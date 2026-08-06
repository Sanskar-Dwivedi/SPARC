"""Transparent baseline calculations for the prototype forecast pack.

This module deliberately does not claim operational model skill.  It provides a
small, deterministic logistic baseline that can be replaced by a trained,
region-specific model after historical labels, calibration, and backtesting
are available.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import exp, isfinite
from typing import Literal


ForecastHazard = Literal["flood", "drought", "heat"]
RiskClass = Literal["low", "moderate", "high", "very-high"]
ConfidenceClass = Literal["high", "medium", "low", "unknown"]

RISK_THRESHOLDS = (0.20, 0.40, 0.70)


@dataclass(frozen=True)
class ForecastFeatures:
    """Normalized inputs expected from the offline ingestion pipeline.

    Percentile values use a 0--100 scale.  Missing values are allowed because
    missingness is part of forecast confidence; the baseline uses a neutral
    fallback for a missing feature rather than silently dropping a point.
    """

    rainfall_6h_mm: float | None = None
    rainfall_24h_mm: float | None = None
    rainfall_72h_mm: float | None = None
    rainfall_percentile: float | None = None
    soil_moisture_percentile: float | None = None
    river_level_percentile: float | None = None
    river_rate_percentile: float | None = None
    spi_4_week: float | None = None
    vegetation_anomaly_percent: float | None = None
    air_temperature_c: float | None = None
    land_surface_temperature_c: float | None = None
    temperature_anomaly_c: float | None = None
    coverage_score: float | None = None
    ensemble_agreement: float | None = None
    freshness_score: float | None = None

    def __post_init__(self) -> None:
        for name in (
            "rainfall_6h_mm",
            "rainfall_24h_mm",
            "rainfall_72h_mm",
            "spi_4_week",
            "vegetation_anomaly_percent",
            "air_temperature_c",
            "land_surface_temperature_c",
            "temperature_anomaly_c",
        ):
            _validate_optional_number(name, getattr(self, name))
        for name in (
            "rainfall_percentile",
            "soil_moisture_percentile",
            "river_level_percentile",
            "river_rate_percentile",
            "coverage_score",
            "ensemble_agreement",
            "freshness_score",
        ):
            value = getattr(self, name)
            _validate_optional_number(name, value)
            if value is not None and not 0 <= value <= 100:
                raise ValueError(f"{name} must be between 0 and 100")


def probability_from_score(score: float) -> float:
    """Convert a finite log-odds score into a bounded, rounded probability."""

    if not isfinite(score):
        raise ValueError("score must be finite")
    # Avoid overflow for an accidentally extreme feature value while retaining
    # a meaningful probability close to 0 or 1.
    score = max(-35.0, min(35.0, score))
    return round(1.0 / (1.0 + exp(-score)), 4)


def risk_class(probability: float) -> RiskClass:
    """Map a probability to the provisional, calibration-gated risk classes."""

    if not 0 <= probability <= 1:
        raise ValueError("probability must be between 0 and 1")
    if probability < RISK_THRESHOLDS[0]:
        return "low"
    if probability < RISK_THRESHOLDS[1]:
        return "moderate"
    if probability < RISK_THRESHOLDS[2]:
        return "high"
    return "very-high"


def confidence(features: ForecastFeatures) -> tuple[float, ConfidenceClass]:
    """Return a confidence score from coverage, agreement, and freshness.

    This is a data-quality score, not a probability of correctness.  It is
    intentionally separate from the hazard probability.
    """

    values = [
        value
        for value in (
            features.coverage_score,
            features.ensemble_agreement,
            features.freshness_score,
        )
        if value is not None
    ]
    if not values:
        return 0.0, "unknown"
    score = round(sum(values) / (100.0 * len(values)), 4)
    if score >= 0.80:
        label: ConfidenceClass = "high"
    elif score >= 0.60:
        label = "medium"
    else:
        label = "low"
    return score, label


def flood_probability(features: ForecastFeatures, lead_hours: int) -> float:
    """Estimate flood-threshold exceedance probability for one lead time."""

    if lead_hours not in {6, 12, 24, 48, 72}:
        raise ValueError("flood lead time must be one of 6, 12, 24, 48, or 72 hours")
    lead_effect = {6: 0.00, 12: 0.08, 24: 0.18, 48: 0.28, 72: 0.35}[lead_hours]
    score = (
        -3.05
        + 0.018 * _value(features.rainfall_6h_mm, 0.0)
        + 0.012 * _value(features.rainfall_24h_mm, 0.0)
        + 0.006 * _value(features.rainfall_72h_mm, 0.0)
        + 0.020 * (_value(features.soil_moisture_percentile, 50.0) - 50.0)
        + 0.018 * (_value(features.river_level_percentile, 50.0) - 50.0)
        + 0.012 * (_value(features.river_rate_percentile, 50.0) - 50.0)
        + 0.35 * lead_effect
    )
    return probability_from_score(score)


def drought_probability(features: ForecastFeatures, lead_weeks: int) -> float:
    """Estimate drought-threshold exceedance probability for one lead time."""

    if lead_weeks not in {2, 4, 8, 12}:
        raise ValueError("drought lead time must be one of 2, 4, 8, or 12 weeks")
    lead_effect = {2: 0.00, 4: 0.12, 8: 0.24, 12: 0.34}[lead_weeks]
    score = (
        -1.75
        + 0.035 * (50.0 - _value(features.rainfall_percentile, 50.0))
        + 0.70 * max(0.0, -_value(features.spi_4_week, 0.0))
        + 0.022 * (50.0 - _value(features.soil_moisture_percentile, 50.0))
        + 0.025 * max(0.0, _value(features.temperature_anomaly_c, 0.0))
        + 0.012 * max(0.0, -_value(features.vegetation_anomaly_percent, 0.0))
        + lead_effect
    )
    return probability_from_score(score)


def heat_probability(features: ForecastFeatures, lead_days: int) -> float:
    """Estimate heat-threshold exceedance probability for one lead time."""

    if lead_days not in {1, 3, 5, 7, 10, 15}:
        raise ValueError("heat lead time must be one of 1, 3, 5, 7, 10, or 15 days")
    lead_effect = {1: 0.00, 3: 0.08, 5: 0.14, 7: 0.18, 10: 0.12, 15: 0.05}[lead_days]
    score = (
        -2.05
        + 0.42 * max(0.0, _value(features.air_temperature_c, 34.0) - 36.0)
        + 0.20 * max(0.0, _value(features.land_surface_temperature_c, 36.0) - 38.0)
        + 0.28 * max(0.0, _value(features.temperature_anomaly_c, 0.0))
        + lead_effect
    )
    return probability_from_score(score)


def _value(value: float | None, fallback: float) -> float:
    return fallback if value is None else value


def _validate_optional_number(name: str, value: float | None) -> None:
    if value is not None and not isfinite(value):
        raise ValueError(f"{name} must be finite")
