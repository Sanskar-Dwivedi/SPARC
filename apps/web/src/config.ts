/* Public browser configuration.
 *
 * Every value here reaches the browser, so none of it can be a secret — see
 * docs/repository-ownership.md. Provider credentials stay server-side and are
 * never referenced from this package.
 *
 * Data mode is read explicitly rather than inferred. An implicit mode is how a
 * demo ends up silently presenting synthetic numbers as real ones. */

export type DataMode = 'demo' | 'api';

export interface AppConfig {
  /** Which transport the repository facade should use. */
  dataMode: DataMode;
  /** Origin of the FastAPI service. Only used by ApiTransport. */
  apiBaseUrl: string;
  /** Contract revision this client was built against. */
  contractVersion: string;
}

function readDataMode(raw: string | undefined): DataMode {
  const value = (raw ?? 'demo').trim().toLowerCase();
  if (value === 'demo' || value === 'api') return value;
  // Fail toward the offline path: demo works with no network and no server, so
  // a typo degrades into something that still runs rather than a blank screen.
  console.warn(`[sparc] unknown VITE_DATA_MODE "${raw}", falling back to "demo"`);
  return 'demo';
}

function readApiBaseUrl(raw: string | undefined): string {
  const defaultValue = import.meta.env.PROD ? 'same-origin' : 'http://localhost:8000';
  const value = (raw ?? defaultValue).trim();
  // The Vercel deployment hosts the FastAPI function and the static client
  // under one origin. Keep this opt-in so local development retains its
  // explicit localhost default and never silently calls a deployed API.
  if (value === 'same-origin') {
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000';
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
    return url.origin;
  } catch {
    console.warn(`[sparc] invalid VITE_API_BASE_URL "${raw}", falling back to localhost:8000`);
    return 'http://localhost:8000';
  }
}

export const config: AppConfig = {
  dataMode: readDataMode(import.meta.env.VITE_DATA_MODE),
  apiBaseUrl: readApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  contractVersion: '1.0.0-alpha.1',
};

/* The frozen P0 comparison windows. These are not user-editable: the whole
   scientific claim depends on comparing the same season across two years, and
   an arbitrary date pair has no precomputed result behind it. The server
   independently rejects anything else — this list only shapes the control. */
export const FROZEN_PERIODS = [
  {
    id: 'post-monsoon-2019-2024',
    label: 'Post-monsoon 2019 → 2024',
    baselineStart: '2019-10-15',
    baselineEnd: '2019-12-15',
    comparisonStart: '2024-10-15',
    comparisonEnd: '2024-12-15',
    seasonLabel: 'post-monsoon',
  },
  {
    id: 'dry-season-2019-2024',
    label: 'Dry season 2019 → 2024',
    baselineStart: '2019-01-15',
    baselineEnd: '2019-03-15',
    comparisonStart: '2024-01-15',
    comparisonEnd: '2024-03-15',
    seasonLabel: 'dry season',
  },
  {
    id: 'summer-2019-2024',
    label: 'Summer 2019 → 2024',
    baselineStart: '2019-06-15',
    baselineEnd: '2019-08-15',
    comparisonStart: '2024-06-15',
    comparisonEnd: '2024-08-15',
    seasonLabel: 'summer',
  },
] as const;

export type FrozenPeriod = (typeof FROZEN_PERIODS)[number];

/* Each packaged city has exactly one processed seasonal window. Keep this
   mapping beside the frozen controls so the browser never offers a period
   belonging to another city's result pack. The API remains the final gate. */
const DRY_SEASON_REGIONS = new Set([
  'district:bengaluru-urban',
  'district:sydney',
  'district:rio-de-janeiro',
]);

const SUMMER_REGIONS = new Set([
  'district:new-york',
  'district:washington-dc',
  'district:tokyo',
  'district:london',
  'district:cairo',
  'district:reykjavik',
]);

export function frozenPeriodsForRegion(regionId: string): readonly FrozenPeriod[] {
  if (DRY_SEASON_REGIONS.has(regionId)) return [FROZEN_PERIODS[1]];
  if (SUMMER_REGIONS.has(regionId)) return [FROZEN_PERIODS[2]];
  return [FROZEN_PERIODS[0]];
}
