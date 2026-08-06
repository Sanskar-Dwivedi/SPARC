# SPARC analytical dashboard

The browser client for district-level satellite-derived environmental proxy
indicators. This is the P0 analytical panel required by
[`docs/project-status.md`](../../docs/project-status.md); the combined local
server mounts it over the globe-led entry in
[`orbital-website/`](../../orbital-website/README.md).

## Run

```bash
npm install
# The canonical full experience is the globe-led combined server:
cd ../../orbital-website && npm run serve   # http://localhost:8123/
```

`npm run dev` remains available for panel-only frontend development at
`http://localhost:5173`, but it is not the user-facing SPARC entry.

### Reporting package workflow

The dashboard can open the report wizard offline, but creating the PDF/evidence
package is a server operation. Run the local API in a second terminal from the
repository root:

```powershell
$env:GEMINI_API_KEY="your-key-for-this-process"
.\.venv\Scripts\python.exe -m uvicorn apps.api.app.main:app --host 127.0.0.1 --port 8000 --reload
```

Keep the key server-side; do not put it in a `VITE_*` variable or commit it.
If Gemini drafting is not configured, the wizard will open but package creation
will fail safely because the UI requires explicit Gemini consent for drafting.

Port 5173 is not arbitrary — it is one of the API's default allowed origins
(`apps/api/app/config.py`). Serving on another port needs `SPARC_ALLOWED_ORIGINS`
updated on the API side.

For the API transport, run the mock API alongside:

```bash
python -m uvicorn apps.api.app.main:app --port 8000   # from the repo root
```

## Test

```bash
npm run build                              # typecheck + production bundle
node ../../tests/frontend/dashboard-e2e.mjs http://localhost:5173/
```

The default e2e run needs the dev server up. To exercise API mode and the
automatic fallback to the offline pack, start FastAPI with an explicit test
origin and a second Vite server:

```powershell
$env:SPARC_ALLOWED_ORIGINS='http://127.0.0.1:5174'
python -m uvicorn apps.api.app.main:app --host 127.0.0.1 --port 8000

$env:VITE_DATA_MODE='api'
npm run dev -- --host 127.0.0.1 --port 5174
node ../../tests/frontend/dashboard-e2e.mjs http://127.0.0.1:5174/ --api
```

The dashboard test covers the implemented location → period → result flow,
failure recovery, 360 px, 200% text zoom, keyboard path and non-colour status
encoding. It does not yet cover a real/pre-publication pack or the full
Orbit-to-panel handoff.
It covers the analytical journey, the failure states, 360 px, 200% text zoom,
the keyboard path and non-colour status encoding, and fails on any console error.

## Configuration

