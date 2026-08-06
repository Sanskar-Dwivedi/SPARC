# SPARC presentation and evidence-based Q&A

**Status:** hackathon presentation plan for the precomputed offline release track
**Primary rule:** use neutral satellite-derived estimate terminology and keep source, method, quality status and limitations available in methodology/provenance views

## 1. Current facts versus future claims

### Confirmed in the current repository

- Requirements, architecture, methods, sources, contracts, schemas and precomputed offline outputs are documented.
- Nagpur is the primary pilot decision and Bengaluru Urban the backup decision.
- The planned P0 methods are MNDWI water, NDVI vegetation/green proxy and Sentinel-2 spectral built-up proxy.
- LST/SUHI, live processing, cloud deployment and user-provided 3D are P1/optional.
- The critical-path architecture is local HTTP with immutable precomputed results.

### Not confirmed in the current repository

- The React/Vite dashboard and FastAPI contract service exist for the bounded offline path.
- Earth Engine processing outputs and validated district boundary packages exist locally.
- Nagpur, Bengaluru Urban, and Mumbai City precomputed packs exist; Nagpur
  built-up uses the approved constrained-NDBI result with built-IBI retained as
  sensitivity evidence.
- No business demand, customer, revenue, cloud deployment or 3D asset compatibility has been validated.

Formal academic validation is deferred for the hackathon track. The presentation must not invent accuracy, ground truth, legal verification, responsibility or causation.

## 2. Suggested eight-slide story

| Slide | Time | Message | Evidence to show | Avoid |
|---|---:|---|---|---|
| 1. The gap | 0:30 | Open satellite data is hard to turn into comparable local evidence | one user workflow/problem statement; no inflated statistic | invented market/impact numbers |
| 2. What SPARC does | 0:35 | District-level before/after proxies with quality and provenance | compact request-flow diagram and proxy disclaimer | “official SDG monitoring” |
| 3. Pilot and methods | 0:45 | Nagpur, comparable windows, three fixed P0 methods | periods and method table | universal thresholds or causal interpretation |
| 4. Architecture | 0:40 | One typed client, offline/API transports and reproducible processing | system architecture with client/server boundary | calling Vite a backend or claiming cloud is deployed |
| 5. Demonstration | 2:45–3:30 | Show summary, indicator evidence, quality and recovery | follow [demo script](demo-script.md) | optional 3D before core evidence |
| 6. Scientific honesty | 0:45 | Common-valid footprint, sensitivity, data-quality status and limits | quality/provenance panel | confidence as an invented probability |
| 7. Reliability and evolution | 0:35 | Offline-first P0; bounded path to live jobs/storage | offline recovery and production evolution | “national-scale production-ready” |
| 8. Viability and ask | 0:35 | Test workflow/demand through bounded pilots | customer/paid-pilot experiment and next technical gate | fabricated TAM, traction or revenue |

If the presentation includes a separate 5–7 minute live demo, compress slides 1–4 and 6–8 rather than duplicating every screen.

## 3. One-slide architecture explanation

Use plain language first:

```text
The browser presents and validates selections for quick feedback
→ a typed gateway reads a local pack or calls the API
→ the FastAPI server repeats all security/domain validation
→ immutable results are looked up; heavy geospatial work is outside the request
→ the same response shape returns metrics, layers, quality and provenance
```

Then introduce the terms:

- **Browser/client:** planned React/TypeScript/Vite code; public and untrusted. Vite builds static assets—it is not a backend.
- **Server/backend:** planned FastAPI routes, validation, authorization and result lookup; only this boundary may read private provider credentials.
- **Shared contract:** OpenAPI and JSON Schema define the JSON crossing the boundary.
- **Offline processing:** provider adapters and geospatial methods create immutable outputs; they are not hidden inside a page click.
- **Storage:** P0 files, not a runtime database. Object storage/PostGIS are future options only when needed.

## 4. Evidence-safe talking points

