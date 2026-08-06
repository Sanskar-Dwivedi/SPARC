"""Adapter from reviewed Earth Engine result packs to the frozen API contract.

The processing pipeline intentionally stores a richer pack than the HTTP
contract.  This adapter is the only place that translates the pack into the
bounded response shape used by the dashboard.  It never runs raster work and
it refuses to start when a required pack/report/boundary record is missing.
"""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from pathlib import Path
from typing import Any


GENERIC_BUILT_UP_CONFLICT_REASON = (
    "Estimated land-cover change is unavailable because the documented methods "
    "reverse direction."
)

INDICATOR_NAMES = {
    "surface-water": ("Estimated surface-water change", "Estimated surface-water area"),
    "vegetation": ("Detected vegetation change", "Detected vegetation cover"),
    "built-up": ("Estimated land-cover change", "Estimated land-cover extent"),
}
INDICATOR_ASSETS = {
    "surface-water": ["B03", "B11", "SCL"],
    "vegetation": ["B04", "B08", "SCL"],
    "built-up": ["B04", "B08", "B11", "SCL"],
}


class PrecomputedPackRepository:
    """Read-only repository for every accepted P0 pack found on disk."""

    def __init__(self, packs_root: Path, reports_root: Path, boundary_metadata: Path) -> None:
        self._packs_root = packs_root.resolve(strict=True)
        self._reports_root = reports_root.resolve(strict=True)
        self._boundary_metadata = boundary_metadata.resolve(strict=True)
        release = _load_json(self._boundary_metadata)
        self._districts = dict(release.get("districts", {}))
        global_release_path = self._boundary_metadata.parents[4] / "data" / "metadata" / "boundaries" / "global" / "release-metadata.json"
        if global_release_path.is_file():
            global_release = _load_json(global_release_path)
            for key, record in global_release.get("cities", {}).items():
                bbox = record.get("bbox")
                if not isinstance(bbox, list) or len(bbox) != 4:
                    continue
                self._districts[key] = {
                    "displayName": record.get("scope", key),
                    "bbox": bbox,
                    "stateValidation": {
                        "representativePoint": {
                            "longitude": (bbox[0] + bbox[2]) / 2,
                            "latitude": (bbox[1] + bbox[3]) / 2,
                        }
                    },
                    "sha256": record.get("boundarySha256"),
                }
        self._packs: dict[str, dict[str, Any]] = {}
        self._reports: dict[tuple[str, str], dict[str, Any]] = {}
        for pack_path in sorted(self._packs_root.glob("*-p0-v2.json")):
            key = pack_path.name.removesuffix("-p0-v2.json")
            pack = _load_json(pack_path)
            if pack.get("packVersion") != "1" or pack.get("status") != "pre-publication":
                raise RuntimeError(f"Unsupported precomputed pack status: {key}")
            if key not in self._districts:
                raise RuntimeError(f"Boundary metadata has no selected district: {key}")
            self._packs[key] = pack
            for indicator in pack["indicators"]:
                indicator_id = indicator["indicatorId"]
                report_path = self._reports_root / f"{key}-{indicator_id}.json"
                report = _load_json(report_path)
                self._validate_report_binding(key, indicator, report, pack["periods"], pack["region"]["boundarySha256"])
                self._reports[(key, indicator_id)] = report

        self._regions = {self._region_id(key): self._region(key) for key in self._packs}
        self._comparisons = {
            (key, indicator_id): self._build_comparison(key, indicator_id)
            for key in self._packs
            for indicator_id in self._indicator_ids(key)
        }
        self._summaries = {key: self._build_summary(key) for key in self._packs}

    @staticmethod
    def _validate_report_binding(
        key: str,
        indicator: dict[str, Any],
        report: dict[str, Any],
        periods: dict[str, Any],
        boundary_sha256: str,
    ) -> None:
        if report.get("region", {}).get("key") != key:
            raise RuntimeError(f"Report region mismatch for {key}/{indicator['indicatorId']}")
        if report.get("periods") != periods:
            raise RuntimeError(f"Report period mismatch for {key}/{indicator['indicatorId']}")
        report_indicator = report.get("indicators", [{}])[0].get("indicatorId")
        if report_indicator != indicator["indicatorId"]:
            raise RuntimeError(f"Report indicator mismatch for {key}/{indicator['indicatorId']}")
        if report.get("region", {}).get("boundarySha256") != boundary_sha256:
            raise RuntimeError(f"Report boundary mismatch for {key}/{indicator['indicatorId']}")

    def _region_id(self, key: str) -> str:
        return f"district:{key}"

    def _region(self, key: str) -> dict[str, Any]:
        district = self._districts[key]
        return {
            "id": self._region_id(key),
            "name": district["displayName"],
            "type": "district",
            "parentId": None,
            "bbox": district["bbox"],
            "centroid": [
                district["stateValidation"]["representativePoint"]["longitude"],
                district["stateValidation"]["representativePoint"]["latitude"],
            ],
            "geometryUrl": None,
            "indicatorIds": self._indicator_ids(key),
        }

    def _indicator_ids(self, key: str) -> list[str]:
        return [item["indicatorId"] for item in self._packs[key]["indicators"]]

    def _periods(self, key: str) -> tuple[dict[str, Any], dict[str, Any]]:
        periods = self._packs[key]["periods"]
        baseline = periods["baseline"]
        comparison = periods["comparison"]
        scene_counts = {
            "baseline": len(self._reports[(key, self._indicator_ids(key)[0])]["source"]["baselineImages"]),
            "comparison": len(self._reports[(key, self._indicator_ids(key)[0])]["source"]["comparisonImages"]),
        }
        month = int(baseline["start"][5:7])
        season = "post-monsoon" if month in {10, 11, 12} else "dry season" if month in {1, 2, 3} else "same-season"
        return (
            {
                "startDate": baseline["start"],
                "endDate": baseline["end"],
                "label": f"{season} baseline {baseline['start'][:4]}",
                "seasonLabel": season,
                "compositeMethod": "Per-observation index median",
                "sceneCount": scene_counts["baseline"],
            },
            {
                "startDate": comparison["start"],
                "endDate": comparison["end"],
                "label": f"{season} comparison {comparison['start'][:4]}",
                "seasonLabel": season,
                "compositeMethod": "Per-observation index median",
                "sceneCount": scene_counts["comparison"],
            },
        )

    def _build_summary(self, key: str) -> dict[str, Any]:
        baseline, comparison = self._periods(key)
        indicators = []
        for indicator in self._packs[key]["indicators"]:
            indicator_id = indicator["indicatorId"]
            comparison_data = self._comparisons[(key, indicator_id)]["data"]
            indicators.append(
                {
                    "indicator": comparison_data["indicator"],
                    "metric": comparison_data["metric"],
                    "qualityLevel": comparison_data["quality"]["level"],
                    "status": comparison_data["status"],
                    "comparisonUrl": f"/api/v1/regions/{self._region_id(key)}/indicators/{indicator_id}",
                }
            )
        return {
            "data": {
                "region": self._regions[self._region_id(key)],
                "baselinePeriod": baseline,
                "comparisonPeriod": comparison,
                "indicators": indicators,
            },
            "meta": self._meta(key),
            "links": {
                "self": f"/api/v1/regions/{self._region_id(key)}/summary",
                "related": [f"/api/v1/regions/{self._region_id(key)}/indicators"],
            },
        }

    def _build_comparison(self, key: str, indicator_id: str) -> dict[str, Any]:
        pack = self._packs[key]
        item = next(item for item in pack["indicators"] if item["indicatorId"] == indicator_id)
        report = self._reports[(key, indicator_id)]
        baseline, comparison = self._periods(key)
        area = item["areaSqKm"]
        blocked_reason = self._built_up_conflict_reason(key, indicator_id, item)
        blocked = blocked_reason is not None
        metric = {
            "baselineValue": None if blocked else area["baseline"],
            "comparisonValue": None if blocked else area["comparison"],
            "absoluteChange": None if blocked else area["net"],
            "percentChange": None if blocked else area["percentChange"],
            "unit": "km2",
            "unavailableReason": blocked_reason,
        }
        quality = item["quality"]
        source = report["source"]
        quality_evidence = {
            "commonValidPercent": item["commonValid"]["fraction"] * 100,
            "cloudPercent": _mean_cloud(source),
            "nodataPercent": max(0.0, (1 - item["commonValid"]["fraction"]) * 100),
            "coveragePercent": item["commonValid"]["fraction"] * 100,
            "sceneCountBaseline": len(source["baselineImages"]),
            "sceneCountComparison": len(source["comparisonImages"]),
            "thresholdSensitivityPercent": _sensitivity_delta(item),
            "independentValidationComplete": False,
            "usersAccuracy": None,
            "producersAccuracy": None,
        }
        warnings = list(quality.get("warnings", []))
        if blocked and blocked_reason not in warnings:
            warnings.append(blocked_reason)
        quality_view = {
            "level": "unknown",
            "basis": "unavailable",
            "methodVersion": item["methodVersion"],
            "reasons": ["Data-quality status is unknown; review coverage and sensitivity in methodology."],
            "warnings": warnings,
            "evidence": quality_evidence,
        }
        indicator_name, proxy_label = INDICATOR_NAMES[indicator_id]
        provenance = self._provenance(key, indicator_id, item, report)
        if blocked:
            interpretation = {
                "summary": blocked_reason,
                "caveats": [blocked_reason],
                "suggestedActions": ["Request inspection or verification rather than selecting one conflicting method."],
                "ruleId": "sparc:interpretation:built-up-conflict-v1",
            }
        else:
            interpretation = {
                "summary": f"{indicator_name} changes from {area['baseline']:.2f} to {area['comparison']:.2f} km² across the analysis periods.",
                "caveats": [
                    "This estimate describes a surface pattern and does not establish cause or responsibility.",
                    pack["disclaimer"],
                ],
                "suggestedActions": ["Review the methodology and provenance before requesting local inspection."],
                "ruleId": f"sparc:interpretation:{indicator_id}-estimate-v1",
            }
        return {
            "data": {
                "comparisonId": f"precomputed:comparison:{key}:{indicator_id}",
                "region": self._regions[self._region_id(key)],
                "indicator": {
                    "id": indicator_id,
                    "version": "1.0.0",
                    "name": indicator_name,
                    "proxyLabel": proxy_label,
                    "unit": "km2",
                    "direction": "context-dependent",
                },
                "baselinePeriod": baseline,
                "comparisonPeriod": comparison,
                "metric": metric,
                "quality": quality_view,
                "provenance": provenance,
                "interpretation": interpretation,
                "layers": [],
                "status": "unavailable" if blocked else "complete",
            },
            "meta": self._meta(key),
            "links": {
                "self": f"/api/v1/regions/{self._region_id(key)}/indicators/{indicator_id}",
                "related": [],
            },
        }

    @staticmethod
    def _built_up_conflict_reason(key: str, indicator_id: str, item: dict[str, Any]) -> str | None:
        """Block non-authoritative built-up methods when their direction conflicts.

        Nagpur's constrained-NDBI result is the approved source for this release;
        its built-IBI run remains sensitivity evidence and must not suppress the
        selected NDBI estimate.
        """

        if indicator_id != "built-up" or key == "nagpur":
            return None
        default_net = item.get("areaSqKm", {}).get("net")
        sensitivity = item.get("sensitivity") or {}
        alternate_net = sensitivity.get("row", {}).get("netAreaSqKm")
        if isinstance(default_net, (int, float)) and isinstance(alternate_net, (int, float)):
            if default_net != 0 and alternate_net != 0 and (default_net > 0) != (alternate_net > 0):
                return GENERIC_BUILT_UP_CONFLICT_REASON
            return None
        # Other districts remain available unless their own evidence demonstrates
        # a conflict. Missing optional sensitivity is not itself a conflict.
        return None

    def _provenance(self, key: str, indicator_id: str, item: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
        source = report["source"]
        images = _bounded_scene_inventory(source)
        parameters = {
            "indicatorId": indicator_id,
            "methodVersion": item["methodVersion"],
            "threshold": item["threshold"],
            "analysis": item["analysis"],
        }
        return {
            "sources": [
                {
                    "datasetId": "earth-engine:copernicus-s2-sr-harmonized",
                    "provider": "Google Earth Engine",
                    "mission": "Sentinel-2",
                    "collection": source["collection"],
                    "processingBaseline": None,
                    "itemIds": [image["id"] for image in images],
                    "acquiredAt": [image["datetime"] for image in images],
                    "assetKeys": INDICATOR_ASSETS[indicator_id],
                    "sourceUrl": "https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED",
                    "citation": "Contains modified Copernicus Sentinel data processed through Google Earth Engine; scene inventory is bounded to the contract limit.",
                    "license": "Copernicus Sentinel Data Legal Notice",
                }
            ],
            "algorithmId": f"sparc:{item['methodVersion']}",
            "algorithmVersion": item["methodVersion"],
            "parametersHash": "sha256:" + hashlib.sha256(
                json.dumps(parameters, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest(),
            "analysisCrs": item["analysis"]["crs"],
            "effectiveResolutionMeters": item["analysis"]["pixelSizeMetres"],
            "generatedAt": self._packs[key]["generatedAt"],
        }

    def _meta(self, key: str) -> dict[str, Any]:
        return {
            "schemaVersion": "1.0.0",
            "requestId": f"precomputed:request:{key}",
            "generatedAt": self._packs[key]["generatedAt"],
            "dataMode": "cache",
            "partial": False,
            "mock": False,
            "warnings": ["Precomputed Earth Engine result; review methodology for data-quality status and known limitations."],
        }

    def list_regions(self, region_type: str | None, parent_id: str | None) -> list[dict[str, Any]]:
        regions = list(self._regions.values())
        if region_type is not None:
            regions = [region for region in regions if region["type"] == region_type]
        if parent_id is not None:
            regions = [region for region in regions if region["parentId"] == parent_id]
        return deepcopy(sorted(regions, key=lambda region: region["id"]))

    def get_region(self, region_id: str) -> dict[str, Any] | None:
        region = self._regions.get(region_id)
        return deepcopy(region) if region else None

    def get_summary(self, region_id: str) -> dict[str, Any] | None:
        key = self._key_for_region(region_id)
        return deepcopy(self._summaries[key]) if key else None

    def list_indicators(self, region_id: str) -> list[dict[str, Any]] | None:
        summary = self.get_summary(region_id)
        return summary["data"]["indicators"] if summary else None

    def get_indicator(self, region_id: str, indicator_id: str) -> dict[str, Any] | None:
        key = self._key_for_region(region_id)
        if not key or (key, indicator_id) not in self._comparisons:
            return None
        return deepcopy(self._comparisons[(key, indicator_id)])

    def get_time_series(self, region_id: str, indicator_id: str) -> dict[str, Any] | None:
        return None

    def get_comparison_summary(self, comparison_id: str) -> dict[str, Any] | None:
        for (key, _), payload in self._comparisons.items():
            if payload["data"]["comparisonId"] == comparison_id:
                return deepcopy(self._summaries[key])
        return None

    def get_layer(self, layer_id: str) -> dict[str, Any] | None:
        return None

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        return None

    def list_datasets(self) -> list[dict[str, Any]]:
        datasets = {}
        for payload in self._comparisons.values():
            for source in payload["data"]["provenance"]["sources"]:
                datasets[source["datasetId"]] = source
        return deepcopy(list(datasets.values()))

    def list_indicator_metadata(self) -> list[dict[str, Any]]:
        indicators = {
            payload["data"]["indicator"]["id"]: payload["data"]["indicator"]
            for payload in self._comparisons.values()
        }
        return deepcopy(sorted(indicators.values(), key=lambda indicator: indicator["id"]))

    @property
    def summary_periods(self) -> tuple[dict[str, Any], dict[str, Any]]:
        first = next(iter(self._summaries.values()))["data"]
        return deepcopy(first["baselinePeriod"]), deepcopy(first["comparisonPeriod"])

    @property
    def base_meta(self) -> dict[str, Any]:
        return deepcopy(next(iter(self._summaries.values()))["meta"])

    def _key_for_region(self, region_id: str) -> str | None:
        for key in self._packs:
            if self._region_id(key) == region_id:
                return key
        return None


def _load_json(path: Path) -> dict[str, Any]:
    resolved = path.resolve(strict=True)
    if resolved.suffix != ".json":
        raise RuntimeError(f"Precomputed source is not JSON: {resolved.name}")
    return json.loads(resolved.read_text(encoding="utf-8"))


def _mean_cloud(source: dict[str, Any]) -> float | None:
    values = [
        image.get("cloudCoverPercent")
        for image in source.get("baselineImages", []) + source.get("comparisonImages", [])
        if isinstance(image.get("cloudCoverPercent"), (int, float))
    ]
    return sum(values) / len(values) if values else None


def _bounded_scene_inventory(source: dict[str, Any], limit: int = 100) -> list[dict[str, Any]]:
    """Keep provenance within the contract cap while retaining both periods."""

    baseline = source.get("baselineImages", [])
    comparison = source.get("comparisonImages", [])
    if len(baseline) + len(comparison) <= limit:
        return baseline + comparison
    per_period = limit // 2
    return baseline[:per_period] + comparison[: limit - per_period]


def _sensitivity_delta(item: dict[str, Any]) -> float | None:
    default = item.get("areaSqKm", {}).get("percentChange")
    # Global city packs may intentionally omit optional threshold sensitivity
    # while the default estimate remains available. Treat a null sensitivity
    # record as no comparison data, not as a malformed object.
    sensitivity = item.get("sensitivity") or {}
    row = sensitivity.get("row", {})
    candidate = row.get("percentChange")
    if isinstance(default, (int, float)) and isinstance(candidate, (int, float)):
        return abs(candidate - default)
    rows = sensitivity.get("rows", [])
    values = [row.get("percentChange") for row in rows if isinstance(row.get("percentChange"), (int, float))]
    return max((abs(value - default) for value in values), default=None) if isinstance(default, (int, float)) else None
