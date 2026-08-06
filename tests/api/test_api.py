from __future__ import annotations

import unittest
from unittest.mock import patch

import httpx

from apps.api.app.main import app, settings


PERIOD_QUERY = {
    "baselineStart": "2019-10-15",
    "baselineEnd": "2019-12-15",
    "comparisonStart": "2024-10-15",
    "comparisonEnd": "2024-12-15",
}


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        self.client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()

    def assert_problem(self, response, status: int, code: str) -> dict:
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(response.headers["content-type"], "application/problem+json")
        body = response.json()
        self.assertEqual(body["status"], status)
        self.assertEqual(body["code"], code)
        self.assertNotIn("Traceback", response.text)
        self.assertNotIn(str(settings.repo_root), response.text)
        return body

    async def test_health_is_cheap_and_discloses_no_configuration(self) -> None:
        response = await self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["dataMode"], "demo")
        self.assertEqual(set(response.json()), {"status", "version", "dataMode"})
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    async def test_root_redirects_to_interactive_api_docs(self) -> None:
        response = await self.client.get("/")
        self.assertEqual(response.status_code, 307)
        self.assertEqual(response.headers["location"], "/docs")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    async def test_region_and_summary_success_flow(self) -> None:
        regions = await self.client.get("/api/v1/regions")
        self.assertEqual(regions.status_code, 200)
        self.assertTrue(any(item["id"] == "mock:district:nagpur" for item in regions.json()["data"]))

        response = await self.client.get(
            "/api/v1/regions/mock:district:nagpur/summary", params=PERIOD_QUERY
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertTrue(body["meta"]["mock"])
        self.assertEqual(body["data"]["region"]["id"], "mock:district:nagpur")
        self.assertIn("etag", response.headers)

    async def test_nagpur_built_up_uses_approved_default_method_at_api_boundary(self) -> None:
        summary = await self.client.get(
            "/api/v1/regions/mock:district:nagpur/summary", params=PERIOD_QUERY
        )
        built_summary = next(
            item for item in summary.json()["data"]["indicators"]
            if item["indicator"]["id"] == "built-up"
        )
        self.assertEqual(built_summary["status"], "complete")
        self.assertEqual(built_summary["metric"]["absoluteChange"], 23.5)
        self.assertIsNone(built_summary["metric"]["unavailableReason"])

        detail = await self.client.get(
            "/api/v1/regions/mock:district:nagpur/indicators/built-up",
            params=PERIOD_QUERY,
        )
        self.assertEqual(detail.status_code, 200, detail.text)
        data = detail.json()["data"]
        self.assertEqual(data["status"], "complete")
        self.assertEqual(data["metric"]["comparisonValue"], 168.5)
        self.assertNotIn("reverse direction", data["interpretation"]["summary"])

    async def test_etag_returns_not_modified(self) -> None:
        first = await self.client.get("/api/v1/regions")
        second = await self.client.get(
            "/api/v1/regions", headers={"If-None-Match": first.headers["etag"]}
        )
        self.assertEqual(second.status_code, 304)
        self.assertEqual(second.content, b"")

    async def test_invalid_identifier_is_rejected_before_repository_lookup(self) -> None:
        response = await self.client.get("/api/v1/regions", params={"parentId": "../../secrets"})
        body = self.assert_problem(response, 422, "VALIDATION_ERROR")
        self.assertEqual(body["invalidParams"][0]["name"], "parentId")

    async def test_unknown_catalogue_identifier_returns_safe_not_found(self) -> None:
        response = await self.client.get("/api/v1/regions/unknown:district")
        self.assert_problem(response, 404, "REGION_NOT_FOUND")

    async def test_invalid_and_unsupported_periods_are_distinct(self) -> None:
        invalid = dict(PERIOD_QUERY)
        invalid["baselineStart"] = "2019-12-16"
        response = await self.client.get(
            "/api/v1/regions/mock:district:nagpur/summary", params=invalid
        )
        self.assert_problem(response, 422, "INVALID_PERIOD")

        unavailable = dict(PERIOD_QUERY)
        unavailable["baselineStart"] = "2020-10-15"
        unavailable["baselineEnd"] = "2020-12-15"
        response = await self.client.get(
            "/api/v1/regions/mock:district:nagpur/summary", params=unavailable
        )
        self.assert_problem(response, 404, "RESULT_NOT_AVAILABLE")

    async def test_comparison_lookup_and_disabled_live_mode(self) -> None:
        request = {
            "regionId": "mock:district:nagpur",
            "baselinePeriod": {"startDate": "2019-10-15", "endDate": "2019-12-15"},
            "comparisonPeriod": {"startDate": "2024-10-15", "endDate": "2024-12-15"},
            "indicatorIds": ["surface-water", "vegetation", "built-up"],
            "modePreference": "demo",
        }
        response = await self.client.post("/api/v1/comparisons", json=request)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["meta"]["mock"])

        request["modePreference"] = "live"
        response = await self.client.post("/api/v1/comparisons", json=request)
        self.assert_problem(response, 503, "LIVE_MODE_DISABLED")

    async def test_extra_input_and_oversized_body_are_rejected(self) -> None:
        request = {
            "regionId": "mock:district:nagpur",
            "baselinePeriod": {"startDate": "2019-10-15", "endDate": "2019-12-15"},
            "comparisonPeriod": {"startDate": "2024-10-15", "endDate": "2024-12-15"},
            "indicatorIds": ["surface-water"],
            "modePreference": "demo",
            "upstreamUrl": "https://attacker.example/raster.tif",
        }
        response = await self.client.post("/api/v1/comparisons", json=request)
        self.assert_problem(response, 422, "VALIDATION_ERROR")

        response = await self.client.post(
            "/api/v1/comparisons",
            content=b"x" * (settings.max_request_bytes + 1),
            headers={"Content-Type": "application/json"},
        )
        self.assert_problem(response, 413, "REQUEST_TOO_LARGE")

        async def oversized_chunks():
            yield b"x" * settings.max_request_bytes
            yield b"x"

        response = await self.client.post(
            "/api/v1/comparisons",
            content=oversized_chunks(),
            headers={"Content-Type": "application/json"},
        )
        self.assert_problem(response, 413, "REQUEST_TOO_LARGE")

        response = await self.client.post("/api/v1/comparisons", json={})
        self.assert_problem(response, 422, "VALIDATION_ERROR")

    async def test_internal_failures_are_redacted_and_job_creation_is_disabled(self) -> None:
        with patch(
            "apps.api.app.main.repository.get_summary",
            side_effect=RuntimeError("private provider response"),
        ):
            response = await self.client.get(
                "/api/v1/regions/mock:district:nagpur/summary",
                params=PERIOD_QUERY,
            )
        body = self.assert_problem(response, 500, "INTERNAL_ERROR")
        self.assertNotIn("private provider response", response.text)
        self.assertEqual(body["detail"], "The service could not complete the request.")

        response = await self.client.post("/api/v1/processing/jobs", json={})
        self.assert_problem(response, 404, "HTTP_404")

    async def test_metadata_layer_job_and_timeseries_reads(self) -> None:
        datasets = await self.client.get("/api/v1/metadata/datasets")
        self.assertEqual(datasets.status_code, 200, datasets.text)
        self.assertTrue(datasets.json()["data"])

        layer_id = "mock:layer:nagpur-water-change"
        layer = await self.client.get(f"/api/v1/layers/{layer_id}")
        self.assertEqual(layer.status_code, 200, layer.text)

        job = await self.client.get("/api/v1/processing/jobs/mock:job:nagpur-water")
        self.assertEqual(job.status_code, 200, job.text)
        self.assertEqual(job.headers["cache-control"], "no-store")

        series = await self.client.get(
            "/api/v1/regions/mock:district:nagpur/timeseries",
            params={
                "indicatorId": "vegetation",
                "startDate": "2019-01-01",
                "endDate": "2024-12-31",
            },
        )
        self.assertEqual(series.status_code, 200, series.text)
        self.assertEqual(len(series.json()["data"]["points"]), 6)

    async def test_cors_allows_only_configured_origin(self) -> None:
        allowed = settings.allowed_origins[0]
        response = await self.client.options(
            "/api/v1/health",
            headers={
                "Origin": allowed,
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), allowed)

        response = await self.client.options(
            "/api/v1/health",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertNotEqual(response.headers.get("access-control-allow-origin"), "https://attacker.example")


if __name__ == "__main__":
    unittest.main()
