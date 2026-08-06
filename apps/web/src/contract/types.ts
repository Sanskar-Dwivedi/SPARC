/* Types derived from the frozen contract.
 *
 *   source:  packages/contracts/schemas/sparc.schema.json  (schemaVersion 1.0.0)
 *            contracts/openapi.yaml                        (info.version 1.0.0-alpha.1)
 *
 * This is the single declaration of these shapes for the browser package.
 * docs/frontend-handoff.md forbids copying a handwritten interface into several
 * components, so everything imports from here — components never restate a
 * response shape inline.
 *
 * These types describe what the contract *permits*, which is why so much is
 * nullable. Resolving that nullability is the view-model's job, not the
 * components': see src/viewmodel/. A component that has to ask "is this null?"
 * is a component that will eventually render a zero where a measurement was
 * never taken. */

export type IndicatorId = 'surface-water' | 'vegetation' | 'built-up' | 'lst';
export type RegionType = 'district' | 'subdistrict' | 'block';
export type QualityLevel = 'high' | 'medium' | 'low' | 'unknown';
export type ResultStatus = 'complete' | 'partial' | 'unavailable' | 'failed';
export type ServerDataMode = 'live' | 'cache' | 'demo';

/** [west, south, east, north] */
export type Bbox = [number, number, number, number];
/** [longitude, latitude] */
export type Centroid = [number, number];

export interface RegionRef {
  id: string;
  name: string;
  type: RegionType;
  parentId: string | null;
  bbox: Bbox;
  centroid: Centroid;
  geometryUrl: string | null;
  indicatorIds: string[];
}

export interface Period {
  startDate: string;
  endDate: string;
  label: string;
  seasonLabel: string | null;
  compositeMethod: string | null;
  sceneCount: number | null;
}

export interface IndicatorRef {
  id: string;
  version: string;
  name: string;
  proxyLabel: string;
  unit: string;
  direction: 'increase-good' | 'decrease-good' | 'context-dependent';
}

export interface Metric {
  baselineValue: number | null;
  comparisonValue: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  unit: string;
  /** Present exactly when a value could not be produced. Never render 0 here. */
  unavailableReason: string | null;
}

export interface QualityEvidence {
  commonValidPercent: number | null;
  cloudPercent: number | null;
  nodataPercent: number | null;
  coveragePercent: number | null;
  sceneCountBaseline: number | null;
  sceneCountComparison: number | null;
  thresholdSensitivityPercent: number | null;
  independentValidationComplete: boolean;
  usersAccuracy: number | null;
  producersAccuracy: number | null;
}

export interface Quality {
  level: QualityLevel;
  basis: string;
  methodVersion: string;
  reasons: string[];
  warnings: string[];
  evidence: QualityEvidence;
}

export interface DatasetSource {
  datasetId: string;
  provider: string;
  mission: string | null;
  collection: string | null;
  processingBaseline: string | null;
  itemIds: string[];
  acquiredAt: string[];
  assetKeys: string[];
  sourceUrl: string | null;
  citation: string;
  license: string;
}

export interface Provenance {
  sources: DatasetSource[];
  algorithmId: string;
  algorithmVersion: string;
  parametersHash: string;
  analysisCrs: string;
  effectiveResolutionMeters: number | null;
  generatedAt: string;
}

export interface Interpretation {
  summary: string;
  caveats: string[];
  suggestedActions: string[];
  ruleId: string;
}

export interface LayerLegendEntry {
  label: string;
  color: string;
  value: string | number | null;
}

export interface LayerAttribution {
  label: string;
  url: string | null;
}

export interface LayerDescriptor {
  id: string;
  kind: string;
  representation: 'image' | 'tile' | 'geojson' | string;
  href: string;
  tileJsonHref: string | null;
  bounds: Bbox;
  minZoom: number | null;
  maxZoom: number | null;
  opacity: number | null;
  legend: LayerLegendEntry[];
  attributions: LayerAttribution[];
  checksum: string | null;
  contentVersion: string | null;
  availableOffline: boolean;
}

export interface ResponseMeta {
  schemaVersion: string;
  requestId: string;
  generatedAt: string;
  dataMode: ServerDataMode;
  partial: boolean;
  /** True whenever the payload is synthetic. Must remain visible in the UI. */
  mock: boolean;
  warnings: string[];
}

export interface Links {
  self: string;
  related: string[];
}

export interface IndicatorSummary {
  indicator: IndicatorRef;
  metric: Metric;
  qualityLevel: QualityLevel;
  status: ResultStatus;
  comparisonUrl: string | null;
}

