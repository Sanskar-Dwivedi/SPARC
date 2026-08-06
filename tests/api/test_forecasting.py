from __future__ import annotations

import httpx
import unittest

from apps.api.app.main import app, settings


RUN_IDS = {
    "flood": "forecast-run:district-nagpur:2026-08-05t06-00-00z:flood",
    "drought": "forecast-run:district-nagpur:2026-08-05t06-00-00z:drought",
    "heat": "forecast-run:district-nagpur:2026-08-05t06-00-00z:heat",
}
SUPPORTED_FORECAST_REGION_IDS = (
    "district:nagpur",
    "district:bengaluru-urban",
    "district:mumbai",
    "district:delhi",
    "district:chennai",
    "district:bhopal",
    "district:new-york",
    "district:washington-dc",
    "district:tokyo",
    "district:london",
    "district:cairo",
    "district:sydney",
    "district:rio-de-janeiro",
    "district:reykjavik",
)


class ForecastApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        self.client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()

    async def test_forecast_run_catalogue_exposes_all_three_hazards(self) -> None:
        response = await self.client.get("/api/v1/regions/mock:district:nagpur/forecast-runs")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual({item["hazard"] for item in body["data"]}, {"flood", "drought", "heat"})
        self.assertTrue(body["meta"]["mock"])
        self.assertIn("synthetic", " ".join(body["meta"]["warnings"]))

        response = await self.client.get(
            "/api/v1/regions/mock:district:nagpur/forecast-runs",
            params={"hazard": "heat"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([item["hazard"] for item in response.json()["data"]], ["heat"])

    async def test_latest_forecasts_return_probability_confidence_and_provenance(self) -> None:
        for hazard, run_id in RUN_IDS.items():
            response = await self.client.get(
                f"/api/v1/regions/mock:district:nagpur/forecasts/{hazard}/latest"
            )
            self.assertEqual(response.status_code, 200, response.text)
            data = response.json()["data"]
            self.assertEqual(data["runId"], run_id)
            self.assertEqual(data["hazard"], hazard)
            self.assertEqual(data["model"]["calibrationStatus"], "not-calibrated")
            self.assertEqual(data["model"]["validationStatus"], "exploratory")
            self.assertTrue(data["provenance"]["sources"])
            self.assertTrue(all(0 <= point["probability"] <= 1 for point in data["points"]))
            self.assertTrue(all(point["uncertainty"]["lower"] <= point["uncertainty"]["upper"] for point in data["points"]))

        heat = (
            await self.client.get(
                "/api/v1/regions/mock:district:nagpur/forecasts/heat/latest"
            )
        ).json()["data"]
        metric_ids = {metric["id"] for metric in heat["points"][0]["metrics"]}
        self.assertIn("air-temperature", metric_ids)
        self.assertIn("land-surface-temperature", metric_ids)

    async def test_requested_city_fixture_coverage_exposes_all_hazards(self) -> None:
        for region_id in SUPPORTED_FORECAST_REGION_IDS:
            requested_region = f"mock:{region_id}"
            response = await self.client.get(
                f"/api/v1/regions/{requested_region}/forecast-runs"
            )
            self.assertEqual(response.status_code, 200, response.text)
            body = response.json()
            self.assertEqual(
                {item["hazard"] for item in body["data"]},
                {"flood", "drought", "heat"},
                region_id,
            )
            for hazard in ("flood", "drought", "heat"):
                response = await self.client.get(
                    f"/api/v1/regions/{requested_region}/forecasts/{hazard}/latest"
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["data"]["region"]["id"], requested_region)

    async def test_forecast_timeseries_is_immutable_and_etag_aware(self) -> None:
        path = (
            "/api/v1/regions/mock:district:nagpur/forecasts/flood/"
            f"{RUN_IDS['flood']}/timeseries"
        )
        first = await self.client.get(path)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["data"]["hazard"], "flood")
        self.assertEqual(len(first.json()["data"]["points"]), 5)

        second = await self.client.get(path, headers={"If-None-Match": first.headers["etag"]})
        self.assertEqual(second.status_code, 304)
        self.assertEqual(second.content, b"")

    async def test_forecast_errors_do_not_leak_catalogue_or_internal_details(self) -> None:
        response = await self.client.get(
            "/api/v1/regions/mock:subdistrict:hingna/forecasts/flood/latest"
        )
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(response.json()["code"], "FORECAST_NOT_AVAILABLE")

        response = await self.client.get(
            "/api/v1/regions/mock:district:nagpur/forecasts/landslide/latest"
        )
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.headers["content-type"], "application/problem+json")
        self.assertEqual(response.json()["code"], "VALIDATION_ERROR")
        self.assertNotIn(str(settings.repo_root), response.text)

        response = await self.client.get(
            "/api/v1/regions/unknown:district/forecasts/flood/latest"
        )
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(response.json()["code"], "REGION_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
