# SPARC validation and uncertainty plan

**Status:** exploratory blinded Nagpur vegetation and built-up frames created; Bengaluru Urban has complete sensitivity evidence but no independent reference labels or formal validation result
**Evidence cut-off:** 2026-08-03
**Primary methodological authority:** Olofsson et al., “Good practices for estimating area and assessing accuracy of land change.” ([OLOFSSON-2014](research/source-register.md#olofsson-2014))

## Terms

- **Data QA** asks whether usable observations, correct scaling, masking, geometry, and provenance exist.
- **Algorithm verification** asks whether the implementation performs the specified arithmetic and rules.
- **Scientific validation** compares mapped classes or temperature against an independent, more reliable reference.
- **Corroboration** compares with another imperfect satellite-derived product. It is useful evidence but not ground truth.
- **Uncertainty** is the quantified or documented range of plausible error.
- **Confidence label** is a transparent SPARC policy label, not a posterior probability of correctness.

## Claims to validate

| Output | Sampling unit | Reference response | Required metrics |
|---|---|---|---|
| Open surface-water proxy | Target-grid pixel or mapped segment | open water / non-water / uncertain | user's accuracy, producer's accuracy, omission, commission, gain/loss accuracy, adjusted area and interval |
| Green-cover proxy | Target-grid pixel | green photosynthetic cover above the documented interpretation / not / uncertain | user's and producer's accuracy for the chosen proxy definition, adjusted area and interval |
| Built-up spectral-candidate proxy | Target-grid pixel | built/impervious-dominated / non-built / ambiguous bare-construction | user's and producer's accuracy, bare-soil confusion, gain/loss accuracy, adjusted area and interval |
| Landsat LST | Valid thermal pixel or homogeneous site | coincident surface-radiometric temperature if available | bias, median absolute error, RMSE, sample count, temporal offset |
| Surface UHI | Scene-level urban/rural sample pair | independently measured or sensitivity-tested surface contrast | scene count, median contrast, bootstrap interval, rural-definition sensitivity |

The reference label must match the public claim. A “green” label cannot silently become “forest,” and a built-candidate label cannot be validated against only building centroids while claiming impervious area.

## Current implementation status

On 2026-08-03, SPARC exported deterministic, blinded Nagpur exploratory frames with 25 points from each mapped stable non-target, stable target, gain, and loss stratum (100 points per frame). The vegetation frame is retained alongside two separately frozen built-up frames: constrained-NDBI default (`2NYBB4IRDEHFGYEZQ4M4CY3A`) and IBI diagnostic (`T462S6Y47PNSZBLXRJ7HHGXH`). The raw CSVs are retained under Git-ignored `data/raw/validation/`; `scripts.data.create_validation_label_template` produced separate local label templates and SHA-256 metadata records under `data/processed/validation/`.

Every frame contains no mapped class, stratum, score, or threshold-distance field and every point is `UNLABELLED`. The built frames retain only the static indicator/method identity needed to label the correct public concept; template creation rejects a method mismatch. They are therefore `EXPLORATORY_REVIEW_ONLY`: no independent reference evidence, temporal labels, inclusion-probability calculation, error matrix, accuracy value, error-adjusted area, or confidence interval exists yet. The equal 25-per-stratum allocation is a debugging/review design, not a probability design. None of these frames passes the independent-validation release gate; they provide sensitivity evidence for the selected built-up method but do not establish environmental accuracy.

### Preregistration gate (2026-08-04)

`scripts/data/create_probability_validation_plan.py` implements the gate that must
pass before any formal probability sample is drawn. It binds a plan to its evidence
— boundary checksum, raw ledger checksum, region, indicator, method id and version,
finite population per stratum, sample size, random seed, replacement policy, target
precision — and derives the inclusion probability as the exact rational
`sampleSize / populationPixels`. Float comparison is not used: the populations are
large enough that a rounded probability silently biases the adjusted-area estimate.

The guarded export writes two separate files: a blinded reviewer CSV carrying only
sample id and geometry, and a restricted design-linkage CSV carrying stratum,
population, sample size and inclusion probability. A reviewer who can see the mapped
stratum is no longer an independent reference.

**The gate does not currently pass, and that is the correct state.** The allocation
is undecided: target precision, per-stratum sample size, replacement policy and
random seed are null in
`docs/templates/nagpur-vegetation-probability-design.template.json`. Per the
**DECISION** below, none of these was defaulted, and the gate contains no fallback
allocation. A test asserts the template ships `sampleSize: null` for every stratum
so the 25-per-stratum exploratory number cannot later be promoted by accident.

The imported v2 population ledger is retained locally under Git-ignored
`data/raw/validation/` and its checksum binding has been exercised against the real
artifact. The weighted v1 export remains rejected and must not be rounded or
reused. The corrected v2 records 7,371,132 stable non-target, 82,372,144 stable
target, 3,350,162 mapped-gain, and 6,124,575 mapped-loss finite pixel units. The
gate therefore blocks only on the scientific allocation decision, not on missing
population data.

The vegetation frame is Nagpur-specific. Bengaluru Urban's latest v2 pre-publication pack now has validated water pooled-Otsu, vegetation-threshold, and built-IBI sensitivity records, but it does not inherit the Nagpur frame; its pack records `vegetationLabelFrame: NOT_APPLICABLE` until a separate Bengaluru probability frame and reference-evidence plan exist. Directional agreement across a sensitivity run is not independent validation.

## Validation sequence

```text
Freeze AOI, periods, source-product rules, masks, grid and candidate thresholds
→ create baseline and comparison maps
→ create stable-target, stable-nontarget, gain and loss strata
→ draw a probability sample with recorded inclusion probabilities
→ label reference state independently and close to the image dates
→ adjudicate uncertain/disputed labels without seeing model confidence
→ compute a design-consistent error matrix
→ report user's/producer's accuracy and adjusted area with intervals
→ decide whether the release gate passes
→ preserve the sample, labels, decisions and method version
```

Probability sampling, temporally appropriate reference data, design-consistent accuracy estimates, error-adjusted area, and confidence intervals are the central recommendations of the original good-practice paper. ([OLOFSSON-2014](research/source-register.md#olofsson-2014))

## 1. Freeze before validation

Record and lock:

- AOI geometry and hash;
- target CRS, transform, pixel size, and resampling;
- date windows and inclusivity;
- product IDs and processing baselines;
- reflectance/temperature scale and offset handling;
- SCL or QA bit mask;
- temporal composite method;
- common-valid rule and minimum observation count;
- candidate threshold(s), cleanup, and minimum mapping unit;
- software/container versions and random seed.

Any material change after seeing validation results creates a new model/method version and requires a fresh held-out validation evaluation.

## 2. Sampling frame and strata

### Classification indicators

Construct the frame only on the common-valid footprint. Use four primary change strata:

1. stable target;
2. stable non-target;
3. mapped gain;
4. mapped loss.

Add explicit confusion-risk strata where material:

- water: shadow, wet soil, narrow shoreline, turbid water;
- green cover: cropland/harvest boundary, sparse vegetation, shadow;
- built proxy: bare soil, construction, rock/sand, bright roof, mixed urban edge.

**RECOMMENDATION:** draw a stratified random sample with a known inclusion probability for every sampled unit. Oversample rare gain/loss strata for diagnostic power, then apply area weights in estimation. Equal sample counts by stratum are not equal-area estimates. ([OLOFSSON-2014](research/source-register.md#olofsson-2014))

**DECISION:** do not invent one universal sample count. Calculate allocation after the discovery map reveals stratum areas and expected precision. Record the calculation, finite population, design, replacement policy, seed, and inclusion probability.

**HEURISTIC — hackathon review only:** if time prevents statistical allocation, inspect at least 25 independently selected samples in each of the four primary strata. This is a debugging exercise, not a statistically adequate production validation and must be labelled `EXPLORATORY_REVIEW_ONLY`.

### LST

LST validation requires temperature references rather than land-cover labels. Prefer homogeneous sites with coincident calibrated ground radiometers. Landsat's `ST_QA` is an uncertainty band from the same production system and is not independent validation. The Level-2 guide documents the retrieval inputs and QA layers. ([LANDSAT-L2-GUIDE](research/source-register.md#landsat-l2-guide))

If no independent radiometric reference exists, report only:

- product QA and cloud-distance distributions;
- cross-date stability over known stable surfaces;
- sensitivity to mask, cloud distance, emissivity, and rural reference;
- comparison with another satellite product explicitly labelled corroboration.

Do not validate LST against a weather station as if the quantities were identical; near-surface air temperature and surface skin temperature are distinct. ([NASA-LST](research/source-register.md#nasa-lst))

## 3. Reference evidence and labelling

### Reference hierarchy

1. Same-date field observations or authoritative local records with adequate spatial definition.
2. Licensed higher-resolution imagery close to each source acquisition date, interpreted by trained reviewers.
3. Multiple independent visual sources and time-series context.
4. Other satellite-derived global products for corroboration only.

JRC Global Surface Water, Dynamic World, ESA WorldCover, and GHSL must not be called ground truth. JRC documents that its post-2015 updates did not receive the original validation, Dynamic World's authors require validation of user-derived products, WorldCover reports global rather than Nagpur-specific accuracy and changed algorithms between 2020/2021, and GHSL is itself a remotely sensed/modelled product. ([GSW-2024](research/source-register.md#gsw-2024), [DW-2022](research/source-register.md#dw-2022), [WORLDCOVER-PUM](research/source-register.md#worldcover-pum), [GHSL-2023](research/source-register.md#ghsl-2023))

### Annotation protocol

For each sample, store:

```text
sampleId
stratum
inclusionProbability
mapPeriod0Class
mapPeriod1Class
referencePeriod0Class
referencePeriod1Class
referenceDates[]
referenceSourceAndLicense
interpreterId
interpretationScale
evidenceLinks[]
uncertainReason | null
adjudication | null
notes
```

**HEURISTIC:** seek reference imagery within 15 days of the relevant clear observation; if unavailable, remain within the same phenological/hydrological window and record the temporal gap. A longer gap is not automatically invalid, but it weakens claims about transient water, crops, construction, and heat.

Use at least two independent interpreters for a subset spanning all strata. Reviewers should not see the index value, probability, confidence label, or threshold-distance field before making the initial label. Disagreements go to adjudication; do not silently coerce `uncertain` to the mapped class.

### Reference definitions

- **Water:** open surface water visible from above at the reference time. Record vegetated wetland, shadow, and mixed shoreline separately.
- **Green proxy:** visible photosynthetic cover consistent with the declared green-cover concept. Record crop, tree, grass, shrub, and uncertain separately even if later collapsed.
- **Built:** built/impervious-dominated surface. Keep bare soil, active construction, quarry/rock, and mixed edge as separate response categories before any binary collapse.
- **LST:** radiometric land-surface temperature with measurement time, footprint, calibration, emissivity assumptions, and aggregation documented.

## 4. Threshold calibration without leakage

Split labelled data into disjoint calibration and validation sets before selecting thresholds. Prefer spatial blocks so adjacent pixels from the same object do not leak into both sets.

Use calibration data to select:

- MNDWI threshold or acceptance of fixed zero;
- NDVI green threshold;
- NDBI/NDVI/MNDWI built-proxy thresholds;
- optional minimum mapping unit;
- optional Sentinel-1 thresholding method;
- any probability cutoff used in optional Dynamic World comparison.

Freeze the chosen rule across 2019 and 2024. Evaluate once on held-out validation data. If thresholds are revised after validation, invalidate that evaluation and repeat with untouched data.

## 5. Design-consistent classification estimates

Let mapped stratum `i` occupy map-area proportion `W_i`, and let `n_ij` be the sample count mapped in stratum `i` whose reference class is `j`. Estimate the area-proportion error matrix as:

\[
\hat p_{ij}=W_i\frac{n_{ij}}{n_i}
\]

Then estimate reference-class area:

\[
\hat A_j=A_{total}\sum_i\hat p_{ij}
\]

Calculate user's accuracy from the relevant mapped-class row and producer's accuracy from the relevant reference-class column. Calculate standard errors and 95% intervals using formulas appropriate to the actual sample design. The design-consistent matrix and adjusted-area approach follow Olofsson et al.; implementation must reproduce that paper's estimator rather than treating the raw sample confusion matrix as an area estimate. ([OLOFSSON-2014](research/source-register.md#olofsson-2014))

Report for each period and for gain/loss:

- sample counts and weighted area by stratum;
- user's accuracy and 95% interval;
- producer's accuracy and 95% interval;
- omission and commission error;
- mapped area;
- error-adjusted area and 95% interval;
- overall accuracy only as a secondary summary;
- excluded/uncertain reference count and policy.

Do not rely on overall accuracy alone. A large stable-non-target class can conceal poor gain/loss performance.

## 6. LST and surface-UHI evaluation

### Pixel/site temperature

For matched reference pairs compute:

\[
error_i=T_{Landsat,i}-T_{reference,i}
\]

Report mean bias, median bias, median absolute error, RMSE, robust spread, temporal mismatch, footprint mismatch, sample count, and separate results by land cover/emissivity class where sample size allows.

### Scene-level SUHI

Compute urban-minus-rural contrast within each scene before temporal aggregation. Report:

- each scene's urban and rural valid counts;
- each scene's median urban and rural LST;
- scene contrast;
- period median contrast;
- bootstrap interval by acquisition date when enough dates exist;
- sensitivity to 0/1/2 km cloud-distance masks;
- sensitivity to rural ring width and elevation/land-cover matching;
- result with each single acquisition removed.

Landsat's native thermal support is 100 m even though the product grid is 30 m, so validation footprints and urban/rural masks must not pretend to resolve individual 30 m heat sources. ([LANDSAT-L2-GUIDE](research/source-register.md#landsat-l2-guide))

## 7. Quality and confidence policy

Do not emit a fabricated probability such as “87% confidence.” Publish independent dimensions:

```text
dataSupport
implementationVerification
validationStatus
thresholdRobustness
temporalComparability
referenceQuality
warnings[]
```

### Data-support label

The following are **SPARC heuristics**, not scientific standards:

| Label | Common-valid footprint | Clear observations per period | Other conditions |
|---|---:|---:|---|
| High | at least 90% | median at least 3 | no material season/grid/version mismatch |
| Medium | at least 70% | median at least 2 | limitations disclosed |
| Low | below either medium limit | any | or single-scene/single-observation dependence, unstable threshold, or severe warning |

### Validation status

- `NOT_RUN`: no independent sample.
- `EXPLORATORY_ONLY`: convenience review without a probability design.
- `FORMAL_FAILED`: formal design completed but release targets not met.
- `FORMAL_PASSED`: formal design completed and preregistered targets met.

**HEURISTIC — proposed pilot release target:** for each public target class and the gain/loss classes, require user's and producer's accuracy point estimates of at least 0.80 and 95% interval lower bounds of at least 0.70. These are product acceptance targets, not universal remote-sensing standards. Revisit them only before drawing the formal validation sample.

### Overall confidence label

- `HIGH`: high data support, implementation verification passed, formal validation passed, no critical warning, and sensitivity does not change area by more than 10%.
- `MEDIUM`: medium-or-better data support and verified implementation, but validation is exploratory/not run or sensitivity changes area by 10–25%.
- `LOW`: low data support, failed verification/validation, sensitivity above 25%, major temporal/reference mismatch, or a critical product caveat.

All percentage cutoffs in this subsection are **heuristics**. Store the components so users can inspect why a label was assigned.

## 8. Implementation verification tests

These tests verify code, not scientific truth:

1. Sentinel-2 `DN=0` becomes nodata.
2. `BOA_ADD_OFFSET` and `QUANTIFICATION_VALUE` are read from metadata and applied in the correct order. ([S2-DQR](research/source-register.md#s2-dqr))
3. Every configured SCL value is accepted/rejected exactly as specified. ([S2-PSD](research/source-register.md#s2-psd))
4. Categorical masks use nearest-neighbor resampling.
5. Index denominator zero/near-zero becomes nodata, not infinity.
6. Threshold is identical for baseline and comparison in one method version.
7. Pixels invalid in either period cannot become gain or loss.
8. Area is computed in square metres from pixel area; a known synthetic polygon returns expected area within numeric tolerance.
9. `A_0 = 0` returns null percentage change plus `BASELINE_ZERO`.
10. Landsat `ST_B10` scale/offset converts known DN fixtures correctly. ([LANDSAT-L2-GUIDE](research/source-register.md#landsat-l2-guide))
11. Every QA_PIXEL bit has an isolated fixture.
12. A 1 K temperature difference equals a 1 °C temperature difference.
13. Product provenance and attributions survive export.
14. Re-running with identical inputs, versions, and seed reproduces the same result.

## 9. Failure and stop rules

Stop or downgrade rather than quietly widening the claim when:

- common-valid coverage is below the documented minimum;
- the baseline or comparison has fewer than two usable optical observations for most of the AOI;
- required source metadata or offsets are missing;
- product versions or grids cannot be reconciled reproducibly;
- calibration and validation samples cannot be separated;
- gain/loss strata have insufficient reference evidence;
- reference dates are incompatible with transient change;
- LST has only one clear scene or no defensible rural reference;
- a threshold sensitivity run changes the policy conclusion;
- licenses do not permit the proposed redistribution.

The output should remain available for debugging if safe, but must be marked `NOT_SUITABLE_FOR_PUBLIC_CLAIM` with the exact reasons.
