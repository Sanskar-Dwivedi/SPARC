# SPARC Implementation Plan

**Planning baseline:** 2026-08-02  
**Implementation window:** Day 0 through Day 3, with optional Day 4 contingency  
**Contract freeze:** End of Day 0

## Objective

Build a reliable prototype that converts open Earth-observation data into district and subdistrict satellite-derived environmental proxy indicators that non-specialists can understand, question, and trace back to source observations.

SPARC addresses an access and interpretation problem: satellite data exists, but local decision-makers often lack a usable before/after view, plain-language meaning, transparent provenance, and an honest account of data quality. SPARC does not certify official UN indicator values or prove why a change occurred.

## Users

- District and subdistrict administrators reviewing local environmental conditions.
- NGOs and community organizations prioritizing investigation and communication.
- CSR and environmental-consulting teams screening and reporting local interventions.
- Researchers and reviewers checking scientific defensibility and provenance.
- Hackathon judges evaluating innovation, implementation, impact, viability, completeness, and presentation.

## Scope

### P0 — required prototype

- Nagpur district plus Bengaluru Urban backup and Mumbai City district as the
  additional validated Maharashtra scope.
- Same-season before/after comparisons using explicit composite windows.
- Satellite-derived open-surface-water-area proxy.
- NDVI activity and green-cover proxy.
- Satellite-derived built-up-area proxy.
- District summary and at least one Nagpur subdistrict drill-down; Hingna is a provisional candidate pending boundary, license, imagery, and QA checks.
- Plain-language, non-causal interpretation.
- Dataset attribution, source-item provenance, method version, and quality evidence.
- Stable OpenAPI/JSON Schema contract and frontend-ready mocks.
- Offline-first “Report Environmental Concern” contract/server slice: strict claim-safe evidence review, ranked authority routing, deterministic PDF/ZIP evidence packages, manual portal handoff, and ephemeral device-scoped records. It never submits complaints or handles government credentials, CAPTCHA, or OTP.
- Precomputed, local-HTTP, internet-independent demonstration path.
- Responsive, keyboard-accessible UI with non-WebGL alternatives.
- A documented, non-blocking plan for user-provided 3D assets.

### P1 — strong enhancement

- Landsat Collection 2 Level-2 surface temperature and surface UHI.
- Time-series charts, district report, automated discovery, COG/tile serving, additional subdistrict comparisons, advanced mobile optimization, interactive quality explanation, and inspected user-provided 3D integration.

### P2 — future work

- Multiple fully validated districts, animated playback, accounts, saved views, complex queues, advanced change detection, predictive modelling, automated policy recommendations, and national scale.

### Non-goals

- Official UN SDG reporting, causal attribution, unrestricted user-defined AOIs, real-time guarantees, Kubernetes, unnecessary authentication, required 3D navigation, external model acquisition, or production-scale infrastructure during the prototype.

### Reporting delivery boundary

The reporting contract, jurisdiction packs, adapter interfaces, and Codex-owned server modules are implemented for P0 and documented in `docs/reporting/`. The browser now creates the SPARC-generated PDF/evidence package; Claude owns polish, registry-driven authority selection, accessibility, localization, and acknowledgement UI. P1 is required before durable production reporting: authenticated ownership, encrypted private storage, configurable deletion jobs, RBAC, accepted immutable result-pack integration, and release rehearsal. Automated authority APIs, portal scraping, legal escalation, and machine translation remain P2 exclusions.

### Hackathon execution priority (2026-08-05)

Formal scientific validation is deliberately deferred for the remaining
hackathon work. Do not spend additional time on preregistration, blinded
sampling, independent manual labels, academic validation studies, or
publication-level accuracy metrics. The release track instead prioritizes:

1. Stable precomputed Nagpur, Bengaluru Urban, and Mumbai City outputs through the frozen contract;
   the API adapter is available with `SPARC_DATA_MODE=precomputed`, while the
   offline browser bundle still needs the approved packaged response assets.
2. Neutral dashboard terminology: “Satellite-derived estimate”, “Estimated
   surface-water change”, “Detected vegetation change”, “Estimated land-cover
   change”, “Analysis period”, “Data source”, and “Processing method”.
3. Frontend dashboard completion and reporting-wizard integration.
4. Verified PDF/evidence-pack downloads, allowlisted manual portal handoff,
   offline operation, presentation, and Q&A rehearsal.

