"""Build a deterministic prototype forecast pack from normalized features.

The default inputs are synthetic and exist only to exercise the contract.  A
real ingestion job should replace ``DEFAULT_FEATURES`` with versioned regional
inputs and must run scientific validation before publishing the result.
"""

from __future__ import annotations

from argparse import ArgumentParser
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
from typing import Any, Callable

from apps.api.app.forecast_engine import (
    ForecastFeatures,
    confidence,
    drought_probability,
    flood_probability,
    heat_probability,
    risk_class,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "contracts" / "examples" / "forecasts" / "district-nagpur.generated.json"
REGION = {
    "id": "district:nagpur",
    "name": "Nagpur district",
    "type": "district",
    "parentId": None,
    "bbox": [78.25182, 20.58121, 79.66161, 21.72314],
    "centroid": [79.08797740597822, 21.176853476440222],
    "geometryUrl": None,
    "indicatorIds": ["surface-water", "vegetation", "built-up"],
}
DEFAULT_FEATURES: dict[str, list[ForecastFeatures]] = {
    "flood": [
        ForecastFeatures(18, 18, 18, soil_moisture_percentile=72, river_level_percentile=50, river_rate_percentile=45, coverage_score=78, ensemble_agreement=64, freshness_score=82),
        ForecastFeatures(32, 38, 38, soil_moisture_percentile=76, river_level_percentile=58, river_rate_percentile=56, coverage_score=77, ensemble_agreement=62, freshness_score=80),
        ForecastFeatures(48, 62, 62, soil_moisture_percentile=79, river_level_percentile=66, river_rate_percentile=65, coverage_score=76, ensemble_agreement=60, freshness_score=78),
        ForecastFeatures(68, 92, 92, soil_moisture_percentile=82, river_level_percentile=78, river_rate_percentile=76, coverage_score=72, ensemble_agreement=52, freshness_score=70),
        ForecastFeatures(82, 118, 118, soil_moisture_percentile=84, river_level_percentile=88, river_rate_percentile=84, coverage_score=68, ensemble_agreement=44, freshness_score=64),
    ],
    "drought": [
        ForecastFeatures(rainfall_percentile=42, soil_moisture_percentile=43, spi_4_week=-0.7, temperature_anomaly_c=0.8, vegetation_anomaly_percent=-4, coverage_score=78, ensemble_agreement=63, freshness_score=80),
        ForecastFeatures(rainfall_percentile=34, soil_moisture_percentile=34, spi_4_week=-1.0, temperature_anomaly_c=1.1, vegetation_anomaly_percent=-8, coverage_score=76, ensemble_agreement=61, freshness_score=78),
        ForecastFeatures(rainfall_percentile=26, soil_moisture_percentile=26, spi_4_week=-1.35, temperature_anomaly_c=1.5, vegetation_anomaly_percent=-12, coverage_score=70, ensemble_agreement=54, freshness_score=70),
        ForecastFeatures(rainfall_percentile=20, soil_moisture_percentile=20, spi_4_week=-1.55, temperature_anomaly_c=1.8, vegetation_anomaly_percent=-16, coverage_score=65, ensemble_agreement=46, freshness_score=64),
    ],
    "heat": [
        ForecastFeatures(air_temperature_c=37.4, land_surface_temperature_c=43.1, temperature_anomaly_c=1.8, coverage_score=82, ensemble_agreement=70, freshness_score=88),
        ForecastFeatures(air_temperature_c=38.6, temperature_anomaly_c=2.4, coverage_score=80, ensemble_agreement=68, freshness_score=84),
        ForecastFeatures(air_temperature_c=39.2, temperature_anomaly_c=2.9, coverage_score=75, ensemble_agreement=62, freshness_score=80),
        ForecastFeatures(air_temperature_c=40.1, temperature_anomaly_c=3.2, coverage_score=70, ensemble_agreement=56, freshness_score=76),
        ForecastFeatures(air_temperature_c=39.4, temperature_anomaly_c=2.7, coverage_score=66, ensemble_agreement=48, freshness_score=70),
    ],
}
LEADS = {"flood": [(6, "hours"), (12, "hours"), (24, "hours"), (48, "hours"), (72, "hours")], "drought": [(2, "weeks"), (4, "weeks"), (8, "weeks"), (12, "weeks")], "heat": [(1, "days"), (3, "days"), (5, "days"), (7, "days"), (10, "days")]}


def build_pack(issue_time: datetime = datetime(2026, 8, 5, 6, tzinfo=timezone.utc)) -> dict[str, Any]:
    runs = [build_run(hazard, issue_time, DEFAULT_FEATURES[hazard]) for hazard in ("flood", "drought", "heat")]
    return {"packVersion": "1", "generatedAt": _iso(issue_time + timedelta(minutes=15)), "synthetic": True, "regionAliases": {"district:nagpur": ["mock:district:nagpur"]}, "runs": runs}


def build_run(hazard: str, issue_time: datetime, features: list[ForecastFeatures]) -> dict[str, Any]:
    lead_definitions = LEADS[hazard]
    point_builder: Callable[[ForecastFeatures, int], float] = {"flood": flood_probability, "drought": drought_probability, "heat": heat_probability}[hazard]
    points = []
    for (lead, unit), feature in zip(lead_definitions, features, strict=True):
        probability = point_builder(feature, lead)
        confidence_score, confidence_class = confidence(feature)
        valid_at = issue_time + {"hours": timedelta(hours=lead), "days": timedelta(days=lead), "weeks": timedelta(weeks=lead)}[unit]
        points.append({"leadTime": lead, "leadUnit": unit, "validAt": _iso(valid_at), "probability": probability, "riskClass": risk_class(probability), "confidence": confidence_class, "confidenceScore": confidence_score, "uncertainty": {"lower": round(max(0, probability - (0.10 + (1 - confidence_score) * 0.12)), 4), "upper": round(min(1, probability + (0.10 + (1 - confidence_score) * 0.12)), 4)}, "metrics": _metrics(hazard, feature), "drivers": _drivers(hazard, feature), "exposedPopulation": None, "notes": ["Generated from synthetic normalized features."]})
    peak = max(points, key=lambda point: point["probability"])
    generated_at = issue_time + timedelta(minutes=15)
    parameters_hash = "sha256:" + hashlib.sha256(json.dumps({"hazard": hazard, "leads": lead_definitions}, sort_keys=True).encode()).hexdigest()
    return {"runId": f"forecast-run:district-nagpur:{issue_time.strftime('%Y-%m-%dT%H-%M-%SZ').lower()}:{hazard}", "region": REGION, "hazard": hazard, "issueTime": _iso(issue_time), "status": "degraded", "stale": False, "forecastWindow": {"firstValidAt": points[0]["validAt"], "lastValidAt": points[-1]["validAt"], "timeZone": "UTC"}, "summary": {"peakProbability": peak["probability"], "peakValidAt": peak["validAt"], "riskClass": peak["riskClass"], "confidence": peak["confidence"], "dataFreshnessMinutes": 60, "exposedPopulationEstimate": None, "exposureUnit": "people-estimate", "keyDrivers": points[-1]["drivers"][:2]}, "points": points, "model": {"modelVersion": "baseline-logistic-forecast-v1.0.0", "modelType": "transparent-logistic-baseline", "calibrationStatus": "not-calibrated", "validationStatus": "exploratory", "trainingDataStatus": "synthetic-fixture", "modelCardUrl": None}, "provenance": {"sources": [{"datasetId": "sparc-demo:synthetic-features", "provider": "SPARC", "mission": "Synthetic prototype input", "collection": "forecast-prototype-v1", "processingBaseline": None, "itemIds": ["fixture:nagpur"], "acquiredAt": [_iso(issue_time)], "assetKeys": [hazard], "sourceUrl": "https://sparc.example.invalid/forecast-fixture", "citation": "Synthetic prototype inputs; no operational upstream acquisition is represented.", "license": "SPARC project fixture; not for operational redistribution"}], "algorithmId": "sparc:forecast:baseline-logistic", "algorithmVersion": "1.0.0", "parametersHash": parameters_hash, "analysisCrs": "EPSG:4326", "effectiveResolutionMeters": 1000, "generatedAt": _iso(generated_at)}, "layers": [], "warnings": ["This run is a synthetic prototype fixture, not a live forecast.", "Probabilities are not calibrated or formally validated for Nagpur."], "disclaimer": "Decision-support prototype only. Consult responsible authorities for official warnings."}


def _metrics(hazard: str, feature: ForecastFeatures) -> list[dict[str, Any]]:
    if hazard == "flood":
        return [{"id": "forecast-rainfall", "label": "Forecast rainfall accumulation", "value": feature.rainfall_24h_mm, "unit": "mm"}, {"id": "soil-moisture", "label": "Soil-moisture percentile", "value": feature.soil_moisture_percentile, "unit": "percentile"}]
    if hazard == "drought":
        return [{"id": "spi-4-week", "label": "Four-week SPI", "value": feature.spi_4_week, "unit": "SPI"}, {"id": "rainfall-percentile", "label": "Rainfall percentile", "value": feature.rainfall_percentile, "unit": "percentile"}]
    return [{"id": "air-temperature", "label": "Forecast two-metre air temperature", "value": feature.air_temperature_c, "unit": "celsius"}, {"id": "temperature-anomaly", "label": "Temperature anomaly", "value": feature.temperature_anomaly_c, "unit": "celsius"}]


def _drivers(hazard: str, feature: ForecastFeatures) -> list[dict[str, Any]]:
    if hazard == "flood":
        return [{"id": "forecast-rainfall", "label": "Forecast rainfall accumulation", "direction": "increases-risk", "value": feature.rainfall_24h_mm, "unit": "mm"}, {"id": "soil-moisture", "label": "Antecedent soil moisture", "direction": "increases-risk", "value": feature.soil_moisture_percentile, "unit": "percentile"}]
    if hazard == "drought":
        return [{"id": "spi-4-week", "label": "Four-week SPI", "direction": "increases-risk", "value": feature.spi_4_week, "unit": "SPI"}, {"id": "rainfall-percentile", "label": "Rainfall percentile", "direction": "increases-risk", "value": feature.rainfall_percentile, "unit": "percentile"}]
    return [{"id": "air-temperature", "label": "Forecast two-metre air temperature", "direction": "increases-risk", "value": feature.air_temperature_c, "unit": "celsius"}, {"id": "temperature-anomaly", "label": "Temperature anomaly", "direction": "increases-risk", "value": feature.temperature_anomaly_c, "unit": "celsius"}]


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(build_pack(), indent=2) + "\n", encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
