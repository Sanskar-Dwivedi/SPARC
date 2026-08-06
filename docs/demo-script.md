# SPARC demonstration script

**Status:** rehearsal specification for the local precomputed-output track
**Target length:** 5–7 minutes  
**Primary path:** Nagpur, precomputed satellite-derived estimates over local HTTP
**Recovery path:** Bengaluru Urban and static/table fallbacks

## 1. Non-negotiable presenter rules

1. Use only the stable precomputed output pack with checksums, provenance, source metadata and known limitations.
2. Say “satellite-derived estimate,” not “official SDG indicator.”
3. Say “the estimated surface pattern changed,” not “our intervention caused” or “SPARC proves.”
4. Use the approved constrained-NDBI result for Nagpur built-up. Mention the
   built-IBI run as sensitivity evidence, not as the selected source.
5. Do not describe any result as officially verified, ground-truth confirmed, legally proven, confirmed deforestation, confirmed pollution, confirmed illegal encroachment, or proof of responsibility or causation.
6. Land-surface temperature is P1, Landsat-derived surface temperature—not air temperature—and is omitted unless it passes its release gate.
7. Hingna is only the provisional child-region candidate. The final script names whichever Nagpur subdistrict passes boundary and data QA; if none passes, use the district-only branch and disclose it.
8. Optional user-provided 3D is never required. Skip it unless the actual files have passed license, safety, performance and accessibility gates.

## 2. Release-time script tokens

The release producer fills these from the immutable release evidence, then removes the braces. Until that happens, the script is not presentation-ready.

| Token | Source of truth |
|---|---|
| `{{RELEASE_VERSION}}` | `RELEASE.json` |
| `{{DATASET_GENERATED_AT}}` | visible response/manifest metadata |
| `{{VALIDATED_CHILD_NAME}}` | boundary/data QA record, or `DISTRICT_ONLY` |
| `{{WATER_RESULT_SENTENCE}}` | deterministic interpretation in the real water result |
| `{{VEGETATION_RESULT_SENTENCE}}` | deterministic interpretation in the real vegetation result |
| `{{BUILT_RESULT_SENTENCE}}` | deterministic interpretation in the real built-up result |
| `{{QUALITY_LIMITATION}}` | most material visible quality warning |
| `{{QUALITY_STATUS}}` | quality status and limitations from the immutable result pack |

Do not manually improve or round a result outside the UI/reporting policy. Keep the quality status and limitations available in the methodology/provenance view.

## 3. Exact launch action and expected first screen

The following is the planned Day 3 release convention. `START-DEMO.cmd` does not exist in the current repository and must be implemented and tested before rehearsal.

1. Disconnect Wi-Fi/network.
2. Double-click `START-DEMO.cmd` in the verified `sparc-release-{{RELEASE_VERSION}}` directory.
3. Wait for the console line `Open http://127.0.0.1:4173/`.
4. Open `http://127.0.0.1:4173/` in a clean browser window.
5. Expected first screen: **District Overview / Select a region** with:
   - a persistent **Satellite-derived estimate** label;
   - dataset generation time `{{DATASET_GENERATED_AT}}`;
   - Nagpur as primary and Bengaluru Urban as backup;
   - no required 3D canvas, remote basemap or login.

If the launcher or first screen does not match, use the recovery table in section 7. Never open the build with `file://`.

## 4. Thirty-second pitch

> SPARC processes Earth-observation imagery using documented geospatial methods to generate district-level satellite-derived environmental estimates. It packages same-season before-and-after observations with dates, data source, processing method, provenance and limitations beside every result. The hackathon path focuses on Nagpur, keeps a Bengaluru Urban backup, and runs fully offline from precomputed open-data products. It does not claim official SDG reporting or causation; it gives people a transparent starting point for inspection and planning.

## 5. Two-minute pitch

> SPARC addresses a practical gap between open Earth-observation data and local decisions. A district officer, NGO or CSR team may not have the geospatial staff to discover scenes, mask clouds, compare consistent seasons, calculate area correctly and explain uncertainty.
>
> Our prototype uses the same post-monsoon windows in 2019 and 2024 for Nagpur. It plans three P0 signals: an MNDWI open-surface-water proxy, per-observation NDVI for vegetation activity and a conservative Sentinel-2 spectral built-up proxy. Each uses a fixed method across both periods. We show common-valid coverage, scene counts, threshold sensitivity, method version and source-item provenance, because a number without those checks is easy to misuse.
>
> The browser is React and TypeScript. It can read a local immutable data pack or the same response shapes from a FastAPI service. The judged path is deliberately precomputed and internet-independent: provider, API, public basemap and WebGL failure cannot erase the core metrics and text/table evidence.
>
> SPARC is not an official UN SDG calculator and it does not prove why a change occurred. It helps users see an observed satellite-derived pattern, inspect its quality, and decide where field verification or deeper analysis is justified. Nagpur is the primary pilot; Bengaluru Urban is the planned recovery pack and is admitted only after its own catalog, schema, integrity and offline checks. Landsat surface temperature and 3D remain optional until they pass separate quality gates.

