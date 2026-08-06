/* Indicator Rows — UI design doc §3.1.
 *
 * Replaces both the card grid and the plain table. One full-width band per
 * indicator, collapsed by default, headline delta right-aligned in the data
 * face because the delta is the answer the product exists to give — not a cell
 * a reader has to find.
 *
 * ── three things this component is careful about ─────────────────────────────
 *
 * 1. Disclosure works without a mouse (§4.2). The header is a real <button>
 *    with `aria-expanded` and `aria-controls`, so pointer, touch, Enter and
 *    Space are one code path and a screen reader is told the state. Hover is
 *    additive styling only; nothing is revealed by hover alone.
 *
 * 2. A contested finding does not get to look confident (§3.1, §5). When the
 *    metric is unavailable — the Nagpur built-up reversal is the live case —
 *    the row switches to the caution signal and the expanded panel leads with
 *    the caveat. The number does not appear above its own reason.
 *
 * 3. The evidence is fetched, not invented. The summary payload does not carry
 *    threshold sensitivity, scene counts or coverage; those live on the
 *    indicator comparison. So the row loads the comparison the first time it is
 *    opened and shows placeholders until it lands, rather than expanding into a
 *    panel of numbers the summary never had.
 */

import { useCallback, useId, useRef, useState } from 'react';
import { styleFor } from '../indicators';
import { sdgChips } from '../sdg';
import type { DetailView, IndicatorCardView } from '../viewmodel/mapper';
import { Value } from './Primitives';

