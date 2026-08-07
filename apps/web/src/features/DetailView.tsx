/* One indicator in full: metric, plain-language reading, quality evidence,
 * provenance, and the spatial layer.
 *
 * Order is deliberate. The interpretation comes before the evidence because a
 * non-specialist needs to know what the number means before they can judge it,
 * and the caveats sit *inside* the interpretation block rather than in a
 * footnote — a reading and its limits should not be separable by scrolling. */

import { useId } from 'react';
import { sdgLinksFor } from '../sdg';
import type { DetailView as DetailVM } from '../viewmodel/mapper';
import { Callout, StatusPill, Value } from './Primitives';
import { QualityPanel } from './Disclosure';
import { LayerView } from './LayerView';
import { EvidenceViz } from './EvidenceViz';

/* Which SDG target this proxy speaks to — and, just as prominently, the official
   indicator it is not. Stating the relevance without stating the limit is how a
   screening tool gets quoted as national reporting. */
function SdgPanel({ indicatorId }: { indicatorId: string }) {
  const id = useId();
  const links = sdgLinksFor(indicatorId);
  if (!links.length) return null;

  return (
    <section className="panel" aria-labelledby={id}>
      <h3 id={id}>SDG relevance</h3>
      {links.map((link) => (
        <article key={`${link.goal}-${link.target}`} className="sdg">
          <h4 className="sdg__head">
            <span className="pill pill--sdg">SDG {link.target}</span>
            {link.goalName} — {link.targetName}
          </h4>
          <p className="sdg__supports">{link.supports}</p>
        </article>
      ))}
    </section>
  );
}

export function DetailScreen({
  detail,
  onBack,
  onOpenProvenance,
}: {
  detail: DetailVM;
  onBack: () => void;
  onOpenProvenance: () => void;
}) {
  const headingId = useId();
  const interpId = useId();

  return (
    <>
      {/* Sticky: the detail view is long, and a back control that scrolls away
          leaves the reader stranded at the bottom of a provenance table. */}
      <nav aria-label="Breadcrumb" className="crumb crumb--sticky">
        <button type="button" className="btn btn--back" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to {detail.region.name.replace(/ — .*$/, '')}
        </button>
        <span className="crumb__here">{detail.indicatorName.replace(/ — .*$/, '')}</span>
        {/* Provenance moved out of a panel at the bottom of a long page and
            into a drawer that opens from wherever the reader is (§3.3). */}
        <button type="button" className="btn" style={{ marginLeft: 'auto' }} onClick={onOpenProvenance}>
          Provenance ↗
        </button>
      </nav>

      <section className="panel" aria-labelledby={headingId}>
        <h2 id={headingId}>{detail.indicatorName}</h2>
        <p className="panel__lede">{detail.proxyLabel}</p>
        <p className="card__pills">
          <StatusPill status={detail.status} />
        </p>


        <dl className="metrics">
          <div>
            <dt>Analysis period · baseline · {detail.baseline.range}</dt>
            <dd><Value value={detail.metric.baseline} /></dd>
          </div>
          <div>
            <dt>Analysis period · comparison · {detail.comparison.range}</dt>
            <dd><Value value={detail.metric.comparison} /></dd>
          </div>
          <div>
            <dt>Estimated change</dt>
            <dd><Value value={detail.metric.absoluteChange} /></dd>
          </div>
          <div>
            <dt>Estimated relative change</dt>
            <dd><Value value={detail.metric.percentChange} /></dd>
          </div>
        </dl>

        {detail.metric.unavailableReason ? (
          <Callout tone="warn" title="Why a value is missing">
            <p>{detail.metric.unavailableReason}</p>
          </Callout>
        ) : null}
      </section>

      <section className="panel" aria-labelledby={interpId}>
        <h3 id={interpId}>What this shows</h3>
        <p className="interp">{detail.interpretation.summary}</p>

        {detail.interpretation.suggestedActions.length ? (
          <>
            <h4>Reasonable next steps</h4>
            <ul className="list">
              {detail.interpretation.suggestedActions.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </>
        ) : null}
      </section>

      <EvidenceViz detail={detail} />
      <SdgPanel indicatorId={detail.indicatorId} />
      <QualityPanel quality={detail.quality} />
      <LayerView
        layers={detail.layers}
        regionId={detail.region.id}
        syntheticLayers={detail.badge.grade === 'synthetic'}
      />
    </>
  );
}
