# SPARC delivery status

**Assessed:** 2026-08-05
**Current stage:** Stage 4 of 5 — the globe-led dashboard now has contract-validated Earth Engine packs for all 14 catalog cities (plus the existing three-district compatibility set), an offline browser fixture path, a jurisdiction-agnostic reporting API, and the report-package workflow. Approved layer review, Claude UI polish, registry-driven authority selection, acknowledgement UI, and final release gates remain open. Formal scientific validation is deferred for the hackathon track.

This is an evidence-based delivery status, not a percentage derived from line count. A completed visual component does not substitute for a validated data result, and a completed data export does not substitute for a usable dashboard.

## Current position

| Stage | Status | Evidence | Exit condition |
|---|---|---|---|
| 1. Contract and safe offline API | Substantially complete | OpenAPI/schema tests pass; FastAPI serves only allowlisted bounded fixtures with safe errors | Stable immutable artifacts can be served through the same contract without weakening safety |
| 2. Boundary and P0 evidence | Complete for the requested city set, with explicit limits | Fourteen boundary gates pass; 36 Earth Engine Sentinel-2 tasks completed in project `project-b44b6a9b-cafb-4d19-8dd`; all 36 CSVs passed the guarded importer. Water is an estimated surface-water change; Nagpur built-up uses the approved constrained-NDBI result with built-IBI retained as sensitivity evidence. Formal independent validation is intentionally deferred. | Unresolved method conflicts elsewhere remain withheld, provenance/limitations are visible, and no unsupported legal or causal claim is made |
| 3. Result packaging and API integration | Complete for the current P0 data slice; release review remains | Twelve expansion packs plus the three existing district packs are schema-checked; 60 static contract examples and a SHA-256 manifest are generated; API precomputed mode indexes all 15 regions; repository tests pass (116) | Review/commit the generated fixtures and verify the release bundle; no request-time raster work |
| 4. Analytical dashboard | Substantially complete; product polish remains | `apps/web/` provides the location → period → summary → indicator journey for all packaged cities, neutral estimate terminology, reporting workflow shell, disclosures, non-WebGL path, and API/offline transports | Globe-to-panel journey, reporting wizard polish, approved layer/static assets, and accessibility/localization review |
| 5. Offline release and rehearsal | Started | The built bundle is served at `/app/` by `apps/web/serve.mjs`; demo, API recovery, viewport, keyboard, and static-server checks pass | Primary and backup journeys work from a frozen local HTTP release with offline, accessibility, security, and evidence checks |

### Supported-city catalog status

The quick-target picker now contains Nagpur, Bengaluru, Mumbai, Delhi, Chennai,
Bhopal, New York, Washington DC, Tokyo, London, Cairo, Sydney, Rio de Janeiro,
and Reykjavik
with ISO country codes, administrative areas, explicit boundary definitions,
coverage states, processing-pack/checksum metadata, and jurisdiction-pack
references. The catalog source is [`docs/city-catalog.md`](city-catalog.md) and
the machine-readable record is [`data/catalog/supported-cities.json`](../data/catalog/supported-cities.json).
The pinned expansion boundary registry is [`data/catalog/city-boundary-coverage.json`](../data/catalog/city-boundary-coverage.json)
with separate raw-source metadata, validated GeoJSON, gate manifests, and
checksums under `data/{raw,validated,metadata}/boundaries`.

All 14 catalog cities now have pinned, gate-validated boundaries and contract-
validated three-indicator Earth Engine packs. Their quality state remains
`unknown`, and the packs do not assert independent accuracy, causation, legal
compliance, or ground truth. Routing coverage is independent of analytical
coverage: the verified U.S. EPA and England routes may be opened for New York,
Washington DC, and London, while report-generation-only or unsupported routing
states remain export-only. Unsupported countries retain local export and do not
receive guessed handoff links.

### Reporting feature status (P0 contract/server slice)

The offline-first “Report Environmental Concern” server slice is implemented as a bounded P0 contract path. It has versioned jurisdiction packs, universal issue/location fields, coverage states, submission-adapter interfaces, strict claim-safe evidence gating, deterministic PDF/ZIP artifacts, canonical manifests and SHA-256 checksums, bounded photo validation, 24-hour private temporary report workspaces, manual portal handoff, and user-entered acknowledgement tracking. The browser workflow now collects report details, optionally drafts neutral narrative text with Gemini using explicit consent, appends sensitive details locally, leaves a blank printable signature line, and downloads the generated report PDF/evidence package. The PDF is generated by SPARC; the upload control accepts photos only.

This does not mean reporting is production-ready. Authentication, durable encrypted storage, background expiry jobs, RBAC, accepted result-pack integration, and the Claude-owned wizard/accessibility implementation remain P1/shared work. No government credentials, CAPTCHA/OTP, portal automation, or allegation of illegality is supported.

## Delivery estimate

The following is a planning estimate for an honest P0 hackathon candidate, not a scientific quality score.