- **Presentation statement:** “SPARC processes Earth-observation imagery using documented geospatial methods to generate district-level satellite-derived environmental estimates.”
- “The comparison windows are explicit and same-season to reduce, not eliminate, seasonal bias.”
- “A fixed method is applied across both periods; sensitivity and common-valid coverage are visible.”
- “Global land-cover products can corroborate a result but are not local ground truth.”
- “The quality status and documented limitations travel with every estimate; SPARC does not invent an accuracy probability.”
- “The primary path is precomputed and visibly dated. It prioritizes reliability and reproducibility over a fragile live request.”
- “The architecture can add bounded live jobs without changing browser semantics; that path is not P0.”
- “The correct next step after a concerning signal is field/reference investigation, not automatic policy action.”

## 5. Questions and direct answers

### Product and impact

**Q: What problem are you solving?**  
A: SPARC targets the effort and interpretation gap between open satellite products and a reviewable district-level before/after briefing. The prototype hypothesis is that visible methods, quality and provenance make screening and field follow-up easier. User value is not yet validated; [business viability](business-viability.md) defines the experiments.

**Q: Who is it for?**  
A: Candidate users are district/environment staff, NGOs/community programmes, CSR teams, consultants and researchers. Candidate buyer and user can differ, so discovery must include both.

**Q: What decision does it make?**  
A: It does not make or automate a policy decision. It highlights an observed satellite-derived proxy pattern and its limitations so a human can decide whether field verification or deeper analysis is warranted.

**Q: What is the impact today?**  
A: In the current repository, impact is a hypothesis; there is no deployed usage evidence. A future pilot should measure comprehension, workflow time, appropriate follow-up and delivery cost rather than claim environmental outcomes caused by SPARC.

### Scientific method

**Q: Are these official UN SDG indicators?**  
A: No. They are satellite-derived environmental proxies related to SDG topics. SPARC does not implement or certify official UN indicator methodologies.

**Q: Why compare 2019 and 2024?**  
A: The planning decision uses explicit same-season windows for a prototype before/after comparison: Nagpur 2019-10-15–2019-12-15 versus 2024-10-15–2024-12-15. Same-season comparison reduces seasonal confounding but does not prove why a change occurred. Actual catalog suitability remains to be verified.

**Q: What periods apply to the optional temperature analysis and backup?**  
A: The optional Nagpur P1 LST windows are fixed at 2019-03-01–2019-05-15 versus 2024-03-01–2024-05-15. Bengaluru Urban 2019-01-15–2019-03-15 versus the same dates in 2024 is only a candidate backup window until catalog and data QA pass.

**Q: Why Nagpur?**  
A: It offers a relevant mix of water, vegetation/agriculture, urban growth and possible heat questions. It is also large enough to create processing risk, which is why Bengaluru Urban is the compact backup. This is a planning rationale, not evidence that scene coverage or every child boundary has passed QA.

**Q: Is Hingna the validated drill-down?**  
A: No. Hingna is only a provisional candidate. The release may name it only after exact boundary terms, geometry checks, source coverage and result QA pass. Otherwise SPARC uses another validated Nagpur child or an explicit district-only fallback.

**Q: How is water measured?**  
A: P0 specifies Sentinel-2 L2A MNDWI, `(B03-B11)/(B03+B11)`, on a 20 m analysis grid with a frozen cross-period decision rule and sensitivity evidence. It maps open surface-water area; it does not measure volume, groundwater, water quality or every wetland.

**Q: Does lower NDVI mean forest loss?**  
A: No. NDVI reflects vegetation activity/greenness and can change with crops, rainfall, irrigation, harvest, soil background and atmosphere. The UI must use proxy wording and cannot infer forest loss from this comparison alone.

**Q: How reliable is the built-up result?**  
A: The planned Sentinel-2 spectral consensus uses NDBI/IBI diagnostics and vegetation/water exclusions, but bare soil, construction, dry vegetation, bright roofs and mixed pixels remain important errors. Reliability must be shown through sensitivity and independent validation; without that, it is low/exploratory or withheld.

**Q: What does “confidence” mean?**  
A: SPARC shows coverage, scene count, threshold sensitivity, temporal comparability and data-quality status. A label is not an 87%-style probability. Formal publication-level accuracy metrics are deferred and not fabricated.

