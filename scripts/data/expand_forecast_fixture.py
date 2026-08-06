"""Expand the synthetic forecast fixture to the supported city catalogue.

The API intentionally serves a checked-in, synthetic pack while the real
forecast ingestion pipeline is being built.  This utility keeps that fixture
reproducible without changing the FastAPI repository or forecast logic.

The copied values are integration-test data only.  A city-specific forecast
must not be published as operational guidance until it is produced from real
inputs, calibrated, and validated.
"""

from __future__ import annotations

from argparse import ArgumentParser
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
PACK_PATH = ROOT / "contracts" / "examples" / "forecasts" / "district-nagpur.json"
CATALOG_PATH = ROOT / "data" / "catalog" / "supported-cities.json"

SUPPORTED_REGION_IDS = (
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

HAZARDS = ("flood", "drought", "heat")
RISK_THRESHOLDS = (0.20, 0.40, 0.70)


def load_city_catalog() -> dict[str, dict[str, Any]]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    cities = {city["regionId"]: city for city in catalog["cities"]}
    missing = [region_id for region_id in SUPPORTED_REGION_IDS if region_id not in cities]
    if missing:
        raise ValueError(f"Forecast fixture cities are missing from the catalogue: {missing}")
    return cities


def expand_pack(template: dict[str, Any]) -> dict[str, Any]:
    cities = load_city_catalog()
    template_runs = {
        run["hazard"]: run
        for run in template["runs"]
        if run["region"]["id"] == "district:nagpur"
    }
    if set(template_runs) != set(HAZARDS):
        raise ValueError("The Nagpur template must contain exactly flood, drought, and heat runs")

    runs: list[dict[str, Any]] = []
    aliases: dict[str, list[str]] = {}
    for region_id in SUPPORTED_REGION_IDS:
        aliases[region_id] = [f"mock:{region_id}"]
        for hazard in HAZARDS:
            if region_id == "district:nagpur":
                runs.append(deepcopy(template_runs[hazard]))
            else:
                runs.append(clone_run(template_runs[hazard], cities[region_id]))

    expanded = deepcopy(template)
    expanded["regionAliases"] = aliases
    expanded["runs"] = runs
    validate_pack_shape(expanded)
    return expanded


def clone_run(template_run: dict[str, Any], city: dict[str, Any]) -> dict[str, Any]:
    run = deepcopy(template_run)
    region_id = city["regionId"]
    city_name = city["name"]
    hazard = run["hazard"]
    bias = synthetic_bias(region_id, hazard)

    run["runId"] = f"forecast-run:{region_id.replace(':', '-')}:" f"{run['issueTime'].replace(':', '-').lower()}:{hazard}"
    run["region"] = {
        "id": region_id,
        "name": city_name,
        "type": "district",
        "parentId": None,
        "bbox": city["bbox"],
        "centroid": city["centroid"],
        "geometryUrl": None,
        "indicatorIds": ["surface-water", "vegetation", "built-up"],
    }

    for point in run["points"]:
        old_probability = point["probability"]
        probability = clamp(round(old_probability + bias, 4), 0.01, 0.99)
        lower_delta = old_probability - point["uncertainty"]["lower"]
        upper_delta = point["uncertainty"]["upper"] - old_probability
        point["probability"] = probability
        point["riskClass"] = risk_class(probability)
        point["uncertainty"] = {
            "lower": round(clamp(probability - lower_delta, 0.0, 1.0), 4),
            "upper": round(clamp(probability + upper_delta, 0.0, 1.0), 4),
        }
        point["exposedPopulation"] = None
        adjust_observations(point, bias)

    peak = max(run["points"], key=lambda point: point["probability"])
    run["summary"]["peakProbability"] = peak["probability"]
    run["summary"]["peakValidAt"] = peak["validAt"]
    run["summary"]["riskClass"] = peak["riskClass"]
    run["summary"]["confidence"] = peak["confidence"]
    run["summary"]["exposedPopulationEstimate"] = None
    run["summary"]["keyDrivers"] = deepcopy(run["points"][-1]["drivers"])
    run["provenance"]["sources"][0]["itemIds"] = [f"fixture:{city['slug']}:2026-08-05"]
    run["provenance"]["sources"][0]["citation"] = (
        "Synthetic city extension for integration testing; no operational upstream acquisition is represented."
    )
    run["warnings"] = [
        "This run is a synthetic prototype fixture, not a live forecast.",
        f"Probabilities are not calibrated or formally validated for {city_name}.",
    ]
    return run


def adjust_observations(point: dict[str, Any], bias: float) -> None:
    for collection_name in ("metrics", "drivers"):
        for observation in point[collection_name]:
            value = observation.get("value")
            if not isinstance(value, (int, float)):
                continue
            unit = observation.get("unit")
            if unit in {"percent", "percentile"}:
                adjusted = value + bias * 100
            elif unit == "mm":
                adjusted = value * (1 + bias)
            elif unit == "celsius":
                adjusted = value + bias * 5
            elif unit == "SPI":
                adjusted = value + bias * 0.5
            else:
                adjusted = value
            observation["value"] = round(
                clamp(adjusted, 0.0, 100.0) if unit in {"percent", "percentile"} else adjusted,
                4,
            )


def synthetic_bias(region_id: str, hazard: str) -> float:
    digest = hashlib.sha256(f"{region_id}:{hazard}".encode("utf-8")).digest()
    normalized = int.from_bytes(digest[:2], "big") / 65535
    return round((normalized - 0.5) * 0.10, 4)


def risk_class(probability: float) -> str:
    if probability < RISK_THRESHOLDS[0]:
        return "low"
    if probability < RISK_THRESHOLDS[1]:
        return "moderate"
    if probability < RISK_THRESHOLDS[2]:
        return "high"
    return "very-high"


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def validate_pack_shape(pack: dict[str, Any]) -> None:
    expected_count = len(SUPPORTED_REGION_IDS) * len(HAZARDS)
    if len(pack["runs"]) != expected_count:
        raise ValueError(f"Expected {expected_count} forecast runs, found {len(pack['runs'])}")
    keys = [(run["region"]["id"], run["hazard"], run["runId"]) for run in pack["runs"]]
    if len(keys) != len(set(keys)):
        raise ValueError("Expanded forecast fixture contains duplicate runs")
    for region_id in SUPPORTED_REGION_IDS:
        hazards = {run["hazard"] for run in pack["runs"] if run["region"]["id"] == region_id}
        if hazards != set(HAZARDS):
            raise ValueError(f"Forecast fixture is missing a hazard for {region_id}")


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=PACK_PATH)
    args = parser.parse_args()
    template = json.loads(PACK_PATH.read_text(encoding="utf-8"))
    expanded = expand_pack(template)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(expanded, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(expanded['runs'])} synthetic forecast runs for {len(SUPPORTED_REGION_IDS)} cities to {args.output}")


if __name__ == "__main__":
    main()
