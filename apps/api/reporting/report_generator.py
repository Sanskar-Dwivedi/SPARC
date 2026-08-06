"""Claim-safe report text and deterministic PDF/ZIP generation."""

from __future__ import annotations

from io import BytesIO
import os
from pathlib import Path
from datetime import date
import textwrap
from typing import Any, Iterable
import zipfile

from .evidence_manifest import (
    MAX_ZIP_BYTES,
    EvidenceManifestError,
    build_manifest,
    canonical_json,
    normalize_attachment,
    sha256_bytes,
    validate_attachment,
)


DISCLAIMER = "This boundary is suitable for prototype analysis but is not an authoritative legal or cadastral boundary."
NEUTRAL_DECLARATION = "This package records an observation and request for verification. It does not prove a violation, identify a responsible party, or provide legal advice."
MANUAL_DECLARATION = "Review every fact before manual submission. SPARC does not submit complaints, bypass CAPTCHA or OTP, or store government credentials."
LOGO_PATH = Path(__file__).with_name("assets") / "sparc-logo.webp"

TRANSLATIONS = {
    "en": {
        "title": "Report environmental concern",
        "mode": "Request for verification",
        "user_observation": "User-described observation",
        "evidence": "Evidence summary",
        "provenance": "Provenance",
        "disclaimer": "Disclaimer",
    },
    "hi": {
        "title": "पर्यावरण संबंधी चिंता की रिपोर्ट",
        "mode": "सत्यापन का अनुरोध",
        "user_observation": "उपयोगकर्ता द्वारा बताया गया अवलोकन",
        "evidence": "साक्ष्य सारांश",
        "provenance": "स्रोत विवरण",
        "disclaimer": "अस्वीकरण",
    },
    "mr": {
        "title": "पर्यावरणीय चिंतेचा अहवाल",
        "mode": "पडताळणीची विनंती",
        "user_observation": "वापरकर्त्याने सांगितलेले निरीक्षण",
        "evidence": "पुराव्याचा सारांश",
        "provenance": "स्रोत तपशील",
        "disclaimer": "अस्वीकरण",
    },
}


class ReportGenerationError(ValueError):
    """The report cannot be generated without weakening safety or integrity."""


def supported_locales() -> tuple[str, ...]:
    return tuple(TRANSLATIONS)


def evaluate_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    """Return the only claim mode the report generator is allowed to use."""

    indicator_id = evidence.get("indicatorId")
    validation = evidence.get("validationStatus")
    quality = evidence.get("qualityLevel")
    conflict = bool(evidence.get("methodsConflict"))
    if indicator_id == "built-up" and conflict:
        return {
            "status": "BLOCKED",
            "claimMode": "NO_INDICATOR_CLAIM",
            "reason": "Built-up methods conflict; no numerical or directional claim is permitted.",
        }
    if validation == "FORMAL_PASSED" and quality in {"high", "medium"}:
        return {
            "status": "ELIGIBLE",
            "claimMode": "NUMERIC_PROXY",
            "reason": "Formal validation is recorded; values remain proxies and are not causal findings.",
        }
    return {
        "status": "ELIGIBLE_WITH_LIMITATION",
        "claimMode": "VERIFICATION_ONLY",
        "reason": "Evidence is exploratory, unavailable, low quality, or not independently validated.",
    }


def _font_name(locale: str) -> str:
    if locale == "en":
        return "Helvetica"
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except ImportError as exc:  # pragma: no cover - exercised in deployment smoke tests
        raise ReportGenerationError("ReportLab is required for PDF generation") from exc
    configured = os.getenv("SPARC_REPORT_FONT_PATH")
    candidates = [configured] if configured else []
    if os.name == "nt":
        candidates.append(r"C:\Windows\Fonts\Nirmala.ttc")
    font_path = next((path for path in candidates if path and Path(path).is_file()), None)
    if not font_path:
        raise ReportGenerationError("A licensed Devanagari font must be configured for Hindi/Marathi PDF output")
    name = "SparcDevanagari"
    try:
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, font_path, subfontIndex=0))
    except Exception as exc:  # pragma: no cover - font-specific failure
        raise ReportGenerationError("Configured Devanagari font could not be registered") from exc
    return name


