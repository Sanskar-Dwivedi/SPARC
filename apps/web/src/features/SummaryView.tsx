/* District summary — UI design doc §3.1, §5.
 *
 * The three indicators are Indicator Rows, not cards and not table rows: a
 * full-width band each, delta right-aligned in the data face, evidence behind a
 * disclosure that works from pointer, touch and keyboard alike.
 *
 * The period pair that qualifies every number below sits above them as a plain
 * label/value block. It used to be two filled cards; two boxes for two dates is
 * exactly the "grid of equal boxes" §2.3 rules out, and the dates are already
 * summarised in the ledger strip, so this is the working, not the headline. */

import { useId } from 'react';
import { SDG_SCOPE_NOTE } from '../sdg';
import type { DetailView, PeriodView, SummaryView as SummaryVM } from '../viewmodel/mapper';
import { IndicatorRow } from './IndicatorRows';

function PeriodFacts({ title, period }: { title: string; period: PeriodView }) {
  return (
    <div className="facts__row">
      <dt className="facts__key">{title}</dt>
      <dd className="facts__val">
        <code>{period.range}</code>
        <span className="facts__note">
          {[period.seasonLabel, period.compositeMethod,
            period.sceneCount === null ? 'scene count unavailable' : `${period.sceneCount} scenes`]
            .filter(Boolean).join(' · ')}
        </span>
      </dd>
    </div>
  );
}

export function SummaryScreen({
  summary,
  onOpenIndicator,
  onOpenProvenance,
  loadEvidence,
  onReport,
}: {
  summary: SummaryVM;
  onOpenIndicator: (indicatorId: string) => void;
  onOpenProvenance: (detail: DetailView) => void;
  loadEvidence: (indicatorId: string) => Promise<DetailView>;
  onReport: () => void;
}) {
  const headId = useId();
  const indicatorsId = useId();
  const reportId = useId();

  return (
    <>
      <section className="panel" aria-labelledby={headId}>
        <h2 id={headId}>
          {summary.regionName}
          <span className="panel__sub">{summary.regionType}</span>
        </h2>
        <p className="panel__lede">
          Same-season comparison between two fixed composite windows. Both windows use the
          same method, so the difference is not an artefact of changing how the measurement
          was made.
        </p>
        <dl className="facts">
          <PeriodFacts title="Baseline" period={summary.baseline} />
          <PeriodFacts title="Comparison" period={summary.comparison} />
        </dl>
      </section>

      <section className="panel" aria-labelledby={indicatorsId}>
        <h3 id={indicatorsId}>Satellite-derived estimates</h3>
        <p className="panel__lede">{SDG_SCOPE_NOTE}</p>
      </section>

      {/* Outside the padded panel: the rows are full-bleed bands, and a band
          that stops short of the drawer edge reads as a card again. */}
      <ul className="rows2">
        {summary.indicators.map((card) => (
          <IndicatorRow
            key={card.id}
            card={card}
            loadEvidence={loadEvidence}
            onOpenFull={onOpenIndicator}
            onOpenProvenance={onOpenProvenance}
          />
        ))}
      </ul>

      <section className="panel report-launch" aria-labelledby={reportId}>
        <h3 id={reportId}>Report an environmental concern</h3>
        <p className="panel__lede">
          Create a neutral request for inspection using this analysis and your own observation.
        </p>
        <button type="button" className="btn btn--primary" onClick={onReport}>
          Report environmental concern
        </button>
      </section>
    </>
  );
}
