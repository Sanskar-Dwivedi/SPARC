# SPARC

**Satellite-Powered Analytics for Resource Conservation**

**Live site:** [sparc-git-main-sanskars-projects-31a9e8dd.vercel.app](https://sparc-git-main-sanskars-projects-31a9e8dd.vercel.app/)

SPARC is a district-level environmental decision-support prototype. It turns open Earth-observation data into understandable before/after signals for local administrators, NGOs, communities, CSR teams, and environmental practitioners.

SPARC outputs are **satellite-derived SDG proxy indicators**, not official UN SDG indicators. They show observed spatial or temporal patterns and do not establish causation.

## Repository status

Implementation has started from the frozen planning package. The globe-led site in `orbital-website/` is the single public entry and opens the React analytical dashboard as a panel over the globe. The FastAPI service supports a safe default offline fixture path and an explicit `SPARC_DATA_MODE=precomputed` path that maps the reviewed Earth Engine packs into the frozen contract; neither path performs request-time raster processing, database access, provider calls, or live job creation. The evidence-based current stage, remaining gates, and missing dashboard work are tracked in the [delivery status](docs/project-status.md).

The selected pilot is **Nagpur district** with **Bengaluru Urban** as a smaller backup. P0 covers surface-water, vegetation/green-cover, and built-up-area proxies. Land-surface temperature and surface urban heat island analysis are P1.

## High-level architecture

```text
Browser/client (globe-led SPARC dashboard)
  ├─ DemoTransport → local manifest + JSON/GeoJSON/image assets
  └─ ApiTransport  → FastAPI /api/v1 contract
                          ├─ default bounded fixture repository
                          └─ precomputed Earth Engine pack adapter
```

The judged path is precomputed-first and runs over local HTTP without internet. Live or semi-live processing is an enhancement and must preserve the same response schemas. The optional user-provided 3D showcase is never required for analytics.

## Implemented server request flow

```text
HTTP client requests a known region, indicator, layer, or comparison
→ FastAPI/Pydantic validates syntax, IDs, dates, enums, sizes, and period rules
→ the repository resolves values through fixed catalogues, never caller-controlled paths
→ a bounded fixture or reviewed precomputed pack response is returned
→ failures use sanitized application/problem+json responses
```

Run the first API slice from the repository root:

```powershell
python -m uvicorn apps.api.app.main:app --host 127.0.0.1 --port 8000
```

## Start here

| File | Purpose | Classification | What depends on it |
|---|---|---|---|
| [plan.md](plan.md) | Executable 3–4 day plan with owners, dependencies, acceptance, and fallbacks | Shared planning | Both workstreams and daily checkpoints |
| [SRS.md](SRS.md) | Testable product and non-functional requirements | Shared requirements | Architecture, tests, judging evidence |
| [contracts/openapi.yaml](contracts/openapi.yaml) | Canonical HTTP operation contract | Shared contract; Codex primary owner | Future API and generated client bindings |
| [packages/contracts/schemas/sparc.schema.json](packages/contracts/schemas/sparc.schema.json) | Canonical reusable data shapes | Shared contract; Codex primary owner | OpenAPI and mock validation |
| [docs/research/SPARC-technical-research.md](docs/research/SPARC-technical-research.md) | Evidence synthesis and recommendations | Research | ADRs and methodology |
| [docs/indicator-methodology.md](docs/indicator-methodology.md) | Reproducible formulas, QA, thresholds, limits | Scientific specification | Processing and validation |
| [docs/architecture/system-architecture.md](docs/architecture/system-architecture.md) | Runtime boundaries and component flow | Architecture | Implementation structure |
| [docs/architecture/api-contract.md](docs/architecture/api-contract.md) | Endpoint-by-endpoint behavior and security | Architecture/contract | Frontend and backend integration |
| [docs/repository-ownership.md](docs/repository-ownership.md) | Exclusive and shared path ownership | Coordination | Conflict prevention and reviews |
| [docs/development-roadmap.md](docs/development-roadmap.md) | Day 0–4 delivery schedule | Execution | Team sequencing |
| [docs/testing-plan.md](docs/testing-plan.md) | Scientific, contract, integration, accessibility, and offline tests | Verification | Definition of done |
| [docs/demo-script.md](docs/demo-script.md) | Exact judged demonstration and recovery | Presentation | Rehearsal |

Removing a canonical requirements, contract, methodology, ownership, or test file leaves an implementation decision undefined. Other documents are indexed by topic below and cross-reference the canonical source rather than redefining it.

## Documentation map

### Research and requirements

- [Technical research](docs/research/SPARC-technical-research.md) and [source register](docs/research/source-register.md)
- [Data sources](docs/data-sources.md)
- [Open-source reuse](docs/open-source-reuse.md)
- [Indicator methodology](docs/indicator-methodology.md)
- [Validation plan](docs/validation-plan.md)

### Architecture

- [System architecture](docs/architecture/system-architecture.md)
- [Data pipeline](docs/architecture/data-pipeline.md)
- [Geospatial pipeline hardening](docs/architecture/pipeline-hardening.md)
- [API contract guide](docs/architecture/api-contract.md)
- [Data storage](docs/architecture/data-storage.md)
- [3D asset integration](docs/architecture/3d-asset-integration.md)
- [Offline demo strategy](docs/architecture/offline-demo-strategy.md)
- [Architecture decision records](docs/decisions/)
- [Security review and adopted controls](docs/security-review.md)

### Coordination and delivery

- [Repository ownership](docs/repository-ownership.md)
- [Two-developer workplan](docs/two-developer-workplan.md)
- [Frontend handoff](docs/frontend-handoff.md)
- [Integration plan](docs/integration-plan.md)
- [Git workflow](docs/git-workflow.md)
- [Development roadmap](docs/development-roadmap.md)
- [Project delivery status](docs/project-status.md)
- [Testing plan](docs/testing-plan.md)
- [Deployment guide](docs/deployment-guide.md)
- [Risk register](docs/risk-register.md)

### Judging and viability

- [Demo script](docs/demo-script.md)
- [Judging checklist](docs/judging-checklist.md)
- [Business viability](docs/business-viability.md)
- [Presentation and Q&A](docs/presentation-and-qa.md)

## Folder ownership planned for implementation

- Codex: `apps/api/**`, `services/geoprocessing/**`, `contracts/**`, `packages/contracts/**`, `scripts/data/**`, backend/data tests, and infrastructure.
- Claude: `apps/web/**`, frontend tests, styling, UI documentation, and future 3D integration code.
- User-owned: actual files placed beneath `assets/models/earth/` and `assets/models/satellite/`.
- Shared paths have a primary owner and review rules in [docs/repository-ownership.md](docs/repository-ownership.md).

## Security baseline

- Private credentials are server-side environment variables only.
- `VITE_` values are public and may contain only non-secrets such as the API base URL and data-mode flag.
- Read-only P0 endpoints need no user authentication; future processing-job creation is restricted.
- Layer APIs resolve opaque allowlisted IDs and never fetch caller-controlled URLs.
- Raw scenes, working rasters, credentials, transient signed URLs, and unapproved model files are excluded by `.gitignore`.

## Project license

SPARC's own repository license has not yet been selected. Third-party code and data retain their original licenses and attribution requirements; see the reuse and data-source inventories before redistribution.
