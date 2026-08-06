from __future__ import annotations

import json
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator, FormatChecker

from apps.api.app.forecast_repository import ForecastRepository


ROOT = Path(__file__).resolve().parents[2]
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


class ForecastContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        schema_path = ROOT / "packages" / "contracts" / "schemas" / "sparc.schema.json"
        cls.schema = json.loads(schema_path.read_text(encoding="utf-8"))
        cls.repository = ForecastRepository(
            ROOT / "contracts" / "examples" / "forecasts",
            "demo",
        )

    def validate(self, definition: str, payload: dict) -> None:
        validator = Draft202012Validator(
            {**self.schema, "$ref": f"#/$defs/{definition}"},
            format_checker=FormatChecker(),
        )
        errors = sorted(validator.iter_errors(payload), key=lambda error: list(error.path))
        self.assertFalse(errors, [error.message for error in errors[:5]])

    def test_forecast_run_responses_validate_against_shared_schema(self) -> None:
        for hazard in ("flood", "drought", "heat"):
            data = self.repository.get_latest("district:nagpur", hazard)
            assert data is not None
            response = {
                "data": data,
                "meta": self.repository.base_meta,
                "links": {
                    "self": f"/api/v1/regions/district:nagpur/forecasts/{hazard}/latest",
                    "related": [],
                },
            }
            self.validate("ForecastRunResponse", response)

            series = self.repository.get_timeseries(
                "district:nagpur", hazard, data["runId"]
            )
            assert series is not None
            self.validate(
                "ForecastTimeSeriesResponse",
                {"data": series, "meta": self.repository.base_meta, "links": response["links"]},
            )

    def test_forecast_run_catalogue_validates(self) -> None:
        runs = self.repository.list_runs("district:nagpur")
        self.assertEqual(len(runs), 3)
        self.validate(
            "ForecastRunListResponse",
            {
                "data": runs,
                "meta": self.repository.base_meta,
                "links": {"self": "/api/v1/regions/district:nagpur/forecast-runs", "related": []},
            },
        )

    def test_requested_city_forecast_runs_validate(self) -> None:
        for region_id in SUPPORTED_FORECAST_REGION_IDS:
            runs = self.repository.list_runs(region_id)
            self.assertEqual(len(runs), 3, region_id)
            for hazard in ("flood", "drought", "heat"):
                data = self.repository.get_latest(region_id, hazard)
                self.assertIsNotNone(data, f"{region_id}/{hazard}")
                assert data is not None
                self.validate(
                    "ForecastRunResponse",
                    {
                        "data": data,
                        "meta": self.repository.base_meta,
                        "links": {
                            "self": f"/api/v1/regions/{region_id}/forecasts/{hazard}/latest",
                            "related": [],
                        },
                    },
                )


if __name__ == "__main__":
    unittest.main()
