from __future__ import annotations

import hashlib
import io
import json
import unittest
import zipfile
from unittest.mock import patch

import httpx

from apps.api.app.main import app
from apps.api.reporting.report_generator import DISCLAIMER
from apps.api.reporting.report_generator import _tiny_png


def report_payload(indicator: str = "surface-water", *, conflict: bool = False) -> dict:
    digest = "sha256:" + "a" * 64
    return {
        "regionId": "mock:district:nagpur",
        "coordinates": {"longitude": 79.08, "latitude": 21.15},
        "boundary": {
            "sourceName": "geoBoundaries gbOpen India ADM2",
            "sourceUrl": "https://www.geoboundaries.org/",
            "license": "ODbL 1.0",
            "attribution": "Contains modified boundary data from geoBoundaries.",
            "sha256": digest,
            "disclaimer": DISCLAIMER,
            "geometry": {"type": "Polygon", "coordinates": [[[79, 21], [79.1, 21], [79.1, 21.1], [79, 21]]]},
        },
        "concernCode": "pollution.water",
        "evidence": {
            "indicatorId": indicator,
            "baseline": 100,
            "comparison": 92,
            "value": -8,
            "unit": "km2",
            "methodId": "sentinel-2-mndwi",
            "methodVersion": "1.0.0",
            "processingRunId": "mock:run:nagpur-water",
            "evidenceSha256": digest,
            "qualityStatus": "exploratory",
            "validationStatus": "EXPLORATORY_ONLY",
            "qualityLevel": "unknown",
            "methodsConflict": conflict,
        },
        "observation": "The mapped proxy appears lower; please verify the site.",
        "locale": "en",
        "consent": {
            "reviewed": True,
            "truthfulness": True,
            "locationSharing": True,
            "attachmentsSharing": True,
            "manualSubmission": True,
            "privacyNoticeVersion": "2026-08-04",
        },
        "attachments": [],
        "municipalConfirmed": False,
    }


class ReportingApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://testserver",
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()

    async def test_authority_registry_is_allowlisted(self) -> None:
        response = await self.client.get("/api/v1/authorities")
        self.assertEqual(response.status_code, 200, response.text)
        ids = {item["id"] for item in response.json()["data"]["authorities"]}
        self.assertEqual(ids, {"mpcb", "nmc", "maharashtra-forest", "aaple-sarkar", "cpgrams", "ngt"})
        self.assertTrue(all(item["officialUrl"].startswith("https://") for item in response.json()["data"]["authorities"]))

    async def test_report_lifecycle_download_handoff_acknowledgement_and_delete(self) -> None:
        created = await self.client.post(
            "/api/v1/reports",
            json=report_payload(),
            headers={"Idempotency-Key": "report-test-key-0001"},
        )
        self.assertEqual(created.status_code, 201, created.text)
        token = created.headers["x-report-access"]
        report = created.json()["data"]
        report_id = report["id"]
        self.assertEqual(report["eligibility"]["claimMode"], "VERIFICATION_ONLY")
        self.assertTrue(created.json()["meta"]["mock"])
        self.assertTrue(all(item["checksum"].startswith("sha256:") for item in report["artifacts"]))
        self.assertTrue(report["artifacts"][1]["manifestChecksum"].startswith("sha256:"))

        fetched = await self.client.get(f"/api/v1/reports/{report_id}", headers={"X-Report-Access": token})
        self.assertEqual(fetched.status_code, 200, fetched.text)
        self.assertEqual(fetched.json()["data"]["id"], report_id)

        artifact = await self.client.get(
            f"/api/v1/reports/{report_id}/artifacts/zip",
            headers={"X-Report-Access": token},
        )
        self.assertEqual(artifact.status_code, 200, artifact.text)
        self.assertIn("evidence-" + report_id.replace(":", "-") + ".zip", artifact.headers["content-disposition"])
        with zipfile.ZipFile(io.BytesIO(artifact.content)) as archive:
            self.assertIn("manifest.json", archive.namelist())
            self.assertIn("provenance.json", archive.namelist())
            self.assertIn("report/report-" + report_id.replace(":", "-") + ".pdf", archive.namelist())

        handoff = await self.client.post(
            f"/api/v1/reports/{report_id}/submit-handoff",
            json={"authorityId": "mpcb", "confirmReview": True},
            headers={"X-Report-Access": token},
        )
        self.assertEqual(handoff.status_code, 200, handoff.text)
        self.assertEqual(handoff.json()["data"]["handoff"]["authorityId"], "mpcb")

        acknowledgement = await self.client.post(
            f"/api/v1/reports/{report_id}/acknowledgement",
            json={
                "authorityId": "mpcb",
                "status": "SUBMITTED",
                "externalReference": "USER-REF-1",
                "confirmedUserEntered": True,
            },
            headers={"X-Report-Access": token},
        )
        self.assertEqual(acknowledgement.status_code, 200, acknowledgement.text)
        self.assertEqual(acknowledgement.json()["data"]["acknowledgement"]["source"], "USER_ENTERED")

        deleted = await self.client.delete(f"/api/v1/reports/{report_id}", headers={"X-Report-Access": token})
        self.assertEqual(deleted.status_code, 204, deleted.text)
        missing = await self.client.get(f"/api/v1/reports/{report_id}", headers={"X-Report-Access": token})
        self.assertEqual(missing.status_code, 404, missing.text)

    async def test_built_up_conflict_is_blocked(self) -> None:
        payload = report_payload("built-up", conflict=True)
        created = await self.client.post("/api/v1/reports", json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["data"]["eligibility"]["status"], "BLOCKED")
        self.assertEqual(created.json()["data"]["eligibility"]["claimMode"], "NO_INDICATOR_CLAIM")

    async def test_universal_us_route_can_handoff_manually(self) -> None:
        payload = report_payload()
        payload.update({
            "countryCode": "US", "administrativeAreas": [], "district": None,
            "municipality": None, "postalCode": None, "issueCodes": ["AIR_POLLUTION"],
            "concernCode": "AIR_POLLUTION",
        })
        created = await self.client.post("/api/v1/reports", json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        report = created.json()["data"]
        self.assertEqual(report["coverageState"], "FULLY_SUPPORTED")
        token = created.headers["x-report-access"]
        handoff = await self.client.post(
            f"/api/v1/reports/{report['id']}/submit-handoff",
            json={"authorityId": "us-epa", "confirmReview": True},
            headers={"X-Report-Access": token},
        )
        self.assertEqual(handoff.status_code, 200, handoff.text)
        self.assertEqual(handoff.json()["data"]["handoff"]["authorityId"], "us-epa")

    async def test_report_generation_only_city_exports_without_fabricated_evidence(self) -> None:
        catalog = json.loads((__import__("pathlib").Path("data/catalog/supported-cities.json")).read_text(encoding="utf-8"))
        city = next(item for item in catalog["cities"] if item["slug"] == "tokyo")
        west, south, east, north = city["bbox"]
        payload = report_payload()
        payload.update({
            "regionId": city["regionId"],
            "coordinates": {"longitude": city["centroid"][0], "latitude": city["centroid"][1]},
            "countryCode": city["countryCode"],
            "administrativeAreas": city["administrativeAreas"],
            "district": city["district"],
            "municipality": city["municipality"],
            "issueCodes": ["WATER_BODY_SHRINKAGE"],
            "concernCode": "WATER_BODY_SHRINKAGE",
            "boundary": {
                "sourceName": city["boundary"]["sourceName"],
                "sourceUrl": city["boundary"]["sourceUrl"],
                "license": city["boundary"]["license"],
                "attribution": city["boundary"]["attribution"],
                "sha256": city["boundary"]["sha256"],
                "disclaimer": DISCLAIMER,
                "geometry": {"type": "Polygon", "coordinates": [[[west, south], [east, south], [east, north], [west, north], [west, south]]]},
            },
            "evidence": {
                "indicatorId": "surface-water", "baseline": None, "comparison": None, "value": None,
                "unit": "not available", "methodId": "not-run", "methodVersion": "0.0.0",
                "processingRunId": "not-run:city:jp:tokyo", "evidenceSha256": "sha256:" + "b" * 64,
                "qualityStatus": "NOT_RUN", "validationStatus": "NOT_RUN", "qualityLevel": "unknown", "methodsConflict": False,
            },
            "evidenceSnapshots": [],
        })
        created = await self.client.post("/api/v1/reports", json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        result = created.json()["data"]
        self.assertEqual(result["coverageState"], "UNSUPPORTED_JURISDICTION")
        self.assertIsNone(result["authorityRoutes"]["primary"])
        self.assertTrue(result["artifacts"])

    async def test_gemini_draft_is_appended_before_local_sensitive_fields(self) -> None:
        payload = report_payload()
        payload.update({
            "geminiConsent": True,
            "signatureDate": "2026-08-05",
            "complainant": {
                "name": "Private Name", "address": "Private Address",
                "identityConfirmation": True, "contactConsent": True,
            },
        })
        with patch("apps.api.reporting.routes.generate_narrative", return_value={"text": "Neutral draft", "model": "test-model"}) as draft:
            created = await self.client.post("/api/v1/reports", json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        draft.assert_called_once()
        context = draft.call_args.args[0]
        self.assertNotIn("complainant", context)
        self.assertNotIn("coordinates", context)
        report_payload_result = created.json()["data"]["payload"]
        self.assertEqual(report_payload_result["complainant"]["name"], "Private Name")
        self.assertEqual(report_payload_result["signatureDate"], "2026-08-05")

    async def test_multipart_attachment_is_normalized_and_packaged(self) -> None:
        payload = report_payload()
        png = _tiny_png()
        payload["attachments"] = [{
            "name": "field-photo.png",
            "mediaType": "image/png",
            "bytes": len(png),
            "sha256": "sha256:" + hashlib.sha256(png).hexdigest(),
        }]
        created = await self.client.post(
            "/api/v1/reports",
            data={"report": json.dumps(payload)},
            files=[("attachments", ("field-photo.png", png, "image/png"))],
        )
        self.assertEqual(created.status_code, 201, created.text)
        token = created.headers["x-report-access"]
        report_id = created.json()["data"]["id"]
        archive = await self.client.get(
            f"/api/v1/reports/{report_id}/artifacts/zip",
            headers={"X-Report-Access": token},
        )
        with zipfile.ZipFile(io.BytesIO(archive.content)) as zipped:
            self.assertIn("attachments/attachment-1-field-photo.png", zipped.namelist())

    async def test_signature_jpeg_is_embedded_and_packaged(self) -> None:
        from PIL import Image

        output = io.BytesIO()
        Image.new("RGB", (32, 16), (255, 255, 255)).save(output, format="JPEG")
        signature = output.getvalue()
        payload = report_payload()
        payload["signatureAttachment"] = {
            "name": "signature.jpg",
            "mediaType": "image/jpeg",
            "bytes": len(signature),
            "sha256": "sha256:" + hashlib.sha256(signature).hexdigest(),
        }
        created = await self.client.post(
            "/api/v1/reports",
            data={"report": json.dumps(payload)},
            files=[("signature", ("signature.jpg", signature, "image/jpeg"))],
        )
        self.assertEqual(created.status_code, 201, created.text)
        report = created.json()["data"]
        self.assertEqual(report["payload"]["signatureAttachment"]["name"], "signature.jpg")
        token = created.headers["x-report-access"]
        archive_response = await self.client.get(
            f"/api/v1/reports/{report['id']}/artifacts/zip",
            headers={"X-Report-Access": token},
        )
        with zipfile.ZipFile(io.BytesIO(archive_response.content)) as zipped:
            self.assertIn("signature/signature.jpg", zipped.namelist())
            pdf = zipped.read(next(name for name in zipped.namelist() if name.startswith("report/")))
        self.assertIn(b"SPARC", pdf)

    async def test_multipart_image_metadata_hash_is_canonicalized(self) -> None:
        from PIL import Image, PngImagePlugin

        output = io.BytesIO()
        image = Image.new("RGB", (2, 2), (20, 30, 40))
        info = PngImagePlugin.PngInfo()
        info.add_text("temporary-camera-metadata", "removed before packaging")
        image.save(output, format="PNG", pnginfo=info)
        raw = output.getvalue()
        payload = report_payload()
        payload["attachments"] = [{
            "name": "field-photo.png",
            "mediaType": "image/png",
            "bytes": len(raw),
            "sha256": "sha256:" + hashlib.sha256(raw).hexdigest(),
        }]
        created = await self.client.post(
            "/api/v1/reports",
            data={"report": json.dumps(payload)},
            files=[("attachments", ("field-photo.png", raw, "image/png"))],
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertNotEqual(created.json()["data"]["payload"]["attachments"][0]["sha256"], payload["attachments"][0]["sha256"])

    async def test_consent_and_access_token_are_required(self) -> None:
        payload = report_payload()
        payload["consent"]["truthfulness"] = False
        rejected = await self.client.post("/api/v1/reports", json=payload)
        self.assertEqual(rejected.status_code, 422, rejected.text)
        created = await self.client.post("/api/v1/reports", json=report_payload())
        report_id = created.json()["data"]["id"]
        missing_token = await self.client.get(f"/api/v1/reports/{report_id}")
        self.assertEqual(missing_token.status_code, 401, missing_token.text)

    async def test_idempotency_replays_and_conflicts_on_body_change(self) -> None:
        key = "report-idempotency-0001"
        first = await self.client.post("/api/v1/reports", json=report_payload(), headers={"Idempotency-Key": key})
        replay = await self.client.post("/api/v1/reports", json=report_payload(), headers={"Idempotency-Key": key})
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(first.json()["data"]["id"], replay.json()["data"]["id"])
        changed = report_payload()
        changed["observation"] = "A different observation."
        conflict = await self.client.post("/api/v1/reports", json=changed, headers={"Idempotency-Key": key})
        self.assertEqual(conflict.status_code, 409, conflict.text)


if __name__ == "__main__":
    unittest.main()
