"""SPARC's read-only P0 HTTP API."""

from __future__ import annotations

from copy import deepcopy
from datetime import date
import hashlib
import json
import os
import re
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import FastAPI, Path, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings
from .errors import (
    SparcError,
    http_error_handler,
    internal_error_handler,
    problem_response,
    sparc_error_handler,
    validation_error_handler,
)
from .forecast_models import ForecastHazard
from .forecast_repository import ForecastRepository
from .limits import FixedWindowRateLimiter
from .middleware import RequestBodyLimitMiddleware
from .models import ComparisonRequest, OPAQUE_ID_PATTERN, PeriodInput, validate_period_pair
from .static_repository import StaticPrecomputedRepository
from .repository import MockResultRepository, apply_request_context, envelope
from ..reporting.routes import router as reporting_router


APP_VERSION = "1.1.0-alpha.1"
REQUEST_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:[-.:][a-z0-9]+)*$")
RegionIdPath = Annotated[
    str,
    Path(min_length=1, max_length=128, pattern=OPAQUE_ID_PATTERN),
]
ResourceIdPath = Annotated[
    str,
    Path(min_length=1, max_length=160, pattern=OPAQUE_ID_PATTERN),
]

settings = Settings.from_environment()
repository = (
    StaticPrecomputedRepository(settings.precomputed_examples_root)
    if settings.use_precomputed
    else MockResultRepository(settings.examples_root)
)
forecast_repository = ForecastRepository(settings.forecast_examples_root, settings.data_mode)
comparison_limiter = FixedWindowRateLimiter(settings.comparison_requests_per_minute)
hosted_on_vercel = os.getenv("VERCEL") == "1"

