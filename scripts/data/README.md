# Data discovery scripts

## Synthetic forecast fixture coverage

The read-only forecast API currently serves a checked-in synthetic pack while
operational forecast ingestion is not available. To reproduce the city
coverage used by the dashboard, run this from the repository root:

```powershell
python -m scripts.data.expand_forecast_fixture
```

This writes flood, drought, and heat integration fixtures for the 14 cities in
`data/catalog/supported-cities.json`. The resulting pack is intentionally
marked synthetic; it must not be used as a live warning or as evidence of
city-specific model skill.

Run metadata-only Sentinel-2 discovery through Earth Engine from the repository root:

```powershell
$env:EARTH_ENGINE_PROJECT='your-google-cloud-project-id'
python -m scripts.data.discover_earth_engine --pilot all
```

The command queries `COPERNICUS/S2_SR_HARMONIZED` for the fixed quick-target
windows in `scripts/data/discover_catalog.py` and writes sanitized reports to
`data/raw/earth-engine-discovery/`. That directory is ignored by Git.
Authenticate locally first with `earthengine authenticate`.

The configured bounding boxes are government-published search envelopes, not approved analytical district polygons. Do not use them for clipping, area calculation, common-valid coverage, or public map boundaries.

The reports intentionally omit provider URLs and credentials. They contain enough metadata to select candidate image IDs before a separate controlled processing/export step. `discover_catalog.py` remains the direct-CDSE fallback.

## Boundary gate before processing

Do not use a search bounding box as an analytical district boundary. Before any Earth Engine composite or area calculation, validate the local GeoJSON and its reviewed provenance record:

```powershell
python -m scripts.data.validate_boundary_gate `
  --boundary path\\to\\approved-district.geojson `
  --provenance path\\to\\approved-district-provenance.json
```

The provenance JSON must provide `sourceName`, an `https` `sourceUrl`, `version`, `license`, `attribution`, and `redistributionPermitted: true`. The command rejects missing permission, non-polygon data, invalid coordinates, open rings, multi-feature inputs, and files larger than 5 MiB. It writes only a local hash/provenance manifest under ignored `data/raw/boundary-gate/`; it does not call Earth Engine or export imagery.

## P0 pre-publication processing

After the pinned geoBoundaries extraction and boundary gate have passed,
calculate local pre-publication summaries without exporting to Google Drive or
exposing a live API route. The accepted region keys include `nagpur`,
`bengaluru-urban`, and `mumbai-city`; the twelve expansion keys and their
boundary records are listed in
[`data/catalog/city-boundary-sources.json`](../../data/catalog/city-boundary-sources.json):

```powershell
$env:EARTH_ENGINE_PROJECT='your-google-cloud-project-id'
python -m scripts.data.extract_geoboundaries_adm2
python -m scripts.data.process_earth_engine_p0 --region all
```

The worker uses `COPERNICUS/S2_SR_HARMONIZED`, allows SCL classes 4/5/6 only, requires two clear observations per period, calculates indices per observation before taking a median, and compares only the common-valid footprint. Results go to ignored `data/processed/earth-engine-p0/` and remain pre-publication with `quality: unknown`; no scientific accuracy claim is implied.

The 12-city expansion batch requests prepared on 2026-08-05 are recorded in
[`data/metadata/earth-engine-p0-expansion-run.json`](../../data/metadata/earth-engine-p0-expansion-run.json).
That manifest is `REQUESTS_PREPARED`: no Drive task was started, no result CSV
was imported, and no contract pack was built. The configured Earth Engine
project reported that its noncommercial compute quota is in restricted mode;
start exports only after the project owner confirms quota and an approved
Drive destination.

The quota-safe rerun using project `project-b44b6a9b-cafb-4d19-8dd` completed 36
one-indicator exports in `SPARC_EE_EXPORTS_20260803`. Its task IDs, completed
states, request checksums, raw CSV checksums, report checksums, and pack
checksums are recorded in
[`data/metadata/earth-engine-p0-expansion-run-project-b44b6a9b.json`](../../data/metadata/earth-engine-p0-expansion-run-project-b44b6a9b.json).
The raw CSVs are preserved unchanged under ignored
`data/raw/earth-engine-exports/`; the guarded importer produced 36 reports and
12 three-indicator packs. Re-running the importer is safe only with the
matching request JSON and unchanged CSV bytes.

