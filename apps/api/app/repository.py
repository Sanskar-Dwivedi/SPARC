"""Allowlisted, immutable access to the local result inventory.

The repository still serves the existing contract fixtures until the
Earth-Engine precomputed-pack adapter is wired in. The checked-in Nagpur
built-up fixture uses the approved constrained-NDBI source directly.
"""

from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from typing import Any


COMPARISON_FILES = {
    "surface-water": "water-comparison.mock.json",
    "vegetation": "vegetation-comparison.mock.json",
    "built-up": "built-up-comparison.mock.json",
    "lst": "lst-comparison.mock.json",
}

class MockResultRepository:
    """Loads a fixed file inventory once; request values never become paths."""

    def __init__(self, examples_root: Path) -> None:
        self._examples_root = examples_root.resolve(strict=True)
        self._summary = self._load("district-summary.mock.json")
        self._block_results = self._load("block-results.mock.json")
        self._time_series = self._load("time-series.mock.json")
        self._job = self._load("processing-job.mock.json")
        self._comparisons = {
            indicator_id: self._load(filename)
            for indicator_id, filename in COMPARISON_FILES.items()
        }
        partial = self._load("partial-data.mock.json")
        self._comparisons.setdefault(partial["data"]["indicator"]["id"], partial)

        self._regions = self._index_regions()
        self._layers = self._index_layers()
        self._comparison_ids = {
            payload["data"]["comparisonId"] for payload in self._comparisons.values()
        }

    def _load(self, filename: str) -> dict[str, Any]:
        if Path(filename).name != filename:
            raise RuntimeError("Example inventory contains an unsafe filename")
        path = (self._examples_root / filename).resolve(strict=True)
        if path.parent != self._examples_root:
            raise RuntimeError("Example resolved outside the fixed repository root")
        payload = json.loads(path.read_text(encoding="utf-8"))
        if "meta" in payload and payload["meta"].get("mock") is not True:
            raise RuntimeError(f"Demo example is not marked as mock: {filename}")
        return payload

    def _index_regions(self) -> dict[str, dict[str, Any]]:
        regions = [self._summary["data"]["region"], self._block_results["data"]["parentRegion"]]
        regions.extend(result["region"] for result in self._block_results["data"]["results"])
        return {region["id"]: region for region in regions}

    def _index_layers(self) -> dict[str, dict[str, Any]]:
        layers: dict[str, dict[str, Any]] = {}
        for payload in self._comparisons.values():
            for layer in payload["data"]["layers"]:
                layers[layer["id"]] = layer
        return layers

    def list_regions(self, region_type: str | None, parent_id: str | None) -> list[dict[str, Any]]:
        regions = self._regions.values()
        if region_type is not None:
            regions = (region for region in regions if region["type"] == region_type)
        if parent_id is not None:
            regions = (region for region in regions if region["parentId"] == parent_id)
        return deepcopy(sorted(regions, key=lambda region: region["id"]))

    def get_region(self, region_id: str) -> dict[str, Any] | None:
        region = self._regions.get(region_id)
        return deepcopy(region) if region else None

    def get_summary(self, region_id: str) -> dict[str, Any] | None:
        if self._summary["data"]["region"]["id"] != region_id:
            return None
        return deepcopy(self._summary)

    def list_indicators(self, region_id: str) -> list[dict[str, Any]] | None:
        summary = self.get_summary(region_id)
        return summary["data"]["indicators"] if summary else None

    def get_indicator(self, region_id: str, indicator_id: str) -> dict[str, Any] | None:
        payload = self._comparisons.get(indicator_id)
        if not payload or payload["data"]["region"]["id"] != region_id:
            return None
        return deepcopy(payload)

    def get_time_series(self, region_id: str, indicator_id: str) -> dict[str, Any] | None:
        data = self._time_series["data"]
        if data["region"]["id"] != region_id or data["indicator"]["id"] != indicator_id:
            return None
        return deepcopy(self._time_series)

    def get_comparison_summary(self, comparison_id: str) -> dict[str, Any] | None:
        return deepcopy(self._summary) if comparison_id in self._comparison_ids else None

    def get_layer(self, layer_id: str) -> dict[str, Any] | None:
        layer = self._layers.get(layer_id)
        return deepcopy(layer) if layer else None

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        return deepcopy(self._job) if self._job["data"]["id"] == job_id else None

    def list_datasets(self) -> list[dict[str, Any]]:
        datasets: dict[str, dict[str, Any]] = {}
        for payload in self._comparisons.values():
            for source in payload["data"]["provenance"]["sources"]:
                datasets.setdefault(source["datasetId"], source)
        return deepcopy(sorted(datasets.values(), key=lambda source: source["datasetId"]))

    def list_indicator_metadata(self) -> list[dict[str, Any]]:
        indicators = {
            payload["data"]["indicator"]["id"]: payload["data"]["indicator"]
            for payload in self._comparisons.values()
        }
        return deepcopy(sorted(indicators.values(), key=lambda indicator: indicator["id"]))

    @property
    def summary_periods(self) -> tuple[dict[str, Any], dict[str, Any]]:
        data = self._summary["data"]
        return deepcopy(data["baselinePeriod"]), deepcopy(data["comparisonPeriod"])

    @property
    def base_meta(self) -> dict[str, Any]:
        return deepcopy(self._summary["meta"])


def envelope(data: Any, meta: dict[str, Any], self_url: str, related: list[str]) -> dict[str, Any]:
    return {
        "data": deepcopy(data),
        "meta": deepcopy(meta),
        "links": {"self": self_url, "related": related},
    }


def apply_request_context(payload: dict[str, Any], request_id: str, self_url: str | None = None) -> dict[str, Any]:
    result = deepcopy(payload)
    if "meta" in result:
        result["meta"]["requestId"] = request_id
    if self_url is not None and "links" in result:
        result["links"]["self"] = self_url
    return result