| Workstream | Approximate readiness | Why it is not further along |
|---|---:|---|
| Boundary and processing foundation | 95% | All requested boundaries and 36 Earth Engine tasks are complete; formal scientific validation remains intentionally deferred and Nagpur's alternate built-proxy sensitivity remains disclosed |
| Contract and API | 82% | Reporting and analytical contracts, the immutable precomputed-pack adapter, 60 generated fixtures, and checksum manifest are tested; deployment packaging and release review remain |
| Analytical frontend | 88% | The dashboard now consumes all 15 packaged district responses offline and through API mode; approved layer assets and Claude reporting polish remain |
| Integration, offline bundle, and release verification | 55% | The production build passes and the single globe-led server is wired, but full release rehearsal, layer assets, handoff flow, and assistive-technology review remain |
| **Overall P0 hackathon candidate** | **about 78%** | Data and contract integration is in place; release QA, reporting polish, layer assets, and presentation rehearsal are the remaining gates |

Roughly **20–25% remains** before an honest hackathon P0 candidate. Formal validation is not on the critical hackathon path; unsupported claims, quality review, reporting handoff, approved layers, offline rehearsal, and presentation quality remain the practical gates.

## What exists today

### Processing and evidence

- Validated prototype district AOIs: Nagpur, Bengaluru Urban, and Mumbai City from geoBoundaries India ADM2, with source-specific ODbL handling and the non-authoritative-boundary disclaimer.
- Precomputed Sentinel-2 P0 summaries for all 14 catalog cities, plus the existing Nagpur/Bengaluru Urban/Mumbai City compatibility packs. Nagpur built-up uses the approved constrained-NDBI default.
- The API and browser expose the Nagpur built-up metrics; the built-IBI alternate remains attached as sensitivity evidence and does not replace the selected source.
- Vegetation threshold sensitivity at NDVI 0.20, 0.30, and 0.40. Its net green-cover proxy change ranges from −27.03 km² to −487.10 km², so the default result remains `quality: unknown`.
- Water pooled-Otsu sensitivity: fixed-zero and pooled-Otsu outputs both show net loss (−8.50 and −10.16 km²), but this is not independent validation.
- Built-proxy IBI v2 sensitivity: the approved constrained-NDBI default shows +158.47 km² while IBI shows −361.52 km². The alternate direction is disclosed as sensitivity evidence; the approved NDBI result remains the selected estimate and retains `quality: unknown` until independent validation.
- Bengaluru Urban sensitivity evidence is complete but is not validation: water is positive under the fixed-zero (+9.22 km²) and pooled-Otsu (+96.17 km²) rules; vegetation is positive at NDVI 0.20/0.30/0.40 (+30.51/+58.03/+51.76 km²); and the constrained-NDBI/IBI built diagnostics are both negative (−79.18/−5.08 km²). The magnitude differences remain material and every result remains `quality: unknown` until independent reference validation.
- A blinded, 100-point exploratory Nagpur vegetation label frame and controlled label template. It contains no independent labels and is not a validation result.
- Two separate blinded, 100-point exploratory built-up frames with checksum metadata: constrained-NDBI default (`04d61db1…e58686a7`) and IBI v2 (`a3f3e6a3…5b33958`). Their template gate verifies the declared rule but not environmental accuracy. They have no independent labels, so the selected result remains `quality: unknown`.
- Local v2 precomputed packs are generated for all 14 expansion cities plus the three compatibility districts. The API adapter generates 60 contract examples with a SHA-256 manifest, and the runtime API serves those static artifacts in `SPARC_DATA_MODE=precomputed`; raw CSVs, validated reports, and source packs remain separated under the ignored processing workspace.

### Server and contract

- A FastAPI read-only API with input limits, allowlisted identifiers, explicit CORS, safe RFC 9457-style errors, ETags, and tests.
- Canonical OpenAPI, JSON Schema, and precomputed contract fixtures with provenance and limitations.
- No database, live job creation, provider request, or Earth Engine credential use in request handlers.

### Analytical dashboard

`apps/web/` is browser/client code. It runs a React/Vite dashboard over bounded offline analysis inputs by default, validates responses against the canonical JSON Schema, and has a separate `ApiTransport` for the FastAPI service. In API mode and offline mode, the picker now lists the same packaged district set and selects each city's frozen period pair. The period control is city-aware: India post-monsoon packs use October–December, Bengaluru/Sydney/Rio use January–March, and the North-American/European/East-Asian packs use June–August.

```text
User chooses a stable district output (or an accepted future district pack)
→ user chooses the frozen same-season period pair when more than one exists
→ browser repository selects DemoTransport or ApiTransport
→ transport validates the contract-shaped response
→ view-model mapper applies unavailable/quality/provenance rules
→ summary or indicator detail renders
→ an API failure can switch the browser back to the offline analysis package
```