The technical provenance view must retain dataset, acquisition periods, method
version, thresholds, boundary source, processing date, data-quality status, and
known limitations. The contradictory Nagpur built-up result remains unavailable;
no method may be selected merely because its direction is more convenient.
The presentation statement is: “SPARC processes Earth-observation imagery using
documented geospatial methods to generate district-level satellite-derived
environmental estimates.”

### City catalog expansion (2026-08-05)

The quick-target catalog is now a versioned, validated-gated record for Nagpur,
Bengaluru, Mumbai, Delhi, Chennai, Bhopal, New York, Washington DC, Tokyo,
London, Cairo, Sydney, Rio de Janeiro, and Reykjavik. All fourteen entries are
bound to pinned geoBoundaries geometry and the generated precomputed contract
manifest. The expansion boundary registry retains separate raw-source metadata,
validated GeoJSON, gate manifests, and checksums. Every pack retains
`quality: unknown`; this is contract/data-integrity validation, not independent
scientific accuracy validation. Unsupported-country entries use
`UNSUPPORTED_JURISDICTION` routing and export-only behavior.

The catalog validator (`\.venv\Scripts\python.exe
scripts/validate_city_catalog.py`) is a release gate. It verifies the country
codes, unique IDs, coordinate envelopes, boundary checksums, validated geometry
assets, global boundary-registry gates, processing-pack checksums, contract
bindings, and fallback-state rules.
The frontend and build-free Orbit launcher consume the same city set. Offline
and API precomputed modes now use the same fifteen-region fixture inventory
(the fourteen catalog cities plus the existing Bengaluru Urban compatibility
district). No fabricated numeric values are added; every value is tied to its
Earth Engine request, boundary checksum, method version, and provenance record.

Expansion delivery status and remaining work:

- [x] **D1-DATA-EXPANSION — Start and import the guarded Earth Engine batch requests**
  - Owner: Codex / project owner for Earth Engine quota and Drive export approval
  - Priority: P0 for city-level analytical coverage
  - Progress 2026-08-05: All twelve boundaries passed selection and boundary gates. The first project was quota-restricted, so its dry-run requests remain as an audit record. The verified replacement project `project-b44b6a9b-cafb-4d19-8dd` completed 36 one-indicator Earth Engine tasks in `SPARC_EE_EXPORTS_20260803`; all 36 raw CSVs passed the guarded importer, 12 three-indicator packs were built, and 60 contract examples were regenerated. Request, raw CSV, report, pack, and contract-manifest checksums are recorded in `data/metadata/earth-engine-p0-expansion-run-project-b44b6a9b.json`.
  - Expected output: one imported three-indicator report per city, boundary-bound checksums, prepublication packs, and regenerated contract examples/manifest
  - Acceptance condition: each imported report validates against its request, exact boundary checksum, fixed periods, Sentinel-2 collection, and the existing claim-safety gates
  - Blocker: none for the data/contract gate. Scientific accuracy validation remains intentionally deferred; release still requires review of the generated fixtures, layer assets, and frontend presentation.

- [ ] Have Claude replace the temporary local catalog/picker presentation with
  registry-driven authority and accessibility components.
- [x] Research and validate an external boundary and provenance record for each
  requested expansion city before promoting it to the precomputed pack catalog.
- [x] Produce and checksum an Earth Engine processing pack plus contract
  examples before setting each remaining city to `FULLY_SUPPORTED` analytical coverage.
  - Progress 2026-08-05: The replacement Earth Engine project completed all 36
    requested exports; guarded imports, 12 three-indicator packs, catalog
    checksums, and 60 contract examples passed the pack/repository gates.
- [ ] Complete offline/browser acceptance checks for every quick target and the
  manual handoff/export-only branches.

## Pilot and Period Decisions

| Candidate | Strengths | Constraints | Decision |
|---|---|---|---|
| Nagpur | Recognizable central-India district; water, agriculture/green cover, forest context, urban growth, and heat narrative; 14 tahsils | 9,892 km² increases processing and validation load | Primary; precompute and verify catalog coverage |
| Bengaluru Urban | Compact, five taluks, strong urban/green/water story | Small water bodies and cloud/season matching require care | Backup |
| Mumbai City | Compact coastal district; post-monsoon water, vegetation, and built-up comparisons | Dense urban fabric, coastal/cloud effects, and district-only boundary scope | Validated additional Maharashtra pack |
| Gurugram | Compact; clear urban and heat relevance; four blocks | Bare-soil confusion and weaker water narrative | Candidate expansion |
| Pune | Strong reservoirs, vegetation gradient, urban growth, and heat | Very large and multi-tile; high P0 processing cost | Candidate expansion |

