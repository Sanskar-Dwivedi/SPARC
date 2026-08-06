/* Offline transport over the generated precomputed contract examples.
 *
 * This is the offline path: no server, no network, no
 * request-time processing. The fixtures are imported from their committed
 * location through the `@fixtures` alias, so there is no second copy to drift.
 *
 * It deliberately runs the *same* validation and the *same* period gate as the
 * API. An offline transport that accepts requests the server would reject is worse
 * than useless — it hides exactly the failure you need rehearsed. */

import nagpurSummary from '@fixtures/precomputed/district-nagpur-summary.json';
import bengaluruSummary from '@fixtures/precomputed/district-bengaluru-urban-summary.json';
import mumbaiSummary from '@fixtures/precomputed/district-mumbai-city-summary.json';
import nagpurWater from '@fixtures/precomputed/district-nagpur-surface-water.json';
import nagpurVegetation from '@fixtures/precomputed/district-nagpur-vegetation.json';
import nagpurBuiltUp from '@fixtures/precomputed/district-nagpur-built-up.json';
import bengaluruWater from '@fixtures/precomputed/district-bengaluru-urban-surface-water.json';
import bengaluruVegetation from '@fixtures/precomputed/district-bengaluru-urban-vegetation.json';
import bengaluruBuiltUp from '@fixtures/precomputed/district-bengaluru-urban-built-up.json';
import mumbaiWater from '@fixtures/precomputed/district-mumbai-city-surface-water.json';
import mumbaiVegetation from '@fixtures/precomputed/district-mumbai-city-vegetation.json';
import mumbaiBuiltUp from '@fixtures/precomputed/district-mumbai-city-built-up.json';
import mumbaiGlobalSummary from '@fixtures/precomputed/district-mumbai-summary.json';
import mumbaiGlobalWater from '@fixtures/precomputed/district-mumbai-surface-water.json';
import mumbaiGlobalVegetation from '@fixtures/precomputed/district-mumbai-vegetation.json';
import mumbaiGlobalBuiltUp from '@fixtures/precomputed/district-mumbai-built-up.json';
import delhiSummary from '@fixtures/precomputed/district-delhi-summary.json';
import delhiWater from '@fixtures/precomputed/district-delhi-surface-water.json';
import delhiVegetation from '@fixtures/precomputed/district-delhi-vegetation.json';
import delhiBuiltUp from '@fixtures/precomputed/district-delhi-built-up.json';
import chennaiSummary from '@fixtures/precomputed/district-chennai-summary.json';
import chennaiWater from '@fixtures/precomputed/district-chennai-surface-water.json';
import chennaiVegetation from '@fixtures/precomputed/district-chennai-vegetation.json';
import chennaiBuiltUp from '@fixtures/precomputed/district-chennai-built-up.json';
import bhopalSummary from '@fixtures/precomputed/district-bhopal-summary.json';
import bhopalWater from '@fixtures/precomputed/district-bhopal-surface-water.json';
import bhopalVegetation from '@fixtures/precomputed/district-bhopal-vegetation.json';
import bhopalBuiltUp from '@fixtures/precomputed/district-bhopal-built-up.json';
import newYorkSummary from '@fixtures/precomputed/district-new-york-summary.json';
import newYorkWater from '@fixtures/precomputed/district-new-york-surface-water.json';
import newYorkVegetation from '@fixtures/precomputed/district-new-york-vegetation.json';
import newYorkBuiltUp from '@fixtures/precomputed/district-new-york-built-up.json';
import washingtonDcSummary from '@fixtures/precomputed/district-washington-dc-summary.json';
import washingtonDcWater from '@fixtures/precomputed/district-washington-dc-surface-water.json';
import washingtonDcVegetation from '@fixtures/precomputed/district-washington-dc-vegetation.json';
import washingtonDcBuiltUp from '@fixtures/precomputed/district-washington-dc-built-up.json';
import tokyoSummary from '@fixtures/precomputed/district-tokyo-summary.json';
import tokyoWater from '@fixtures/precomputed/district-tokyo-surface-water.json';
import tokyoVegetation from '@fixtures/precomputed/district-tokyo-vegetation.json';
import tokyoBuiltUp from '@fixtures/precomputed/district-tokyo-built-up.json';
import londonSummary from '@fixtures/precomputed/district-london-summary.json';
import londonWater from '@fixtures/precomputed/district-london-surface-water.json';
import londonVegetation from '@fixtures/precomputed/district-london-vegetation.json';
import londonBuiltUp from '@fixtures/precomputed/district-london-built-up.json';
import cairoSummary from '@fixtures/precomputed/district-cairo-summary.json';
import cairoWater from '@fixtures/precomputed/district-cairo-surface-water.json';
import cairoVegetation from '@fixtures/precomputed/district-cairo-vegetation.json';
import cairoBuiltUp from '@fixtures/precomputed/district-cairo-built-up.json';
import sydneySummary from '@fixtures/precomputed/district-sydney-summary.json';
import sydneyWater from '@fixtures/precomputed/district-sydney-surface-water.json';
import sydneyVegetation from '@fixtures/precomputed/district-sydney-vegetation.json';
import sydneyBuiltUp from '@fixtures/precomputed/district-sydney-built-up.json';
import rioDeJaneiroSummary from '@fixtures/precomputed/district-rio-de-janeiro-summary.json';
import rioDeJaneiroWater from '@fixtures/precomputed/district-rio-de-janeiro-surface-water.json';
import rioDeJaneiroVegetation from '@fixtures/precomputed/district-rio-de-janeiro-vegetation.json';
import rioDeJaneiroBuiltUp from '@fixtures/precomputed/district-rio-de-janeiro-built-up.json';
import reykjavikSummary from '@fixtures/precomputed/district-reykjavik-summary.json';
import reykjavikWater from '@fixtures/precomputed/district-reykjavik-surface-water.json';
import reykjavikVegetation from '@fixtures/precomputed/district-reykjavik-vegetation.json';
import reykjavikBuiltUp from '@fixtures/precomputed/district-reykjavik-built-up.json';
import partialData from '@fixtures/partial-data.mock.json';