**Q: How will you validate it?**  
A: The hackathon track freezes the method, periods, source provenance and limitations, then presents stable precomputed estimates. Formal sampling, independent labels, error-adjusted areas and publication-level accuracy metrics are deferred rather than simulated. Other global satellite products remain corroboration rather than ground truth.

**Q: Does a change prove an intervention worked?**  
A: No. Two observational satellite windows cannot establish attribution. Weather, phenology, construction and other confounders require independent evidence and an appropriate evaluation design.

**Q: Is heat from Sentinel-2?**  
A: No. Sentinel-2 has no thermal band suitable for this. Optional P1 LST uses USGS Landsat 8/9 Collection 2 Level-2 `ST_B10` with QA. It is surface skin temperature, not air temperature or direct human heat exposure.

### Data and provenance

**Q: Which external data sources are required?**  
A: P0 uses geoBoundaries gbOpen India ADM2 `IND-ADM2-76128533` as a validated prototype boundary and Earth Engine Sentinel-2 L2A for offline processing, with Copernicus Data Space STAC as a fallback. The selected boundary follows its source-specific ODbL 1.0 record, including attribution and applicable share-alike obligations; it is not a legal/cadastral boundary. Optional LST uses Landsat Collection 2 Level-2. No Survey of India geometry is used. See [data sources](data-sources.md).

**Q: Do you depend on Google Earth Engine or Dynamic World?**  
A: Google Earth Engine is the offline processing platform for the current build. The judged path uses already-exported local results, so it does not require Earth Engine or internet access. Dynamic World may be optional corroboration but is not the primary built-up method or ground truth.

**Q: Can someone reproduce a number?**  
A: The boundary inputs are pinned by source/archive/output hashes and the current water and built-candidate pre-publication runs record image IDs, acquisition dates, processing baseline, AOI/grid/CRS, parameters, and output metadata. Reproducibility is still a release gate: vegetation requires batch processing and every indicator requires sensitivity and independent validation before publication.

**Q: Are the numbers in the repository real findings?**  
A: The presentation path uses stable precomputed outputs with source, method, processing date, quality status and limitations visible in provenance. Contract fixtures remain an internal fallback and are not used to fabricate accuracy or legal claims.

### Architecture and reliability

**Q: What runs in the browser?**  
A: Planned React client code: controls, quick validation, transport selection, map/chart/table rendering and accessible states. It cannot safely hold provider secrets or decide scientific thresholds.

**Q: What runs on the server?**  
A: Planned FastAPI route validation, safe result lookup, opaque layer resolution and restricted job coordination. Geospatial raster processing is a separate offline/worker module and does not run as unbounded work inside a request handler.

**Q: Where is the database?**  
A: P0 has no runtime database. It serves immutable JSON/GeoJSON/images/small tiles from files. Object storage plus PostgreSQL/PostGIS is a future evolution for larger operations, not needed for the hackathon path.

**Q: Is this live?**  
A: The judged path is precomputed and shows its generation time. A future API may return an immutable cache hit or `202` for bounded work. We prefer an honest, reliable mode label over a fragile “live” claim.

**Q: What happens without internet?**  
A: The primary local HTTP bundle contains application assets plus versioned Nagpur, Bengaluru, and Mumbai City data. It requires no provider, public basemap, runtime CDN, database or FastAPI. This must be proven by a cold-start network-disabled test.

**Q: What if WebGL or a layer fails?**  
A: The client displays a reviewed static image plus legend, metric, table, interpretation and provenance. One visualization cannot crash or erase the result.

**Q: Can this scale nationally?**  
A: The contract, provider adapters and immutable-result model are designed to add regions, but national performance, cost, validation, boundary/version management and operations are not proven. Production could add object storage, metadata database and bounded workers after load/cost tests.

**Q: Why not microservices/Kubernetes now?**  
A: They add operational complexity without evidence of a prototype need. A modular monolith and offline worker boundary are easier to test and sufficient for P0.

### Security, privacy and licensing