The dashboard's non-WebGL path remains available inside the panel. `orbital-website/` is now the single globe-led public entry under the combined static server; selecting a target opens the dashboard panel and displays a district overlay. No analytical result depends on a 3D canvas. The overlay must not imply a raster, a cadastral boundary, or real data for a generated fixture.

## Frontend work remaining for P0

| Priority | Remaining browser work | Why it remains |
|---|---|---|
| P0 | Review and commit the generated 15-region contract fixtures and manifest | `contracts/examples/precomputed/` now supplies the full packaged city set to `DemoTransport`; release review remains |
| P0 | Review city-specific journeys and add approved layer/static alternatives | The three-indicator journey is mapped for every packaged city; release still needs reviewed layer assets |
| P0 | Supply approved local layers/static alternatives for accepted results | Current fixture layer descriptors exercise disclosure and failure handling, but do not represent approved published evidence assets |
| P0 | Test the full globe-to-panel handoff and manual screen-reader/reduced-motion behavior | The panel's keyboard, 360 px, 200% zoom, and non-colour path are automated; the integrated 3D handoff and assistive-technology review still need release evidence |
| P0 | Claude polish and registry-driven browser reporting | Codex integration creates the report package and opens the server-returned handoff URL; Claude still needs reviewed `EvidenceQualityGate`, accessibility/focus handling, translations, registry-driven authority choices, and acknowledgement UI |
| P0 | Actual approved child-region drill-down | Hingna remains unapproved; the interface correctly states district-only scope until a separate boundary/data gate passes |
| P1, not P0 | Time series, LST/SUHI, live processing controls, and 3D data overlays | Keep these out of the core demo until real P0 results and release gates are stable |

The primary dashboard uses concise estimate terminology. Source dataset, acquisition periods, selected method version, thresholds, boundary provenance, processing date, quality status, and limitations remain available in methodology/provenance views. Nagpur's built-IBI alternate remains visible as sensitivity evidence while constrained-NDBI supplies the selected estimate.

## Remaining data and release gates

1. Review and commit the generated contract examples and manifest for the offline browser bundle.
2. Keep constrained-NDBI as the selected Nagpur built-up source; expose the water output only as an estimated surface-water change and keep reporting language neutral.
3. Add the Bengaluru backup journey and approved layer/static alternatives.
4. Have Claude polish the integrated wizard, consume the jurisdiction registry, add acknowledgement tracking, and complete accessibility/localization tests.
5. Run integrated offline, security, accessibility, presentation, and Q&A rehearsal gates.
6. Formal preregistration, blinded sampling, independent labels, and publication-level accuracy metrics are deferred and must not block the hackathon release track.

### 2026-08-05 expansion run

The twelve requested expansion city boundaries are source-pinned and
gate-validated. An initial dry-run used the restricted `orbitwatch-503717`
project; that historical manifest remains an audit record. The project owner
then verified `project-b44b6a9b-cafb-4d19-8dd` and approved the
`SPARC_EE_EXPORTS_20260803` Drive folder.
[`data/metadata/earth-engine-p0-expansion-run.json`](../data/metadata/earth-engine-p0-expansion-run.json).
Using that project and folder, all 36 one-indicator exports (12 cities ×
surface-water, vegetation, and built-up) completed. All 36 raw CSVs passed the
guarded importer, 12 three-indicator prepublication packs were built, and 60
contract fixtures were generated. The completed task states, raw/result/pack
checksums, and manifest link are recorded in
[`data/metadata/earth-engine-p0-expansion-run-project-b44b6a9b.json`](../data/metadata/earth-engine-p0-expansion-run-project-b44b6a9b.json).

## Current next task

The dashboard is ready for the hackathon integration track and has passed the
current browser checks, the 116-test repository suite, and the production build. The combined local server serves
the single globe-led experience at `http://localhost:8123/`; selecting a
location opens the analytical panel over the globe. `/app/` is retained only as
a redirect for old bookmarks, while `/app/*` serves panel assets. Offline and
API precomputed modes now expose the same 15 packaged regions. Water may be
presented as an estimated surface-water change. Nagpur built-up uses the
approved constrained-NDBI estimate while the built-IBI alternate remains
visible as sensitivity evidence; all packs retain quality status unknown and
documented limitations. Formal preregistration,
blinded sampling, independent labels, and publication-level accuracy metrics are
explicitly deferred for the hackathon track.

The API remains bounded to precomputed/offline results while this work is underway. Do not introduce request-time raster processing or publish unsupported legal, causal, pollution, deforestation, or encroachment findings. The generated responses are bound to the reviewed pack and boundary checksums; release still requires the asset review below.

The next task is release integration: review/commit the generated pack assets, add approved static layers, finish the reporting components (`EvidenceQualityGate`, `ComplaintWizard`, `OfficialPortalHandoff`, and `SubmissionTracker`), verify artifact downloads and manual handoff across supported and export-only jurisdictions, then rehearse the offline presentation. The city-picker contract and migration notes are documented in [`docs/reporting/frontend-migration-note.md`](reporting/frontend-migration-note.md).