- Nagpur P0 windows: 2019-10-15–2019-12-15 versus 2024-10-15–2024-12-15.
- Nagpur P1 LST windows: 2019-03-01–2019-05-15 versus 2024-03-01–2024-05-15.
- Bengaluru Urban backup windows: 2019-01-15–2019-03-15 versus the same dates in 2024. The district-boundary, catalog, cloud/common-valid-area, and license gates passed on 2026-08-03; any later period change requires a new documented method/version.
- Mumbai City windows: 2019-10-15–2019-12-15 versus 2024-10-15–2024-12-15. The pinned Mumbai City ADM2 boundary, catalog, common-valid-area, source, and checksum gates passed on 2026-08-05; any later period change requires a new documented method/version.
- Catalog metadata, common-valid coverage, and same-season suitability are Day 0 gates. Any expansion is symmetric across years and recorded; the demo never switches dates silently.

## Indicator Decisions

| Indicator | P0 method | Evidence exposed | Important limitation |
|---|---|---|---|
| Surface water | Sentinel-2 L2A MNDWI at 20 m; fixed zero baseline with pooled/calibrated sensitivity; AWEI/JRC/Sentinel-1 checks | Areas, gain/loss, threshold, common-valid coverage, scene counts, sensitivity | Open water only; not volume, quality, groundwater, all wetlands, or causation |
| Vegetation | Per-scene Sentinel-2 NDVI at 10 m then median; optional 0.30 green-cover heuristic with 0.20/0.40 sensitivity | Median index, green-cover proxy, valid coverage, threshold sensitivity | Greenness changes with crops, rain, irrigation, harvest, and atmosphere; not forest loss |
| Built-up | Sentinel-2 spectral consensus using NDBI/IBI diagnostics with NDVI/MNDWI exclusions at 20 m | Gain/loss/net, calibration, sensitivity, quality warnings | Bare soil, construction, dry vegetation, roofs, and mixed pixels create errors |
| Surface temperature | P1 USGS Landsat 8/9 Collection 2 Level-2 `ST_B10` | QA, uncertainty, cloud distance, scene dates, rural reference | Surface—not air—temperature; effective thermal support is coarser than the published grid |

Quality is categorical and evidence-based. A high grade requires independent validation; no grade is presented as a probability of correctness.

## Data-source and Reuse Strategy

1. Discover and process Sentinel-2 L2A surface reflectance through Google Earth Engine using `COPERNICUS/S2_SR_HARMONIZED`.
2. Keep the direct Copernicus Data Space STAC path as a documented fallback for metadata discovery and future export recovery; retain underlying Copernicus attribution and provider limitations.
3. Keep Dynamic World off the critical path.
4. Use the validated geoBoundaries gbOpen India ADM2 release `IND-ADM2-76128533` for the two prototype district AOIs. Preserve its source-specific ODbL 1.0 attribution and applicable share-alike obligations; the collection-level CC BY 4.0 description must not be represented as a CC-BY-only grant. No Survey of India ABDB geometry is used or redistributed.
5. Use JRC Global Surface Water, ESA WorldCover, GHSL, and approved local records for context/corroboration, not automatic ground truth.
6. Reuse GDAL, Rasterio, GeoPandas, Shapely, NumPy, pystac-client, and narrowly scoped scikit-image. Do not rebuild projection, raster IO, geometry, STAC, or Otsu functionality.
7. Pin a tested geospatial binary matrix before implementation and retain all required notices and data attributions.

## Architecture

### Summary

- Modular monolith rather than microservices.
- React/TypeScript/Vite browser with MapLibre and Recharts.
- Planned FastAPI/Pydantic API.
- Separate geoprocessing package/CLI for bounded, repeatable preprocessing.
- Static immutable precomputed results for P0; no runtime database.
- GeoPackage for vector handoff; JSON/GeoJSON and PNG/WebP/small XYZ layers for demo delivery.
- Future object storage/CDN plus PostGIS metadata only when operational requirements justify them.

### Live or semi-live mode