function Chevron() {
  return (
    <svg className="irow__chev" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2 4.5 L6 8.5 L10 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** A status word plus its colour — never the colour alone (§6). */
function StatusChip({ card }: { card: IndicatorCardView }) {
  const blocked = card.metric.changeUnavailable;
  const tone = blocked || card.status !== 'complete' ? 'caution'
    : card.qualityLevel === 'high' ? 'verified' : 'quiet';
  const word = blocked ? 'WITHHELD' : card.status.toUpperCase();
  return <span className={`chip2 chip2--${tone}`}>{word}</span>;
}

/* Inline magnitude comparison. The bar is the comparison; the number confirms
   it. Both are printed, so the bar is never the only way to read the value, and
   a missing value produces no bar at all — a bar drawn from a null would be a
   fabricated measurement. */
function Magnitude({ rows }: { rows: { key: string; text: string; fraction: number | null; muted?: boolean }[] }) {
  const drawable = rows.filter((r) => r.fraction !== null);
  if (!drawable.length) return null;
  return (
    <div className="mag">
      {rows.map((r) => (
        <div className="mag__row" key={r.key}>
          <span className="mag__key">{r.key}</span>
          <span className="mag__val">{r.text}</span>
          <span className="mag__bar" aria-hidden="true">
            {r.fraction === null ? null : (
              <span
                className={`mag__fill${r.muted ? ' mag__fill--muted' : ''}`}
                style={{ width: `${Math.max(r.fraction, 0.01) * 100}%` }}
              />
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function Fact({ k, v, note }: { k: string; v: React.ReactNode; note?: string }) {
  return (
    <div className="facts__row">
      <dt className="facts__key">{k}</dt>
      <dd className="facts__val">
        {v}
        {note ? <span className="facts__note">{note}</span> : null}
      </dd>
    </div>
  );
}

/* Placeholder rows while the comparison loads: hairline bars with one slow
   pulse, per §5. Never a shimmer gradient, and never a spinner standing in for
   content whose shape we already know. */
function EvidenceGhost() {
  return (
    <div aria-hidden="true">
      <div className="mag">
        <div className="mag__row"><span className="ghost__bar ghost__bar--short" /><span /><span className="ghost__bar" /></div>
        <div className="mag__row"><span className="ghost__bar ghost__bar--short" /><span /><span className="ghost__bar" /></div>
      </div>
    </div>
  );
}

export function IndicatorRow({
  card,
  loadEvidence,
  onOpenFull,
  onOpenProvenance,
}: {
  card: IndicatorCardView;
  loadEvidence: (indicatorId: string) => Promise<DetailView>;
  onOpenFull: (indicatorId: string) => void;
  onOpenProvenance: (detail: DetailView) => void;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<DetailView | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const asked = useRef(false);

  const style = styleFor(card.id);
  const blocked = card.metric.changeUnavailable;

  const toggle = useCallback(() => {
    setOpen((was) => {
      const next = !was;
      /* Fetched once, on first open. Re-opening a row must not re-request —
         the pack is immutable, so a second fetch could only ever return the
         same bytes. */
      if (next && !asked.current) {
        asked.current = true;
        loadEvidence(card.id)
          .then(setEvidence)
          .catch((e: unknown) => setEvidenceError(
            e instanceof Error ? e.message : 'The evidence for this indicator could not be loaded.',
          ));
      }
      return next;
    });
  }, [card.id, loadEvidence]);

  /* Magnitudes are scaled against the larger of the pair, not a global range:
     the question is how these two compare with each other. */
  const { baselineRaw, comparisonRaw } = card.metric;
  const peak = baselineRaw !== null && comparisonRaw !== null
    ? Math.max(Math.abs(baselineRaw), Math.abs(comparisonRaw)) || 1
    : null;

  return (
    <li
      className={`irow${blocked ? ' irow--caution' : ''}`}
      style={{ ['--signal' as string]: blocked ? undefined : style.signal }}
    >
      <button
        type="button"
        className="irow__head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        <span className="irow__dot" aria-hidden="true" />
        <span className="irow__name">
          {style.short}
          <span className="irow__title">{card.name}</span>
        </span>

        {blocked ? (
          <span className="irow__delta irow__delta--none">No value</span>
        ) : (
          <span className="irow__delta">
            <Value value={card.metric.absoluteChange} />
            <span className="irow__pct">
              <Value value={card.metric.percentChange} /> {card.metric.direction} than baseline
            </span>
          </span>
        )}

        <Chevron />

        <span className="irow__meta">
          {card.proxyLabel}
          {sdgChips(card.id).map((chip) => <span key={chip}> · {chip}</span>)}
          {' · '}
          <StatusChip card={card} />
        </span>
      </button>

      {open ? (
        <div className="irow__body" id={bodyId}>
          <div className="irow__panel">
            {/* Contested first. A caveat printed under the numbers is a caveat
                most readers never reach. */}
            {blocked && card.metric.unavailableReason ? (
              <p className="limitnote limitnote--caution" style={{ border: 0, padding: 0, marginBottom: '1.1rem' }}>
                {card.metric.unavailableReason}
              </p>
            ) : null}

            {peak !== null && !blocked ? (
              <>
                <p className="irow__sub">Baseline against comparison</p>
                <Magnitude rows={[
                  { key: 'Baseline', text: card.metric.baseline.text, fraction: Math.abs(baselineRaw!) / peak, muted: true },
                  { key: 'Comparison', text: card.metric.comparison.text, fraction: Math.abs(comparisonRaw!) / peak },
                ]} />
              </>
            ) : null}

            <p className="irow__sub">Evidence</p>
            {evidenceError ? (
              <p className="limitnote limitnote--caution">{evidenceError}</p>
            ) : evidence ? (
              <>
                {evidence.quality.thresholdSensitivityRaw !== null ? (
                  <Magnitude rows={[{
                    key: 'Threshold sensitivity',
                    text: evidence.quality.rows.find((r) => r.label === 'Threshold sensitivity')?.value.text ?? '',
                    /* Sensitivity is already a percentage of the result, so it
                       is drawn against 100% rather than against its own
                       maximum — the reader is asking "how far could this move",
                       not "which of these two is bigger". */
                    fraction: Math.min(Math.abs(evidence.quality.thresholdSensitivityRaw) / 100, 1),
                  }]} />
                ) : null}
                <dl className="facts">
                  {evidence.quality.rows
                    .filter((r) => ['Common-valid coverage', 'Scenes — baseline', 'Scenes — comparison'].includes(r.label))
                    .map((r) => (
                      <Fact key={r.label} k={r.label} v={<Value value={r.value} />} note={r.note} />
                    ))}
                  <Fact k="Method" v={evidence.quality.methodVersion} />
                  <Fact k="Quality basis" v={evidence.quality.basis} />
                </dl>
                <p className="limitnote">
                  {evidence.interpretation.caveats[0] ?? 'No additional limitation is recorded for this result.'}
                </p>
              </>
            ) : (
              <EvidenceGhost />
            )}

            <div className="irow__actions">
              <button type="button" className="btn" onClick={() => onOpenFull(card.id)}>
                Full result
                <span className="sr-only"> for {card.name}</span>
              </button>
              <button
                type="button"
                className="btn"
                disabled={!evidence}
                onClick={() => evidence && onOpenProvenance(evidence)}
              >
                Provenance ↗
                <span className="sr-only"> for {card.name}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
