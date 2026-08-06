/* Provenance Drawer — UI design doc §3.3.
 *
 * Replaces a table of metadata with grouped label/value pairs. Separation comes
 * from vertical rhythm and label colour alone: no zebra striping, no cell
 * borders, no rules between fields.
 *
 * ── why a drawer and not a modal ─────────────────────────────────────────────
 * §3.3 is explicit that this must not become a focus trap laid over the map or
 * the globe. So it is right-anchored, it does not take a scrim that swallows
 * pointer events on the scene behind it beyond its own dismissal, and Escape
 * always closes it. Focus moves into the drawer on open and returns to the
 * control that opened it on close — which is the part that makes it usable by
 * keyboard without also making it a trap.
 *
 * ── what goes in it ──────────────────────────────────────────────────────────
 * Only facts that came off the wire. Every field here is either a value from
 * the indicator comparison's provenance block or a constant the pipeline
 * gated against. Nothing in this drawer is composed for presentation, because
 * a provenance panel that paraphrases is not provenance.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { DetailView } from '../viewmodel/mapper';
import { BOUNDARY_DISCLAIMER } from '../viewmodel/mapper';

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="facts__row">
      <dt className="facts__key">{k}</dt>
      <dd className="facts__val">{v}</dd>
    </div>
  );
}

export function ProvenanceDrawer({
  detail,
  open,
  onClose,
}: {
  detail: DetailView | null;
  open: boolean;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    /* Focus the panel itself rather than the first control: the drawer is a
       readout, and dropping the caret onto its close button announces "close"
       before any of the content the user asked to see. */
    requestAnimationFrame(() => panel.current?.focus());

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  const p = detail?.provenance;
  const source = p?.sources[0];

  return createPortal(
    <>
      <div
        className={`prov-scrim${open ? ' prov-scrim--open' : ''}`}
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        tabIndex={-1}
        className={`prov-drawer${open ? ' prov-drawer--open' : ''}`}
        role="dialog"
        aria-label="Provenance"
        /* Hidden from assistive technology while closed, so a screen reader
           does not walk into a drawer that is off-screen. */
        aria-hidden={open ? undefined : true}
      >
        <div className="prov-drawer__head">
          <h2 className="prov-drawer__title">Provenance</h2>
          <button type="button" className="prov-drawer__close" onClick={onClose} aria-label="Close provenance">×</button>
        </div>

        <div className="prov-drawer__body">
          {!detail || !p ? (
            <p className="blank__say">Open an indicator to read its provenance.</p>
          ) : (
            <>
              <section className="prov-drawer__group">
                <p className="prov-drawer__legend">Observation</p>
                <dl className="facts">
                <Field k="Indicator" v={detail.indicatorName} />
                <Field k="Dataset" v={source ? <code>{source.datasetId}</code> : 'Unavailable'} />
                {source?.collection ? <Field k="Collection" v={<code>{source.collection}</code>} /> : null}
                {source?.mission ? <Field k="Mission" v={source.mission} /> : null}
                <Field
                  k="Acquisition"
                  v={<><code>{detail.baseline.range}</code> vs <code>{detail.comparison.range}</code></>}
                />
                </dl>
              </section>

              <section className="prov-drawer__group">
                <p className="prov-drawer__legend">Method</p>
                <dl className="facts">
                <Field k="Algorithm" v={<code>{p.algorithmId}</code>} />
                <Field k="Version" v={<code>v{p.algorithmVersion}</code>} />
                <Field k="Parameters hash" v={<code className="wrap">{p.parametersHash}</code>} />
                <Field k="Analysis CRS" v={<code>{p.analysisCrs}</code>} />
                <Field
                  k="Effective resolution"
                  v={p.effectiveResolutionMeters === null ? 'Unavailable' : <code>{p.effectiveResolutionMeters} m</code>}
                />
                <Field k="Processed" v={<code>{p.generatedAt}</code>} />
                </dl>
              </section>

              <section className="prov-drawer__group">
                <p className="prov-drawer__legend">Boundary</p>
                <dl className="facts">
                <Field k="Region" v={detail.region.name} />
                <Field k="Region id" v={<code>{detail.region.id}</code>} />
                <Field k="Limitation" v={BOUNDARY_DISCLAIMER} />
                </dl>
              </section>

              <section className="prov-drawer__group">
                <p className="prov-drawer__legend">Quality</p>
                <dl className="facts">
                <Field
                  k="Level"
                  v={
                    /* Word first, colour second (§6). "Unknown" is stated as a
                       reason, not left as a bare grade a reader has to guess at. */
                    <>
                      <span className={`chip2 chip2--${detail.quality.level === 'high' ? 'verified' : 'caution'}`}>
                        {detail.quality.level.toUpperCase()}
                      </span>
                      {!detail.quality.independentValidationComplete ? (
                        <span className="facts__note">
                          Independent validation has not been run, so no accuracy figure can be quoted.
                        </span>
                      ) : null}
                    </>
                  }
                />
                <Field k="Basis" v={detail.quality.basis} />
                <Field k="Method version" v={<code>{detail.quality.methodVersion}</code>} />
                <Field k="Limitation" v={detail.interpretation.caveats[0] ?? 'None recorded.'} />
                </dl>
              </section>

              {source ? (
                <section className="prov-drawer__group">
                  <p className="prov-drawer__legend">Source</p>
                  <dl className="facts">
                  <Field k="Scenes" v={<code>{source.itemIds.length.toLocaleString()}</code>} />
                  <Field k="Citation" v={source.citation} />
                  <Field k="Licence" v={source.license} />
                  {source.sourceUrl ? (
                    <Field
                      k="Catalogue"
                      v={<a className="wrap" href={source.sourceUrl} target="_blank" rel="noreferrer noopener">{source.sourceUrl}</a>}
                    />
                  ) : null}
                </dl>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