Every `VITE_*` value reaches the browser and therefore cannot be a secret.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_DATA_MODE` | `demo` | `demo` reads committed fixtures offline; `api` calls FastAPI |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Origin of the API. Ignored in demo mode |
| `VITE_BASE_PATH` | `/app/` locally, `/` on Vercel | Asset base path; Vercel is detected automatically, but this can be set explicitly for a standalone dashboard |

An unrecognised value falls back to `demo` with a console warning, because the
offline path is the one that works with no server at all.

## Layout

| Path | Role |
| --- | --- |
| `src/config.ts` | public configuration and the city-aware frozen comparison windows |
| `src/contract/types.ts` | the single declaration of contract shapes for this package |
| `src/contract/validate.ts` | Ajv boundary validation against the canonical schema |
| `src/data/` | `DemoTransport`, `ApiTransport`, the repository facade, the error taxonomy |
| `src/viewmodel/` | response → presentation-safe view model |
| `src/features/` | screens and shared primitives |
| `src/sdg.ts` | indicator → SDG goal/target mapping, and what each proxy is *not* |
| `src/globe/` | optional region-selection globe, lazy-loaded |

## Notes

- **Two transports, one view model.** `DemoTransport` reads the committed
  fixtures with no network; `ApiTransport` calls `/api/v1`. Both return the same
  validated contract shapes and both go through the same mapper, which is what
  lets the demo fall back to offline mid-presentation without changing a
  component. The fixtures are imported from `contracts/examples/` through a Vite
  alias rather than copied, so there is no second source of truth.

- **Validation is at the transport boundary, against the committed schema.** Not
  a re-description of it — a second description is a second thing to keep in
  sync, and the copy is what drifts. A payload that fails is *rejected*, not
  rendered: a malformed response does not produce an error page, it produces a
  plausible-looking dashboard with a caveat quietly missing, which is the one
  failure this project cannot ship.

- **A missing measurement is never a number.** `null` in a metric means the
  observation could not be made — cloud, no common-valid coverage, a failed gate.
  The formatters return a discriminated result and `<Value>` renders the
  unavailable case with its reason, so a component cannot print `0` for it. Zero
  and "not measured" are different claims.

- **Status never depends on colour.** Every quality and status pill emits text;
  colour is redundant reinforcement (WCAG 1.4.1). The same applies to the layer
  legend, where the label carries the meaning and the swatch is `aria-hidden`.

- **The map is an enhancement, the table is the product.** The layer's bounds,
  legend, attribution and checksum render always; MapLibre is lazy-loaded and
  only when the user asks for a preview. Building it the other way round
  produces a fallback nobody has looked at since the day it was written. There is
  no remote basemap — the offline gate forbids one.

- **MapLibre is pinned to 5.24.0**, below the v6 ESM/WebGL2 change, per
  [ADR-005](../../docs/decisions/ADR-005-map-library.md). It is code-split into
  its own chunk so the analytical journey does not pay for it.

- **Routing is hash-based** (`#/`, `#/indicator/<id>`). The offline bundle is
  opened from a file server with no rewrite rules, where a history-API route
  404s on reload.

- **Region and period are allowlists, not free text.** The browser check is a
  usability affordance only; the server repeats it, because a selection arriving
  from a hash fragment has been through no control at all. The region list is
  filtered to districts: the endpoint also returns subdistricts, but none has an
  approved boundary or a packaged result, so offering them would advertise a
  drill-down that 404s.

- **Each proxy names its SDG target and, just as prominently, the official
  indicator it is not.** 6.6 for water, 15.1 for vegetation, 11.3 for built-up,
  13.1/11.6 for heat. Relevance without the limit stated is how a screening tool
  ends up quoted as national reporting — so `src/sdg.ts` carries both, and the
  detail view renders "Can support" beside "Is not".

## The globe

`orbital-website/` was a standalone Three.js page that consumed no SPARC data.
It is now folded in as an optional **region-selection** visual on the summary
route. `docs/project-status.md` permits this *only after* the dashboard has a
complete non-WebGL analytical path — which it does, so the globe is an
enhancement rather than a dependency.

Three properties are enforced and tested, not just intended:

- **Zero 3D bytes until requested.** three.js, the scattering shaders and 2.3 MB
  of textures live in a chunk behind a dynamic import that only runs on click.
  The analytical bundle is 104 kB gzip and contains no three.js and no texture
  reference; `tests/frontend/dashboard-e2e.mjs` asserts nothing matching
  `three|scene-|earth_` has been fetched before the button is pressed.
- **Never the only way in.** Every district on the globe is also an ordinary
  button beneath it, and the header `<select>` stays authoritative. A keyboard
  user never touches the canvas, which is `aria-hidden`-equivalent (`role="img"`
  with a description pointing at the buttons).
- **Failure degrades to the buttons.** No WebGL, chunk failed, textures missing —
  all land on the same list, and district selection is unaffected.

The shaders and textures are imported from `orbital-website/` through the
`@globe` alias rather than copied. One scattering integrator, one place to fix
it, and no second copy of 2.3 MB of imagery.

Reduced motion stops the idle rotation — the globe still responds to a
deliberate drag, but it does not move on its own.

## Not yet built

- **Child-region drill-down.** Blocked upstream, not skipped: no approved child
  geometry exists and `docs/project-status.md` requires a separate
  boundary/data gate first. The UI states district-only scope rather than
  implying a drill-down that has no verified boundary behind it.
- **Time series, LST/SUHI, live processing controls.** P1 by decision.
