/* Raster basemap tiles, with a bundled fallback.
 *
 * ── the tension this file resolves ───────────────────────────────────────────
 * A real labelled basemap — streets, towns, the name of the lake the district
 * sits on — is worth a great deal when the question is "where is this and what
 * is around it". The bundled Natural Earth vectors cannot answer that: at
 * 1:50M they know a coastline and a state border and nothing else.
 *
 * But docs/judging-checklist.md gates on the demo running offline, and tiles
 * are a network dependency by definition. So this module does not choose one
 * or the other. It probes once for a single tile, and every map asks the answer
 * before it builds its style:
 *
 *   · tiles reachable  → OSM raster through CARTO, labelled and familiar
 *   · tiles unreachable → the bundled vector basemap, exactly as before
 *
 * The offline gate still passes with the network unplugged, and nothing about
 * the analysis changes either way — the basemap is context, never data. The
 * district outline and every figure on top of it come from the packaged result
 * in both cases.
 *
 * ── attribution ──────────────────────────────────────────────────────────────
 * OpenStreetMap is ODbL and CARTO's basemap service requires credit. This
 * project already treats attribution as a correctness requirement rather than a
 * courtesy — see BoundaryProvenance — so ATTRIBUTION below is not optional
 * decoration and every map that switches tiles on must render it.
 */

/** Credit line required by both the data and the tile service. */
export const ATTRIBUTION = '© OpenStreetMap contributors · © CARTO';

const CARTO_HOSTS = ['a', 'b', 'c', 'd'];

function cartoTiles(style: 'voyager' | 'dark_all'): string[] {
  const path = style === 'voyager' ? 'rastertiles/voyager' : 'dark_all';
  // Multiple subdomains rather than {s}: MapLibre has no subdomain token, it
  // round-robins whatever URLs the array contains.
  return CARTO_HOSTS.map((h) => `https://${h}.basemaps.cartocdn.com/${path}/{z}/{x}/{y}@2x.png`);
}

export const TILES = {
  /** Light, labelled. For maps that sit inside a bordered panel. */
  light: cartoTiles('voyager'),
  /** Dark, labelled. For maps the interface floats white text over. */
  dark: cartoTiles('dark_all'),
} as const;

/* One probe for the whole session. Every map awaits the same promise, so
   opening three maps costs one request, and a map that mounts later than the
   first does not re-test a question already answered. */
let probe: Promise<boolean> | null = null;

export function tilesAvailable(): Promise<boolean> {
  if (probe) return probe;
  probe = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    try {
      const controller = new AbortController();
      /* Short budget on purpose. A slow probe would hold every map at a blank
         frame waiting to find out which basemap to draw; failing fast to the
         bundled vectors shows something correct immediately. */
      const timer = setTimeout(() => controller.abort(), 2500);
      // Tile 0/0/0 is one small image and is cached by the browser afterwards.
      const r = await fetch('https://a.basemaps.cartocdn.com/rastertiles/voyager/0/0/0@2x.png', {
        method: 'GET', mode: 'cors', cache: 'force-cache', signal: controller.signal,
      });
      clearTimeout(timer);
      return r.ok;
    } catch {
      return false;
    }
  })();
  return probe;
}

/** Raster source + layer to drop into a MapLibre style. */
export function rasterBasemap(theme: 'light' | 'dark') {
  return {
    source: {
      type: 'raster' as const,
      tiles: [...TILES[theme]],
      tileSize: 256,
      attribution: ATTRIBUTION,
      maxzoom: 20,
    },
    /* Dark Matter is already dark, but it is lighter than this interface's
       background; a slight knock-down keeps the district glow dominant without
       making the labels unreadable. */
    paint: theme === 'dark'
      ? { 'raster-opacity': 0.92, 'raster-brightness-max': 0.9 }
      : { 'raster-opacity': 1 },
  };
}
