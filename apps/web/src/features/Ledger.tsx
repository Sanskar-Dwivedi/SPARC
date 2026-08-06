/* The Ledger Strip and the Journey Rail — UI design doc §2.4 and §4.1.
 *
 * These are the two pieces of persistent chrome in the interface, and they are
 * deliberately the only two.
 *
 * ── the ledger (§2.4) ────────────────────────────────────────────────────────
 * A telemetry readout under the header showing the provenance state of whatever
 * is currently on screen. The design constraint that matters is not visual: it
 * is that *every field must be a checkable fact*. There is no field here that
 * exists to fill the strip. If a value is not known yet it says so — `LOADING`,
 * `UNKNOWN` — because a blank in a provenance readout reads as "fine", and the
 * whole point of putting mode and quality on permanent display is that a reader
 * never has to go looking for the reason a number might not mean what it looks
 * like.
 *
 * It is also the interface's entire load animation (§4.3): fields fade in left
 * to right, 40 ms apart. Nothing else on the page animates on arrival.
 *
 * ── the rail (§4.1) ──────────────────────────────────────────────────────────
 * The one justified ordinal in the product, because the sequence is real:
 * you cannot compare periods before choosing a region, and you cannot read
 * provenance for an indicator you have not opened.
 *
 * The doc sketches five steps including a subdistrict drill-down. That step is
 * not rendered: SPARC's own limitations panel states that no subdistrict
 * boundary has passed its approval gate, so no child-region result is offered.
 * A permanently unreachable step on a wayfinding device teaches the reader the
 * device is decorative, which is exactly what §1 is trying to prevent.
 */

import type { QualityLevel } from '../contract/types';

export type JourneyStep = 'region' | 'periods' | 'indicator' | 'provenance';

const STEPS: { id: JourneyStep; label: string }[] = [
  { id: 'region', label: 'Select region' },
  { id: 'periods', label: 'Compare periods' },
  { id: 'indicator', label: 'Inspect indicator' },
  { id: 'provenance', label: 'Provenance' },
];

export function JourneyRail({ current }: { current: JourneyStep }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="rail" aria-label="Where you are in the analysis">
      {STEPS.map((step, i) => {
        const state = i < index ? 'done' : i === index ? 'now' : 'next';
        return (
          <li
            key={step.id}
            className={`rail__step rail__step--${state}`}
            aria-current={state === 'now' ? 'step' : undefined}
          >
            <span className="rail__node" aria-hidden="true" />
            {step.label}
            {/* The state is spoken, not inferred from a filled dot. */}
            <span className="sr-only">
              {state === 'done' ? ' — done' : state === 'now' ? ' — current step' : ' — not reached'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface LedgerFacts {
  region: string | null;
  /** Baseline start → comparison end, the full span the result covers. */
  window: string | null;
  /** Server-declared transport: precomputed pack, live API, offline demo. */
  mode: string;
  /** True when the mode is a fallback the reader must not overlook (§5). */
  modeCaution: boolean;
  quality: QualityLevel | 'loading' | null;
  scenes: number | null;
}

const QUALITY_WORD: Record<QualityLevel, string> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  unknown: 'UNKNOWN',
};

/** Every field carries its own label, so the strip reads correctly when
 *  linearised by a screen reader and when colour is unavailable (§6). */
function Field({ k, v, tone, index }: {
  k: string; v: string; tone?: 'strong' | 'caution' | 'verified'; index: number;
}) {
  return (
    <span
      className="ledger__field"
      /* §4.3: 40 ms stagger, ~400 ms for the whole strip. Inline because the
         delay is positional and there is no sensible class for "the seventh". */
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <span className="ledger__key">{k}</span>
      <span className={`ledger__val${tone ? ` ledger__val--${tone}` : ''}`}>{v}</span>
    </span>
  );
}

export function LedgerStrip({ facts }: { facts: LedgerFacts }) {
  const fields: { k: string; v: string; tone?: 'strong' | 'caution' | 'verified' }[] = [];

  if (facts.region) fields.push({ k: 'REGION', v: facts.region.toUpperCase(), tone: 'strong' });
  if (facts.window) fields.push({ k: 'WINDOW', v: facts.window });
  fields.push({ k: 'MODE', v: facts.mode, tone: facts.modeCaution ? 'caution' : undefined });
  if (facts.scenes !== null) fields.push({ k: 'SCENES', v: String(facts.scenes) });
  if (facts.quality) {
    fields.push({
      k: 'QUALITY',
      v: facts.quality === 'loading' ? 'LOADING' : QUALITY_WORD[facts.quality],
      /* Unknown is not a failure and is never red — it is undecided, and the
         caution colour is the token that means exactly that (§2.1). */
      tone: facts.quality === 'high' ? 'verified'
        : facts.quality === 'loading' ? undefined : 'caution',
    });
  }

  return (
    /* aria-live, because this is the one element that changes underneath a
       reader when they change selection without moving focus. Polite: it
       should not interrupt, only report. */
    <div className="ledger" role="status" aria-live="polite" aria-label="Provenance readout">
      {fields.map((f, i) => <Field key={f.k} index={i} {...f} />)}
    </div>
  );
}