app = FastAPI(
    title="SPARC API",
    summary="Read-only environmental proxy indicator API",
    version=APP_VERSION,
    docs_url=None if hosted_on_vercel else "/docs",
    redoc_url=None,
    openapi_url=None if hosted_on_vercel else "/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Content-Type",
        "Idempotency-Key",
        "If-None-Match",
        "X-Request-ID",
        "X-Report-Access",
    ],
    expose_headers=["ETag", "X-Request-ID", "X-Report-Access"],
)
app.add_middleware(RequestBodyLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_exception_handler(SparcError, sparc_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.add_exception_handler(Exception, internal_error_handler)
app.include_router(reporting_router)


@app.middleware("http")
async def request_guard(request: Request, call_next):
    supplied_id = request.headers.get("X-Request-ID", "")
    request.state.request_id = (
        supplied_id
        if len(supplied_id) <= 80 and REQUEST_ID_PATTERN.fullmatch(supplied_id)
        else f"req:{uuid4().hex}"
    )

    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response


def _meta(request: Request) -> dict:
    meta = repository.base_meta
    meta["requestId"] = request.state.request_id
    return meta


def _etag_response(request: Request, payload: dict, *, status_code: int = 200) -> Response:
    semantic_payload = deepcopy(payload)
    semantic_payload.get("meta", {}).pop("requestId", None)
    encoded = json.dumps(
        semantic_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    etag = f'W/"{hashlib.sha256(encoded).hexdigest()}"'
    if request.method == "GET" and request.headers.get("If-None-Match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return JSONResponse(payload, status_code=status_code, headers={"ETag": etag})


def _periods_from_query(
    baseline_start: date,
    baseline_end: date,
    comparison_start: date,
    comparison_end: date,
) -> tuple[PeriodInput, PeriodInput]:
    try:
        baseline = PeriodInput(startDate=baseline_start, endDate=baseline_end)
        comparison = PeriodInput(startDate=comparison_start, endDate=comparison_end)
        validate_period_pair(baseline, comparison)
    except ValidationError as exc:
        raise SparcError(422, "INVALID_PERIOD", "The requested period pair is invalid.") from exc
    return baseline, comparison


def _require_available_periods(
    baseline: PeriodInput,
    comparison: PeriodInput,
    region_id: str | None = None,
) -> None:
    region_summary = repository.get_summary(region_id) if region_id else None
    if region_summary:
        available_baseline = region_summary["data"]["baselinePeriod"]
        available_comparison = region_summary["data"]["comparisonPeriod"]
    else:
        available_baseline, available_comparison = repository.summary_periods
    expected = (
        available_baseline["startDate"],
        available_baseline["endDate"],
        available_comparison["startDate"],
        available_comparison["endDate"],
    )
    requested = (
        baseline.start_date.isoformat(),
        baseline.end_date.isoformat(),
        comparison.start_date.isoformat(),
        comparison.end_date.isoformat(),
    )
    if requested != expected:
        raise SparcError(
            404,
            "RESULT_NOT_AVAILABLE",
            "No precomputed result exists for the requested region and period pair.",
        )


def _require_forecast_region(region_id: str) -> None:
    if forecast_repository.has_region(region_id):
        return
    if repository.get_region(region_id) is None:
        raise SparcError(404, "REGION_NOT_FOUND", "The requested region is not in the published catalogue.")
    raise SparcError(
        404,
        "FORECAST_NOT_AVAILABLE",
        "No forecast run is published for the requested region.",
    )


@app.get("/", include_in_schema=False)
def get_root() -> Response:
    if hosted_on_vercel:
        return JSONResponse({"service": "SPARC API", "status": "ok"})
    return RedirectResponse("/docs")


@app.get("/api/v1/health", tags=["Health"])
def get_health() -> dict[str, str]:
    return {"status": "ok", "version": APP_VERSION, "dataMode": settings.data_mode}


@app.get("/api/v1/regions", tags=["Regions"])
def list_regions(
    request: Request,
    region_type: Literal["district", "subdistrict", "block"] | None = Query(None, alias="type"),
    parent_id: Annotated[
        str | None,
        Query(alias="parentId", min_length=1, max_length=128, pattern=OPAQUE_ID_PATTERN),
    ] = None,
) -> Response:
    payload = envelope(
        repository.list_regions(region_type, parent_id),
        _meta(request),
        "/api/v1/regions",
        [],
    )
    return _etag_response(request, payload)


@app.get("/api/v1/regions/{region_id}", tags=["Regions"])
def get_region(request: Request, region_id: RegionIdPath) -> Response:
    region = repository.get_region(region_id)
    if region is None:
        raise SparcError(404, "REGION_NOT_FOUND", "The requested region is not in the published catalogue.")
    payload = envelope(
        region,
        _meta(request),
        f"/api/v1/regions/{region_id}",
        ["/api/v1/regions"],
    )
    return _etag_response(request, payload)


@app.get("/api/v1/regions/{region_id}/forecast-runs", tags=["Forecasts"])
def list_forecast_runs(
    request: Request,
    region_id: RegionIdPath,
    hazard: ForecastHazard | None = Query(None),
) -> Response:
    _require_forecast_region(region_id)
    runs = forecast_repository.list_runs(region_id, hazard)
    if not runs:
        raise SparcError(
            404,
            "FORECAST_NOT_AVAILABLE",
            "No forecast run is published for the requested hazard.",
        )
    payload = envelope(
        runs,
        forecast_repository.meta(request.state.request_id),
        f"/api/v1/regions/{region_id}/forecast-runs",
        [
            f"/api/v1/regions/{region_id}/forecasts/{hazard}/latest"
            if hazard is not None
            else f"/api/v1/regions/{region_id}/forecast-runs"
        ],
    )
    return _etag_response(request, payload)


@app.get("/api/v1/regions/{region_id}/forecasts/{hazard}/latest", tags=["Forecasts"])
def get_latest_forecast(
    request: Request,
    region_id: RegionIdPath,
    hazard: ForecastHazard,
) -> Response:
    _require_forecast_region(region_id)
    data = forecast_repository.get_latest(region_id, hazard)
    if data is None:
        raise SparcError(
            404,
            "FORECAST_NOT_AVAILABLE",
            "No latest forecast is published for the requested hazard.",
        )
    payload = envelope(
        data,
        forecast_repository.meta(request.state.request_id),
        f"/api/v1/regions/{region_id}/forecasts/{hazard}/latest",
        [
            f"/api/v1/regions/{region_id}/forecast-runs",
            f"/api/v1/regions/{region_id}/forecasts/{hazard}/{data['runId']}/timeseries",
        ],
    )
    return _etag_response(request, payload)


@app.get("/api/v1/regions/{region_id}/forecasts/{hazard}/{run_id}", tags=["Forecasts"])
def get_forecast_run(
    request: Request,
    region_id: RegionIdPath,
    hazard: ForecastHazard,
    run_id: ResourceIdPath,
) -> Response:
    _require_forecast_region(region_id)
    data = forecast_repository.get_run(region_id, hazard, run_id)
    if data is None:
        raise SparcError(404, "FORECAST_NOT_FOUND", "The requested forecast run is not published.")
    payload = envelope(
        data,
        forecast_repository.meta(request.state.request_id),
        f"/api/v1/regions/{region_id}/forecasts/{hazard}/{run_id}",
        [f"/api/v1/regions/{region_id}/forecasts/{hazard}/{run_id}/timeseries"],
    )
    return _etag_response(request, payload)


@app.get(
    "/api/v1/regions/{region_id}/forecasts/{hazard}/{run_id}/timeseries",
    tags=["Forecasts"],
)
def get_forecast_timeseries(
    request: Request,
    region_id: RegionIdPath,
    hazard: ForecastHazard,
    run_id: ResourceIdPath,
) -> Response:
    _require_forecast_region(region_id)
    data = forecast_repository.get_timeseries(region_id, hazard, run_id)
    if data is None:
        raise SparcError(404, "FORECAST_NOT_FOUND", "The requested forecast time series is not published.")
    payload = envelope(
        data,
        forecast_repository.meta(request.state.request_id),
        f"/api/v1/regions/{region_id}/forecasts/{hazard}/{run_id}/timeseries",
        [f"/api/v1/regions/{region_id}/forecasts/{hazard}/{run_id}"],
    )
    return _etag_response(request, payload)


@app.get("/api/v1/regions/{region_id}/summary", tags=["Regions", "Indicators"])
def get_region_summary(
    request: Request,
    region_id: RegionIdPath,
    baseline_start: date = Query(alias="baselineStart"),
    baseline_end: date = Query(alias="baselineEnd"),
    comparison_start: date = Query(alias="comparisonStart"),
    comparison_end: date = Query(alias="comparisonEnd"),
) -> Response:
    baseline, comparison = _periods_from_query(
        baseline_start, baseline_end, comparison_start, comparison_end
    )
    _require_available_periods(baseline, comparison, region_id)
    payload = repository.get_summary(region_id)
    if payload is None:
        raise SparcError(404, "SUMMARY_NOT_FOUND", "No published summary exists for the requested region.")
    payload = apply_request_context(
        payload, request.state.request_id, f"/api/v1/regions/{region_id}/summary"
    )
    return _etag_response(request, payload)


@app.get("/api/v1/regions/{region_id}/indicators", tags=["Indicators"])
def list_region_indicators(
    request: Request,
    region_id: RegionIdPath,
    baseline_start: date = Query(alias="baselineStart"),
    baseline_end: date = Query(alias="baselineEnd"),
    comparison_start: date = Query(alias="comparisonStart"),
    comparison_end: date = Query(alias="comparisonEnd"),
    indicator_id: Literal["surface-water", "vegetation", "built-up", "lst", "suhi"] | None = Query(
        None, alias="indicatorId"
    ),
) -> Response:
    baseline, comparison = _periods_from_query(
        baseline_start, baseline_end, comparison_start, comparison_end
    )
    _require_available_periods(baseline, comparison, region_id)
    indicators = repository.list_indicators(region_id)
    if indicators is None:
        raise SparcError(404, "INDICATORS_NOT_FOUND", "No published indicators exist for the requested region.")
    if indicator_id is not None:
        indicators = [item for item in indicators if item["indicator"]["id"] == indicator_id]
    payload = envelope(
        indicators,
        _meta(request),
        f"/api/v1/regions/{region_id}/indicators",
        [f"/api/v1/regions/{region_id}/summary"],
    )
    return _etag_response(request, payload)


@app.get("/api/v1/regions/{region_id}/indicators/{indicator_id}", tags=["Indicators"])
def get_region_indicator(
    request: Request,
    region_id: RegionIdPath,
    indicator_id: Literal["surface-water", "vegetation", "built-up", "lst", "suhi"],
    baseline_start: date = Query(alias="baselineStart"),
    baseline_end: date = Query(alias="baselineEnd"),
    comparison_start: date = Query(alias="comparisonStart"),
    comparison_end: date = Query(alias="comparisonEnd"),
) -> Response:
    baseline, comparison = _periods_from_query(
        baseline_start, baseline_end, comparison_start, comparison_end
    )
    _require_available_periods(baseline, comparison, region_id)
    payload = repository.get_indicator(region_id, indicator_id)
    if payload is None:
        raise SparcError(404, "INDICATOR_NOT_FOUND", "No published indicator result matches the request.")
    payload = apply_request_context(
        payload,
        request.state.request_id,
        f"/api/v1/regions/{region_id}/indicators/{indicator_id}",
    )
    return _etag_response(request, payload)


@app.get("/api/v1/regions/{region_id}/timeseries", tags=["Indicators"])
def get_time_series(
    request: Request,
    region_id: RegionIdPath,
    indicator_id: Literal["surface-water", "vegetation", "built-up", "lst", "suhi"] = Query(
        alias="indicatorId"
    ),
    start_date: date = Query(alias="startDate"),
    end_date: date = Query(alias="endDate"),
) -> Response:
    if start_date > end_date or (end_date - start_date).days > 3_660 or end_date > date.today():
        raise SparcError(422, "INVALID_PERIOD", "The time-series period is invalid or too large.")
    payload = repository.get_time_series(region_id, indicator_id)
    if payload is None:
        raise SparcError(404, "TIME_SERIES_NOT_FOUND", "No published time series matches the request.")
    available_dates = [date.fromisoformat(point["date"]) for point in payload["data"]["points"]]
    if start_date > max(available_dates) or end_date < min(available_dates):
        raise SparcError(404, "TIME_SERIES_NOT_FOUND", "No published points overlap the requested period.")
    payload["data"]["points"] = [
        point
        for point in payload["data"]["points"]
        if start_date <= date.fromisoformat(point["date"]) <= end_date
    ]
    payload = apply_request_context(
        payload, request.state.request_id, f"/api/v1/regions/{region_id}/timeseries"
    )
    return _etag_response(request, payload)


@app.post("/api/v1/comparisons", tags=["Comparisons"])
def create_comparison(request: Request, comparison: ComparisonRequest) -> Response:
    client_key = request.client.host if request.client else "unknown"
    if not comparison_limiter.allow(client_key):
        raise SparcError(
            429,
            "RATE_LIMITED",
            "Too many comparison requests; retry later.",
            headers={"Retry-After": "60"},
        )
    if comparison.mode_preference == "live":
        raise SparcError(
            503,
            "LIVE_MODE_DISABLED",
            "Live processing is disabled; request an available demo result.",
            headers={"Retry-After": "300"},
        )
    _require_available_periods(
        comparison.baseline_period,
        comparison.comparison_period,
        comparison.region_id,
    )
    payload = repository.get_summary(comparison.region_id)
    if payload is None:
        raise SparcError(404, "RESULT_NOT_AVAILABLE", "No precomputed result matches the request.")
    available = {item["indicator"]["id"] for item in payload["data"]["indicators"]}
    if not set(comparison.indicator_ids).issubset(available):
        raise SparcError(404, "RESULT_NOT_AVAILABLE", "One or more requested indicators are unavailable.")
    payload = apply_request_context(payload, request.state.request_id, "/api/v1/comparisons")
    return _etag_response(request, payload)


@app.get("/api/v1/comparisons/{comparison_id}", tags=["Comparisons"])
def get_comparison(request: Request, comparison_id: ResourceIdPath) -> Response:
    payload = repository.get_comparison_summary(comparison_id)
    if payload is None:
        raise SparcError(404, "COMPARISON_NOT_FOUND", "The requested comparison is not published.")
    payload = apply_request_context(
        payload, request.state.request_id, f"/api/v1/comparisons/{comparison_id}"
    )
    return _etag_response(request, payload)


@app.get("/api/v1/processing/jobs/{job_id}", tags=["Processing"])
def get_processing_job(request: Request, job_id: ResourceIdPath) -> Response:
    payload = repository.get_job(job_id)
    if payload is None:
        raise SparcError(404, "JOB_NOT_FOUND", "The requested job is not published.")
    payload = apply_request_context(
        payload, request.state.request_id, f"/api/v1/processing/jobs/{job_id}"
    )
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


@app.get("/api/v1/layers/{layer_id}", tags=["Layers"])
def get_layer(request: Request, layer_id: ResourceIdPath) -> Response:
    layer = repository.get_layer(layer_id)
    if layer is None:
        raise SparcError(404, "LAYER_NOT_FOUND", "The requested layer is not published.")
    payload = envelope(
        layer,
        _meta(request),
        f"/api/v1/layers/{layer_id}",
        [],
    )
    return _etag_response(request, payload)


@app.get("/api/v1/layers/{layer_id}/tilejson.json", tags=["Layers"])
def get_layer_tilejson(_request: Request, layer_id: ResourceIdPath) -> Response:
    layer = repository.get_layer(layer_id)
    if layer is None:
        raise SparcError(404, "LAYER_NOT_FOUND", "The requested layer is not published.")
    if layer["representation"] not in {"tilejson", "xyz"}:
        raise SparcError(409, "LAYER_NOT_TILED", "The published layer has no tile representation.")
    raise SparcError(503, "TILES_UNAVAILABLE", "Tile serving is not enabled in the first API slice.")


@app.get("/api/v1/metadata/datasets", tags=["Metadata"])
def list_datasets(request: Request) -> Response:
    payload = envelope(
        repository.list_datasets(),
        _meta(request),
        "/api/v1/metadata/datasets",
        ["/api/v1/metadata/indicators"],
    )
    return _etag_response(request, payload)


@app.get("/api/v1/metadata/indicators", tags=["Metadata", "Indicators"])
def list_indicator_metadata(request: Request) -> Response:
    payload = envelope(
        repository.list_indicator_metadata(),
        _meta(request),
        "/api/v1/metadata/indicators",
        ["/api/v1/metadata/datasets"],
    )
    return _etag_response(request, payload)
