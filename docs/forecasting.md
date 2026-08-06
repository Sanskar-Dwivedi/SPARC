# SPARC forecasting backend

SPARC now has a backend-only prototype contract for three hazards:

- flood probability at 6, 12, 24, 48, and 72 hours;
- drought probability at 2, 4, 8, and 12 weeks; and
- heat-risk probability at 1, 3, 5, 7, and 10 days, with separate air-temperature, land-surface-temperature, and anomaly metrics.

The API is deliberately precomputed-first. It does not download providers,
process rasters, train models, or run long jobs inside FastAPI request
handlers. A scheduled worker can publish the same `ForecastRunData` contract
after replacing the prototype pack with validated regional outputs.

## Endpoints

```text
GET /api/v1/regions/{regionId}/forecast-runs[?hazard=flood|drought|heat]
GET /api/v1/regions/{regionId}/forecasts/{hazard}/latest
GET /api/v1/regions/{regionId}/forecasts/{hazard}/{runId}
GET /api/v1/regions/{regionId}/forecasts/{hazard}/{runId}/timeseries
```

Each forecast point includes a probability, provisional risk class,
independent confidence score/class, uncertainty interval, contributing
drivers, metrics, and exposure estimate where the pack provides one. Model
status, source provenance, issue time, valid times, freshness, warnings, and a
decision-support disclaimer are also returned.

## Prototype boundary

The committed Nagpur pack uses synthetic inputs and is therefore marked as a
mock response even when the API runs in cache/precomputed mode. The baseline
functions in `apps/api/app/forecast_engine.py` are monotonic, deterministic
logistic formulas. They are useful for contract and integration testing, not
for public emergency decisions. Risk thresholds remain provisional until
probability calibration and regional stakeholder review are complete.

The next production step is an offline ingestion and validation pipeline that
produces normalized rainfall, soil-moisture, river, drought-index,
temperature, and exposure features. The API should continue serving immutable
versioned runs and should never silently present a previous run as current
when mandatory upstream data are stale or missing.