```text
selection → POST /api/v1/comparisons → validation → deterministic result lookup
→ 200 cache hit OR 202 queued job → Google Earth Engine worker → processing
→ immutable result + provenance → shared API response → browser rendering
```

### Offline precomputed mode

```text
selection → canonical request key → local manifest → checksum/schema validation
→ local response/layers → shared view model → browser rendering with source/methodology disclosure
```

Live failure may fall back only on defined network/timeout/503 cases and must visibly change the data-mode label.

## Planned Repository Structure and Ownership

```text
apps/api/                    Codex
apps/web/                    Claude
services/geoprocessing/      Codex
packages/contracts/          Codex primary, Shared review
contracts/                   Codex primary, Shared review
data/{boundaries,raw,interim,processed,demo}/  Codex; demo reviewed by Shared
assets/models/{earth,satellite}/               User-owned payloads; Claude integration only
scripts/data/                Codex
tests/{api,processing,contract,integration}/   Codex or Shared as documented
tests/frontend/              Claude
infra/                       Codex
docs/                        Primary owner by topic; Shared review for cross-cutting files
```

No developer directly edits another owner's exclusive path. Generated files identify their source/tool and are never hand-edited. User-provided models are not modified, converted, replaced, or committed without approval.

## Contract-first Workflow

1. `packages/contracts/schemas/sparc.schema.json` defines reusable shapes.
2. `contracts/openapi.yaml` defines operations and references canonical schemas.
3. Every example validates before the end-of-Day-0 freeze.
4. Claude builds against committed examples without waiting for the API.
5. Future TypeScript and Python bindings are generated from the contract; duplicate handwritten models are prohibited.
6. After freeze, additive changes need contract-owner review. Breaking changes require both workstreams, a schema-version bump, regenerated outputs, updated examples, and migration notes.

## Dependency Graph

```text
Research/license gates
  → pilot periods + boundary decision
  → indicator methodology + schemas
  → OpenAPI + mock examples (Day 0 freeze)
      ├─→ Claude UI against mocks
      └─→ Codex processing/API against contract
            → representative real output
            → end-to-end integration
            → offline pack + verification
            → feature freeze + demo rehearsal
```

## Day 0 — Scope, Evidence, and Contract Freeze

- [ ] **D0-C-001 — Verify source, boundary, and license gates**
  - Owner: Codex
  - Priority: P0
  - Dependency: None
  - Expected output: Metadata-only catalog inventory for Nagpur, Bengaluru Urban, and Mumbai City, boundary version/license records, and attribution text
  - Acceptance condition: All three validated regions have documented identifiers, candidate scenes/windows, boundary source, redistribution basis, and fallback
  - Fallback: Use the next approved catalog/boundary source or retain only licensed precomputed artifacts
  - Progress 2026-08-05: Passed for the three district AOIs. The pinned geoBoundaries India ADM2 archive, feature IDs/names, WGS84 CRS, state containment, polygon geometry, provenance, and SHA-256 values were validated for Nagpur, the Bengaluru Urban backup, and Mumbai City (`shapeName=Mumbai`, `shapeID=76128533B16442413169750`). The source-specific metadata is ODbL 1.0, so any commit, distribution, or deployment must preserve its attribution and applicable share-alike obligations. No Survey of India geometry was acquired or used. See `docs/research/pilot-source-gate.md`.

- [ ] **D0-S-002 — Freeze P0 scope, terminology, and methodology**
  - Owner: Shared
  - Priority: P0
  - Dependency: D0-C-001
  - Expected output: Accepted P0/P1/P2 list, proxy vocabulary, formulas, QA rules, quality policy, and pilot windows
  - Acceptance condition: SRS, methodology, ADRs, and presentation use identical names and periods
  - Fallback: Remove an unvalidated enhancement rather than weaken scientific disclosure

- [ ] **D0-C-003 — Freeze OpenAPI, shared schemas, and mocks**
  - Owner: Codex
  - Priority: P0
  - Dependency: D0-S-002
  - Expected output: Valid OpenAPI 3.1, canonical schemas, all required mock payloads, and contract change policy
  - Acceptance condition: Examples validate; Claude can render the full main journey without backend code
  - Fallback: Reduce optional operations while preserving the comparison, provenance, quality, and layer contract