def _pdf_bytes(
    report_id: str,
    payload: dict[str, Any],
    eligibility: dict[str, Any],
    locale: str,
    signature: tuple[str, str, bytes] | None = None,
) -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas
    except ImportError as exc:  # pragma: no cover - dependency installation failure
        raise ReportGenerationError("ReportLab is required for PDF generation") from exc

    labels = TRANSLATIONS[locale]
    buffer = BytesIO()
    document = canvas.Canvas(buffer, pagesize=A4, invariant=1)
    document.setTitle(f"SPARC report {report_id}")
    document.setAuthor("SPARC")
    font = _font_name(locale)
    page_width, _page_height = A4

    # The uploaded mark is transparent and can be rendered directly by
    # ReportLab through Pillow's WebP reader. Keep the text trademark notice
    # beside it as a searchable, accessible fallback for PDF readers that do
    # not expose image metadata.
    try:
        if LOGO_PATH.is_file():
            logo = ImageReader(str(LOGO_PATH))
            logo_width, logo_height = logo.getSize()
            target_width = 132
            target_height = target_width * logo_height / max(logo_width, 1)
            document.drawImage(
                logo, 48, 764, width=target_width, height=target_height,
                preserveAspectRatio=True, mask="auto",
            )
    except Exception:
        # A missing optional brand asset must not make a safety report
        # unavailable; the searchable trademark text below remains present.
        pass
    document.setFont("Helvetica", 10)
    document.drawString(196, 813, "SPARC™")
    document.setFont("Helvetica", 7)
    document.drawString(196, 801, "Satellite-Powered Analytics for Resource Conservation")
    document.drawRightString(page_width - 48, 801, f"© {date.today().year} SPARC")
    document.setStrokeColorRGB(0.78, 0.78, 0.78)
    document.line(48, 754, page_width - 48, 754)
    document.setStrokeColorRGB(0, 0, 0)
    document.setFont(font, 14)
    y = 736
    document.drawString(48, y, labels["title"])
    y -= 28
    document.setFont(font, 9)
    complainant = payload.get("complainant") or {}
    def value(key: str, default: str = "Not provided") -> str:
        raw = complainant.get(key) if key in complainant else payload.get(key)
        return default if raw in (None, "") else str(raw)

    lines = [
        f"Report title: {payload.get('reportTitle') or 'Environmental concern request for verification'}",
        f"Receiving authority: {payload.get('receivingAuthority') or 'To be selected from the verified registry'}",
        f"Report ID: {report_id}",
        f"Region: {payload['regionId']}",
        f"Location: {payload.get('countryCode') or 'legacy'} / {', '.join(payload.get('administrativeAreas', [])) or payload['regionId']}",
        f"Exact coordinates: longitude {payload['coordinates']['longitude']}, latitude {payload['coordinates']['latitude']}",
        f"Concern(s): {', '.join(payload.get('issueCodes') or [payload['concernCode']])}",
        "",
        "Complainant details",
        f"Name: {value('name')}",
        f"Organization: {value('organization')}",
        f"Address: {value('address')}",
        f"Email: {value('email')}",
        f"Phone: {value('phone')}",
        f"Identity-confirmation declaration: {'Confirmed by user' if complainant.get('identityConfirmation') else 'Not provided'}",
        f"Consent to contact and verification: {'Granted' if complainant.get('contactConsent') else 'Not granted'}",
        f"Mode: {labels['mode']} ({eligibility['claimMode']})",
        "",
        labels["evidence"],
        eligibility["reason"],
        f"Indicator: {payload['evidence']['indicatorId']}",
        f"Processing run: {payload['evidence']['processingRunId']}",
        "",
        labels["user_observation"],
        str(payload.get("observation", "")),
        "",
        "Persons, facilities or departments concerned",
        str(payload.get("personsFacilitiesDepartments") or "Not provided"),
        "",
        "Timeline of events",
        str(payload.get("timeline") or "Not provided"),
        "",
        "Prior complaint history",
        str(payload.get("priorComplaintHistory") or "Not provided"),
        "",
        "Requested action",
        str(payload.get("requestedAction") or "Inspection or verification by the receiving authority."),
        "",
        "Supporting evidence and attachment manifest",
        f"See manifest.json in the evidence ZIP ({len(payload.get('attachments') or [])} user attachment(s)).",
        "",
        labels["provenance"],
        f"Boundary source: {payload['boundary']['sourceName']}",
        f"Boundary checksum: {payload['boundary']['sha256']}",
        "",
        labels["disclaimer"],
        "Disclosure and privacy warning",
        DISCLAIMER,
        NEUTRAL_DECLARATION,
        MANUAL_DECLARATION,
        "",
        "Truthfulness declaration",
        "I declare that the user-provided details in this package are accurate to the best of my knowledge.",
        "",
        "Signature: ______________________________________________",
        f"Date: {payload.get('signatureDate') or '____________________'}",
        "",
        "Government acknowledgement section",
        "Received by: _____________________________________________",
        "Reference number: ________________________________________",
        "Date received: ____________________________________________",
        "Official remarks: _________________________________________",
    ]
    snapshots = payload.get("evidenceSnapshots") or []
    if snapshots:
        lines.extend(["", "Selected issue analyses"])
        for snapshot in snapshots:
            lines.extend([
                f"- {snapshot.get('indicatorId')}: baseline={snapshot.get('baseline')}, comparison={snapshot.get('comparison')}, value={snapshot.get('value')}, unit={snapshot.get('unit')}",
                f"  method={snapshot.get('methodId')} {snapshot.get('methodVersion')}; quality={snapshot.get('qualityStatus')}; processing={snapshot.get('processingRunId')}",
            ])
    analysis = payload.get("analysis") or {}
    if analysis:
        lines.extend(["", "Dashboard analysis context"])
        for key in sorted(analysis):
            value = analysis[key]
            if isinstance(value, (str, int, float, bool)):
                lines.append(f"{key}: {value}")
    gemini_draft = payload.get("geminiDraft") or {}
    if isinstance(gemini_draft, dict) and gemini_draft.get("text"):
        lines.extend(["", "Gemini-assisted neutral draft", str(gemini_draft["text"])])

    signature_name = signature[0] if signature else None
    signature_media_type = signature[1] if signature else None
    signature_bytes = signature[2] if signature else None
    if signature_name:
        lines.extend([
            "",
            f"Signature attachment: {signature_name} ({'JPEG shown in this PDF' if signature_media_type == 'image/jpeg' else 'PDF included in the evidence package'})",
        ])

    def draw_footer() -> None:
        document.setFont("Helvetica", 7)
        document.setFillColorRGB(0.35, 0.35, 0.35)
        document.drawString(48, 24, "SPARC™ · Satellite-Powered Analytics for Resource Conservation")
        document.drawRightString(page_width - 48, 24, f"© {date.today().year} SPARC")
        document.setFillColorRGB(0, 0, 0)

    for raw in lines:
        for line in textwrap.wrap(raw, width=105) or [""]:
            if y < 62:
                draw_footer()
                document.showPage()
                document.setFont(font, 9)
                y = 800
            document.drawString(48, y, line)
            y -= 14
            if line == "Signature: ______________________________________________" and signature_media_type == "image/jpeg" and signature_bytes:
                try:
                    signature_image = ImageReader(BytesIO(signature_bytes))
                    image_width, image_height = signature_image.getSize()
                    max_width, max_height = 220, 64
                    scale = min(max_width / max(image_width, 1), max_height / max(image_height, 1), 1)
                    drawn_width, drawn_height = image_width * scale, image_height * scale
                    document.drawImage(
                        signature_image, 48, y - drawn_height + 4,
                        width=drawn_width, height=drawn_height,
                        preserveAspectRatio=True, mask="auto",
                    )
                    y -= drawn_height + 8
                except Exception:
                    # The validated attachment remains available in the ZIP;
                    # the printed signature line is retained if embedding fails.
                    pass
    draw_footer()
    document.save()
    return buffer.getvalue()