**Q: How do you protect API keys?**  
A: Provider credentials are server/worker environment secrets only. Any `VITE_*` variable is delivered to the browser and can hold only public configuration. Secrets must be ignored by Git, redacted from logs/responses and scanned out of release assets. If committed, they must be revoked and rotated.

**Q: Can a user make the server fetch an arbitrary URL?**  
A: The contract accepts approved opaque region/layer/recipe IDs, not upstream URLs, local paths, commands or free-form AOIs. The server resolves them through allowlists and validates again at the trust boundary.

**Q: Is there authentication?**  
A: Read-only P0 endpoints need no account. Planned P1 processing-job creation requires a server-side admin bearer credential, authorization, idempotency and rate limits, and stays disabled until those tests pass.

**Q: Is the project open source?**  
A: The project’s own license is currently undecided. Candidate dependencies and data retain their own licenses/attributions; exact versions, native/transitive terms and boundary redistribution must pass a release audit. Do not imply a repository license that has not been selected.

### 3D and presentation

**Q: Where are the Earth and satellite models?**  
A: The user has not supplied inspectable assets in this planning baseline. The analytical dashboard cannot depend on them. If supplied, the team first checks format, references, license, security, size, mobile performance and accessibility; otherwise a neutral 2D placeholder remains.

**Q: Why include 3D at all?**  
A: It may improve presentation or orientation after inspection, but it adds no scientific validity. It is isolated and lazy-loaded so failure has zero impact on the core analysis.

### Business and roadmap

**Q: Who pays?**  
A: Institutional, NGO/CSR, consultant/API and grant-funded models are plausible, but none is validated. The next evidence is interviews around a real workflow followed by a bounded paid-pilot test—not an invented market-size slide.

**Q: What is next after the hackathon?**  
A: First complete frontend/reporting integration, offline rehearsal and user workflow testing. Formal independent validation and production storage can follow the hackathon rather than blocking the presentation track.

## 6. Questions to answer with a limitation, not spin

| If asked… | Say… |
|---|---|
| “What is Nagpur’s exact water loss?” | “SPARC shows an estimated surface-water change for the fixed analysis periods; it is a satellite-derived estimate, not a legal or causal finding.” |
| “Which subdistrict changed most?” before child-region QA | “I cannot confirm that from the current evidence; Hingna is only provisional.” |
| “What caused the pattern?” | “This comparison is observational and cannot establish cause.” |
| “What is the accuracy?” | “The data-quality status, coverage and sensitivity are shown in methodology. Formal publication-level accuracy metrics are deferred and not fabricated.” |
| “Will it handle every Indian district?” | “The architecture is extensible, but data, boundary, validation, cost and performance must be tested district by district.” |
| “Is deployment live?” when only docs exist | “No; this is the deployment plan and contract, not a deployed service.” |

## 7. Presenter evidence pack

Keep these available offline:

- frozen source commit and release/dataset/schema versions;
- parsed OpenAPI/schema/example report;
- real pack manifest and SHA-256 report;
- processing reproduction/QA summary;
- validation status and, if applicable, error matrix/intervals;
- primary/backup offline test record;
- secret/license/attribution review;
- accessibility test record;
- [source register](research/source-register.md), [methodology](indicator-methodology.md), [API contract](architecture/api-contract.md) and [risk register](risk-register.md);
- one page listing implemented, removed and future features.

Do not expose environment dumps, bearer tokens, signed URLs, absolute workstation paths or raw private reference data in the evidence pack.

## 8. Final verbal checklist

- [ ] Start with the outcome/problem, not the technology stack.
- [ ] State data mode and generation time before reading results.
- [ ] Name the comparison periods and proxy status.
- [ ] Show quality/provenance before claiming usefulness.
- [ ] Give the most material limitation in plain language.
- [ ] Demonstrate one recovery without drama.
- [ ] Separate current implementation, P1 plan and business hypothesis.
- [ ] End with field/reference validation as the next action.

The exact timed words and actions are in [demo script](demo-script.md); judging evidence is traced in [judging checklist](judging-checklist.md).
