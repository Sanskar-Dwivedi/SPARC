/* HTTP transport against the FastAPI service.
 *
 * URL construction lives here and nowhere else. Components pass a canonical
 * selection; they never see a path. Identifiers are placed with
 * encodeURIComponent because catalogue ids contain colons
 * (`district:nagpur`) and an unencoded one silently changes the path. */

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
import {
  asProblemDetails,
  assertDistrictSummary,
  assertForecastRun,
  assertForecastRunList,
  assertForecastTimeSeries,
  assertIndicatorComparison,
  ContractViolation,
} from '../contract/validate';
import { DataError, kindForStatus } from './errors';
import type { Transport } from './transport';

const TIMEOUT_MS = 10_000;

export class ApiTransport implements Transport {
  readonly label = 'SPARC analysis service';
  readonly offlineCapable = false;

  constructor(private readonly baseUrl: string) {}

  private url(path: string, query?: Record<string, string>): string {
    const url = new URL(path, this.baseUrl);
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url.toString();
  }

  private async request(url: string, signal?: AbortSignal): Promise<unknown> {
    // navigator.onLine is only reliable in the negative direction, which is
    // exactly the direction we use it: if the browser is certain it is offline,
    // say so rather than showing a generic failure after a timeout.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new DataError('offline', 'The browser is offline. Switch to the offline analysis package.');
    }

    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
    const composite = signal
      ? AbortSignal.any([signal, timeout.signal])
      : timeout.signal;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: composite,
        headers: { Accept: 'application/json, application/problem+json' },
      });
    } catch (err) {
      if (signal?.aborted) throw new DataError('cancelled', 'Request superseded.');
      // A failed fetch cannot distinguish "process down" from "CORS rejected"
      // from "DNS failed" — the browser withholds that on purpose. Say what the
      // user can act on instead of guessing.
      throw new DataError(
        'unreachable',
        'The API did not respond. It may not be running, or it may not allow this origin.',
        { detail: [String((err as Error)?.message ?? err)] },
      );
    } finally {
      clearTimeout(timer);
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const problem = asProblemDetails(body);
      throw new DataError(
        kindForStatus(response.status),
        problem?.detail ?? problem?.title ?? `The API returned ${response.status}.`,
        { problem },
      );
    }
    return body;
  }

  private periodQuery(selection: ComparisonSelection): Record<string, string> {
    return {
      baselineStart: selection.baselineStart,
      baselineEnd: selection.baselineEnd,
      comparisonStart: selection.comparisonStart,
      comparisonEnd: selection.comparisonEnd,
    };
  }

  async listRegions(signal?: AbortSignal): Promise<RegionRef[]> {
    const body = await this.request(this.url('/api/v1/regions'), signal);
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) {
      throw new DataError('contract', 'Region list response did not contain an array.');
    }
    return data as RegionRef[];
  }

  async getRegionSummary(
    selection: ComparisonSelection,
    signal?: AbortSignal,
  ): Promise<DistrictSummaryResponse> {
    const url = this.url(
      `/api/v1/regions/${encodeURIComponent(selection.regionId)}/summary`,
      this.periodQuery(selection),
    );
    return this.validated(assertDistrictSummary, await this.request(url, signal));
  }

  async getIndicatorComparison(
    selection: ComparisonSelection,
    indicatorId: string,
    signal?: AbortSignal,
  ): Promise<IndicatorComparisonResponse> {
    const url = this.url(
      `/api/v1/regions/${encodeURIComponent(selection.regionId)}` +
        `/indicators/${encodeURIComponent(indicatorId)}`,
      this.periodQuery(selection),
    );
    return this.validated(assertIndicatorComparison, await this.request(url, signal));
  }

  async listForecastRuns(
    regionId: string,
    hazard?: ForecastHazard,
    signal?: AbortSignal,
  ): Promise<ForecastRunListResponse> {
    const url = this.url(
      `/api/v1/regions/${encodeURIComponent(regionId)}/forecast-runs`,
      hazard ? { hazard } : undefined,
    );
    return this.validated(assertForecastRunList, await this.request(url, signal));
  }

  async getLatestForecast(
    regionId: string,
    hazard: ForecastHazard,
    signal?: AbortSignal,
  ): Promise<ForecastRunResponse> {
    const url = this.url(
      `/api/v1/regions/${encodeURIComponent(regionId)}/forecasts/${encodeURIComponent(hazard)}/latest`,
    );
    return this.validated(assertForecastRun, await this.request(url, signal));
  }

  async getForecastRun(
    regionId: string,
    hazard: ForecastHazard,
    runId: string,
    signal?: AbortSignal,
  ): Promise<ForecastRunResponse> {
    const url = this.url(
      `/api/v1/regions/${encodeURIComponent(regionId)}/forecasts/` +
        `${encodeURIComponent(hazard)}/${encodeURIComponent(runId)}`,
    );
    return this.validated(assertForecastRun, await this.request(url, signal));
  }

  async getForecastTimeSeries(
    regionId: string,
    hazard: ForecastHazard,
    runId: string,
    signal?: AbortSignal,
  ): Promise<ForecastTimeSeriesResponse> {
    const url = this.url(
      `/api/v1/regions/${encodeURIComponent(regionId)}/forecasts/` +
        `${encodeURIComponent(hazard)}/${encodeURIComponent(runId)}/timeseries`,
    );
    return this.validated(assertForecastTimeSeries, await this.request(url, signal));
  }

  /** Turns a schema failure into a DataError so callers only handle one type. */
  private validated<T>(assert: (payload: unknown) => T, payload: unknown): T {
    try {
      return assert(payload);
    } catch (err) {
      if (err instanceof ContractViolation) {
        throw new DataError('contract', err.message, { detail: err.errors });
      }
      throw err;
    }
  }
}
