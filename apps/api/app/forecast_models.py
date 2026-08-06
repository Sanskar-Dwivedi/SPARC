"""Pydantic models for the read-only forecast contract and local forecast pack."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from .models import OPAQUE_ID_PATTERN


ForecastHazard = Literal["flood", "drought", "heat"]
ForecastRunStatus = Literal["published", "stale", "degraded"]
ForecastLeadUnit = Literal["hours", "days", "weeks"]
ForecastRiskClass = Literal["low", "moderate", "high", "very-high"]
ForecastConfidence = Literal["high", "medium", "low", "unknown"]
ForecastDriverDirection = Literal["increases-risk", "decreases-risk", "context"]
CalibrationStatus = Literal["not-calibrated", "pending", "validated"]
ValidationStatus = Literal["not-run", "exploratory", "formal-failed", "formal-passed"]

OpaqueForecastId = Annotated[
    str,
    StringConstraints(min_length=1, max_length=160, pattern=OPAQUE_ID_PATTERN),
]
MetricId = Annotated[
    str,
    StringConstraints(min_length=1, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
]
RelativeResourceUrl = Annotated[
    str,
    StringConstraints(
        max_length=400,
        pattern=r"^(?:/|\./)[A-Za-z0-9][A-Za-z0-9._~:-]*(?:/[A-Za-z0-9][A-Za-z0-9._~:-]*)*$",
    ),
]
HttpsUrl = Annotated[
    str,
    StringConstraints(max_length=2048, pattern=r"^https://[^\s\r\n]+$"),
]


class ForecastRegion(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: OpaqueForecastId
    name: str = Field(min_length=1, max_length=160)
    type: Literal["district", "subdistrict", "block"]
    parent_id: OpaqueForecastId | None = Field(alias="parentId", default=None)
    bbox: list[float] = Field(min_length=4, max_length=4)
    centroid: list[float] = Field(min_length=2, max_length=2)
    geometry_url: RelativeResourceUrl | None = Field(alias="geometryUrl", default=None)
    indicator_ids: list[str] = Field(alias="indicatorIds", max_length=5)


class ForecastWindow(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    first_valid_at: datetime = Field(alias="firstValidAt")
    last_valid_at: datetime = Field(alias="lastValidAt")
    time_zone: str = Field(alias="timeZone", min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_order(self) -> "ForecastWindow":
        if self.first_valid_at.tzinfo is None or self.last_valid_at.tzinfo is None:
            raise ValueError("forecast window timestamps must include a timezone")
        if self.first_valid_at > self.last_valid_at:
            raise ValueError("firstValidAt must be on or before lastValidAt")
        return self


class ForecastMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: MetricId
    label: str = Field(min_length=1, max_length=160)
    value: float | None = None
    unit: str = Field(min_length=1, max_length=48)


class ForecastDriver(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: MetricId
    label: str = Field(min_length=1, max_length=160)
    direction: ForecastDriverDirection
    value: float | None = None
    unit: str = Field(min_length=1, max_length=48)


class ForecastUncertainty(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    lower: float = Field(ge=0, le=1)
    upper: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def validate_order(self) -> "ForecastUncertainty":
        if self.lower > self.upper:
            raise ValueError("uncertainty.lower must not exceed uncertainty.upper")
        return self


class ForecastPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    lead_time: int = Field(alias="leadTime", ge=1, le=336)
    lead_unit: ForecastLeadUnit = Field(alias="leadUnit")
    valid_at: datetime = Field(alias="validAt")
    probability: float = Field(ge=0, le=1)
    risk_class: ForecastRiskClass = Field(alias="riskClass")
    confidence: ForecastConfidence
    confidence_score: float = Field(alias="confidenceScore", ge=0, le=1)
    uncertainty: ForecastUncertainty
    metrics: list[ForecastMetric] = Field(min_length=1, max_length=12)
    drivers: list[ForecastDriver] = Field(min_length=1, max_length=6)
    exposed_population: int | None = Field(alias="exposedPopulation", default=None, ge=0)
    notes: list[str] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def validate_timestamp(self) -> "ForecastPoint":
        if self.valid_at.tzinfo is None:
            raise ValueError("validAt must include a timezone")
        return self


class ForecastSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    peak_probability: float = Field(alias="peakProbability", ge=0, le=1)
    peak_valid_at: datetime = Field(alias="peakValidAt")
    risk_class: ForecastRiskClass = Field(alias="riskClass")
    confidence: ForecastConfidence
    data_freshness_minutes: int = Field(alias="dataFreshnessMinutes", ge=0, le=100000)
    exposed_population_estimate: int | None = Field(
        alias="exposedPopulationEstimate", default=None, ge=0
    )
    exposure_unit: str = Field(alias="exposureUnit", min_length=1, max_length=80)
    key_drivers: list[ForecastDriver] = Field(alias="keyDrivers", min_length=1, max_length=6)

    @model_validator(mode="after")
    def validate_timestamp(self) -> "ForecastSummary":
        if self.peak_valid_at.tzinfo is None:
            raise ValueError("peakValidAt must include a timezone")
        return self


class ForecastModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    model_version: str = Field(alias="modelVersion", min_length=1, max_length=80)
    model_type: str = Field(alias="modelType", min_length=1, max_length=120)
    calibration_status: CalibrationStatus = Field(alias="calibrationStatus")
    validation_status: ValidationStatus = Field(alias="validationStatus")
    training_data_status: str = Field(alias="trainingDataStatus", min_length=1, max_length=120)
    model_card_url: RelativeResourceUrl | None = Field(alias="modelCardUrl", default=None)


class ForecastRunSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    run_id: OpaqueForecastId = Field(alias="runId")
    region_id: OpaqueForecastId = Field(alias="regionId")
    hazard: ForecastHazard
    issue_time: datetime = Field(alias="issueTime")
    latest_valid_at: datetime = Field(alias="latestValidAt")
    status: ForecastRunStatus
    stale: bool
    risk_class: ForecastRiskClass = Field(alias="riskClass")
    confidence: ForecastConfidence
    model_version: str = Field(alias="modelVersion", min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_timestamps(self) -> "ForecastRunSummary":
        if self.issue_time.tzinfo is None or self.latest_valid_at.tzinfo is None:
            raise ValueError("forecast timestamps must include a timezone")
        return self


class ForecastSource(BaseModel):
    """A bounded source record matching the shared provenance contract."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    dataset_id: OpaqueForecastId = Field(alias="datasetId")
    provider: str = Field(min_length=1, max_length=160)
    mission: str = Field(min_length=1, max_length=120)
    collection: str = Field(min_length=1, max_length=160)
    processing_baseline: str | None = Field(alias="processingBaseline", default=None, max_length=120)
    item_ids: list[str] = Field(alias="itemIds", min_length=1, max_length=100)
    acquired_at: list[datetime] = Field(alias="acquiredAt", min_length=1, max_length=100)
    asset_keys: list[str] = Field(alias="assetKeys", min_length=1, max_length=50)
    source_url: HttpsUrl = Field(alias="sourceUrl")
    citation: str = Field(min_length=1, max_length=500)
    license: str = Field(min_length=1, max_length=200)


class ForecastProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    sources: list[ForecastSource] = Field(min_length=1, max_length=20)
    algorithm_id: OpaqueForecastId = Field(alias="algorithmId")
    algorithm_version: str = Field(alias="algorithmVersion", min_length=1, max_length=80)
    parameters_hash: str = Field(alias="parametersHash", pattern=r"^sha256:[a-f0-9]{64}$")
    analysis_crs: str = Field(alias="analysisCrs", max_length=16, pattern=r"^EPSG:[0-9]+$")
    effective_resolution_meters: float = Field(alias="effectiveResolutionMeters", gt=0)
    generated_at: datetime = Field(alias="generatedAt")

    @model_validator(mode="after")
    def validate_timestamps(self) -> "ForecastProvenance":
        if self.generated_at.tzinfo is None:
            raise ValueError("generatedAt must include a timezone")
        return self


class ForecastRun(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    run_id: OpaqueForecastId = Field(alias="runId")
    region: ForecastRegion
    hazard: ForecastHazard
    issue_time: datetime = Field(alias="issueTime")
    status: ForecastRunStatus
    stale: bool
    forecast_window: ForecastWindow = Field(alias="forecastWindow")
    summary: ForecastSummary
    points: list[ForecastPoint] = Field(min_length=1, max_length=24)
    model: ForecastModel
    provenance: ForecastProvenance
    layers: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    warnings: list[str] = Field(min_length=1, max_length=20)
    disclaimer: str = Field(min_length=1, max_length=600)

    @model_validator(mode="after")
    def validate_run(self) -> "ForecastRun":
        if self.issue_time.tzinfo is None:
            raise ValueError("issueTime must include a timezone")
        if any(point.valid_at < self.issue_time for point in self.points):
            raise ValueError("forecast points cannot be valid before issueTime")
        leads = [point.lead_time for point in self.points]
        if leads != sorted(leads) or len(set(leads)) != len(leads):
            raise ValueError("forecast points must have unique, ascending lead times")
        if self.points[0].valid_at < self.forecast_window.first_valid_at:
            raise ValueError("first forecast point precedes forecastWindow.firstValidAt")
        if self.points[-1].valid_at > self.forecast_window.last_valid_at:
            raise ValueError("last forecast point exceeds forecastWindow.lastValidAt")
        return self


class ForecastTimeSeriesData(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    region: ForecastRegion
    run_id: OpaqueForecastId = Field(alias="runId")
    hazard: ForecastHazard
    issue_time: datetime = Field(alias="issueTime")
    points: list[ForecastPoint] = Field(min_length=1, max_length=24)
    provenance: ForecastProvenance


class ForecastPack(BaseModel):
    """Internal, versioned local pack loaded by the API at startup."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    pack_version: Literal["1"] = Field(alias="packVersion")
    generated_at: datetime = Field(alias="generatedAt")
    synthetic: bool
    region_aliases: dict[str, list[str]] = Field(alias="regionAliases", default_factory=dict)
    runs: list[ForecastRun] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def validate_pack(self) -> "ForecastPack":
        if self.generated_at.tzinfo is None:
            raise ValueError("pack generatedAt must include a timezone")
        keys = [(run.region.id, run.hazard, run.run_id) for run in self.runs]
        if len(set(keys)) != len(keys):
            raise ValueError("forecast pack contains duplicate runs")
        for canonical, aliases in self.region_aliases.items():
            if canonical not in {run.region.id for run in self.runs}:
                raise ValueError(f"forecast alias references unknown region: {canonical}")
            if len(set(aliases)) != len(aliases):
                raise ValueError(f"forecast aliases are not unique: {canonical}")
        return self
