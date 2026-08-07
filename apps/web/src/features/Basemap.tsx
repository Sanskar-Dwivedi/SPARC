/* The map, as the whole canvas.
 *
 * ── why the previous one looked empty ────────────────────────────────────────
 * Two mistakes, both mine. The land fill was #101720 against a #070A0F sea —
 * two colours nobody can tell apart — so the basemap was rendering the whole
 * time and simply could not be seen. And the camera was fitted to the district
 * plus 28% padding, which at district scale is about half a degree: the bundled
 * Natural Earth data is generalised to 1:50M, so at that crop there is not a
 * single coastline vertex in frame. A correct map of nothing.
 *
 * Both are fixed by the same idea: show the district *in its region*. The
 * camera never frames tighter than MIN_SPAN degrees, which is the scale the
 * bundled geometry is actually good at, and land now sits four stops above the
 * sea. The district is small in frame and that is right — it is one district,
 * and the picture should say so.
 *
 * ── interaction ──────────────────────────────────────────────────────────────
 * Drag to pan, scroll to zoom, double-click to fit. The pointer position is
 * reported back as real coordinates. None of that is decoration: a screening
 * map you cannot move around is a picture, and the first question anyone asks
 * of a district outline is "where is that, exactly".
 */

import { useEffect, useRef } from 'react';
import type { LonLat } from '../globe/overlay';
import { ATTRIBUTION, rasterBasemap, tilesAvailable } from './tiles';

/* Sea to land is a real step, not a shade. Every layer above it is a hairline
   so the district stays the only solid thing on the canvas. */
const PALETTE = {
  sea: '#04070d',
  land: '#0f1b26',
  landHi: '#14232f',
  state: 'rgba(126, 170, 205, 0.16)',
  coast: 'rgba(140, 196, 235, 0.55)',
  grid: 'rgba(126, 170, 205, 0.07)',
} as const;

/** Never frame tighter than this. Below it the bundled geometry has nothing. */
const MIN_SPAN_DEG = 4.2;

/* The colour the district settles to at the baseline end of the scrub. Pulling
   toward a cold slate as you travel back, and up to the live signal colour as
   you return, is what makes moving the handle read as moving through time. */
const PAST = '#4a6474';