- [ ] **D0-S-004 — Freeze ownership, environment names, and integration rules**
  - Owner: Shared
  - Priority: P0
  - Dependency: D0-C-003
  - Expected output: Path matrix, branch/merge policy, environment-variable list, checkpoints, and generated-file rules
  - Acceptance condition: No exclusive path has two direct editors and no secret-bearing variable is browser-visible
  - Fallback: Assign a single primary owner and require proposed changes through review

- [ ] **D0-CL-005 — Prove frontend independence with mocks**
  - Owner: Claude
  - Priority: P0
  - Dependency: D0-C-003
  - Expected output: Mock transport plan and accepted dashboard/view-state mapping
  - Acceptance condition: Every P0 screen state maps to a committed example or explicit client-only state
  - Fallback: Use a static fixture repository conforming to the same schemas

**Checkpoint:** Claude can start independently; contracts, ownership, and vocabulary are frozen.

## Day 1 — Independent Core Development

- [ ] **D1-C-001 — Prepare reproducible boundary and composite pipeline**
  - Owner: Codex
  - Priority: P0
  - Dependency: D0-C-001, D0-S-002
  - Expected output: Pinned environment, validated Nagpur/Bengaluru Urban/Mumbai City grids and boundaries, common-valid composites, and provenance manifests
  - Acceptance condition: A clean run reproduces checksums and records scenes, masks, CRS, parameters, and valid coverage
  - Fallback: Use the approved preselected scenes and locally retained inputs
  - Progress 2026-08-05: `scripts.data.extract_geoboundaries_adm2` produces separate raw-source, validated GeoJSON, and metadata/gate artifacts. `scripts.data.process_earth_engine_p0` checks the gate/hash before Earth Engine processing. Nagpur, Bengaluru Urban, and Mumbai City water, vegetation, and built-up computations completed on their validated polygons. Mumbai City’s 10 m vegetation computation used the guarded full-resolution Google Earth Engine CSV batch path; its importer verified the approved boundary checksum, CRS, method settings, coverage, and area arithmetic. Method and scale remain unchanged.

- [x] **D1-C-002 — Produce representative water, vegetation, and built-up outputs**
  - Owner: Codex
  - Priority: P0
  - Dependency: D1-C-001
  - Expected output: One representative result per P0 method plus formula/schema tests
  - Acceptance condition: Results validate, use fixed cross-period rules, and expose raw/cleaned/sensitivity evidence
  - Fallback: Mark an unstable indicator low-quality and use the documented simpler fixed method
  - Progress 2026-08-04: Completed as pre-publication evidence only. Nagpur water, vegetation, and built-candidate reports now carry imported sensitivity records validated against the approved boundary checksum, CRS, method settings, coverage, and area arithmetic. Water's fixed-zero and pooled-Otsu runs both show net loss (−8.50 and −10.16 km²), but independent validation remains required. Vegetation's net proxy change spans −27.03 to −487.10 km² at the fixed 0.20/0.30/0.40 thresholds. The corrected built IBI (`L=0.5`, `>0`) v2 sensitivity reverses the constrained-NDBI default direction (+158.47 versus −361.52 km²), so the built-change finding is blocked and must be withheld or retained only as an explicitly unstable diagnostic. Separate 100-point blinded exploratory frames for the constrained-NDBI and IBI v2 rules completed in the approved Drive folder and were method-bound locally before template creation; they are not independent labels or a probability design. A prior IBI v1 CSV did not record the denominator-validity footprint and is explicitly excluded. The processing command now has a separate `validation-population-export` and guarded import path that records finite common-valid mapped-stratum populations for a frozen method. Nagpur vegetation's v1 population task `NV3GJIT5ETNZIKGSEFSQXBYB` completed but is rejected: the default Earth Engine frequency histogram is weighted and produced fractional totals, which are not finite pixel populations. Corrected unweighted v2 task `IPR4AHLHF5N4M5S64WS5XIIO` is running. No allocation, inclusion probability, independent label, formal accuracy analysis, or release claim exists. All quality remains `unknown`.

- [x] **D1-C-003 — Build API/result-repository skeleton to the contract**
  - Owner: Codex
  - Priority: P0
  - Dependency: D0-C-003
  - Expected output: Health, region, metadata, comparison, layer, and error paths reading immutable results
  - Acceptance condition: Contract tests pass without performing raster processing in request handlers
  - Fallback: Serve the exact immutable payloads through the demo transport while correcting the API

