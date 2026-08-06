/* Spatial layer with a mandatory non-WebGL path.
 *
 * The fallback is not a degraded afterthought — docs/project-status.md requires
 * the layer to be inspectable "with a non-WebGL table/image fallback" and the
 * offline release gate tests the journey with WebGL unavailable. So the
 * accessible representation (bounds, legend, attribution, checksum) is rendered
 * *always*, and the map is an enhancement layered on top when the platform can
 * support it. Doing it the other way round produces a fallback nobody has
 * looked at since the day it was written.
 *
 * MapLibre is loaded lazily: it is the single largest dependency in the bundle
 * and the dashboard must be usable before it arrives, or on a device where it
 * never will. ADR-005 pins it below v6. */

import { useEffect, useId, useRef, useState } from 'react';
import type { LayerDescriptor } from '../contract/types';
import { shapeForRegion } from '../globe/overlay';
import { Callout } from './Primitives';

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

/** Only relative, application-controlled hrefs are ever resolved. The contract
 *  promises the API never returns an upstream or signed URL; this is the
 *  browser-side half of that promise, because a descriptor is still data and
 *  data is not trusted just because it validated. */
function isSafeAppHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

function BoundsTable({ layer }: { layer: LayerDescriptor }) {
  const [west, south, east, north] = layer.bounds;
  return (
    <table className="table table--compact">
      <caption className="sr-only">Layer extent and identity</caption>
      <tbody>
        <tr><th scope="row">Representation</th><td>{layer.representation}</td></tr>
        <tr><th scope="row">West</th><td>{west}°</td></tr>
        <tr><th scope="row">South</th><td>{south}°</td></tr>
        <tr><th scope="row">East</th><td>{east}°</td></tr>
        <tr><th scope="row">North</th><td>{north}°</td></tr>
        <tr>
          <th scope="row">Available offline</th>
          <td>{layer.availableOffline ? 'Yes' : 'No'}</td>
        </tr>
        {layer.checksum ? (
          <tr><th scope="row">Checksum</th><td><code className="wrap">{layer.checksum}</code></td></tr>
        ) : null}
      </tbody>
    </table>
  );
}