### Interactive timeout: controlled batch export

Do not increase resolution, use `bestEffort`, or relax masks when a district-wide 10 m reduction exceeds the interactive deadline. The worker can package the same scalar calculation as an Earth Engine CSV batch export. A dry run writes only a local, ignored request record:

```powershell
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator vegetation `
  --mode batch-export `
  --drive-folder SPARC_EE
```

Adding `--start-batch-export` creates a task and writes its result to the named Google Drive folder. That is an external write, so use it only after the destination has been approved. The downloaded CSV is pre-publication evidence, not a deployable application asset, until it has been imported into a provenance-complete manifest and passed sensitivity and independent-validation gates.

After downloading the completed CSV into the ignored raw-export directory, validate its task request, region, boundary checksum, method, CRS, pixel size, observation floor, and area arithmetic before producing the local report:

```powershell
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator vegetation `
  --import-export-csv data\raw\earth-engine-exports\sparc_nagpur_vegetation_p0_v1.csv
```

### Vegetation threshold sensitivity

The vegetation method fixes the input scenes, 10 m UTM grid, SCL mask, common-valid footprint, and two-observation floor. It varies only the documented NDVI thresholds `0.20`, `0.30`, and `0.40` in one three-row CSV export:

```powershell
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator vegetation `
  --mode batch-export `
  --vegetation-sensitivity `
  --drive-folder SPARC_EE_EXPORTS_20260803 `
  --start-batch-export
```

This creates external Drive state. The resulting rows are sensitivity evidence, not separate calibrated classifications; retain them with the batch request and do not change the default `NDVI >= 0.30` rule from their outcome.

After downloading the completed three-row CSV, validate it and attach the evidence to the existing local Nagpur vegetation report:

```powershell
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator vegetation `
  --import-vegetation-sensitivity-csv data\raw\earth-engine-exports\sparc_nagpur_vegetation_p0_sensitivity_v1.csv
```

### Water and built-proxy sensitivity

Water sensitivity does not move the fixed `MNDWI > 0` method. It first exports
one 256-bin fixed-range histogram over both common-valid period composites. The
local importer validates every bin, the AOI checksum, CRS, scale and observation
floor, then derives one deterministic pooled Otsu split. Only that recorded
threshold can start the second area-summary export. This avoids a long,
unbounded interactive reduction and prevents a per-period threshold from being
introduced by accident.

```powershell
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator surface-water `
  --mode water-otsu-histogram-export `
  --drive-folder SPARC_EE_EXPORTS_20260803 `
  --start-batch-export

# Download the completed CSV into ignored data/raw/earth-engine-exports/.
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator surface-water `
  --import-water-otsu-histogram-csv data\raw\earth-engine-exports\sparc_nagpur_surface-water_p0_water-pooled-otsu_histogram_v1.csv

# The imported JSON, rather than a user-supplied number, is required for the
# area-summary export. Import that CSV with --import-sensitivity-csv afterwards.
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator surface-water `
  --mode batch-export `
  --sensitivity water-pooled-otsu `
  --water-otsu-result data\processed\earth-engine-p0\nagpur-surface-water-water-pooled-otsu-histogram.json `
  --drive-folder SPARC_EE_EXPORTS_20260803 `
  --start-batch-export
```

Built-proxy sensitivity uses only the already documented diagnostic alternative:
`IBI > 0` with `SAVI L = 0.5`. It uses the same selected images, SCL mask,
district AOI, UTM grid and observation floor as the constrained NDBI default.
The report separately applies and exposes an IBI zero-denominator guard rather
than silently treating undefined values as non-built. It is not a calibration
or an impervious-area class.

```powershell
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator built-up `
  --mode batch-export `
  --sensitivity built-ibi `
  --drive-folder SPARC_EE_EXPORTS_20260803 `
  --start-batch-export

# After download:
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator built-up `
  --sensitivity built-ibi `
  --import-sensitivity-csv data\raw\earth-engine-exports\sparc_nagpur_built-up_p0_built-ibi_v2.csv