def _tiny_png() -> bytes:
    # A deterministic 1x1 transparent PNG for the marked synthetic P0 pack.
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - dependency installation failure
        raise ReportGenerationError("Pillow is required for the synthetic PNG fixture") from exc
    output = BytesIO()
    Image.new("RGBA", (1, 1), (0, 0, 0, 0)).save(output, format="PNG", optimize=False)
    return output.getvalue()


def generate_artifacts(
    *,
    report_id: str,
    payload: dict[str, Any],
    locale: str,
    attachments: Iterable[tuple[str, str, bytes]] = (),
    signature: tuple[str, str, bytes] | None = None,
) -> dict[str, Any]:
    if locale not in TRANSLATIONS:
        raise ReportGenerationError("unsupported report locale")
    observation = str(payload.get("observation", ""))
    if len(observation) > 4_000:
        raise ReportGenerationError("observation exceeds the 4,000-character limit")
    evidence = payload["evidence"]
    eligibility = evaluate_evidence(evidence)
    normalized_signature: tuple[str, str, bytes] | None = None
    signature_row: dict[str, Any] | None = None
    if signature is not None:
        signature_name, signature_media_type, signature_data = signature
        if signature_media_type not in {"image/jpeg", "application/pdf"}:
            raise ReportGenerationError("signature must be a JPEG or PDF")
        try:
            normalized_signature_data = normalize_attachment(signature_media_type, signature_data)
            signature_row = validate_attachment(signature_media_type, normalized_signature_data, signature_name)
        except EvidenceManifestError as exc:
            raise ReportGenerationError(str(exc)) from exc
        normalized_signature = (signature_row["name"], signature_row["mediaType"], normalized_signature_data)
    pdf = _pdf_bytes(report_id, payload, eligibility, locale, normalized_signature)
    if len(pdf) > 5 * 1024 * 1024:
        raise ReportGenerationError("generated PDF exceeds the 5 MiB limit")

    files: list[tuple[str, str, bytes]] = [
        (f"report/report-{report_id.replace(':', '-')}.pdf", "application/pdf", pdf),
        (f"boundary/{payload['regionId']}.geojson", "application/geo+json", canonical_json(payload["boundary"].get("geometry", {"type": "Polygon", "coordinates": []}))),
        (f"indicators/{evidence['indicatorId']}/before.png", "image/png", _tiny_png()),
        (f"indicators/{evidence['indicatorId']}/after.png", "image/png", _tiny_png()),
    ]
    attachment_rows = list(attachments)
    if len(attachment_rows) > 6:
        raise ReportGenerationError("no more than six attachments are allowed")
    total_attachment_bytes = 0
    for index, (name, media_type, data) in enumerate(attachment_rows, start=1):
        try:
            normalized = normalize_attachment(media_type, data)
            row = validate_attachment(media_type, normalized, name)
        except EvidenceManifestError as exc:
            raise ReportGenerationError(str(exc)) from exc
        total_attachment_bytes += row["bytes"]
        files.append((f"attachments/attachment-{index}-{row['name']}", media_type, normalized))
    if signature_row is not None and normalized_signature is not None:
        files.append((f"signature/{signature_row['name']}", signature_row["mediaType"], normalized_signature[2]))
    if total_attachment_bytes > 20 * 1024 * 1024:
        raise ReportGenerationError("combined attachments exceed the 20 MiB limit")

    provenance = {
        "boundary": payload["boundary"],
        "evidence": evidence,
        "locale": locale,
        "eligibility": eligibility,
        "signature": payload.get("signatureAttachment"),
        "gemini": {
            "used": bool(payload.get("geminiDraft")),
            "model": (payload.get("geminiDraft") or {}).get("model") if isinstance(payload.get("geminiDraft"), dict) else None,
            "sensitiveFieldsSent": False,
        },
    }
    provenance_bytes = canonical_json(provenance)
    files.append(("provenance.json", "application/json", provenance_bytes))
    manifest = build_manifest(report_id=report_id, provenance=provenance, files=files)
    manifest_bytes = canonical_json(manifest)
    files.append(("manifest.json", "application/json", manifest_bytes))
    files.sort(key=lambda item: item[0])

    archive = BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
        for path, media_type, data in files:
            info = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o600 << 16
            output.writestr(info, data)
    zip_bytes = archive.getvalue()
    if len(zip_bytes) > MAX_ZIP_BYTES:
        raise ReportGenerationError("generated ZIP exceeds the 25 MiB limit")
    return {
        "eligibility": eligibility,
        "manifest": manifest,
        "manifestSha256": sha256_bytes(manifest_bytes),
        "zipSha256": sha256_bytes(zip_bytes),
        "pdfSha256": sha256_bytes(pdf),
        "pdf": pdf,
        "zip": zip_bytes,
        "files": {path: data for path, _media_type, data in files},
    }