function Legend({ layer }: { layer: LayerDescriptor }) {
  if (!layer.legend.length) return null;
  return (
    <div className="legend">
      <h4 className="legend__title">Legend</h4>
      <ul className="legend__list">
        {layer.legend.map((entry) => (
          <li key={`${entry.label}-${String(entry.value)}`} className="legend__item">
            {/* The swatch is decorative; the label carries the meaning, so the
                legend still reads correctly without colour. */}
            <span
              className="legend__swatch"
              style={{ background: entry.color }}
              aria-hidden="true"
            />
            <span>{entry.label}</span>
            {entry.value !== null ? (
              <code className="legend__value">{String(entry.value)}</code>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A descriptor carrying only what the map needs to frame a boundary. */
function syntheticBoundaryLayer(regionId: string, rings: [number, number][][]): LayerDescriptor {
  let w = 180, s = 90, e = -180, n = -90;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      w = Math.min(w, lon); e = Math.max(e, lon);
      s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  return {
    id: `${regionId}:extent`, kind: 'district extent', representation: 'geojson',
    href: '', tileJsonHref: null, bounds: [w, s, e, n],
    minZoom: null, maxZoom: null, opacity: 1, legend: [], attributions: [],
    checksum: null, contentVersion: null, availableOffline: true,
  };
}

/* Map palette.
 *
 * Kept here as named constants rather than inline hex because MapLibre paints
 * on a canvas and cannot read the stylesheet's custom properties — so these are
 * the one place in the app where the theme has to be restated, and restating it
 * in one block is the only way it stays in step with daoism.css. */
const MAP = {
  water: '#0d0f11',
  land: '#141719',
  landEdge: '#1e2225',
  coast: 'rgba(154, 167, 158, 0.38)',
  graticule: 'rgba(154, 167, 158, 0.12)',
  /* Neutral, not a signal colour. §2.1 reserves the indicator accents for that
     indicator's own data, and a district extent is not a measurement — painting
     it in the water accent would imply it was one. */
  district: '#edefea',
} as const;

const FIT_PADDING = 34;

function MapCanvas({ layer, regionId, syntheticLayers, quiet = false }: {
  layer: LayerDescriptor; regionId: string; syntheticLayers: boolean;
  /** Suppress the raster-absence callout when the caller already states it —
   *  two consecutive notices saying the same thing read as a fault. */
  quiet?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [rasterMissing, setRasterMissing] = useState(false);

  useEffect(() => {
    let disposed = false;
    let map: { remove: () => void } | null = null;
    let observer: ResizeObserver | null = null;

    (async () => {
      try {
        const maplibre = await import('maplibre-gl');
        if (disposed || !ref.current) return;

        // No remote basemap by design: the offline gate forbids one, and a
        // missing tile server would otherwise leave a blank frame with the
        // analytical layer invisible on top of it.
        const instance = new maplibre.Map({
          container: ref.current,
          style: { version: 8, sources: {}, layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': MAP.water } },
          ] },
          bounds: layer.bounds,
          fitBoundsOptions: { padding: FIT_PADDING },
          attributionControl: false,
          // The accessible table below is the keyboard path; leaving the canvas
          // in the tab order would trap users in a control with no equivalent.
          keyboard: false,
        });
        map = instance;

        /* Re-fit whenever the container changes size.
         *
         * `bounds` at construction is a one-shot: MapLibre turns it into a
         * centre and a zoom against whatever the container measured at that
         * instant, and keeps them forever after. The drawer this map lives in
         * is user-resizable, so dragging it wider left the zoom untouched and
         * simply revealed more empty sea — the district stayed the same forty
         * pixels it had been in a half-width panel, which is what made this
         * read as "no feature, nothing".
         *
         * Re-fitting on resize also covers the case where the container has not
         * been laid out yet at construction, which produces the same symptom
         * from a different cause. */
        observer = new ResizeObserver(() => {
          if (disposed) return;
          instance.resize();
          instance.fitBounds(layer.bounds, { padding: FIT_PADDING, animate: false });
        });
        observer.observe(ref.current);

        instance.on('load', () => {
          if (disposed) return;
          instance.resize();
          instance.fitBounds(layer.bounds, { padding: FIT_PADDING, animate: false });

          /* Land and coastline context. Without it the district floats on a flat
             background and reads as a broken map rather than a located one.
             Natural Earth is public domain and is bundled into the build, so
             this costs no runtime network access — the offline gate holds.
             Provenance: data/metadata/basemap/natural-earth.provenance.json */
          instance.addSource('ne-land', { type: 'geojson', data: `${import.meta.env.BASE_URL}basemap/ne_110m_land.geojson` });
          instance.addLayer({
            id: 'ne-land-fill', type: 'fill', source: 'ne-land',
            paint: { 'fill-color': MAP.land, 'fill-outline-color': MAP.landEdge },
          });
          instance.addSource('ne-coast', { type: 'geojson', data: `${import.meta.env.BASE_URL}basemap/ne_50m_coastline.geojson` });
          instance.addLayer({
            id: 'ne-coast-line', type: 'line', source: 'ne-coast',
            paint: { 'line-color': MAP.coast, 'line-width': 1 },
          });

          /* The district boundary, drawn from the validated geometry we already
             hold. This is the part that is always real — the raster below is a
             demo asset that may not be packaged, and a map showing nothing at
             all because one image 404'd was worse than useless. */
          /* Graticule, stepped to the extent rather than fixed at one degree.
             A district is roughly a third of a degree across, so a 1° grid put
             at most one line on screen — or none — and gave the frame no sense
             of scale at all. This picks the largest 1-2-5 step that still draws
             a handful of lines across whatever is being shown, which is what
             makes the grid read as a measure instead of decoration. */
          const [gw, gs, ge, gn] = layer.bounds;
          const span = Math.max(ge - gw, gn - gs) || 1;
          const raw = span / 4;
          const magnitude = 10 ** Math.floor(Math.log10(raw));
          const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
          const pad = span;
          const lines: { type: 'Feature'; properties: Record<string, never>;
            geometry: { type: 'LineString'; coordinates: number[][] } }[] = [];
          for (let lon = Math.ceil((gw - pad) / step) * step; lon <= ge + pad; lon += step) {
            lines.push({ type: 'Feature', properties: {}, geometry: {
              type: 'LineString', coordinates: [[lon, gs - pad], [lon, gn + pad]] } } as never);
          }
          for (let lat = Math.ceil((gs - pad) / step) * step; lat <= gn + pad; lat += step) {
            lines.push({ type: 'Feature', properties: {}, geometry: {
              type: 'LineString', coordinates: [[gw - pad, lat], [ge + pad, lat]] } } as never);
          }
          instance.addSource('graticule', {
            type: 'geojson', data: { type: 'FeatureCollection', features: lines },
          });
          instance.addLayer({
            id: 'graticule-line', type: 'line', source: 'graticule',
            paint: { 'line-color': MAP.graticule, 'line-width': 1 },
          });

          const shape = shapeForRegion(regionId, layer.bounds);
          if (shape) {
            instance.addSource('sparc-district', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: shape.rings },
              },
            });
            /* The district is the subject of the frame, so it is the one thing
               drawn in the house accent — everything else on this map is
               context and stays grey. Three passes: a soft halo so the shape
               separates from the land under it, a fill, then a crisp edge. */
            instance.addLayer({
              id: 'sparc-district-halo',
              type: 'line',
              source: 'sparc-district',
              paint: { 'line-color': MAP.district, 'line-width': 8, 'line-opacity': 0.12, 'line-blur': 5 },
            });
            instance.addLayer({
              id: 'sparc-district-fill',
              type: 'fill',
              source: 'sparc-district',
              paint: { 'fill-color': MAP.district, 'fill-opacity': 0.09 },
            });
            instance.addLayer({
              id: 'sparc-district-line',
              type: 'line',
              source: 'sparc-district',
              paint: {
                'line-color': MAP.district,
                'line-width': 1.4,
                // Dashed when the outline is a bounding box rather than a
                // surveyed boundary, so the two never look alike.
                ...(shape.approximate ? { 'line-dasharray': [3, 2] } : {}),
              },
            });
          }

          /* Synthetic descriptors point at demo assets that were never
             committed. Probing for one produces a guaranteed 404 in the console
             of every demo — an error that looks like a defect, caused by us
             asking for something we already know is not there. So when the
             payload is synthetic we state the absence instead of discovering
             it. */
          if (syntheticLayers) { setRasterMissing(true); return; }

          // The analytical raster is optional and often absent in a demo build.
          if (isSafeAppHref(layer.href) && layer.representation === 'image') {
            const [w, s, e, n] = layer.bounds;
            fetch(layer.href, { method: 'HEAD' })
              .then((r) => {
                if (disposed || !r.ok) {
                  if (!r.ok) setRasterMissing(true);
                  return;
                }
                instance.addSource('sparc-layer', {
                  type: 'image',
                  url: layer.href,
                  coordinates: [[w, n], [e, n], [e, s], [w, s]],
                });
                instance.addLayer({
                  id: 'sparc-layer',
                  type: 'raster',
                  source: 'sparc-layer',
                  paint: { 'raster-opacity': layer.opacity ?? 1 },
                });
              })
              .catch(() => setRasterMissing(true));
          }
        });

        instance.on('error', (event: { error?: { message?: string } }) => {
          const msg = event?.error?.message ?? '';
          // A missing raster is expected and already reported separately; do not
          // escalate it into "the map is broken", because the map is fine and
          // the boundary on it is real.
          if (/404|Not Found/i.test(msg)) { setRasterMissing(true); return; }
          setFailed(msg || 'The map could not be drawn.');
        });
      } catch (err) {
        setFailed(`The map renderer failed to load: ${String((err as Error)?.message ?? err)}`);
      }
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      map?.remove();
    };
  }, [layer, regionId, syntheticLayers]);

  return (
    <>
      <div ref={ref} className="map" role="img" aria-label={`Map preview of ${layer.id}. The table below carries the same information.`} />
      {rasterMissing && !quiet ? (
        <Callout tone="info" title="Analytical raster not packaged in this build">
          <p>
            The district boundary above is the validated geometry. The
            change-detection image it would be draped with is a demo asset that
            is not committed, so only the boundary is drawn — the extent, legend
            and attribution below remain authoritative.
          </p>
        </Callout>
      ) : null}
      {failed ? (
        <Callout tone="warn" title="Map preview unavailable">
          <p>{failed}</p>
          <p>The layer's extent, legend and attribution are listed below and remain authoritative.</p>
        </Callout>
      ) : null}
    </>
  );
}

export function LayerView({ layers, regionId, syntheticLayers = false }: {
  layers: LayerDescriptor[]; regionId: string; syntheticLayers?: boolean;
}) {
  const headingId = useId();
  const [webgl] = useState(webglAvailable);

  /* No analytical raster does not mean nothing to show. The district boundary
     always exists, so the map renders regardless — previously an empty `layers`
     array produced a text callout and no visual at all, which is what every
     generated district got. */
  if (!layers.length) {
    const shape = shapeForRegion(regionId);
    return (
      <section className="panel" aria-labelledby={headingId}>
        <h3 id={headingId}>Spatial extent</h3>
        {webgl && shape ? (
          <div className="layer__map">
            <MapCanvas
              layer={syntheticBoundaryLayer(regionId, shape.rings)}
              regionId={regionId}
              syntheticLayers
              quiet
            />
          </div>
        ) : null}
        <Callout tone="info" title="No analytical layer is packaged for this result">
          <p>
            {shape?.approximate
              ? 'The outline is this district’s bounding box, drawn dashed because it is an approximation rather than a surveyed boundary.'
              : 'The outline is the validated district boundary.'}{' '}
            No change-detection raster exists for it, so there is nothing to drape
            over the shape. The metric, quality evidence and provenance are
            unaffected.
          </p>
        </Callout>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby={headingId}>
      <h3 id={headingId}>Spatial layer</h3>

      {layers.map((layer) => (
        <article key={layer.id} className="layer">
          <header className="layer__head">
            <h4 className="layer__title">{layer.kind}</h4>
            <code className="layer__id">{layer.id}</code>
          </header>

          {webgl ? (
            <div className="layer__map">
              <MapCanvas
                layer={layer}
                regionId={regionId}
                syntheticLayers={syntheticLayers}
              />
              <p className="hint">
                The map is an optional preview. Everything it shows is also in the
                table below, which is the accessible and offline path.
              </p>
            </div>
          ) : (
            <Callout tone="info" title="WebGL is unavailable — using the accessible layer view">
              <p>
                The map preview needs WebGL. The extent, legend and attribution
                below carry the same information and are the supported path for
                the offline release.
              </p>
            </Callout>
          )}

          <BoundsTable layer={layer} />
          <Legend layer={layer} />

          <div className="layer__attrib">
            <h4 className="legend__title">Attribution</h4>
            <ul>
              {layer.attributions.map((a) => (
                <li key={a.label}>
                  {a.url ? (
                    <a href={a.url} rel="noreferrer noopener" target="_blank">{a.label}</a>
                  ) : (
                    a.label
                  )}
                </li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </section>
  );
}
