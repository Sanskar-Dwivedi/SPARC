"""Allowlisted access to versioned, precomputed forecast runs."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
from typing import Any

from .forecast_models import ForecastPack, ForecastRun


FORECAST_PACK_FILENAME = "district-nagpur.json"


class ForecastRepository:
    """Load a fixed forecast pack once and serve immutable response data.

    Request identifiers are only used for catalogue lookup.  They never become
    filesystem paths, outbound URLs, or provider queries.
    """

    def __init__(self, examples_root: Path, data_mode: str) -> None:
        self._root = examples_root.resolve(strict=True)
        pack_path = (self._root / FORECAST_PACK_FILENAME).resolve(strict=True)
        if pack_path.parent != self._root or pack_path.name != FORECAST_PACK_FILENAME:
            raise RuntimeError("Forecast pack resolved outside its fixed repository root")
        raw = json.loads(pack_path.read_text(encoding="utf-8"))
        pack = ForecastPack.model_validate(raw)
        self._pack = pack
        self._data_mode = data_mode
        self._runs: dict[tuple[str, str, str], ForecastRun] = {
            (run.region.id, run.hazard, run.run_id): run for run in pack.runs
        }
        self._aliases: dict[str, str] = {run.region.id: run.region.id for run in pack.runs}
        for canonical, aliases in pack.region_aliases.items():
            for alias in aliases:
                existing = self._aliases.get(alias)
                if existing is not None and existing != canonical:
                    raise RuntimeError(f"Forecast region alias has multiple targets: {alias}")
                self._aliases[alias] = canonical

    @property
    def base_meta(self) -> dict[str, Any]:
        warnings = [
            "Forecast values come from a transparent prototype baseline.",
            "Probabilities are not calibrated or formally validated for operational use.",
            "This is decision support, not an official warning or evacuation order.",
        ]
        if self._pack.synthetic:
            warnings.insert(0, "The published forecast pack uses synthetic prototype inputs.")
        return {
            "schemaVersion": "1.0.0",
            "requestId": "forecast:request:unassigned",
            "generatedAt": _isoformat(self._pack.generated_at),
            "dataMode": self._data_mode,
            "partial": False,
            "mock": self._pack.synthetic,
            "warnings": warnings,
        }

    def meta(self, request_id: str) -> dict[str, Any]:
        result = deepcopy(self.base_meta)
        result["requestId"] = request_id
        return result

    def has_region(self, region_id: str) -> bool:
        return region_id in self._aliases

    def list_runs(self, region_id: str, hazard: str | None = None) -> list[dict[str, Any]]:
        canonical = self._aliases.get(region_id)
        if canonical is None:
            return []
        runs = [
            run
            for (run_region, run_hazard, _), run in self._runs.items()
            if run_region == canonical and (hazard is None or run_hazard == hazard)
        ]
        return [self._summary(run, region_id) for run in sorted(runs, key=_issue_time, reverse=True)]

    def get_latest(self, region_id: str, hazard: str) -> dict[str, Any] | None:
        canonical = self._aliases.get(region_id)
        if canonical is None:
            return None
        candidates = [
            run
            for (run_region, run_hazard, _), run in self._runs.items()
            if run_region == canonical and run_hazard == hazard
        ]
        if not candidates:
            return None
        return self._response_data(max(candidates, key=_issue_time), region_id)

    def get_run(self, region_id: str, hazard: str, run_id: str) -> dict[str, Any] | None:
        canonical = self._aliases.get(region_id)
        if canonical is None:
            return None
        run = self._runs.get((canonical, hazard, run_id))
        return self._response_data(run, region_id) if run is not None else None

    def get_timeseries(self, region_id: str, hazard: str, run_id: str) -> dict[str, Any] | None:
        canonical = self._aliases.get(region_id)
        if canonical is None:
            return None
        run = self._runs.get((canonical, hazard, run_id))
        if run is None:
            return None
        response = self._response_data(run, region_id)
        return {
            "region": response["region"],
            "runId": response["runId"],
            "hazard": response["hazard"],
            "issueTime": response["issueTime"],
            "points": response["points"],
            "provenance": response["provenance"],
        }

    @staticmethod
    def _summary(run: ForecastRun, requested_region_id: str) -> dict[str, Any]:
        return {
            "runId": run.run_id,
            "regionId": requested_region_id,
            "hazard": run.hazard,
            "issueTime": _isoformat(run.issue_time),
            "latestValidAt": _isoformat(run.forecast_window.last_valid_at),
            "status": run.status,
            "stale": run.stale,
            "riskClass": run.summary.risk_class,
            "confidence": run.summary.confidence,
            "modelVersion": run.model.model_version,
        }

    @staticmethod
    def _response_data(run: ForecastRun, requested_region_id: str) -> dict[str, Any]:
        response = run.model_dump(by_alias=True, mode="json")
        # The pack stores a canonical region ID and serves the demo alias too.
        # Replace only the response copy; the immutable loaded model is untouched.
        response["region"]["id"] = requested_region_id
        return response


def _issue_time(run: ForecastRun) -> datetime:
    return run.issue_time


def _isoformat(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")
