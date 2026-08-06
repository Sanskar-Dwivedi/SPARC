import { useEffect, useRef, useState } from 'react';
import type { ForecastPoint, ForecastRun } from '../contract/types';
import { shapeForRegion } from '../globe/overlay';
import { Callout } from './Primitives';

type MapControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  fitBounds: () => void;
};

function pointFeature(run: ForecastRun, point: ForecastPoint) {
  return {
    type: 'Feature' as const,
    properties: {
      probability: point.probability,
      riskClass: point.riskClass,
      validAt: point.validAt,
    },
    geometry: { type: 'Point' as const, coordinates: run.region.centroid },
  };
}

function safeAppHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//');
}

export function ForecastMap({
  run,
  point,
  accent,
}: {
  run: ForecastRun;
  point: ForecastPoint;
  accent: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapControls | null>(null);
  const markerSourceRef = useRef<{ setData: (data: unknown) => void } | null>(null);
  const pointRef = useRef(point);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [failure, setFailure] = useState('');
  pointRef.current = point;

  useEffect(() => {
    let disposed = false;
    let map: { remove: () => void } | null = null;
    setStatus('loading');
    setFailure('');
    markerSourceRef.current = null;

    (async () => {
      try {
        const maplibre = await import('maplibre-gl');
        if (disposed || !hostRef.current) return;

        const instance = new maplibre.Map({
          container: hostRef.current,
          style: {
            version: 8,
            sources: {},
            layers: [{ id: 'forecast-background', type: 'background', paint: { 'background-color': '#050607' } }],
          },
          bounds: run.region.bbox,
          fitBoundsOptions: { padding: 28, maxZoom: 8 },
          attributionControl: false,
          keyboard: false,
        });
        map = instance;
        mapRef.current = {
          zoomIn: () => instance.zoomIn(),
          zoomOut: () => instance.zoomOut(),
          fitBounds: () => instance.fitBounds(run.region.bbox, { padding: 28, maxZoom: 8 }),
        };

        instance.on('load', () => {
          if (disposed) return;

          /* These are the same public-domain, bundled context layers used by
           * the existing spatial view. No remote basemap is required. */
          instance.addSource('forecast-land', {
            type: 'geojson',
            data: `${import.meta.env.BASE_URL}basemap/ne_110m_land.geojson`,
          });
          instance.addLayer({
            id: 'forecast-land-fill',
            type: 'fill',
            source: 'forecast-land',
            paint: { 'fill-color': '#141719', 'fill-outline-color': '#1e2225' },
          });
          instance.addSource('forecast-coast', {
            type: 'geojson',
            data: `${import.meta.env.BASE_URL}basemap/ne_50m_coastline.geojson`,
          });
          instance.addLayer({
            id: 'forecast-coast-line',
            type: 'line',
            source: 'forecast-coast',
            paint: { 'line-color': '#4fb6c9', 'line-opacity': 0.55, 'line-width': 0.9 },
          });

          const [west, south, east, north] = run.region.bbox;
          const graticule: unknown[] = [];
          for (let longitude = Math.floor(west) - 1; longitude <= Math.ceil(east) + 1; longitude += 1) {
            graticule.push({
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: [[longitude, south - 2], [longitude, north + 2]] },
            });
          }
          for (let latitude = Math.floor(south) - 1; latitude <= Math.ceil(north) + 1; latitude += 1) {
            graticule.push({
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: [[west - 2, latitude], [east + 2, latitude]] },
            });
          }
          instance.addSource('forecast-graticule', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: graticule },
          });
          instance.addLayer({
            id: 'forecast-graticule-line',
            type: 'line',
            source: 'forecast-graticule',
            paint: { 'line-color': '#1e2225', 'line-width': 0.6 },
          });

          const shape = shapeForRegion(run.region.id, run.region.bbox);
          if (shape) {
            instance.addSource('forecast-region', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: { approximate: shape.approximate },
                geometry: { type: 'Polygon', coordinates: shape.rings },
              },
            });
            instance.addLayer({
              id: 'forecast-region-fill',
              type: 'fill',
              source: 'forecast-region',
              paint: { 'fill-color': accent, 'fill-opacity': 0.24 },
            });
            instance.addLayer({
              id: 'forecast-region-line',
              type: 'line',
              source: 'forecast-region',
              paint: {
                'line-color': accent,
                'line-width': 1.8,
                ...(shape.approximate ? { 'line-dasharray': [2, 2] } : {}),
              },
            });
          }

          /* The forecast contract currently has no gridded layer for this
           * run. The marker remains at the published centroid so the map does
           * not imply unsupported sub-region precision. */
          instance.addSource('forecast-marker', {
            type: 'geojson',
            data: pointFeature(run, pointRef.current),
          });
          markerSourceRef.current = instance.getSource('forecast-marker') as unknown as {
            setData: (data: unknown) => void;
          };
          instance.addLayer({
            id: 'forecast-marker-halo',
            type: 'circle',
            source: 'forecast-marker',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['get', 'probability'], 0, 9, 1, 22],
              'circle-color': accent,
              'circle-opacity': 0.18,
            },
          });
          instance.addLayer({
            id: 'forecast-marker-dot',
            type: 'circle',
            source: 'forecast-marker',
            paint: {
              'circle-radius': 5,
              'circle-color': accent,
              'circle-stroke-color': '#edefea',
              'circle-stroke-width': 1.4,
            },
          });

          /* If a future API run publishes a local image layer, keep it as an
           * actual overlay. The current forecast pack publishes no layers, so
           * no frontend-owned pixels are substituted here. */
          const imageLayer = run.layers.find((layer) => layer.representation === 'image' && safeAppHref(layer.href));
          if (imageLayer) {
            const [layerWest, layerSouth, layerEast, layerNorth] = imageLayer.bounds;
            instance.addSource('forecast-analytical-layer', {
              type: 'image',
              url: imageLayer.href,
              coordinates: [[layerWest, layerNorth], [layerEast, layerNorth], [layerEast, layerSouth], [layerWest, layerSouth]],
            });
            instance.addLayer({
              id: 'forecast-analytical-layer',
              type: 'raster',
              source: 'forecast-analytical-layer',
              paint: { 'raster-opacity': imageLayer.opacity ?? 0.7 },
            });
          }

          setStatus('ready');
        });

        instance.on('error', (event: { error?: { message?: string } }) => {
          if (disposed) return;
          const message = event.error?.message ?? '';
          if (/404|Not Found/i.test(message)) return;
          setFailure(message || 'The map renderer reported an error.');
          setStatus('failed');
        });
      } catch (error) {
        if (disposed) return;
        setFailure(`The map renderer failed to load: ${String((error as Error)?.message ?? error)}`);
        setStatus('failed');
      }
    })();

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
      markerSourceRef.current = null;
    };
  }, [accent, run.runId, run.region.bbox, run.region.id]);

  useEffect(() => {
    markerSourceRef.current?.setData(pointFeature(run, point));
  }, [point, run]);

  return (
    <div className="forecast-map">
      <div className="forecast-map__toolbar" aria-label="Map controls">
        <span className="forecast-map__status">{status === 'ready' ? 'Interactive map' : status === 'loading' ? 'Loading map' : 'Map unavailable'}</span>
        <div className="forecast-map__controls">
          <button type="button" className="btn btn--small" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">+</button>
          <button type="button" className="btn btn--small" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">−</button>
          <button type="button" className="btn btn--small" onClick={() => mapRef.current?.fitBounds()}>Reset</button>
        </div>
      </div>
      <div
        ref={hostRef}
        className="forecast-map__canvas"
        role="img"
        aria-label={`Forecast map for ${run.region.name}. The coloured region is the published region footprint and the marker is the forecast centroid.`}
      />
      {status === 'failed' ? (
        <Callout tone="warn" title="Map preview unavailable">
          <p>{failure}</p>
          <p>The forecast chart and point values remain available above and below the map.</p>
        </Callout>
      ) : null}
      <p className="forecast-map__truth">
        The shaded {shapeForRegion(run.region.id, run.region.bbox)?.approximate ? 'bounding box' : 'region boundary'} comes from the API region metadata. The marker is the published centroid for the selected forecast point; no gridded hazard surface was included in this run.
      </p>
    </div>
  );
}