function mixHex(from: string, to: string, k: number): string {
  const parse = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const c = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/* Every paint value the scrubber touches, derived from one number.
 *
 * `phase` is the handle's position between the two observations, not the ratio
 * of the two measured values. That distinction is the whole fix: districts
 * change by a few percent, so a magnitude ratio spans 0.97 → 1.00 and the map
 * appeared frozen. Position always spans the full range, so the scene always
 * responds — and the magnitude is not lost, because the readout beside it
 * prints the measured figure to two decimals. */
function paintFor(signal: string, phase: number, approximate: boolean) {
  const k = Math.min(Math.max(phase, 0), 1);
  const tone = mixHex(PAST, signal, k);
  return {
    tone,
    halo: { width: 5 + k * 17, opacity: 0.05 + k * 0.26 },
    fill: 0.06 + k * 0.38,
    edge: 1 + k * 1.8,
    // The basemap drains to near-greyscale at the baseline end and returns to
    // full colour at the comparison end, so the whole frame moves, not a shape.
    raster: { opacity: 0.62 + k * 0.34, saturation: -0.85 + k * 0.85 },
  };
}

export interface BasemapHandle {
  fit: () => void;
}

export function Basemap({
  polygons,
  focusBounds,
  approximate,
  signal,
  /** 0..1 — where the time handle sits between the two observations. */
  phase,
  onHover,
  onReady,
}: {
  polygons: LonLat[][][];
  focusBounds: [number, number, number, number];
  approximate: boolean;
  signal: string;
  phase: number;
  onHover?: (pos: { lat: number; lon: number } | null) => void;
  onReady?: (handle: BasemapHandle) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const credit = useRef<HTMLParagraphElement | null>(null);
  const api = useRef<{
    setPaint: (signal: string, phase: number, approximate: boolean) => void;
  } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let map: { remove: () => void } | null = null;

    (async () => {
      const [maplibre, online] = await Promise.all([import('maplibre-gl'), tilesAvailable()]);
      if (disposed || !host.current) return;

      /* The camera frames the district's core, not its full legal extent —
         overlay.ts decides which parts count. Every part is still drawn. */
      const [w, s, e, n] = focusBounds;
      const cx = (w + e) / 2;
      const cy = (s + n) / 2;
      /* How wide to frame depends on what is underneath. Real tiles are legible
         all the way down, so the district gets a close crop with a little
         context around it. The bundled vectors are 1:50M and have nothing to
         show at that scale, so offline the frame opens out to MIN_SPAN_DEG —
         which is the fix that turned a blank rectangle into a map. */
      const halfSpan = Math.max((e - w) / 2, (n - s) / 2);
      const half = online ? halfSpan * 1.35 : Math.max(halfSpan, MIN_SPAN_DEG / 2);
      const bounds: [number, number, number, number] = [cx - half, cy - half, cx + half, cy + half];

      const instance = new maplibre.Map({
        container: host.current,
        style: { version: 8, sources: {}, layers: [
          { id: 'sea', type: 'background', paint: { 'background-color': PALETTE.sea } },
        ] },
        bounds,
        fitBoundsOptions: { padding: 40 },
        attributionControl: false,
        keyboard: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchZoomRotate: true,
      });
      map = instance;
      const B = import.meta.env.BASE_URL;

      const P = paintFor(signal, phase, approximate);

      instance.on('load', () => {
        if (disposed) return;
        instance.resize();
        instance.fitBounds(bounds, { padding: 40, animate: false });

        if (credit.current) credit.current.hidden = !online;
        if (online) {
          /* Real streets, towns and water names. This is the layer that lets a
             reader answer "where is that" without leaving the product — the
             bundled vectors know a coastline and a state border and nothing
             else. Dark, because the interface floats white readouts over it. */
          const raster = rasterBasemap('dark');
          instance.addSource('tiles', raster.source as never);
          instance.addLayer({
            id: 'tiles', type: 'raster', source: 'tiles',
            paint: { 'raster-opacity': P.raster.opacity, 'raster-saturation': P.raster.saturation },
          });
        } else {
          /* Unplugged. The offline gate requires this path to keep working, so
             the bundled Natural Earth vectors stand in — less to read, but the
             district and every figure attached to it are unchanged. */
          instance.addSource('land', { type: 'geojson', data: `${B}basemap/ne_110m_land.geojson` });
          instance.addLayer({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': PALETTE.land } });

          instance.addSource('states', { type: 'geojson', data: `${B}basemap/india-admin1.geojson` });
          instance.addLayer({ id: 'states-fill', type: 'fill', source: 'states', paint: { 'fill-color': PALETTE.landHi } });
          instance.addLayer({ id: 'states-line', type: 'line', source: 'states', paint: { 'line-color': PALETTE.state, 'line-width': 1 } });

          instance.addSource('coast', { type: 'geojson', data: `${B}basemap/ne_50m_coastline.geojson` });
          instance.addLayer({ id: 'coast', type: 'line', source: 'coast', paint: { 'line-color': PALETTE.coast, 'line-width': 1.1 } });

          // A one-degree grid gives the empty frame a sense of scale. With real
          // tiles underneath it would just be clutter over the street network.
          const lines: unknown[] = [];
          for (let lon = Math.floor(cx - half) - 2; lon <= Math.ceil(cx + half) + 2; lon += 1) {
            lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lon, cy - half - 4], [lon, cy + half + 4]] } });
          }
          for (let lat = Math.floor(cy - half) - 2; lat <= Math.ceil(cy + half) + 2; lat += 1) {
            lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[cx - half - 4, lat], [cx + half + 4, lat]] } });
          }
          instance.addSource('grid', { type: 'geojson', data: { type: 'FeatureCollection', features: lines } as never });
          instance.addLayer({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': PALETTE.grid, 'line-width': 1 } });
        }

        instance.addSource('district', {
          type: 'geojson',
          data: {
            type: 'Feature', properties: {},
            geometry: { type: 'MultiPolygon', coordinates: polygons },
          } as never,
        });
        /* Halo, fill, edge. The halo is what makes a small shape findable on a
           large frame without inflating the shape itself, which would misstate
           the area the numbers cover. */
        instance.addLayer({ id: 'd-halo', type: 'line', source: 'district', paint: { 'line-color': P.tone, 'line-width': P.halo.width, 'line-opacity': P.halo.opacity, 'line-blur': 40 } });
        instance.addLayer({ id: 'd-fill', type: 'fill', source: 'district', paint: { 'fill-color': P.tone, 'fill-opacity': P.fill } });
        instance.addLayer({
          id: 'd-edge', type: 'line', source: 'district',
          paint: {
            'line-color': P.tone, 'line-width': P.edge, 'line-opacity': 1,
            // Dashed whenever the outline is an envelope, never a survey.
            ...(approximate ? { 'line-dasharray': [3, 2] } : {}),
          },
        });

        /* Repaint in place rather than rebuilding the map when the indicator or
           the time position changes — a rebuild would throw away the reader's
           pan and zoom every time they moved the scrubber. */
        api.current = {
          /* Everything about the district moves with the scrubber, not just its
             fill: the glow spreads, the edge thickens and the tiles underneath
             brighten. One property changing by a few percent was technically a
             reaction and visually nothing — dragging time has to *look* like
             something is happening to the place. */
          setPaint: (sig, ph, approx) => {
            if (disposed) return;
            const q = paintFor(sig, ph, approx);
            instance.setPaintProperty('d-halo', 'line-color', q.tone);
            instance.setPaintProperty('d-halo', 'line-width', q.halo.width);
            instance.setPaintProperty('d-halo', 'line-opacity', q.halo.opacity);
            instance.setPaintProperty('d-fill', 'fill-color', q.tone);
            instance.setPaintProperty('d-fill', 'fill-opacity', q.fill);
            instance.setPaintProperty('d-edge', 'line-color', q.tone);
            instance.setPaintProperty('d-edge', 'line-width', q.edge);
            instance.setPaintProperty('d-edge', 'line-dasharray', approx ? [3, 2] : [1]);
            if (instance.getLayer('tiles')) {
              instance.setPaintProperty('tiles', 'raster-opacity', q.raster.opacity);
              instance.setPaintProperty('tiles', 'raster-saturation', q.raster.saturation);
            }
          },
        };
        onReady?.({ fit: () => instance.fitBounds(bounds, { padding: 40, duration: 600 }) });
      });

      if (onHover) {
        instance.on('mousemove', (ev: { lngLat: { lat: number; lng: number } }) =>
          onHover({ lat: ev.lngLat.lat, lon: ev.lngLat.lng }));
        instance.on('mouseout', () => onHover(null));
      }
      instance.on('dblclick', () => instance.fitBounds(bounds, { padding: 40, duration: 600 }));

      const ro = new ResizeObserver(() => { if (!disposed) instance.resize(); });
      ro.observe(host.current);
      const stop = () => ro.disconnect();
      map = { remove: () => { stop(); instance.remove(); } };
    })();

    return () => { disposed = true; api.current = null; map?.remove(); };
    // Rings identity is stable per region; signal/weight are pushed through the
    // imperative handle below instead of remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygons, focusBounds, approximate]);

  useEffect(() => {
    api.current?.setPaint(signal, phase, approximate);
  }, [signal, phase, approximate]);

  return (
    <>
      <div className="atlas__map" ref={host} />
      {/* Rendered by the map itself rather than left to each caller: OSM is
          ODbL and CARTO requires credit, so this must not be something a screen
          can forget to include. */}
      <p className="atlas__attrib" ref={credit}>{ATTRIBUTION}</p>
    </>
  );
}