- [x] **D1-CL-004 — Build accessible dashboard shell against mock transport**
  - Owner: Claude
  - Priority: P0
  - Dependency: D0-CL-005
  - Expected output: App shell, region/period controls, summary cards, map/chart shells, and loading/error/empty/partial states
  - Acceptance condition: Keyboard journey works at desktop and 360 px using only committed mocks
  - Fallback: Use static accessible result tables and image layers before adding map interactions
  - Progress 2026-08-03: Completed in `apps/web/`. The browser flow is location → frozen period → district summary → indicator detail. It uses DemoTransport by default, repeats the contract boundary validation in the browser, and passed 36 headless-browser checks in demo/static mode for keyboard order, 360 px, 200% zoom, disclosures, deep links, and non-colour status text.

- [x] **D1-CL-005 — Add provenance, quality, and optional-showcase placeholders**
  - Owner: Claude
  - Priority: P0
  - Dependency: D1-CL-004
  - Expected output: Provenance drawer, quality explanation, demo badge, 3D placeholder, no-WebGL fallback
  - Acceptance condition: Scientific caveats and data mode are visible without opening developer tools
  - Fallback: Keep 3D as a noninteractive poster and prioritize analytical disclosure
  - Progress 2026-08-03: Completed for the dashboard. Synthetic-demo mode, provenance, quality, ODbL attribution/share-alike, SDG limitations, district-only scope, and non-WebGL disclosure are visible. API mode passed 40 headless-browser checks, including an intentionally blocked request followed by recovery to the bundled demo transport. Full Orbit-to-panel handoff remains a release test.

**Checkpoint:** Representative scientific outputs and a usable mock dashboard exist; contract validation passes; no shared-file conflict exists.

## Day 2 — End-to-End Prototype

- [ ] **D2-C-001 — Complete P0 zonal results and precomputed packs**
  - Owner: Codex
  - Priority: P0
  - Dependency: D1-C-001, D1-C-002
  - Expected output: Nagpur district/tahsil results plus Bengaluru Urban and Mumbai City district results, layers, quality, provenance, manifests, and checksums
  - Acceptance condition: Primary and backup payloads validate and all referenced local assets resolve
  - Fallback: Preserve the district and whichever Nagpur subdistrict passes the gate; otherwise mark child results unavailable and keep the district-level backup
  - Progress 2026-08-05: Schema-checked, non-overwritable local pre-publication packs exist for Nagpur, Bengaluru Urban, and Mumbai City. Each retains report checksums, water/vegetation/built sensitivity records, `quality: unknown`, the boundary disclaimer, and `NOT_COMPLETED` independent validation. Mumbai City’s default and built-IBI sensitivity results agree in direction, so its built estimate is available with the same quality limitations; the Nagpur built sensitivity reversal remains blocked. All three packs are offline evidence only and are now connected to the precomputed API/browser contract.

- [ ] **D2-C-002 — Complete comparison and contract behavior**
  - Owner: Codex
  - Priority: P0
  - Dependency: D1-C-003, D2-C-001
  - Expected output: Cache/demo hits, partial results, errors, idempotency, safe layer descriptors, and contract test report
  - Acceptance condition: All normal and planned failure examples match the OpenAPI contract
  - Fallback: Disable live job creation and expose read-only precomputed comparisons

- [ ] **D2-CL-003 — Complete the main analytical journey**
  - Owner: Claude
  - Priority: P0
  - Dependency: D1-CL-004, D2-C-001
  - Expected output: Before/after layers, district summary, indicator charts, tahsil drill-down, quality/provenance, and interpretations
  - Acceptance condition: A user can complete the exact demo journey without knowing remote-sensing terminology
  - Fallback: Use static overlay images and accessible tables rather than live tiles
  - Progress 2026-08-05: The dashboard and API precomputed transport now consume the same 15-region fixture inventory: the 14 catalog cities plus the existing Bengaluru Urban compatibility pack. The Nagpur built-up conflict remains unavailable. This item remains open for reviewed layer/static assets, Claude-owned reporting polish, accessibility/localization review, and a permitted child-region result; no real-time/national coverage is implied.

- [ ] **D2-S-004 — Perform first full integration**
  - Owner: Shared
  - Priority: P0
  - Dependency: D2-C-002, D2-CL-003
  - Expected output: Integrated build, defect log, contract-drift report, and updated release candidate
  - Acceptance condition: Both transports render equivalent view models and the critical demo completes
  - Fallback: Freeze on DemoTransport and correct live integration after the judged path is safe