import {
  cityForRegionId, comparisonForCity, summaryForCity,
} from '../demo/cities';
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
import { assertDistrictSummary, assertIndicatorComparison, ContractViolation } from '../contract/validate';
import { DataError } from './errors';
import type { Transport } from './transport';

const SUMMARIES: Record<string, unknown> = {
  'district:nagpur': nagpurSummary,
  'district:bengaluru-urban': bengaluruSummary,
  'district:mumbai-city': mumbaiSummary,
  'district:mumbai': mumbaiGlobalSummary,
  'district:delhi': delhiSummary,
  'district:chennai': chennaiSummary,
  'district:bhopal': bhopalSummary,
  'district:new-york': newYorkSummary,
  'district:washington-dc': washingtonDcSummary,
  'district:tokyo': tokyoSummary,
  'district:london': londonSummary,
  'district:cairo': cairoSummary,
  'district:sydney': sydneySummary,
  'district:rio-de-janeiro': rioDeJaneiroSummary,
  'district:reykjavik': reykjavikSummary,
};

/* Keyed by immutable region and indicator IDs, never by a caller-controlled
   path. The examples are generated from the reviewed Earth Engine packs. */
const COMPARISONS: Record<string, Record<string, unknown>> = {
  'district:nagpur': {
    'surface-water': nagpurWater,
    vegetation: nagpurVegetation,
    'built-up': nagpurBuiltUp,
  },
  'district:bengaluru-urban': {
    'surface-water': bengaluruWater,
    vegetation: bengaluruVegetation,
    'built-up': bengaluruBuiltUp,
  },
  'district:mumbai-city': {
    'surface-water': mumbaiWater,
    vegetation: mumbaiVegetation,
    'built-up': mumbaiBuiltUp,
  },
  'district:mumbai': {
    'surface-water': mumbaiGlobalWater,
    vegetation: mumbaiGlobalVegetation,
    'built-up': mumbaiGlobalBuiltUp,
  },
  'district:delhi': {
    'surface-water': delhiWater,
    vegetation: delhiVegetation,
    'built-up': delhiBuiltUp,
  },
  'district:chennai': {
    'surface-water': chennaiWater,
    vegetation: chennaiVegetation,
    'built-up': chennaiBuiltUp,
  },
  'district:bhopal': {
    'surface-water': bhopalWater,
    vegetation: bhopalVegetation,
    'built-up': bhopalBuiltUp,
  },
  'district:new-york': {
    'surface-water': newYorkWater,
    vegetation: newYorkVegetation,
    'built-up': newYorkBuiltUp,
  },
  'district:washington-dc': {
    'surface-water': washingtonDcWater,
    vegetation: washingtonDcVegetation,
    'built-up': washingtonDcBuiltUp,
  },
  'district:tokyo': {
    'surface-water': tokyoWater,
    vegetation: tokyoVegetation,
    'built-up': tokyoBuiltUp,
  },
  'district:london': {
    'surface-water': londonWater,
    vegetation: londonVegetation,
    'built-up': londonBuiltUp,
  },
  'district:cairo': {
    'surface-water': cairoWater,
    vegetation: cairoVegetation,
    'built-up': cairoBuiltUp,
  },
  'district:sydney': {
    'surface-water': sydneyWater,
    vegetation: sydneyVegetation,
    'built-up': sydneyBuiltUp,
  },
  'district:rio-de-janeiro': {
    'surface-water': rioDeJaneiroWater,
    vegetation: rioDeJaneiroVegetation,
    'built-up': rioDeJaneiroBuiltUp,
  },
  'district:reykjavik': {
    'surface-water': reykjavikWater,
    vegetation: reykjavikVegetation,
    'built-up': reykjavikBuiltUp,
  },
};

