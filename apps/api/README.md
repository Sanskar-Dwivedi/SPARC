# SPARC API

This is a read-only FastAPI service. By default it serves the bounded contract fixtures; with `SPARC_DATA_MODE=precomputed` it serves the reviewed Nagpur and Bengaluru Urban Earth Engine packs through the same contract. It performs no request-time raster processing, database access, provider calls, or live job creation.

## Run locally

From the repository root:

```powershell
python -m uvicorn apps.api.app.main:app --host 127.0.0.1 --port 8000
```

To use the reviewed precomputed packs locally, set the mode before starting
the server:

```powershell
$env:SPARC_DATA_MODE="precomputed"
python -m uvicorn apps.api.app.main:app --host 127.0.0.1 --port 8000
```

The runtime reads the generated, checksum-listed responses under
`contracts/examples/precomputed/`. Regenerate those artifacts only after an
approved processing-pack change:

```powershell
python scripts/data/build_contract_pack_examples.py
```

## Forecast prototype endpoints

The API also exposes read-only flood, drought, and heat-risk forecast products
from the versioned pack under `contracts/examples/forecasts/`:

```text
GET /api/v1/regions/{regionId}/forecast-runs
GET /api/v1/regions/{regionId}/forecasts/{hazard}/latest
GET /api/v1/regions/{regionId}/forecasts/{hazard}/{runId}
GET /api/v1/regions/{regionId}/forecasts/{hazard}/{runId}/timeseries
```

The current Nagpur pack is synthetic and is marked `meta.mock=true`. The
baseline engine is intentionally transparent, uncalibrated, and exploratory;
it is not an official warning service. Replace the pack with region-specific
validated inputs only after event backtesting, spatial holdouts, calibration,
and domain review. The fixture builder is available at
`scripts/data/build_forecast_pack.py`.

The default allowed browser origins are `http://localhost:5173` and the supplied Orbital UI reference at `http://localhost:8123`. Override them with a comma-separated `SPARC_ALLOWED_ORIGINS` value. Do not use `*`.

## Optional Gemini report drafting

Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in the server environment.
The key is never accepted from the browser, logged, or included in a report.
When the user explicitly consents, the API sends only the selected report text
and non-identifying analysis context to Gemini using the server-side
`generateContent` request. Complainant name, address, contact details,
attachments, exact coordinates, signature and date are appended locally after
the draft returns. If Gemini is unavailable, requests that opted into Gemini
fail safely rather than silently claiming that Gemini drafted the report.

## Request flow

```text
HTTP request
→ request ID and size checks
→ FastAPI/Pydantic syntax and type validation
→ date and comparison domain validation
→ allowlisted catalogue lookup
→ bounded fixture or precomputed-pack JSON response
→ sanitized Problem Details on failure
```

`POST /api/v1/comparisons` only resolves the selected bounded result inventory. `modePreference: live` is rejected, and the administrative processing-creation route is not implemented.

## Tests

Install the pinned test extra and run the standard-library suite:

```powershell
python -m pip install -r apps/api/requirements-dev.txt
python -m unittest discover -s tests -p "test_*.py"
```