## 6. Timed 5–7 minute screen sequence

This sequence targets **6 minutes 15 seconds**. Screen titles are acceptance names for the planned UI, not claims that components/routes already exist.

| Time | Screen and exact action | Presenter words | Required visible evidence |
|---:|---|---|---|
| 0:00–0:30 | **District Overview / Select a region.** Point to the estimate label and disconnected-network icon/status. Select **Nagpur**. | “This is SPARC running from a local HTTP bundle with the network disconnected. The analysis period, data source and processing date stay visible beside the estimate.” | `Satellite-derived estimate`, generation time, release/dataset version, Nagpur/Bengaluru choices |
| 0:30–1:10 | **Nagpur Environmental Summary.** Confirm **2019-10-15–2019-12-15** and **2024-10-15–2024-12-15**. | “We compare the same post-monsoon windows rather than arbitrary dates. The dashboard summarizes three satellite-derived proxies; these are not official SDG indicators and do not establish cause.” | both inclusive windows, season labels, water/vegetation/built-up cards, quality levels |
| 1:10–2:05 | Open **Surface Water Detail**. Toggle **2019**, **2024**, then **Change**. If WebGL is disabled, use the static before/after controls. | “The water method is Sentinel-2 MNDWI on a 20 metre analysis grid with one frozen decision rule for both periods. {{WATER_RESULT_SENTENCE}} This describes mapped open surface water—not volume, groundwater, water quality or every wetland.” | baseline/comparison/change, area/unit, gain/loss, common-valid coverage, fixed threshold/method version, text/table alternative |
| 2:05–2:50 | Open **Vegetation Detail**. Focus the metric/table and sensitivity disclosure. | “NDVI is calculated for each valid observation before the seasonal median. {{VEGETATION_RESULT_SENTENCE}} Crops, rainfall, irrigation, harvest, soil and residual cloud can change this signal, so we do not label it forest loss.” | median NDVI or labelled green-cover proxy, coverage, scene counts, threshold sensitivity, caveat |
| 2:50–3:35 | Open **Built-up Detail**. Show the approved constrained-NDBI estimate and its sensitivity evidence. | “The Nagpur land-cover estimate uses the approved constrained-NDBI method. The built-IBI run is retained as sensitivity evidence, so the alternate direction is visible without replacing the selected source. Bare soil, construction and reflective roofs can still be confused, so this remains a satellite-derived proxy for field review.” | baseline/comparison/change, selected method, alternate sensitivity, resolution, quality status, bare-soil/confusion limitation |
| 3:35–4:15 | Open **Subdistrict comparison**. Select `{{VALIDATED_CHILD_NAME}}`; if token is `DISTRICT_ONLY`, remain on Nagpur and use the district-only words below. | Normal: “The same contract and method support a drill-down to a child region that passed boundary and data QA; the UI does not recalculate science in the browser.” District-only: “No child region passed the release gate, so this candidate deliberately remains district-only rather than presenting provisional geometry as validated.” | validated child name and parent link, or explicit child-data-unavailable state; never assume Hingna |
| 4:15–5:15 | Open **Quality & Provenance** drawer/panel. Expand source observations and method. | “Here is the evidence behind the screen: source product and item IDs, acquisition dates, processing baseline where known, method version, thresholds, analysis grid, processing date and citations. The data-quality status is {{QUALITY_STATUS}}. {{QUALITY_LIMITATION}}” | dataset/provider, mission/product, item IDs/acquisition dates, method/parameters hash, thresholds, CRS, coverage, quality status, citation/license |
| 5:15–5:45 | Return to **Nagpur Environmental Summary** and activate the **table/text view** beside the map. | “The result remains understandable without color, hover or WebGL. That is also our failure-safe path: metrics, table, interpretation and provenance survive a map-layer problem.” | table/text equivalent, focus indicator, visible caveat and data mode |
| 5:45–6:15 | Open **District selector**, highlight **Bengaluru Urban backup**, but do not spend time on its numbers unless asked. End on summary. | “The backup is a separate versioned pack checked with the same schema and integrity rules. SPARC’s next step is workflow testing and presentation rehearsal—not claiming national scale from one district pair.” | separately selectable backup, version/integrity status; close with limitations and next step |

