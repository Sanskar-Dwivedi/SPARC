"""Mock-safe P0 reporting routes over the ephemeral reporting services."""

from __future__ import annotations

from datetime import date, datetime
from hashlib import sha256
import json
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, Path, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError, field_validator

from ..app.errors import SparcError
from ..app.limits import FixedWindowRateLimiter
from .authority_registry import get_authority, list_authorities
from .evidence_manifest import (
    MAX_ATTACHMENTS,
    MAX_USER_TEXT,
    EvidenceManifestError,
    canonical_json,
    normalize_attachment,
    validate_attachment,
)
from .report_generator import DISCLAIMER, generate_artifacts
from .gemini_narrative import GeminiGenerationError, generate_narrative, safe_context
from .routing_rules import route_concern, route_global
from .jurisdiction_registry import ISSUE_CODES, list_jurisdictions
from .submission_records import EphemeralReportStore


router = APIRouter(prefix="/api/v1")
store = EphemeralReportStore()
idempotency_records: dict[str, tuple[str, str, str]] = {}
report_limiter = FixedWindowRateLimiter(30)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Coordinates(StrictModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class BoundaryProvenance(StrictModel):
    source_name: str = Field(alias="sourceName", min_length=1, max_length=160)
    source_url: str = Field(alias="sourceUrl", pattern=r"^https://[^\s\r\n]+$", max_length=2048)
    license: str = Field(min_length=1, max_length=200)
    attribution: str = Field(min_length=1, max_length=500)
    sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    disclaimer: Literal[DISCLAIMER]
    geometry: dict[str, Any] = Field(min_length=1)


class EvidenceSnapshot(StrictModel):
    indicator_id: Literal["surface-water", "vegetation", "built-up", "lst", "suhi"] = Field(alias="indicatorId")
    baseline: float | None = None
    comparison: float | None = None
    value: float | None = None
    unit: str = Field(min_length=1, max_length=48)
    method_id: str = Field(alias="methodId", min_length=1, max_length=120)
    method_version: str = Field(alias="methodVersion", min_length=1, max_length=80)
    processing_run_id: str = Field(alias="processingRunId", min_length=1, max_length=160)
    evidence_sha256: str = Field(alias="evidenceSha256", pattern=r"^sha256:[a-f0-9]{64}$")
    quality_status: str = Field(alias="qualityStatus", min_length=1, max_length=40)
    validation_status: Literal["NOT_RUN", "EXPLORATORY_ONLY", "FORMAL_FAILED", "FORMAL_PASSED"] = Field(alias="validationStatus")
    quality_level: Literal["high", "medium", "low", "unknown"] = Field(alias="qualityLevel")
    methods_conflict: bool = Field(default=False, alias="methodsConflict")


class ConsentDeclaration(StrictModel):
    reviewed: bool
    truthfulness: bool
    location_sharing: bool = Field(alias="locationSharing")
    attachments_sharing: bool = Field(alias="attachmentsSharing")
    manual_submission: bool = Field(alias="manualSubmission")
    privacy_notice_version: str = Field(alias="privacyNoticeVersion", min_length=1, max_length=40)


class AttachmentMetadata(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    media_type: Literal["image/jpeg", "image/png", "application/pdf"] = Field(alias="mediaType")
    bytes: int = Field(gt=0, le=5 * 1024 * 1024)
    sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")


class SignatureAttachment(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    media_type: Literal["image/jpeg", "application/pdf"] = Field(alias="mediaType")
    bytes: int = Field(gt=0, le=5 * 1024 * 1024)
    sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")


class ComplainantDetails(StrictModel):
    name: str | None = Field(default=None, max_length=160)
    organization: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=40)
    identity_confirmation: bool = Field(default=False, alias="identityConfirmation")
    contact_consent: bool = Field(default=False, alias="contactConsent")


class ReportCreateRequest(StrictModel):
    region_id: str = Field(alias="regionId", min_length=1, max_length=128, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*)*$")
    coordinates: Coordinates
    boundary: BoundaryProvenance
    concern_code: str = Field(alias="concernCode", min_length=1, max_length=80)
    issue_codes: list[str] = Field(default_factory=list, alias="issueCodes", max_length=16)
    country_code: str | None = Field(default=None, alias="countryCode", min_length=2, max_length=2, pattern=r"^[A-Z]{2}$")
    administrative_areas: list[str] = Field(default_factory=list, alias="administrativeAreas", max_length=8)
    municipality: str | None = Field(default=None, max_length=160)
    postal_code: str | None = Field(default=None, alias="postalCode", max_length=32)
    district: str | None = Field(default=None, max_length=160)
    emergency: bool = False
    report_title: str | None = Field(default=None, alias="reportTitle", max_length=200)
    receiving_authority: str | None = Field(default=None, alias="receivingAuthority", max_length=200)
    complainant: ComplainantDetails = Field(default_factory=ComplainantDetails)
    persons_facilities_departments: str | None = Field(default=None, alias="personsFacilitiesDepartments", max_length=1000)
    timeline: str | None = Field(default=None, max_length=2000)
    prior_complaint_history: str | None = Field(default=None, alias="priorComplaintHistory", max_length=2000)
    requested_action: str | None = Field(default=None, alias="requestedAction", max_length=1000)
    signature_date: date | None = Field(default=None, alias="signatureDate")
    signature_attachment: SignatureAttachment | None = Field(default=None, alias="signatureAttachment")
    gemini_consent: bool = Field(default=False, alias="geminiConsent")
    evidence: EvidenceSnapshot
    evidence_snapshots: list[EvidenceSnapshot] = Field(default_factory=list, alias="evidenceSnapshots", max_length=16)
    analysis: dict[str, Any] = Field(default_factory=dict, max_length=64)
    observation: str = Field(min_length=1, max_length=MAX_USER_TEXT)
    locale: Literal["en", "hi", "mr"]
    consent: ConsentDeclaration
    attachments: list[AttachmentMetadata] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)
    municipal_confirmed: bool = Field(default=False, alias="municipalConfirmed")

    @field_validator("concern_code")
    @classmethod
    def concern_code_is_known(cls, value: str) -> str:
        if value not in ISSUE_CODES and not __import__("re").fullmatch(r"^[a-z0-9]+(?:\.[a-z0-9_]+)+$", value):
            raise ValueError("concernCode must be a universal issue code or legacy namespaced code")
        return value

    @field_validator("issue_codes")
    @classmethod
    def issue_codes_are_known(cls, values: list[str]) -> list[str]:
        if any(value not in ISSUE_CODES for value in values):
            raise ValueError("issueCodes contains an unsupported universal issue code")
        return list(dict.fromkeys(values))

    @field_validator("observation")
    @classmethod
    def no_control_characters(cls, value: str) -> str:
        if any(ord(char) < 32 and char not in "\n\r\t" for char in value):
            raise ValueError("observation contains a control character")
        return value.strip()


class HandoffRequest(StrictModel):
    authority_id: str = Field(alias="authorityId", min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    confirm_review: bool = Field(alias="confirmReview")


class AcknowledgementRequest(StrictModel):
    authority_id: str = Field(alias="authorityId", min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    status: Literal["SUBMITTED", "NOT_SUBMITTED", "UNKNOWN"]
    external_reference: str | None = Field(default=None, alias="externalReference", max_length=160)
    submitted_at: datetime | None = Field(default=None, alias="submittedAt")
    confirmed_user_entered: bool = Field(alias="confirmedUserEntered")


def _token(value: str | None) -> str:
    if not value:
        raise SparcError(401, "REPORT_ACCESS_REQUIRED", "A report access token is required.")
    return value


def _record_or_error(report_id: str, access: str):
    record = store.get(report_id, access)
    if record is None:
        raise SparcError(404, "REPORT_NOT_FOUND", "The requested report was not found.")
    if record.expired():
        raise SparcError(410, "REPORT_EXPIRED", "The report has expired and was deleted from temporary storage.")
    return record


def _envelope(request: Request, data: Any) -> dict[str, Any]:
    return {
        "data": data,
        "meta": {
            "schemaVersion": "1.0.0",
            "apiVersion": "1.0.0-alpha.1",
            "mock": True,
            "requestId": request.state.request_id,
            "dataMode": "demo",
        },
        "links": {"self": str(request.url), "related": []},
    }


def _route_payload(decision) -> dict[str, Any]:
    return decision.as_dict()


def _artifact_descriptors(artifacts: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": "pdf",
            "mediaType": "application/pdf",
            "bytes": len(artifacts["pdf"]),
            "checksum": artifacts["pdfSha256"],
        },
        {
            "id": "zip",
            "mediaType": "application/zip",
            "bytes": len(artifacts["zip"]),
            "checksum": artifacts["zipSha256"],
            "manifestChecksum": artifacts["manifestSha256"],
        },
    ]


@router.post("/reports", status_code=201, tags=["Reporting"])
async def create_report(
    request: Request,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=128)] = None,
) -> Response:
    uploaded: list[tuple[str, str, bytes]] = []
    signature_uploaded: tuple[str, str, bytes] | None = None
    normalized_attachment_metadata: list[dict[str, Any]] = []
    body: ReportCreateRequest | None = None
    is_multipart = request.headers.get("content-type", "").startswith("multipart/form-data")
    if is_multipart:
        async with request.form(max_files=MAX_ATTACHMENTS + 1) as form:
            raw_report = form.get("report")
            if not isinstance(raw_report, str):
                raise SparcError(422, "REPORT_METADATA_REQUIRED", "Multipart reports require a JSON report field.")
            try:
                body = TypeAdapter(ReportCreateRequest).validate_json(raw_report)
            except ValidationError as exc:
                raise SparcError(422, "INVALID_REPORT", "The report metadata is invalid.") from exc
            for item in form.getlist("attachments"):
                if not hasattr(item, "filename") or not hasattr(item, "content_type"):
                    raise SparcError(422, "INVALID_ATTACHMENT", "Report attachments must be uploaded files.")
                uploaded.append((item.filename or "attachment", item.content_type or "", await item.read()))
            signature_item = form.get("signature")
            if signature_item is not None:
                if not hasattr(signature_item, "filename") or not hasattr(signature_item, "content_type"):
                    raise SparcError(422, "INVALID_SIGNATURE", "The signature must be uploaded as a JPEG or PDF file.")
                signature_uploaded = (
                    signature_item.filename or "signature",
                    signature_item.content_type or "",
                    await signature_item.read(),
                )
    else:
        try:
            body = TypeAdapter(ReportCreateRequest).validate_python(await request.json())
        except (TypeError, ValueError, ValidationError) as exc:
            raise SparcError(422, "INVALID_REPORT", "The report metadata is invalid.") from exc
    if body is None:
        raise SparcError(422, "REPORT_METADATA_REQUIRED", "Report metadata is required.")
    if is_multipart:
        if len(uploaded) != len(body.attachments):
            raise SparcError(422, "ATTACHMENT_METADATA_MISMATCH", "Each uploaded attachment must have matching metadata.")
        for declared, (filename, media_type, raw_bytes) in zip(body.attachments, uploaded, strict=True):
            try:
                # The browser hashes the bytes it selected. Image metadata
                # stripping intentionally rewrites those bytes before they
                # enter the evidence ZIP, so validate both representations.
                raw_actual = validate_attachment(media_type, raw_bytes, filename)
                normalized = normalize_attachment(media_type, raw_bytes)
                actual = validate_attachment(media_type, normalized, filename)
            except EvidenceManifestError as exc:
                raise SparcError(422, "INVALID_ATTACHMENT", "The uploaded attachment failed safety validation.") from exc
            declared_values = declared.model_dump(by_alias=True)
            if not any(all(candidate[key] == declared_values[key] for key in ("name", "mediaType", "bytes", "sha256")) for candidate in (raw_actual, actual)):
                raise SparcError(422, "ATTACHMENT_METADATA_MISMATCH", "Attachment metadata does not match the selected upload or its normalized package bytes.")
            normalized_attachment_metadata.append(actual)
        if body.signature_attachment is None and signature_uploaded is not None:
            raise SparcError(422, "SIGNATURE_METADATA_REQUIRED", "The signature upload requires matching signature metadata.")
        if body.signature_attachment is not None:
            if signature_uploaded is None:
                raise SparcError(422, "SIGNATURE_UPLOAD_REQUIRED", "The selected signature file was not uploaded.")
            filename, media_type, raw_bytes = signature_uploaded
            try:
                raw_actual = validate_attachment(media_type, raw_bytes, filename)
                normalized = normalize_attachment(media_type, raw_bytes)
                actual = validate_attachment(media_type, normalized, filename)
            except EvidenceManifestError as exc:
                raise SparcError(422, "INVALID_SIGNATURE", "The signature must be a valid JPEG or PDF under the 5 MiB limit.") from exc
            declared_values = body.signature_attachment.model_dump(by_alias=True)
            if not any(all(candidate[key] == declared_values[key] for key in ("name", "mediaType", "bytes", "sha256")) for candidate in (raw_actual, actual)):
                raise SparcError(422, "SIGNATURE_METADATA_MISMATCH", "Signature metadata does not match the selected file.")
            signature_uploaded = (actual["name"], actual["mediaType"], normalized)
            payload_signature_metadata = actual
        else:
            payload_signature_metadata = None
    else:
        if body.signature_attachment is not None:
            raise SparcError(422, "SIGNATURE_UPLOAD_REQUIRED", "Signature files must be sent as multipart uploads.")
        payload_signature_metadata = None
    client_key = request.client.host if request.client else "unknown"
    if not report_limiter.allow(client_key):
        raise SparcError(429, "REPORT_RATE_LIMITED", "Too many report generations from this client.", headers={"Retry-After": "60"})
    if idempotency_key is not None and len(idempotency_key) < 16:
        raise SparcError(422, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must contain at least 16 characters.")
    if not all((body.consent.reviewed, body.consent.truthfulness, body.consent.location_sharing, body.consent.manual_submission)):
        raise SparcError(422, "CONSENT_REQUIRED", "The report requires review, truthfulness, location-sharing, and manual-submission consent.")

    payload = body.model_dump(by_alias=True, mode="json")
    if is_multipart:
        # The report payload and manifest describe the bytes that SPARC will
        # redistribute, not the pre-normalization upload bytes.
        payload["attachments"] = normalized_attachment_metadata
    payload["signatureAttachment"] = payload_signature_metadata
    request_hash = sha256(canonical_json(payload)).hexdigest()
    if idempotency_key:
        existing = idempotency_records.get(idempotency_key)
        if existing:
            existing_hash, existing_id, existing_token = existing
            if existing_hash != request_hash:
                raise SparcError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key was already used with a different report body.")
            existing_record = store.get(existing_id, existing_token)
            if existing_record is not None and not existing_record.expired():
                response = _envelope(request, existing_record.public())
                return Response(
                    content=json.dumps(response, ensure_ascii=False),
                    status_code=200,
                    media_type="application/json",
                    headers={"X-Report-Access": existing_token, "Location": f"/api/v1/reports/{existing_id}"},
                )

    selected_issue = body.issue_codes[0] if body.issue_codes else body.concern_code
    if body.country_code:
        global_route = route_global(
            country_code=body.country_code,
            administrative_areas=tuple(body.administrative_areas),
            municipality=body.municipality,
            district=body.district,
            issue_code=selected_issue,
            emergency=body.emergency,
        )
        decision = _global_route_as_legacy(global_route)
        payload["coverageState"] = global_route["coverageState"]
        payload["jurisdictionRouting"] = global_route
    else:
        decision = route_concern(body.concern_code, region_id=body.region_id, municipal_confirmed=body.municipal_confirmed)
        payload["coverageState"] = "FULLY_SUPPORTED"
    payload["boundary"]["disclaimer"] = DISCLAIMER
    if body.gemini_consent:
        try:
            payload["geminiDraft"] = generate_narrative(safe_context(payload))
        except GeminiGenerationError as exc:
            raise SparcError(503, "GEMINI_UNAVAILABLE", str(exc)) from exc
    try:
        artifacts = generate_artifacts(report_id="pending", payload=payload, locale=body.locale, attachments=uploaded, signature=signature_uploaded)
    except Exception as exc:
        raise SparcError(422, "REPORT_ARTIFACT_FAILED", "The report could not be generated safely.") from exc

    record = store.create(
        {
            **payload,
            "eligibility": artifacts["eligibility"],
            "authorityRoutes": _route_payload(decision),
            "artifacts": _artifact_descriptors(artifacts),
        },
        artifacts={"pdf": artifacts["pdf"], "zip": artifacts["zip"]},
        manifest=artifacts["manifest"],
    )
    # The report ID is part of the PDF/ZIP names, so regenerate once the final
    # opaque ID exists.  This remains local and deterministic; no external call
    # or provider credential is involved.
    try:
        final_artifacts = generate_artifacts(report_id=record.report_id, payload=payload, locale=body.locale, attachments=uploaded, signature=signature_uploaded)
    except Exception as exc:
        store.delete(record.report_id, record.access_token)
        raise SparcError(422, "REPORT_ARTIFACT_FAILED", "The report could not be generated safely.") from exc
    store.replace_artifacts(record, {"pdf": final_artifacts["pdf"], "zip": final_artifacts["zip"]})
    record.manifest = final_artifacts["manifest"]
    record.payload["artifacts"] = _artifact_descriptors(final_artifacts)
    if idempotency_key:
        idempotency_records[idempotency_key] = (request_hash, record.report_id, record.access_token)
    response = _envelope(request, record.public())
    return Response(
        content=json.dumps(response, ensure_ascii=False),
        status_code=201,
        media_type="application/json",
        headers={"X-Report-Access": record.access_token, "Location": f"/api/v1/reports/{record.report_id}"},
    )


@router.get("/reports/{report_id}", tags=["Reporting"])
def get_report(
    request: Request,
    report_id: Annotated[str, Path(min_length=20, max_length=80, pattern=r"^report:[a-f0-9]{32}$")],
    report_access: Annotated[str | None, Header(alias="X-Report-Access")] = None,
) -> dict[str, Any]:
    record = _record_or_error(report_id, _token(report_access))
    return _envelope(request, record.public())


@router.get("/reports/{report_id}/artifacts/{artifact_id}", tags=["Reporting"])
def get_artifact(
    report_id: Annotated[str, Path(min_length=20, max_length=80, pattern=r"^report:[a-f0-9]{32}$")],
    artifact_id: Annotated[str, Path(pattern=r"^(?:pdf|zip)$")],
    report_access: Annotated[str | None, Header(alias="X-Report-Access")] = None,
) -> Response:
    record = _record_or_error(report_id, _token(report_access))
    data = record.artifacts.get(artifact_id)
    if data is None:
        raise SparcError(404, "ARTIFACT_NOT_FOUND", "The requested report artifact was not found.")
    media_type = "application/pdf" if artifact_id == "pdf" else "application/zip"
    extension = "pdf" if artifact_id == "pdf" else "zip"
    prefix = "report" if artifact_id == "pdf" else "evidence"
    filename = f'{prefix}-{report_id.replace(":", "-")}.{extension}'
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.post("/reports/{report_id}/submit-handoff", tags=["Reporting"])
def submit_handoff(
    request: Request,
    report_id: Annotated[str, Path(min_length=20, max_length=80, pattern=r"^report:[a-f0-9]{32}$")],
    body: HandoffRequest,
    report_access: Annotated[str | None, Header(alias="X-Report-Access")] = None,
) -> dict[str, Any]:
    record = _record_or_error(report_id, _token(report_access))
    if not body.confirm_review:
        raise SparcError(422, "REVIEW_CONFIRMATION_REQUIRED", "Review confirmation is required before manual handoff.")
    authority = get_authority(body.authority_id)
    jurisdiction_authority = next((item for item in list_jurisdictions() if item.authority_id == body.authority_id), None)
    if authority is None and jurisdiction_authority is None:
        raise SparcError(404, "AUTHORITY_NOT_FOUND", "The selected authority is not in the allowlisted registry.")
    routes = record.payload["authorityRoutes"]
    allowed = {candidate["authorityId"] for candidate in routes["secondary"]}
    if routes["primary"]:
        allowed.add(routes["primary"]["authorityId"])
    if body.authority_id not in allowed:
        raise SparcError(422, "AUTHORITY_NOT_ROUTED", "The selected authority is not a route for this concern.")
    store.record_handoff(record, {"authorityId": body.authority_id, "officialUrl": authority.official_url if authority else jurisdiction_authority.official_url})
    return _envelope(request, record.public())


@router.post("/reports/{report_id}/acknowledgement", tags=["Reporting"])
def acknowledge_report(
    request: Request,
    report_id: Annotated[str, Path(min_length=20, max_length=80, pattern=r"^report:[a-f0-9]{32}$")],
    body: AcknowledgementRequest,
    report_access: Annotated[str | None, Header(alias="X-Report-Access")] = None,
) -> dict[str, Any]:
    record = _record_or_error(report_id, _token(report_access))
    if not body.confirmed_user_entered:
        raise SparcError(422, "ACKNOWLEDGEMENT_CONFIRMATION_REQUIRED", "Acknowledgements must be confirmed as user-entered.")
    authority = get_authority(body.authority_id)
    jurisdiction_authority = next((item for item in list_jurisdictions() if item.authority_id == body.authority_id), None)
    if authority is None and jurisdiction_authority is None:
        raise SparcError(404, "AUTHORITY_NOT_FOUND", "The selected authority is not in the allowlisted registry.")
    acknowledgement = body.model_dump(by_alias=True)
    acknowledgement["source"] = "USER_ENTERED"
    store.record_acknowledgement(record, acknowledgement)
    return _envelope(request, record.public())


@router.get("/authorities", tags=["Reporting"])
def get_authorities(request: Request, issue_code: str | None = Query(default=None, alias="issueCode", max_length=80)) -> dict[str, Any]:
    records = list_authorities()
    if issue_code:
        records = [record for record in records if issue_code in record["issueCodes"]]
    return _envelope(request, {"registryVersion": records[0]["registryVersion"] if records else "2026-08-04", "authorities": records})


def _global_route_as_legacy(route: dict[str, Any]):
    """Adapt jurisdiction-pack candidates to the frozen report response shape."""
    class Decision:
        def as_dict(self) -> dict[str, Any]:
            candidates = []
            for item in route.get("authorities", []):
                candidates.append({
                    "authorityId": item["authorityId"],
                    "name": item["authorityName"],
                    "rank": item["rank"],
                    "rationale": "Verified jurisdiction-pack route.",
                    "jurisdictionConfidence": "high",
                    "officialUrl": item["officialUrl"],
                    "manualOnly": True,
                    "escalationOnly": item["authorityId"] in {"ngt"},
                })
            primary = candidates[0] if candidates else None
            secondary = tuple(candidates[1:])
            return {
                "primary": primary,
                "secondary": list(secondary),
                "selectionRequired": bool(route.get("selectionRequired")),
                "reason": route.get("reason", ""),
                "coverageState": route.get("coverageState"),
            }
    return Decision()


@router.get("/jurisdictions", tags=["Reporting"])
def get_jurisdictions(
    request: Request,
    country_code: str | None = Query(default=None, alias="countryCode", pattern=r"^[A-Z]{2}$"),
) -> dict[str, Any]:
    records = list_jurisdictions()
    if country_code:
        records = [record for record in records if record.country_code == country_code]
    return _envelope(request, {
        "registryVersion": "2026-08-05",
        "coverageStates": ["FULLY_SUPPORTED", "REPORT_GENERATION_ONLY", "UNSUPPORTED_JURISDICTION"],
        "jurisdictions": [record.as_dict() for record in records],
    })


@router.get("/authorities/{authority_id}", tags=["Reporting"])
def get_authority_detail(request: Request, authority_id: Annotated[str, Path(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")]) -> dict[str, Any]:
    authority = get_authority(authority_id)
    if authority is None:
        raise SparcError(404, "AUTHORITY_NOT_FOUND", "The requested authority is not in the allowlisted registry.")
    return _envelope(request, {"registryVersion": "2026-08-04", **authority.as_dict()})


@router.delete("/reports/{report_id}", status_code=204, tags=["Reporting"])
def delete_report(
    report_id: Annotated[str, Path(min_length=20, max_length=80, pattern=r"^report:[a-f0-9]{32}$")],
    report_access: Annotated[str | None, Header(alias="X-Report-Access")] = None,
) -> Response:
    if not store.delete(report_id, _token(report_access)):
        raise SparcError(404, "REPORT_NOT_FOUND", "The requested report was not found.")
    return Response(status_code=204)