export interface DistrictSummary {
  region: RegionRef;
  baselinePeriod: Period;
  comparisonPeriod: Period;
  indicators: IndicatorSummary[];
}

export interface IndicatorComparison {
  comparisonId: string;
  region: RegionRef;
  indicator: IndicatorRef;
  baselinePeriod: Period;
  comparisonPeriod: Period;
  metric: Metric;
  quality: Quality;
  provenance: Provenance;
  interpretation: Interpretation;
  layers: LayerDescriptor[];
  status: ResultStatus;
}

export interface Envelope<T> {
  data: T;
  meta: ResponseMeta;
  links: Links;
}

export type DistrictSummaryResponse = Envelope<DistrictSummary>;
export type IndicatorComparisonResponse = Envelope<IndicatorComparison>;

/* Forecast contracts are kept beside the existing analytical response types
 * so the API boundary and every forecast view share one declaration. The
 * server publishes a point forecast plus region metadata; it does not publish
 * a made-up raster or per-pixel forecast value. */
export type ForecastHazard = 'flood' | 'drought' | 'heat';
export type ForecastRunStatus = 'published' | 'stale' | 'degraded';
export type ForecastLeadUnit = 'hours' | 'days' | 'weeks';
export type ForecastRiskClass = 'low' | 'moderate' | 'high' | 'very-high';
export type ForecastConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type ForecastDriverDirection = 'increases-risk' | 'decreases-risk' | 'context';

export interface ForecastWindow {
  firstValidAt: string;
  lastValidAt: string;
  timeZone: string;
}

export interface ForecastMetric {
  id: string;
  label: string;
  value: number | null;
  unit: string;
}

export interface ForecastDriver {
  id: string;
  label: string;
  direction: ForecastDriverDirection;
  value: number | null;
  unit: string;
}

export interface ForecastUncertainty {
  lower: number;
  upper: number;
}

export interface ForecastPoint {
  leadTime: number;
  leadUnit: ForecastLeadUnit;
  validAt: string;
  probability: number;
  riskClass: ForecastRiskClass;
  confidence: ForecastConfidence;
  confidenceScore: number;
  uncertainty: ForecastUncertainty;
  metrics: ForecastMetric[];
  drivers: ForecastDriver[];
  exposedPopulation: number | null;
  notes: string[];
}

export interface ForecastSummary {
  peakProbability: number;
  peakValidAt: string;
  riskClass: ForecastRiskClass;
  confidence: ForecastConfidence;
  dataFreshnessMinutes: number;
  exposedPopulationEstimate: number | null;
  exposureUnit: string;
  keyDrivers: ForecastDriver[];
}

export interface ForecastModel {
  modelVersion: string;
  modelType: string;
  calibrationStatus: 'not-calibrated' | 'pending' | 'validated';
  validationStatus: 'not-run' | 'exploratory' | 'formal-failed' | 'formal-passed';
  trainingDataStatus: string;
  modelCardUrl: string | null;
}

export interface ForecastRunSummary {
  runId: string;
  regionId: string;
  hazard: ForecastHazard;
  issueTime: string;
  latestValidAt: string;
  status: ForecastRunStatus;
  stale: boolean;
  riskClass: ForecastRiskClass;
  confidence: ForecastConfidence;
  modelVersion: string;
}

export interface ForecastRun {
  runId: string;
  region: RegionRef;
  hazard: ForecastHazard;
  issueTime: string;
  status: ForecastRunStatus;
  stale: boolean;
  forecastWindow: ForecastWindow;
  summary: ForecastSummary;
  points: ForecastPoint[];
  model: ForecastModel;
  provenance: Provenance;
  layers: LayerDescriptor[];
  warnings: string[];
  disclaimer: string;
}

export interface ForecastTimeSeries {
  region: RegionRef;
  runId: string;
  hazard: ForecastHazard;
  issueTime: string;
  points: ForecastPoint[];
  provenance: Provenance;
}

export type ForecastRunListResponse = Envelope<ForecastRunSummary[]>;
export type ForecastRunResponse = Envelope<ForecastRun>;
export type ForecastTimeSeriesResponse = Envelope<ForecastTimeSeries>;

/** RFC 9457 problem document. The API returns these for every failure. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  traceId?: string;
  invalidParams?: { name: string; reason: string }[];
}

/** A canonical request. Both transports accept exactly this. */
export interface ComparisonSelection {
  regionId: string;
  baselineStart: string;
  baselineEnd: string;
  comparisonStart: string;
  comparisonEnd: string;
}
