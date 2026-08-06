/* Boundary validation against the canonical schema.
 *
 * The point of validating here is narrow but important: everything downstream —
 * the view-model, every card, the disclosure panel — is written assuming the
 * contract holds. If a malformed payload gets past this line it does not
 * produce an error, it produces a *plausible-looking dashboard* with a missing
 * caveat or a silently absent warning. That is the failure mode this project
 * cannot ship, so the transports refuse the response instead.
 *
 * We compile the committed schema itself rather than re-describing it here.
 * A second description of a shape is a second thing to keep in sync, and the
 * one that drifts is always the copy. */

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import schema from '@contract/sparc.schema.json';
import type {
  DistrictSummaryResponse,
  ForecastRunListResponse,
  ForecastRunResponse,
  ForecastTimeSeriesResponse,
  IndicatorComparisonResponse,
  ProblemDetails,
} from './types';

export class ContractViolation extends Error {
  readonly errors: string[];
  constructor(what: string, errors: string[]) {
    super(`${what} does not satisfy the frozen contract`);
    this.name = 'ContractViolation';
    this.errors = errors;
  }
}

const ajv = new Ajv2020({
  // Collect everything: one error at a time turns a contract fix into an
  // afternoon of round trips.
  allErrors: true,
  strict: false,
  // The schema documents formats but we do not want format failures to be the
  // difference between rendering and not; the server is authoritative on dates.
  validateFormats: false,
});
ajv.addSchema(schema, 'sparc');

const cache = new Map<string, ValidateFunction>();

function validatorFor(defName: string): ValidateFunction {
  const cached = cache.get(defName);
  if (cached) return cached;
  const compiled = ajv.getSchema(`sparc#/$defs/${defName}`);
  if (!compiled) {
    throw new Error(`Contract definition "${defName}" is missing from sparc.schema.json`);
  }
  cache.set(defName, compiled);
  return compiled;
}

function describe(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors?.length) return ['unknown validation failure'];
  // Cap it: a badly wrong payload can produce hundreds, and nobody reads past
  // the first handful.
  return errors.slice(0, 12).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
}

function assertShape<T>(defName: string, payload: unknown, what: string): T {
  const validate = validatorFor(defName);
  if (!validate(payload)) {
    throw new ContractViolation(what, describe(validate.errors));
  }
  return payload as T;
}

export function assertDistrictSummary(payload: unknown): DistrictSummaryResponse {
  return assertShape<DistrictSummaryResponse>(
    'DistrictSummaryResponse',
    payload,
    'District summary response',
  );
}

export function assertIndicatorComparison(payload: unknown): IndicatorComparisonResponse {
  return assertShape<IndicatorComparisonResponse>(
    'IndicatorComparisonResponse',
    payload,
    'Indicator comparison response',
  );
}

export function assertForecastRunList(payload: unknown): ForecastRunListResponse {
  return assertShape<ForecastRunListResponse>(
    'ForecastRunListResponse',
    payload,
    'Forecast run list response',
  );
}

export function assertForecastRun(payload: unknown): ForecastRunResponse {
  return assertShape<ForecastRunResponse>(
    'ForecastRunResponse',
    payload,
    'Forecast run response',
  );
}

export function assertForecastTimeSeries(payload: unknown): ForecastTimeSeriesResponse {
  return assertShape<ForecastTimeSeriesResponse>(
    'ForecastTimeSeriesResponse',
    payload,
    'Forecast time-series response',
  );
}

/* Problem documents are validated too. An error path that itself throws is how
   a recoverable API failure turns into a blank screen. */
export function asProblemDetails(payload: unknown): ProblemDetails | null {
  const validate = validatorFor('ProblemDetails');
  return validate(payload) ? (payload as ProblemDetails) : null;
}
