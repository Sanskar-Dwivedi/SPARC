/* Indicator → SDG mapping.
 *
 * The problem statement is framed in SDG terms, so the dashboard has to say
 * which goal each proxy speaks to. The wording below is deliberately careful:
 * a proxy is *relevant to* a goal, it does not *measure* the official
 * indicator. SPARC has no mandate to report official SDG values and saying so
 * plainly here is cheaper than defending an implied claim later.
 *
 * Targets are named because "SDG 6" alone is too coarse to act on — 6.6 is
 * water-related ecosystems specifically, which is what an open-water proxy can
 * actually speak to, whereas 6.1 (drinking water access) is not observable from
 * this method at all. */

export interface SdgLink {
  goal: number;
  goalName: string;
  /** The specific target the proxy is relevant to. */
  target: string;
  targetName: string;
  /** What the proxy can support, in plain language. */
  supports: string;
  /** The official indicator this is NOT. */
  notOfficial: string;
}

const WATER: SdgLink = {
  goal: 6,
  goalName: 'Clean Water and Sanitation',
  target: '6.6',
  targetName: 'Protect and restore water-related ecosystems',
  supports:
    'Screening for change in mapped open-surface-water extent between two same-season composites.',
  notOfficial:
    'Official indicator 6.6.1 requires a defined national methodology and reporting process. This is a screening proxy for surface extent only — not volume, quality, groundwater, or drinking-water access.',
};

const VEGETATION: SdgLink = {
  goal: 15,
  goalName: 'Life on Land',
  target: '15.1',
  targetName: 'Conserve and restore terrestrial ecosystems',
  supports:
    'Screening for change in vegetation activity and green-cover extent across the district.',
  notOfficial:
    'Official indicator 15.1.1 is forest area as a proportion of land area, under a national forest definition. Vegetation index change is not forest area and does not distinguish crops from forest.',
};

const BUILT_UP: SdgLink = {
  goal: 11,
  goalName: 'Sustainable Cities and Communities',
  target: '11.3',
  targetName: 'Inclusive and sustainable urbanisation',
  supports:
    'Screening for change in built-up extent, as a rough signal of land consumption.',
  notOfficial:
    'Official indicator 11.3.1 is the ratio of land-consumption rate to population-growth rate, which needs population data this method does not have. Bare soil and construction are readily confused with built-up surface.',
};

const HEAT: SdgLink = {
  goal: 13,
  goalName: 'Climate Action',
  target: '13.1',
  targetName: 'Strengthen resilience to climate hazards',
  supports:
    'Screening for surface-temperature contrast between urban and rural reference areas.',
  notOfficial:
    'This is land-surface temperature, not air temperature, and the effective thermal support is coarser than the published grid. It is not an official climate indicator.',
};

/* Heat sits across two goals — it is a climate signal and an urban-liveability
   signal — so both are listed rather than picking one and losing the other. */
const HEAT_URBAN: SdgLink = {
  ...HEAT,
  goal: 11,
  goalName: 'Sustainable Cities and Communities',
  target: '11.6',
  targetName: 'Reduce the environmental impact of cities',
};

const BY_INDICATOR: Record<string, SdgLink[]> = {
  'surface-water': [WATER],
  vegetation: [VEGETATION],
  'built-up': [BUILT_UP],
  lst: [HEAT, HEAT_URBAN],
};

export function sdgLinksFor(indicatorId: string): SdgLink[] {
  return BY_INDICATOR[indicatorId] ?? [];
}

/** Short chip text for the summary cards, e.g. "SDG 6.6". */
export function sdgChips(indicatorId: string): string[] {
  return sdgLinksFor(indicatorId).map((l) => `SDG ${l.target}`);
}

export const SDG_SCOPE_NOTE =
  'Each proxy is mapped to the SDG target it is relevant to.';