### Optional 15-second P1 mention

Use only if time remains and the feature passed release:

> “We also tested Landsat Collection 2 Level-2 land-surface temperature as a P1 extension. It measures surface skin temperature, not air temperature or direct heat exposure, and it is excluded when scene count or the rural reference is inadequate.”

Do not open 3D during the analytical script. If a user-provided scene passed all gates, demonstrate it after questions as an optional showcase and immediately show “Skip to dashboard.”

## 7. Forced-failure and offline recovery

One recovery branch must be rehearsed inside the timed run. Internet loss is already the normal condition, so use WebGL/layer or API failure as the visible demonstration.

| Failure | What the audience sees | Exact presenter action | Exact presenter words |
|---|---|---|---|
| Internet/catalog unavailable | no change to local journey | point to offline/data-mode status and continue | “The critical journey is precomputed, so provider availability cannot interrupt this demonstration.” |
| FastAPI unavailable/timeout/`503` | visible switch/selection to offline analysis, generation time remains | choose **Use offline analysis package** if not already selected | “The client and API use the same schemas. This is a disclosed fallback to a versioned precomputed result, not a silent claim that the request stayed live.” |
| Validation `422`, auth `401/403` or incompatible schema | explicit error; no auto-fallback | correct request or use the matching release copy | “We do not substitute unrelated data for an invalid or unauthorized request.” |
| WebGL/context loss | static before/after image, legend, table and metrics | select **Static view** and continue water/detail narration | “The map renderer failed, but the analytical result and accessible evidence remain.” |
| One layer 404 | layer warning; metrics/table persist | dismiss/acknowledge warning and use table | “One visualization asset is unavailable; we are not hiding that, and no number is recomputed in the browser.” |
| Primary Nagpur pack hash/missing failure | integrity error; values withheld | stop using Nagpur; select verified **Bengaluru Urban backup** | “Integrity failed, so SPARC refuses to display those values. I’m switching to the independently checked backup pack.” |
| Launcher/port/device failure | no valid first screen | stop improvisation; move to separately tested backup device/copy | “The primary launcher failed. We are using the same immutable release on the verified backup device.” |
| Optional 3D failure | 2D poster/dashboard | choose **Skip to dashboard** | “The 3D asset is supplementary and never blocks the environmental analysis.” |

Never respond to a corrupt pack, unapproved boundary, exposed secret or failed scientific gate by reading saved numbers from memory. Disclose the issue and use only a verified matching recovery.

## 8. Presenter handoff and roles

For two presenters:

- **Presenter A:** problem, user, first screen, summary, water and final value proposition.
- **Presenter B:** vegetation, built-up, child-region decision, quality/provenance and failure recovery.
- Handoff cue at 2:05: “The same evidence discipline applies to vegetation and urban growth; [Presenter B] will show those limits.”
- Return cue at 5:45: “That reliability is what makes the prototype usable in a real local workflow; [Presenter A] will close.”

For one presenter, keep the same screen order and remove handoff sentences; do not accelerate the quality/provenance section to preserve an optional visual.

## 9. Rehearsal checklist

- [ ] Fill every release token from immutable evidence; no braces remain.
- [ ] Verify all spoken indicator statements match the visible deterministic interpretation exactly.
- [ ] Run twice in 5–7 minutes, including one forced failure branch.
- [ ] Run from a cold browser with the network disabled.
- [ ] Run once keyboard-only and once with WebGL disabled.
- [ ] Verify Nagpur primary and Bengaluru recovery on both presentation devices.
- [ ] Confirm every displayed estimate has its source, processing method, period and limitations available in the methodology view.
- [ ] Confirm no line says official SDG, causal proof, real-time, forest loss, air temperature or guaranteed accuracy.
- [ ] Keep [presentation and Q&A](presentation-and-qa.md) open offline on the backup device.

## 10. Closing sentence

> “SPARC does not replace field evidence; it makes a local satellite-derived signal transparent enough to question, verify and use as the start of a better investigation.”

Related documents: [testing plan](testing-plan.md), [deployment guide](deployment-guide.md), [judging checklist](judging-checklist.md), [indicator methodology](indicator-methodology.md) and [validation plan](validation-plan.md).