```

### Exploratory reference-label frame

Independent validation cannot be fabricated from another global satellite product. This export creates a blinded, deterministic frame of 25 points from each mapped stable non-target, stable target, gain, and loss stratum (100 points total when every stratum can supply its allocation). It omits mapped classes and index values so reviewers can make an initial reference judgement without seeing the candidate result.

```powershell
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator vegetation `
  --mode validation-sample-export `
  --drive-folder SPARC_EE_EXPORTS_20260803 `
  --start-batch-export
```

This is explicitly `EXPLORATORY_REVIEW_ONLY`: the exported points still need temporally appropriate independent labels, a recorded inclusion-probability design, and a design-consistent accuracy analysis before any formal-validation claim is possible.

The fixed vegetation sensitivity export and importer work for either approved district. The importer binds the downloaded CSV to the selected region's approved boundary checksum and CRS; it never applies a Nagpur label frame to Bengaluru.

The Nagpur built-proxy reversal must be reviewed as two distinct frozen map rules. Do not combine their labels, samples, or results: the constrained-NDBI default and the IBI diagnostic have different classifications and the IBI frame additionally excludes zero-denominator pixels in both periods.

```powershell
# Default constrained-NDBI proxy
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator built-up `
  --mode validation-sample-export `
  --drive-folder SPARC_EE_EXPORTS_20260803 `
  --start-batch-export

# IBI diagnostic proxy (L=0.5, IBI > 0)
python -m scripts.data.process_earth_engine_p0 `
  --region nagpur `
  --indicator built-up `
  --mode validation-sample-export `
  --sensitivity built-ibi `
  --drive-folder SPARC_EE_EXPORTS_20260803 `
  --start-batch-export
```

Create the controlled local label template from the downloaded blinded CSV:

```powershell
python -m scripts.data.create_validation_label_template `
  --sample-csv data\raw\validation\sparc_nagpur_vegetation_validation_frame_v1.csv `
  --output-csv data\processed\validation\nagpur-vegetation-label-template.csv `
  --metadata-json data\processed\validation\nagpur-vegetation-label-template.metadata.json
```

Bind a built frame to the exact frozen method while creating its template. The check rejects a swapped or internally inconsistent CSV while preserving the blind to per-point map class.

```powershell
python -m scripts.data.create_validation_label_template `
  --sample-csv data\raw\validation\sparc_nagpur_built-up_validation_frame_default_v1.csv `
  --output-csv data\processed\validation\nagpur-built-up-default-label-template.csv `
  --metadata-json data\processed\validation\nagpur-built-up-default-label-template.metadata.json `
  --indicator-id built-up `
  --map-method-id default `
  --map-method-version p0-constrained-ndbi-v1
```

### Pre-publication result pack

After validated local P0 reports exist, build one non-overwritable offline pack. It rechecks the report region, boundary checksum, fixed periods, Earth Engine collection, area arithmetic, unknown quality, boundary disclaimer, and report checksums before writing a new result. Optional sensitivity records are retained when available; the global expansion packs intentionally do not claim sensitivity or independent validation.

```powershell
python -m scripts.data.build_prepublication_result_pack `
  --report data\processed\earth-engine-p0\nagpur-surface-water.json `
  --report data\processed\earth-engine-p0\nagpur-vegetation.json `
  --report data\processed\earth-engine-p0\nagpur-built-up.json `
  --output data\processed\prepublication-packs\nagpur-p0-v1.json
```

For each expansion city, use the same pack gate with the three reports under
`data\processed\earth-engine-p0\<city>-*.json` and output
`<city>-p0-v2.json`. Copy the accepted packs into
`data\processed\prepublication-packs\` and rebuild the published contract
examples with `python -m scripts.data.build_contract_pack_examples`.

The output remains Git-ignored and uses [`prepublication-result-pack.schema.json`](../../packages/contracts/schemas/prepublication-result-pack.schema.json). It is an offline evidence and integration boundary, not an HTTP response and not a deployable result. The current FastAPI service must remain in `SPARC_DATA_MODE=demo` until a separately reviewed mapping and disclosure path exists.