/* Reachable through a query flag so the partial/unavailable state can be
   rehearsed on demand. It is a real contract fixture, not a simulated failure. */
const PARTIAL_OVERRIDE: Record<string, unknown> = {
  'surface-water': partialData,
};

function periodsMatch(selection: ComparisonSelection, summary: DistrictSummaryResponse): boolean {
  const b = summary.data.baselinePeriod;
  const c = summary.data.comparisonPeriod;
  return (
    selection.baselineStart === b.startDate &&
    selection.baselineEnd === b.endDate &&
    selection.comparisonStart === c.startDate &&
    selection.comparisonEnd === c.endDate
  );
}

export class DemoTransport implements Transport {
  readonly label = 'Local analysis package';
  readonly offlineCapable = true;

  private readonly summaries: Record<string, DistrictSummaryResponse>;
  private readonly usePartial: boolean;

  constructor(opts: { usePartial?: boolean } = {}) {
    // Validate the fixtures at construction. If a committed example stops
    // satisfying the schema, that is a contract break and it should surface
    // immediately at boot, not on whichever screen happens to open it.
    this.summaries = Object.fromEntries(
      Object.entries(SUMMARIES).map(([regionId, payload]) => [regionId, assertDistrictSummary(payload)]),
    );
    this.usePartial = opts.usePartial ?? false;
  }

  async listRegions(): Promise<RegionRef[]> {
    return Object.values(this.summaries).map((summary) => summary.data.region);
  }

  async getRegionSummary(selection: ComparisonSelection): Promise<DistrictSummaryResponse> {
    const summary = this.summaries[selection.regionId];
    const city = cityForRegionId(selection.regionId);
    const fallbackCity = city?.processingPack.status === 'NOT_AVAILABLE' ? city : null;
    if (!summary && !fallbackCity) {
      throw new DataError('not-found', 'No precomputed output exists for the requested region.');
    }
    if (summary && !periodsMatch(selection, summary)) {
      throw new DataError(
        'invalid-input',
        'The offline analysis package only contains the frozen comparison for the selected district.',
      );
    }
    // Keep generated fixtures available only for internal test callers; they
    // are not returned by listRegions and cannot enter the primary picker.
    if (fallbackCity) {
      try {
        return assertDistrictSummary(summaryForCity(fallbackCity));
      } catch (err) {
        if (err instanceof ContractViolation) {
          throw new DataError('contract', err.message, { detail: err.errors });
        }
        throw err;
      }
    }
    return summary as DistrictSummaryResponse;
  }

  async getIndicatorComparison(
    selection: ComparisonSelection,
    indicatorId: string,
  ): Promise<IndicatorComparisonResponse> {
    // Resolve the summary first so region and period are gated identically for
    // every indicator, rather than each branch inventing its own check.
    await this.getRegionSummary(selection);

    const city = cityForRegionId(selection.regionId);
    const fallbackCity = city?.processingPack.status === 'NOT_AVAILABLE' ? city : null;
    const source = fallbackCity
      ? comparisonForCity(fallbackCity, indicatorId)
      : this.usePartial && PARTIAL_OVERRIDE[indicatorId]
        ? PARTIAL_OVERRIDE[indicatorId]
        : COMPARISONS[selection.regionId]?.[indicatorId];

    if (!source) {
      throw new DataError('not-found', `No precomputed result is packaged for "${indicatorId}".`);
    }

    try {
      return assertIndicatorComparison(source);
    } catch (err) {
      if (err instanceof ContractViolation) {
        throw new DataError('contract', err.message, { detail: err.errors });
      }
      throw err;
    }
  }

  /* Forecasts are not copied into the offline analysis package. Returning the
     existing not-found state keeps demo mode honest and prevents a second,
     frontend-owned forecast fixture from drifting away from the API. */
  async listForecastRuns(
    _regionId: string,
    _hazard?: ForecastHazard,
    _signal?: AbortSignal,
  ): Promise<ForecastRunListResponse> {
    throw new DataError('not-found', 'Forecasts are available through the API transport only.');
  }

  async getLatestForecast(
    _regionId: string,
    _hazard: ForecastHazard,
    _signal?: AbortSignal,
  ): Promise<ForecastRunResponse> {
    throw new DataError('not-found', 'Forecasts are available through the API transport only.');
  }

  async getForecastRun(
    _regionId: string,
    _hazard: ForecastHazard,
    _runId: string,
    _signal?: AbortSignal,
  ): Promise<ForecastRunResponse> {
    throw new DataError('not-found', 'Forecasts are available through the API transport only.');
  }

  async getForecastTimeSeries(
    _regionId: string,
    _hazard: ForecastHazard,
    _runId: string,
    _signal?: AbortSignal,
  ): Promise<ForecastTimeSeriesResponse> {
    throw new DataError('not-found', 'Forecasts are available through the API transport only.');
  }
}
