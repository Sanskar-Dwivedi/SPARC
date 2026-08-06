/* Boundary source, licence and attribution.
 *
 * plan.md now fixes the district geometry to the validated geoBoundaries India
 * ADM2 release and requires the UI to "preserve the selected geoBoundaries
 * India ADM2 ODbL provenance, attribution, and applicable share-alike
 * obligations" alongside the prototype/non-authoritative disclaimer.
 *
 * Two traps this component exists to avoid:
 *
 *  1. **Calling it CC BY.** geoBoundaries ships a citation file saying its code
 *     and derivative works are CC BY 4.0, but the India ADM2 record labels the
 *     boundary *source* ODbL 1.0. The plan is explicit that the collection-level
 *     CC BY description must not be presented as a CC-BY-only grant, so both
 *     statements are shown with the reason SPARC follows the stricter one.
 *  2. **Retyping the licence.** Everything below is read from the committed
 *     metadata record, so the interface cannot state terms that differ from the
 *     record the pipeline validated against. */

import { useId } from 'react';
import release from '@boundaries/release-metadata.json';
import nagpurProvenance from '@boundaries/nagpur.provenance.json';
import { Row } from './Primitives';

/** The disclaimer the validated record itself carries. */
export const RECORD_DISCLAIMER: string = release.disclaimer;

/** Attribution string that must accompany any redistribution of the geometry. */
export const BOUNDARY_ATTRIBUTION: string = nagpurProvenance.attribution;

export const SHARE_ALIKE_NOTE =
  'ODbL 1.0 carries share-alike obligations: a produced work built from this ' +
  'geometry must keep the attribution, and a derived database must be offered ' +
  'under the same licence. That applies to this prototype and to anything ' +
  'exported from it.';

export function BoundaryProvenancePanel() {
  const id = useId();
  const r = release.release;

  return (
    <section className="panel" aria-labelledby={id}>
      <h3 id={id}>Boundary source and licence</h3>

      <p className="panel__lede">{RECORD_DISCLAIMER}</p>

      <p className="attrib-block">{BOUNDARY_ATTRIBUTION}</p>

      <dl className="rows">
        <Row label="Provider">{r.provider}</Row>
        <Row label="Release">
          <code>{r.boundaryId}</code> · {r.boundaryType} · boundary year {r.boundaryYear}
        </Row>
        <Row label="Build" note="Pinned commit, so the geometry is reproducible.">
          {r.buildDate} · commit <code>{r.commit}</code>
        </Row>
        <Row label="Upstream source">{r.source}</Row>
        <Row label="Licence">
          <strong>{r.sourceLicense}</strong>
          {' — '}
          <a href={r.sourceLicenseTermsUrl} target="_blank" rel="noreferrer noopener">terms</a>
        </Row>
        <Row label="Archive checksum">
          <code className="wrap">sha256:{r.archiveSha256}</code>
        </Row>
        <Row label="Redistribution">
          {nagpurProvenance.redistributionPermitted
            ? 'Permitted under the source terms, with attribution preserved.'
            : 'Not permitted — geometry must not be redistributed.'}
        </Row>
      </dl>

      <h4>Share-alike</h4>
      <p className="note">{SHARE_ALIKE_NOTE}</p>

      <h4>Why ODbL and not CC BY</h4>
      <p className="note">{r.geoBoundariesDerivativeLicenseNotice}</p>

      {/* The feature-count mismatch is recorded in the validated metadata. It is
          shown rather than filtered out: a discrepancy the pipeline noticed and
          resolved by individual verification is evidence of diligence, and
          hiding it would misrepresent how clean the source was. */}
      {r.featureCountWarning ? (
        <>
          <h4>Source note</h4>
          <p className="note">{r.featureCountWarning}</p>
        </>
      ) : null}

      <p className="note">
        No Survey of India ABDB geometry is used or redistributed by this
        prototype.
      </p>
    </section>
  );
}