**Checkpoint:** The main journey is end-to-end; demo mode and backup region work; contract drift is zero.

## Day 3 — Reliability and Judging Readiness

- [ ] **D3-S-001 — Run scientific, contract, security, and accessibility verification**
  - Progress 2026-08-05: The repository test suite passes (116 tests). Scientific
    preregistration, blinded sampling, independent labels, and publication-level
    accuracy metrics remain deliberately deferred for the hackathon track. The
    existing claim-safety gates, method-conflict suppression, provenance checks,
    and quality limitations remain active; no accuracy score or ground-truth claim
    is fabricated. See `docs/frontend-handoff.md` and `docs/project-status.md`.
  - Owner: Shared
  - Priority: P0
  - Dependency: D2-S-004
  - Expected output: Test evidence, validation metrics, secret scan, accessibility results, and remaining-risk list
  - Acceptance condition: All P0 acceptance tests pass or an explicit limitation/fallback is approved
  - Fallback: Remove the failing enhancement and retain the simplest validated P0 path

- [ ] **D3-S-002 — Verify the offline release bundle**
  - Owner: Shared
  - Priority: P0
  - Dependency: D3-S-001
  - Expected output: Self-contained local bundle, checksum report, startup instructions, and recovery copy
  - Acceptance condition: Primary and backup journeys pass twice with network disabled and WebGL unavailable
  - Fallback: Use the verified static build and image/table layers with no API process

- [ ] **D3-C-003 — Prepare optional cloud deployment candidate**
  - Owner: Codex
  - Priority: P1
  - Dependency: D3-S-002
  - Expected output: Reproducible container/static deployment instructions and health verification
  - Acceptance condition: Cloud failure cannot affect the local release candidate
  - Fallback: Do not deploy; demonstrate locally

- [ ] **D3-CL-004 — Finish responsive and presentation polish**
  - Owner: Claude
  - Priority: P0
  - Dependency: D3-S-001
  - Expected output: Responsive fixes, focus/order review, readable charts/tables, and final demo-state visuals
  - Acceptance condition: 360 px, keyboard-only, 200% zoom, and reduced-motion journeys pass
  - Fallback: Remove decorative animation and retain clear static presentation

- [ ] **D3-S-005 — Feature-freeze and rehearse judging flow**
  - Owner: Shared
  - Priority: P0
  - Dependency: D3-S-002, D3-CL-004
  - Expected output: Feature-frozen candidate, timed demo, Q&A roles, evidence checklist, and recovery rehearsal
  - Acceptance condition: Two consecutive 5–7 minute runs finish within time, including one forced offline recovery
  - Fallback: Use the shorter scripted path and pre-opened backup view

**Checkpoint:** Feature freeze, offline verification, deployment candidate or documented local-only decision, and presentation-ready prototype.

## Optional Day 4 — Contingency Only

- [ ] **D4-S-001 — Resolve only critical release defects**
  - Owner: Shared
  - Priority: P0
  - Dependency: D3-S-005
  - Expected output: Minimal reviewed fixes and rerun verification
  - Acceptance condition: No new feature or contract break enters the release
  - Fallback: Revert the optional change and use the Day 3 candidate

- [ ] **D4-CL-002 — Inspect and optionally integrate supplied 3D assets**
  - Owner: Claude
  - Priority: P1
  - Dependency: User supplies assets; D3-S-005 complete
  - Expected output: Asset audit and optional lazy showcase that meets budgets/fallback rules
  - Acceptance condition: Dashboard bundle and critical journey remain unchanged and usable without the scene
  - Fallback: Keep the approved placeholder/poster experience

- [ ] **D4-S-003 — Final submission and recovery copies**
  - Owner: Shared
  - Priority: P0
  - Dependency: D4-S-001 or accepted Day 3 candidate
  - Expected output: Submission archive, hashes, documentation, presentation, and two tested local copies
  - Acceptance condition: Submission checklist is signed and both copies start offline
  - Fallback: Submit the verified Day 3 archive

## Testing Milestones

- Day 0: schemas, examples, OpenAPI, terminology, and ownership validation.
- Day 1: formula/unit/CRS/QA tests plus component states against mocks.
- Day 2: contract, repository, layer, integration, partial/failure, and subdistrict tests.
- Day 3: scientific sampling, accessibility, responsive, security, performance, offline, clean-start, and rehearsal tests.
- Every failure records the exact layer: UI, client logic, network, API, validation, business logic, processing, storage, provider, or environment.

