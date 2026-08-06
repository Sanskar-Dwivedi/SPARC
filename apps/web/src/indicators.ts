/* Per-indicator identity: colour, glyph, short label.
 *
 * The colours match the marker colours in orbital-website/main.js, so the
 * district marker on the globe and the card in the panel agree at a glance.
 * They are duplicated rather than shared because that page is deliberately
 * build-free and cannot import from this bundle — the pair is small, stable,
 * and commented on both sides.
 *
 * Colour is never the only carrier. Every place these are used also prints the
 * indicator name and the change in words. */

export interface IndicatorStyle {
  /** Marker colour on the globe. Owned by the scene, not by the interface —
   *  the UI design doc puts the globe viewport out of its scope, so this value
   *  stays in step with orbital-website/main.js and nothing else. */
  accent: string;
  /** Interface signal colour (UI design doc §2.1). Muted, one per indicator,
   *  and only ever painted next to that indicator's own data — never as page
   *  branding, which is what keeps colour carrying information. */
  signal: string;
  /** Text glyph, so the family reads without colour. */
  glyph: string;
  short: string;
}

const STYLES: Record<string, IndicatorStyle> = {
  'surface-water': { accent: '#4da3ff', signal: '#4fb6c9', glyph: '≈', short: 'Water' },
  vegetation: { accent: '#63d68a', signal: '#7fa65a', glyph: '❧', short: 'Vegetation' },
  'built-up': { accent: '#ffb454', signal: '#c99a5b', glyph: '▦', short: 'Built-up' },
  lst: { accent: '#ff7a5c', signal: '#c97155', glyph: '▲', short: 'Heat' },
};

const FALLBACK: IndicatorStyle = { accent: '#93a4b8', signal: '#5c685f', glyph: '•', short: 'Indicator' };

export function styleFor(indicatorId: string): IndicatorStyle {
  return STYLES[indicatorId] ?? FALLBACK;
}

/* Bar lengths for the baseline/comparison comparison.
 *
 * Scaled against the larger of the two, not against zero-to-max of some global
 * range: the question a reader is asking is "how do these two compare with each
 * other", and anchoring to a global range makes small real changes invisible.
 * Returns null when either side is missing — a bar drawn from a missing value
 * is a fabricated measurement. */
export function barFractions(
  baseline: number | null,
  comparison: number | null,
): { baseline: number; comparison: number } | null {
  if (baseline === null || comparison === null) return null;
  if (!Number.isFinite(baseline) || !Number.isFinite(comparison)) return null;
  const max = Math.max(Math.abs(baseline), Math.abs(comparison));
  if (max === 0) return { baseline: 0, comparison: 0 };
  return {
    baseline: Math.abs(baseline) / max,
    comparison: Math.abs(comparison) / max,
  };
}
