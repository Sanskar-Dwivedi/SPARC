/* Response → view model.
 *
 * Both transports converge here, so every screen renders one shape regardless
 * of where the bytes came from. Concentrating the null/partial/quality/mode
 * decisions in this file is the point: if each card decided for itself what
 * counts as "unavailable", they would disagree, and the one that disagreed
 * quietly would be the one that showed a number it should not have. */

import type {
  DistrictSummaryResponse,
  IndicatorComparison,
  IndicatorComparisonResponse,
  IndicatorSummary,
  Metric,
  Period,
  QualityLevel,
  ResponseMeta,
  ResultStatus,
} from '../contract/types';
import { changeWord, formatDateRange, formatNumber, formatPercent, unitLabel, type Formatted } from './format';

/** How trustworthy the *provenance* of these bytes is — distinct from the
 *  scientific quality of the result, which is `qualityLevel`. Both are shown. */
export type EvidenceGrade = 'synthetic' | 'pre-publication' | 'published';

export interface ModeBadge {
  grade: EvidenceGrade;
  label: string;
  detail: string;
  /** Server-declared mode: live | cache | demo. */
  serverDataMode: string;
  transportLabel: string;
}

export interface MetricView {
  /* Raw numbers alongside the formatted strings. The bars need magnitudes, and
     parsing them back out of a localised string would be both fragile and a
     second place for the null handling to go wrong. */
  baselineRaw: number | null;
  comparisonRaw: number | null;
  percentRaw: number | null;
  baseline: Formatted;
  comparison: Formatted;
  absoluteChange: Formatted;
  percentChange: Formatted;
  /** True when no change value exists — cards must show why, not a zero. */
  changeUnavailable: boolean;
  unavailableReason: string | null;
  unit: string;
  /** Neutral wording; never "improved"/"worsened". */
  direction: string;
}

export interface IndicatorCardView {
  id: string;
  name: string;
  proxyLabel: string;
  unit: string;
  status: ResultStatus;
  qualityLevel: QualityLevel;
  metric: MetricView;
  /** Set when the card must not be presented as a finished result. */
  caveat: string | null;
}

export interface PeriodView {
  label: string;
  range: string;
  seasonLabel: string | null;
  compositeMethod: string | null;
  sceneCount: number | null;
}

export interface SummaryView {
  regionId: string;
  regionName: string;
  regionType: string;
  bbox: [number, number, number, number];
  baseline: PeriodView;
  comparison: PeriodView;
  indicators: IndicatorCardView[];
  badge: ModeBadge;
  warnings: string[];
  partial: boolean;
  generatedAt: string;
}

export interface QualityView {
  level: QualityLevel;
  basis: string;
  methodVersion: string;
  reasons: string[];
  warnings: string[];
  rows: { label: string; value: Formatted; note?: string }[];
  independentValidationComplete: boolean;
  /* Raw magnitude alongside the formatted string, for the same reason
     MetricView carries raw numbers: the sensitivity bar needs a magnitude, and
     parsing one back out of a localised percentage would be both fragile and a
     second place for the null handling to go wrong. */
  thresholdSensitivityRaw: number | null;
}

export interface DetailView {
  comparisonId: string;
  indicatorId: string;
  indicatorName: string;
  proxyLabel: string;
  status: ResultStatus;
  metric: MetricView;
  quality: QualityView;
  interpretation: IndicatorComparison['interpretation'];
  provenance: IndicatorComparison['provenance'];
  layers: IndicatorComparison['layers'];
  baseline: PeriodView;
  comparison: PeriodView;
  badge: ModeBadge;
  warnings: string[];
  partial: boolean;
  region: IndicatorComparison['region'];
}

export const BUILT_UP_CONFLICT_REASON =
  'Estimated land-cover change is unavailable because the two documented Nagpur methods reverse direction.';

function isNagpurBuiltUp(regionId: string, indicatorId: string): boolean {
  return indicatorId === 'built-up' && /nagpur/i.test(regionId);
}

/** Keep primary-screen labels concise and neutral. Provenance and quality
 * fields remain available in the detail methodology panels. */
export function userFacingLabel(value: string): string {
  return value
    .replace(/\s+—\s+MOCK(?: REGION)?\b/gi, '')
    .replace(/\s+—\s+DEMO\b/gi, '')
    .replace(/^DEMO:\s*/i, '')
    .trim();
}

