/* The analysis, as a place rather than a page.
 *
 * ── what changed, and why ────────────────────────────────────────────────────
 * Every previous version of this screen was a vertical stack of rectangles in a
 * side drawer. Three redesigns kept that skeleton and only repainted it, which
 * is why each one felt like the last. This one throws the skeleton away.
 *
 *   · The map is the canvas, not a widget inside a card.
 *   · Movement between indicators is lateral — you switch measurement, the same
 *     district restains and the same readout re-reads. Nothing scrolls past.
 *   · Time is a control you hold, not two columns you compare by eye. Dragging
 *     the scrubber moves the fill and the figure together and continuously,
 *     which is the one interaction that makes "it went down" a thing you feel
 *     rather than a thing you are told.
 *
 * ── the one thing the readout still states ───────────────────────────────────
 * There are two observations, not a series. The readout names the date at each
 * end and says "between observations" anywhere in the middle, so a figure read
 * off the middle of the track is never mistaken for a date SPARC measured.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { styleFor } from '../indicators';
import { shapeForRegion } from '../globe/overlay';
import type { DetailView, SummaryView as SummaryVM } from '../viewmodel/mapper';
import { Basemap, type BasemapHandle } from './Basemap';

function fmt(n: number, digits = 2): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function Atlas({
  summary,
  evidence,
  onOpenEvidence,
  onOpenProvenance,
  onReport,
}: {
  summary: SummaryVM;
  evidence: Record<string, DetailView>;
  onOpenEvidence: (indicatorId: string) => void;
  onOpenProvenance: (detail: DetailView) => void;
  onReport: () => void;
}) {
  const [activeId, setActiveId] = useState(summary.indicators[0]?.id ?? '');
  /** 0 = baseline observation, 1 = comparison observation. */
  const [t, setT] = useState(1);
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const fitRef = useRef<BasemapHandle | null>(null);

  const active = summary.indicators.find((i) => i.id === activeId) ?? summary.indicators[0];
  const style = active ? styleFor(active.id) : styleFor('surface-water');
  const shape = useMemo(() => shapeForRegion(summary.regionId), [summary.regionId]);

  /* Announce the measurement to the planet so the beam, the patch and this
     screen never disagree about which indicator is being read. */
  useEffect(() => {
    if (!activeId) return;
    dispatchEvent(new CustomEvent('sparc:indicator', { detail: { indicatorId: activeId } }));
  }, [activeId]);

  const base = active?.metric.baselineRaw ?? null;
  const comp = active?.metric.comparisonRaw ?? null;
  const known = base !== null && comp !== null;
  const atEnd = t === 0 || t === 1;

  /* The value under the scrubber: the measured figure at either end, a straight
     line between them anywhere else. */
  const value = known ? base + (comp - base) * t : null;

  const step = useCallback((dir: -1 | 1) => {
    const i = summary.indicators.findIndex((x) => x.id === activeId);
    const next = summary.indicators[(i + dir + summary.indicators.length) % summary.indicators.length];
    if (next) setActiveId(next.id);
  }, [activeId, summary.indicators]);

  /* Left/right anywhere on the canvas moves between measurements. A lateral
     interface that only responds to a click on one small control is a lateral
     interface most people never discover. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [step]);

  const detail = active ? evidence[active.id] : undefined;
  const coverage = detail?.quality.rows.find((r) => r.label === 'Common-valid coverage');

  if (!active) return null;

  return (
    <div className="atlas" style={{ ['--signal' as string]: style.signal }}>
      {/* ── the canvas ─────────────────────────────────────────────────── */}
      {shape ? (
        <Basemap
          polygons={shape.polygons}
          focusBounds={shape.focusBounds}
          approximate={shape.approximate}
          signal={style.signal}
          phase={known ? t : 1}
          onHover={setCursor}
          onReady={(h) => { fitRef.current = h; }}
        />
      ) : (
        <div className="atlas__map atlas__map--none">
          <p>No boundary geometry is packaged for this district, so there is nothing to draw.</p>
        </div>
      )}

      {/* Vignette: keeps the overlaid readouts legible over bright coastline
          without putting a panel behind any of them. */}
      <div className="atlas__vig" aria-hidden="true" />

      {/* ── place ─────────────────────────────────────────────────────── */}
      <header className="atlas__place">
        <h1 className="atlas__where">{summary.regionName}</h1>
        <p className="atlas__meta">
          {summary.regionType} · {summary.baseline.seasonLabel ?? 'same-season'} comparison
        </p>
      </header>

      {/* ── the measurement selector, lateral ─────────────────────────── */}
      <nav className="atlas__pick" aria-label="Measurement">
        {summary.indicators.map((card) => {
          const s = styleFor(card.id);
          const on = card.id === active.id;
          const missing = card.metric.changeUnavailable;
          return (
            <button
              key={card.id}
              type="button"
              className={`pick${on ? ' pick--on' : ''}${missing ? ' pick--missing' : ''}`}
              style={{ ['--signal' as string]: s.signal }}
              aria-pressed={on}
              onClick={() => setActiveId(card.id)}
            >
              <span className="pick__glyph" aria-hidden="true">{s.glyph}</span>
              <span className="pick__name">{s.short}</span>
              <span className="pick__delta">
                {missing ? 'no value' : card.metric.absoluteChange.text}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── the readout ───────────────────────────────────────────────── */}
      <section className="atlas__read" aria-live="polite">
        <p className="read__label">{active.name}</p>

        {value === null ? (
          <>
            <p className="read__none">No value</p>
            <p className="read__why">{active.metric.unavailableReason}</p>
          </>
        ) : (
          <>
            <p className="read__value">
              {fmt(value)}<span className="read__unit"> {active.metric.unit}</span>
            </p>
            <p className={`read__when${atEnd ? '' : ' read__when--interp'}`}>
              {t === 0 ? summary.baseline.range.split(' to ')[0]
                : t === 1 ? summary.comparison.range.split(' to ')[1]
                  : 'between observations'}
            </p>
            <p className="read__delta">
              {active.metric.absoluteChange.text} overall
              {active.metric.percentChange.kind === 'value' ? ` · ${active.metric.percentChange.text}` : ''}
            </p>
          </>
        )}

        {coverage?.value.kind === 'value' ? (
          <p className="read__cov">
            <span className="read__covbar" aria-hidden="true">
              <span style={{ width: coverage.value.text }} />
            </span>
            {coverage.value.text} of the district observed in both periods
          </p>
        ) : null}

        <div className="read__acts">
          <button type="button" className="lnk" onClick={() => onOpenEvidence(active.id)}>Evidence</button>
          <button type="button" className="lnk" disabled={!detail} onClick={() => detail && onOpenProvenance(detail)}>Provenance</button>
          <button type="button" className="lnk" onClick={onReport}>Report</button>
        </div>
      </section>

      {/* ── time ──────────────────────────────────────────────────────── */}
      <div className="atlas__time">
        <div className="time__ends">
          <span className={t === 0 ? 'time__end time__end--on' : 'time__end'}>
            {summary.baseline.range.split(' to ')[0]}
          </span>
          <span className={t === 1 ? 'time__end time__end--on' : 'time__end'}>
            {summary.comparison.range.split(' to ')[1]}
          </span>
        </div>
        <label className="sr-only" htmlFor="atlas-time">
          Move between the baseline and comparison observation
        </label>
        <input
          id="atlas-time"
          className="time__range"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={t}
          disabled={!known}
          onChange={(e) => setT(Number(e.target.value))}
        />
        <div className="time__ticks" aria-hidden="true">
          <span className="time__tick" style={{ left: '0%' }} />
          <span className="time__tick" style={{ left: '100%' }} />
        </div>
        <p className="time__hint">Drag between the two observations</p>
      </div>

      {/* ── pointer readout ───────────────────────────────────────────── */}
      <p className={`atlas__cursor${cursor ? ' atlas__cursor--on' : ''}`} aria-hidden="true">
        {cursor
          ? `${Math.abs(cursor.lat).toFixed(3)}°${cursor.lat >= 0 ? 'N' : 'S'}  ${Math.abs(cursor.lon).toFixed(3)}°${cursor.lon >= 0 ? 'E' : 'W'}`
          : 'drag to pan · scroll to zoom · ← → to switch'}
      </p>

      <button type="button" className="atlas__fit" onClick={() => fitRef.current?.fit()}>
        Recentre
      </button>
    </div>
  );
}
