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

export interface BasemapHandle {
  fit: () => void;
}

export function Basemap({
  rings,
  approximate,
  signal,
  /** 0..1 — how strongly the district is filled right now. */
  weight,
  onHover,
  onReady,
}: {
  rings: LonLat[][];
  approximate: boolean;
  signal: string;
  weight: number;
  onHover?: (pos: { lat: number; lon: number } | null) => void;
  onReady?: (handle: BasemapHandle) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const api = useRef<{
    setPaint: (signal: string, weight: number, approximate: boolean) => void;
  } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let map: { remove: () => void } | null = null;

    (async () => {
      const maplibre = await import('maplibre-gl');
      if (disposed || !host.current) return;

      let w = 180, s = 90, e = -180, n = -90;
      for (const ring of rings) {
        for (const [lon, lat] of ring) {
          w = Math.min(w, lon); e = Math.max(e, lon);
          s = Math.min(s, lat); n = Math.max(n, lat);
        }
      }
      const cx = (w + e) / 2;
      const cy = (s + n) / 2;
      /* Grow the frame to the scale the basemap can actually draw, keeping the
         district centred. This is the line that turned a blank rectangle into
         a map. */
      const half = Math.max((e - w) / 2, (n - s) / 2, MIN_SPAN_DEG / 2);
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

      instance.on('load', () => {
        if (disposed) return;
        instance.resize();
        instance.fitBounds(bounds, { padding: 40, animate: false });

        instance.addSource('land', { type: 'geojson', data: `${B}basemap/ne_110m_land.geojson` });
        instance.addLayer({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': PALETTE.land } });

        // Admin-1 gives the frame something a person can recognise at this scale.
        instance.addSource('states', { type: 'geojson', data: `${B}basemap/india-admin1.geojson` });
        instance.addLayer({ id: 'states-fill', type: 'fill', source: 'states', paint: { 'fill-color': PALETTE.landHi } });
        instance.addLayer({ id: 'states-line', type: 'line', source: 'states', paint: { 'line-color': PALETTE.state, 'line-width': 1 } });

        instance.addSource('coast', { type: 'geojson', data: `${B}basemap/ne_50m_coastline.geojson` });
        instance.addLayer({ id: 'coast', type: 'line', source: 'coast', paint: { 'line-color': PALETTE.coast, 'line-width': 1.1 } });

        // One-degree grid, so the frame has a sense of scale without a scalebar.
        const lines: unknown[] = [];
        for (let lon = Math.floor(cx - half) - 2; lon <= Math.ceil(cx + half) + 2; lon += 1) {
          lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lon, cy - half - 4], [lon, cy + half + 4]] } });
        }
        for (let lat = Math.floor(cy - half) - 2; lat <= Math.ceil(cy + half) + 2; lat += 1) {
          lines.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[cx - half - 4, lat], [cx + half + 4, lat]] } });
        }
        instance.addSource('grid', { type: 'geojson', data: { type: 'FeatureCollection', features: lines } as never });
        instance.addLayer({ id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': PALETTE.grid, 'line-width': 1 } });

        instance.addSource('district', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } } as never,
        });
        /* Halo, fill, edge. The halo is what makes a small shape findable on a
           large frame without inflating the shape itself, which would misstate
           the area the numbers cover. */
        instance.addLayer({ id: 'd-halo', type: 'line', source: 'district', paint: { 'line-color': signal, 'line-width': 30, 'line-opacity': 0.16, 'line-blur': 22 } });
        instance.addLayer({ id: 'd-fill', type: 'fill', source: 'district', paint: { 'fill-color': signal, 'fill-opacity': 0.15 + weight * 0.4 } });
        instance.addLayer({
          id: 'd-edge', type: 'line', source: 'district',
          paint: {
            'line-color': signal, 'line-width': 1.8, 'line-opacity': 1,
            // Dashed whenever the outline is an envelope, never a survey.
            ...(approximate ? { 'line-dasharray': [3, 2] } : {}),
          },
        });

        /* Repaint in place rather than rebuilding the map when the indicator or
           the time position changes — a rebuild would throw away the reader's
           pan and zoom every time they moved the scrubber. */
        api.current = {
          setPaint: (sig, wt, approx) => {
            if (disposed) return;
            instance.setPaintProperty('d-halo', 'line-color', sig);
            instance.setPaintProperty('d-fill', 'fill-color', sig);
            instance.setPaintProperty('d-fill', 'fill-opacity', 0.15 + wt * 0.4);
            instance.setPaintProperty('d-edge', 'line-color', sig);
            instance.setPaintProperty('d-edge', 'line-dasharray', approx ? [3, 2] : [1]);
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
  }, [rings, approximate]);

  useEffect(() => { api.current?.setPaint(signal, weight, approximate); }, [signal, weight, approximate]);

  return <div className="atlas__map" ref={host} />;
}