export function estimateLabel(indicatorId: string, fallback: string): string {
  switch (indicatorId) {
    case 'surface-water': return 'Estimated surface-water change';
    case 'vegetation': return 'Detected vegetation change';
    case 'built-up': return 'Estimated land-cover change';
    case 'lst': return 'Satellite-derived surface-temperature estimate';
    default: return userFacingLabel(fallback);
  }
}

/* The mandatory disclosure from docs/project-status.md. It is a constant rather
   than prose inside a component so it cannot be edited away in one place while
   surviving in another.

   The licence and attribution half of this now lives in
   features/BoundaryProvenance.tsx, read from the validated boundary record so
   the wording cannot drift from what the pipeline gated against. What stays
   here is the consequence a reader needs at the point of use: this geometry
   does not decide anyone's entitlement. */
export const BOUNDARY_DISCLAIMER =
  'District geometry is from geoBoundaries (ODbL 1.0, share-alike) and is not an ' +
  'authoritative government boundary. It must not be used to determine jurisdiction ' +
  'or entitlement. Full source, licence and attribution are in the boundary panel.';

export const PROXY_DISCLAIMER =
  'These are satellite-derived proxy indicators, not official UN SDG indicators. ' +
  'They describe observed surface patterns and do not establish a cause.';

function gradeFor(meta: ResponseMeta): EvidenceGrade {
  if (meta.mock) return 'synthetic';
  // Nothing in P0 is published yet; anything non-mock is pre-publication until
  // a validated pack with completed accuracy analysis exists.
  return 'pre-publication';
}

export function badgeFor(meta: ResponseMeta, transportLabel: string): ModeBadge {
  const grade = gradeFor(meta);
  const detail = 'Satellite dataset, analysis period, processing method, and data-quality status are available in the methodology view.';
  return {
    grade,
    label: 'Satellite-derived estimate',
    detail,
    serverDataMode: meta.dataMode,
    transportLabel,
  };
}

export function mapPeriod(period: Period): PeriodView {
  return {
    label: period.label,
    range: formatDateRange(period.startDate, period.endDate),
    seasonLabel: period.seasonLabel,
    compositeMethod: period.compositeMethod,
    sceneCount: period.sceneCount,
  };
}

export function mapMetric(metric: Metric): MetricView {
  const reason = metric.unavailableReason;
  const changeUnavailable = metric.absoluteChange === null || metric.absoluteChange === undefined;
  return {
    baselineRaw: metric.baselineValue,
    comparisonRaw: metric.comparisonValue,
    percentRaw: metric.percentChange,
    baseline: formatNumber(metric.baselineValue, { unit: metric.unit, reason }),
    comparison: formatNumber(metric.comparisonValue, { unit: metric.unit, reason }),
    absoluteChange: formatNumber(metric.absoluteChange, { unit: metric.unit, reason, signed: true }),
    percentChange: formatPercent(metric.percentChange, { reason, signed: true }),
    changeUnavailable,
    unavailableReason: reason,
    unit: unitLabel(metric.unit),
    direction: changeWord(metric.absoluteChange),
  };
}

function caveatFor(summary: IndicatorSummary): string | null {
  if (summary.status === 'partial') {
    return 'Partial result — at least one period did not meet the coverage gate.';
  }
  if (summary.status === 'unavailable' || summary.status === 'failed') {
    return 'No usable result for this period pair.';
  }
  if (summary.qualityLevel === 'unknown') {
    return 'Estimate includes documented sensitivity; see methodology for limitations.';
  }
  if (summary.qualityLevel === 'low') {
    return 'Estimate has documented data-quality limits; see methodology.';
  }
  return null;
}

export function mapIndicatorCard(summary: IndicatorSummary, regionId = ''): IndicatorCardView {
  const blocked = isNagpurBuiltUp(regionId, summary.indicator.id);
  const metric = blocked
    ? mapMetric({
      ...summary.metric,
      baselineValue: null,
      comparisonValue: null,
      absoluteChange: null,
      percentChange: null,
      unavailableReason: BUILT_UP_CONFLICT_REASON,
    })
    : mapMetric(summary.metric);
  return {
    id: summary.indicator.id,
    name: estimateLabel(summary.indicator.id, summary.indicator.name),
    proxyLabel: estimateLabel(summary.indicator.id, summary.indicator.proxyLabel),
    unit: unitLabel(summary.indicator.unit),
    status: blocked ? 'unavailable' : summary.status,
    qualityLevel: summary.qualityLevel,
    metric,
    caveat: blocked ? BUILT_UP_CONFLICT_REASON : caveatFor(summary),
  };
}

