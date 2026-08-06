from __future__ import annotations

import unittest

from apps.api.app.forecast_engine import (
    ForecastFeatures,
    confidence,
    drought_probability,
    flood_probability,
    heat_probability,
    risk_class,
)


class ForecastEngineTests(unittest.TestCase):
    def test_flood_probability_increases_with_rainfall_and_wetness(self) -> None:
        dry = ForecastFeatures(
            rainfall_6h_mm=5,
            rainfall_24h_mm=8,
            rainfall_72h_mm=12,
            soil_moisture_percentile=30,
            river_level_percentile=30,
            river_rate_percentile=30,
        )
        wet = ForecastFeatures(
            rainfall_6h_mm=40,
            rainfall_24h_mm=80,
            rainfall_72h_mm=140,
            soil_moisture_percentile=90,
            river_level_percentile=90,
            river_rate_percentile=90,
        )
        self.assertLess(flood_probability(dry, 24), flood_probability(wet, 24))

    def test_drought_probability_increases_with_negative_indices(self) -> None:
        normal = ForecastFeatures(
            rainfall_percentile=65,
            soil_moisture_percentile=70,
            spi_4_week=0.4,
            temperature_anomaly_c=0.2,
            vegetation_anomaly_percent=4,
        )
        stressed = ForecastFeatures(
            rainfall_percentile=15,
            soil_moisture_percentile=20,
            spi_4_week=-1.8,
            temperature_anomaly_c=3.0,
            vegetation_anomaly_percent=-20,
        )
        self.assertLess(drought_probability(normal, 4), drought_probability(stressed, 4))

    def test_heat_probability_increases_with_temperature_and_anomaly(self) -> None:
        mild = ForecastFeatures(air_temperature_c=32, temperature_anomaly_c=0.2)
        extreme = ForecastFeatures(air_temperature_c=42, temperature_anomaly_c=4.0)
        self.assertLess(heat_probability(mild, 5), heat_probability(extreme, 5))

    def test_confidence_is_separate_from_hazard_probability(self) -> None:
        score, label = confidence(
            ForecastFeatures(coverage_score=90, ensemble_agreement=80, freshness_score=90)
        )
        self.assertEqual(score, 0.8667)
        self.assertEqual(label, "high")
        self.assertEqual(risk_class(0.65), "high")
        self.assertEqual(risk_class(0.71), "very-high")

    def test_invalid_horizon_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            flood_probability(ForecastFeatures(), 7)
        with self.assertRaises(ValueError):
            drought_probability(ForecastFeatures(), 3)
        with self.assertRaises(ValueError):
            heat_probability(ForecastFeatures(), 2)


if __name__ == "__main__":
    unittest.main()