## Deployment and Demo Strategy

- Primary: prebuilt static client and local demo assets over local HTTP.
- Optional: static frontend on a CDN and containerized FastAPI on a cloud host; never required for recovery.
- No runtime writes, remote fonts, remote basemap, public OSM prefetch, live provider, database, or 3D asset in the critical path.
- Demo sequence: problem → Nagpur selection → water comparison → vegetation → built-up → validated subdistrict drill-down → quality/provenance → offline proof → architecture/scalability → limitations/action.

## Principal Risks and Controls

| Risk | Primary control | Fallback |
|---|---|---|
| Provider/auth/quota outage | Preselect and cache exact inputs/results | Static offline pack |
| Cloud-heavy or incomparable periods | Same-season multi-scene composite and coverage gate | Symmetric window expansion or approved alternate window |
| Boundary/license failure | Preserve the selected geoBoundaries India ADM2 ODbL provenance, attribution, and applicable share-alike obligations; include the prototype/non-authoritative disclaimer | Another authority/version/license-verified source, or omit public geometry |
| Spectral misclassification | Frozen thresholds, sensitivity, local validation, visible quality | Low-grade result or remove unstable enhancement |
| Tile/API/cloud failure | Static images/GeoJSON and local transport | Accessible tables and screenshots |
| Contract drift | Day 0 freeze, canonical schemas, CI validation | Freeze frontend on committed mocks until fixed |
| Merge conflict | Exclusive path ownership and ordered merges | Primary owner resolves from latest main |
| 3D incompatibility/performance | Inspect after core freeze; lazy optional scene | Poster/2D path |
| Unsupported scientific or causal claim | Terminology review and citations | Replace with observed-pattern wording |

## Judging Traceability Summary

| Criterion | Planned evidence | Demo moment | Acceptance |
|---|---|---|---|
| Innovation & Originality | Local proxy indicators, interpretation, quality, provenance | Water-to-action explanation | Innovation is analytical, not decorative 3D |
| Technical Implementation | Reproducible pipeline, frozen contract, offline transport | Mode/architecture reveal | Schemas, tests, and provenance pass |
| Problem Understanding | User needs, scientific limits, SDG distinction | Opening and caveat | No official-indicator or causal claim |
| Scalability & Practical Impact | Provider adapters, region config, immutable artifacts | Add-a-district explanation | New region needs no contract change |
| UI/UX | Plain language, comparison, map/table, accessibility | Main journey | Keyboard/mobile/no-WebGL pass |
| Business Viability | Government/NGO/CSR/service use cases with cost/risk | Closing | Models labelled plausible, not validated |
| Presentation & Q&A | Timed script, evidence-based answers, recovery | Rehearsal/offline switch | Two successful timed runs |
| Prototype Completeness | Primary, backup, three proxies, drill-down, provenance | Full flow | P0 definition of done passes |

## Business Considerations

Plausible models include institutional subscription, paid district onboarding/validation, consulting-supported reports, and a metered API for derived results. These are hypotheses, not validated demand. Open satellite data reduces input licensing cost but does not remove processing, validation, hosting, support, boundary, and attribution obligations. The first validation target is whether district/NGO users find the proxy evidence actionable enough to justify repeated use.

## Final Submission Checklist

- [ ] P0 primary and backup journeys verified offline.
- [ ] Three P0 indicators, one validated Nagpur subdistrict drill-down, quality, provenance, interpretation, and attributions present.
- [ ] Contract/examples and all referenced assets validate.
- [ ] Scientific limitations and proxy terminology reviewed.
- [ ] Accessibility, responsive, no-WebGL, security, and secret checks pass.
- [ ] No raw scenes, secret, signed URL, unapproved model, or license-incompatible asset is included.
- [ ] Demo script, Q&A, architecture, judging matrix, business caveats, and recovery copies are final.
- [ ] Project license remains explicitly unresolved until the user chooses it.

## Definition of Done

SPARC P0 is done only when a non-specialist can open the local application without internet, select Nagpur, compare the frozen periods, understand all three proxy indicators, inspect at least one subdistrict, see where the data came from and how trustworthy it is, switch to the backup district, and complete the journey using keyboard and non-WebGL fallbacks—while every payload validates against the frozen contract and no wording implies official SDG compliance, environmental causation, or unsupported accuracy.