export function mapSummary(
  response: DistrictSummaryResponse,
  transportLabel: string,
): SummaryView {
  const { data, meta } = response;
  return {
    regionId: data.region.id,
    regionName: userFacingLabel(data.region.name),
    regionType: data.region.type,
    bbox: data.region.bbox,
    baseline: mapPeriod(data.baselinePeriod),
    comparison: mapPeriod(data.comparisonPeriod),
    indicators: data.indicators.map((indicator) => mapIndicatorCard(indicator, data.region.id)),
    badge: badgeFor(meta, transportLabel),
    warnings: meta.warnings,
    partial: meta.partial,
    generatedAt: meta.generatedAt,
  };
}

function mapQuality(comparison: IndicatorComparison): QualityView {
  const e = comparison.quality.evidence;
  return {
    level: comparison.quality.level,
    basis: comparison.quality.basis,
    methodVersion: comparison.quality.methodVersion,
    reasons: comparison.quality.reasons,
    warnings: comparison.quality.warnings,
    independentValidationComplete: e.independentValidationComplete,
    thresholdSensitivityRaw: e.thresholdSensitivityPercent,
    rows: [
      {
        label: 'Common-valid coverage',
        value: formatPercent(e.commonValidPercent),
        note: 'Share of the district observed validly in both periods. Everything else is unknown, not unchanged.',
      },
      { label: 'Cloud', value: formatPercent(e.cloudPercent) },
      { label: 'No data', value: formatPercent(e.nodataPercent) },
      { label: 'Scene coverage', value: formatPercent(e.coveragePercent) },
      { label: 'Scenes — baseline', value: formatNumber(e.sceneCountBaseline, { digits: 0 }) },
      { label: 'Scenes — comparison', value: formatNumber(e.sceneCountComparison, { digits: 0 }) },
      {
        label: 'Threshold sensitivity',
        value: formatPercent(e.thresholdSensitivityPercent),
        note: 'How far the result moves when the classification threshold is varied across its documented range.',
      },
      {
        label: "User's accuracy",
        value: formatNumber(e.usersAccuracy, { digits: 3 }),
        note: 'Requires independent reference labels.',
      },
      {
        label: "Producer's accuracy",
        value: formatNumber(e.producersAccuracy, { digits: 3 }),
        note: 'Requires independent reference labels.',
      },
    ],
  };
}

export function mapDetail(
  response: IndicatorComparisonResponse,
  transportLabel: string,
): DetailView {
  const { data, meta } = response;
  const blocked = isNagpurBuiltUp(data.region.id, data.indicator.id);
  const metric = blocked
    ? mapMetric({
      ...data.metric,
      baselineValue: null,
      comparisonValue: null,
      absoluteChange: null,
      percentChange: null,
      unavailableReason: BUILT_UP_CONFLICT_REASON,
    })
    : mapMetric(data.metric);
  return {
    comparisonId: data.comparisonId,
    indicatorId: data.indicator.id,
    indicatorName: estimateLabel(data.indicator.id, data.indicator.name),
    proxyLabel: estimateLabel(data.indicator.id, data.indicator.proxyLabel),
    status: blocked ? 'unavailable' : data.status,
    metric,
    quality: mapQuality(data),
    interpretation: blocked
      ? {
        ...data.interpretation,
        summary: BUILT_UP_CONFLICT_REASON,
        caveats: [BUILT_UP_CONFLICT_REASON, ...data.interpretation.caveats],
        suggestedActions: ['Request an on-site inspection or verification rather than selecting one conflicting method.'],
      }
      : data.interpretation,
    provenance: data.provenance,
    layers: data.layers,
    baseline: mapPeriod(data.baselinePeriod),
    comparison: mapPeriod(data.comparisonPeriod),
    badge: badgeFor(meta, transportLabel),
    warnings: meta.warnings,
    partial: meta.partial,
    region: { ...data.region, name: userFacingLabel(data.region.name) },
  };
}
