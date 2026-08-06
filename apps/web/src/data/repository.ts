/* The single facade the UI talks to.
 *
 * Screens depend on this, never on a transport. Swapping demo for API is
 * therefore a one-line change here and invisible to every component — which is
 * the property the offline recovery rehearsal depends on. */

import { config, type DataMode } from '../config';
import type {
  ComparisonSelection,
  DistrictSummaryResponse,
  ForecastHazard,
  ForecastRunListResponse,
  ForecastRunResponse,
  ForecastTimeSeriesResponse,
  IndicatorComparisonResponse,
  RegionRef,
} from '../contract/types';
import { ApiTransport } from './ApiTransport';
import { DemoTransport } from './DemoTransport';
import type { Transport } from './transport';

export interface RepositoryOptions {
  /** Serve the committed partial fixture, so that state can be rehearsed. */
  usePartial?: boolean;
}

export function createTransport(mode: DataMode, opts: RepositoryOptions = {}): Transport {
  return mode === 'api'
    ? new ApiTransport(config.apiBaseUrl)
    : new DemoTransport({ usePartial: opts.usePartial ?? false });
}

export class Repository {
  constructor(private transport: Transport) {}

  get label(): string { return this.transport.label; }
  get offlineCapable(): boolean { return this.transport.offlineCapable; }

  listRegions(signal?: AbortSignal): Promise<RegionRef[]> {
    return this.transport.listRegions(signal);
  }

  getRegionSummary(
    selection: ComparisonSelection,
    signal?: AbortSignal,
  ): Promise<DistrictSummaryResponse> {
    return this.transport.getRegionSummary(selection, signal);
  }

  getIndicatorComparison(
    selection: ComparisonSelection,
    indicatorId: string,
    signal?: AbortSignal,
  ): Promise<IndicatorComparisonResponse> {
    return this.transport.getIndicatorComparison(selection, indicatorId, signal);
  }

  listForecastRuns(
    regionId: string,
    hazard?: ForecastHazard,
    signal?: AbortSignal,
  ): Promise<ForecastRunListResponse> {
    return this.transport.listForecastRuns(regionId, hazard, signal);
  }

  getLatestForecast(
    regionId: string,
    hazard: ForecastHazard,
    signal?: AbortSignal,
  ): Promise<ForecastRunResponse> {
    return this.transport.getLatestForecast(regionId, hazard, signal);
  }

  getForecastRun(
    regionId: string,
    hazard: ForecastHazard,
    runId: string,
    signal?: AbortSignal,
  ): Promise<ForecastRunResponse> {
    return this.transport.getForecastRun(regionId, hazard, runId, signal);
  }

  getForecastTimeSeries(
    regionId: string,
    hazard: ForecastHazard,
    runId: string,
    signal?: AbortSignal,
  ): Promise<ForecastTimeSeriesResponse> {
    return this.transport.getForecastTimeSeries(regionId, hazard, runId, signal);
  }
}
