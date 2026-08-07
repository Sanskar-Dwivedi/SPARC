/* District geometry for the globe overlay.
 *
 * ── Why a uniform tint and not a false-colour raster ─────────────────────────
 * The result behind every card is *one zonal statistic per district* — a single
 * number computed over the whole polygon. Painting a varying raster inside that
 * polygon would show sub-district structure that the data does not contain, and
 * a viewer would read the texture as information. So the patch is flat: one
 * district, one value, one tint. The shape carries where; the colour carries
 * which indicator; the opacity carries how much it moved.
 *
 * That is not a compromise, it is the faithful rendering. A prettier lie would
 * be easy and would be exactly the failure this project is built to avoid.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Real districts contribute their validated boundary. Generated demo districts
 * only have a bounding box, and they are flagged so the globe can draw them
 * differently — an approximate rectangle must not pass for a surveyed outline. */

import nagpurGeo from '@validated/nagpur.geojson?raw';
import bengaluruGeo from '@validated/bengaluru-urban.geojson?raw';
import mumbaiCityGeo from '@validated/mumbai-city.geojson?raw';
/* The rest of the catalogue. These were gated and committed alongside the three
   Indian districts above but were never wired in, so every other city fell back
   to its bounding box and rendered as a dashed rectangle. They are all real
   geoBoundaries selections — Greater London's 33 boroughs, New York's five
   counties, Tokyo's 31 wards — so the only work here is reading them. */
import bhopalGeo from '@global-boundaries/bhopal.geojson?raw';
import cairoGeo from '@global-boundaries/cairo.geojson?raw';
import chennaiGeo from '@global-boundaries/chennai.geojson?raw';
import delhiGeo from '@global-boundaries/delhi.geojson?raw';
import londonGeo from '@global-boundaries/london.geojson?raw';
import mumbaiPairGeo from '@global-boundaries/mumbai.geojson?raw';
import newYorkGeo from '@global-boundaries/new-york.geojson?raw';
import reykjavikGeo from '@global-boundaries/reykjavik.geojson?raw';
import rioGeo from '@global-boundaries/rio-de-janeiro.geojson?raw';
import sydneyGeo from '@global-boundaries/sydney.geojson?raw';
import tokyoGeo from '@global-boundaries/tokyo.geojson?raw';
import washingtonGeo from '@global-boundaries/washington-dc.geojson?raw';
import { cityForRegionId } from '../catalog/cities';

/** [lon, lat] */
export type LonLat = [number, number];

export interface DistrictShape {
  /** Outer ring first, then holes. The largest part of a multi-part district. */
  rings: LonLat[][];
  /* Every part, for renderers that can draw a MultiPolygon. Greater London is
     33 separate boroughs and New York is five counties; drawing only the
     largest would show a fraction of the area the numbers cover. The globe
     keeps using `rings` because it draws one outline loop. */
  polygons: LonLat[][][];
  /* Camera bounds. Not the extent of `polygons` — see focusBoundsOf. */
  focusBounds: [number, number, number, number];
  /** True when the outline is a bounding box, not a surveyed boundary. */
  approximate: boolean;
  label: string;
}

interface GeoFeature {
  type: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

/* Parsed once. `?raw` rather than a JSON import because these files carry the
   .geojson extension, which Vite's JSON plugin does not claim. */
function parse(raw: string): GeoFeature | null {
  try { return JSON.parse(raw) as GeoFeature; } catch { return null; }
}

/* Keyed by the local part of the region id — `district:chennai` → `chennai`.
   Exact rather than substring: `district:mumbai` and `district:mumbai-city` are
   two different packs over two different areas, and a substring match would let
   one silently answer for the other. */
const REAL: Record<string, GeoFeature | null> = {
  nagpur: parse(nagpurGeo),
  'bengaluru-urban': parse(bengaluruGeo),
  'mumbai-city': parse(mumbaiCityGeo),
  // `mumbai` is the two-district union the mumbai pack actually covers, which
  // is why that pack could never use mumbai-city.geojson and drew a box.
  mumbai: parse(mumbaiPairGeo),
  bhopal: parse(bhopalGeo),
  cairo: parse(cairoGeo),
  chennai: parse(chennaiGeo),
  delhi: parse(delhiGeo),
  london: parse(londonGeo),
  'new-york': parse(newYorkGeo),
  reykjavik: parse(reykjavikGeo),
  'rio-de-janeiro': parse(rioGeo),
  sydney: parse(sydneyGeo),
  tokyo: parse(tokyoGeo),
  'washington-dc': parse(washingtonGeo),
};

/** Every part of a feature, as an array of polygons. */
function polygonsFromFeature(f: GeoFeature): LonLat[][][] {
  if (f.geometry.type === 'Polygon') return [f.geometry.coordinates as LonLat[][]];
  if (f.geometry.type === 'MultiPolygon') return f.geometry.coordinates as LonLat[][][];
  return [];
}

/** The largest part, for renderers that draw a single outline. */
function largestPart(polys: LonLat[][][]): LonLat[][] {
  return polys.reduce(
    (best, p) => ((p[0]?.length ?? 0) > (best[0]?.length ?? 0) ? p : best),
    polys[0] ?? [],
  );
}

/* Shoelace area of a ring, corrected for latitude so a part far from the
   equator is not over-weighted against one near it. Relative sizes are all
   this is used for, so the units do not matter. */
function ringArea(ring: LonLat[]): number {
  if (ring.length < 3) return 0;
  let a = 0;
  let latSum = 0;
  /* The previous edge is indexed explicitly. Writing this as the usual
     `for (let i = 0, j = n - 1; i < n; j = i += 1)` is wrong — `i += 1`
     evaluates before the assignment, so `j` ends up equal to `i` and every
     shoelace term is zero. That returned 0 for every polygon, which made the
     "largest cluster" an arbitrary one and put the camera on Izu Ōshima
     instead of Tokyo. */
  for (let i = 0; i < ring.length; i += 1) {
    const prev = ring[(i + ring.length - 1) % ring.length]!;
    const cur = ring[i]!;
    a += (prev[0] - cur[0]) * (prev[1] + cur[1]);
    latSum += cur[1];
  }
  const midLat = latSum / ring.length;
  return Math.abs(a / 2) * Math.cos((midLat * Math.PI) / 180);
}

/* Where the camera should sit, which is not the same as where the district is.
 *
 * Tokyo prefecture legally includes the Izu and Ogasawara island chains, and
 * Ogasawara is about a thousand kilometres south of the wards. Framing on the
 * full extent produced a nine-degree view in which Japan was a smudge in one
 * corner and the district was three specks — technically the correct bounds and
 * a useless picture.
 *
 * The rule is proximity, and the unit is a cluster rather than a part.
 *
 * Two earlier attempts got this wrong in opposite directions. An area-share
 * threshold could not separate the cases — Tokyo's wards are only about 82% of
 * the prefecture, so any threshold generous enough to hold New York's five
 * boroughs together also drags the Izu chain back in. Seeding from the single
 * largest part failed too: Tokyo ships as 23 separate ward polygons plus its
 * islands, so the largest *individual* part is an island, and the camera dived
 * onto a rock in the Pacific.
 *
 * What actually distinguishes the mainland is that it is a large group of parts
 * that touch each other. So: merge parts whose boxes touch into clusters, then
 * frame the cluster holding the most total area. Twenty-three contiguous wards
 * beat one big island easily, London's 33 boroughs merge into one, and an
 * island a hundred kilometres offshore stays in its own cluster and never sets
 * the zoom. Every part is still drawn — panning out finds them. */
type Box = [number, number, number, number];

/** Roughly two kilometres. Contiguous parts overlap; islands do not come close. */
const CLUSTER_MARGIN_DEG = 0.03;

function boxOf(poly: LonLat[][]): Box {
  let w = 180, s = 90, e = -180, n = -90;
  for (const ring of poly) {
    for (const [lon, lat] of ring) {
      w = Math.min(w, lon); e = Math.max(e, lon);
      s = Math.min(s, lat); n = Math.max(n, lat);
    }
  }
  return [w, s, e, n];
}

function touches(a: Box, b: Box, m: number): boolean {
  return b[0] <= a[2] + m && b[2] >= a[0] - m && b[1] <= a[3] + m && b[3] >= a[1] - m;
}

function focusBoundsOf(polygons: LonLat[][][]): Box {
  if (!polygons.length) return [0, 0, 0, 0];

  const clusters = polygons.map((poly) => ({
    box: boxOf(poly),
    area: ringArea(poly[0] ?? []),
    live: true,
  }));

  let merging = true;
  while (merging) {
    merging = false;
    for (let i = 0; i < clusters.length; i += 1) {
      const a = clusters[i]!;
      if (!a.live) continue;
      for (let j = i + 1; j < clusters.length; j += 1) {
        const b = clusters[j]!;
        if (!b.live || !touches(a.box, b.box, CLUSTER_MARGIN_DEG)) continue;
        a.box = [
          Math.min(a.box[0], b.box[0]), Math.min(a.box[1], b.box[1]),
          Math.max(a.box[2], b.box[2]), Math.max(a.box[3], b.box[3]),
        ];
        a.area += b.area;
        b.live = false;
        merging = true;
      }
    }
  }

  let best = clusters.find((c) => c.live) ?? clusters[0]!;
  for (const c of clusters) if (c.live && c.area > best.area) best = c;
  return best.box;
}

function boxRings(bbox: [number, number, number, number]): LonLat[][] {
  const [w, s, e, n] = bbox;
  return [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
}

/**
 * Resolve a region id to something the globe can draw.
 * Returns null when the region is unknown — the globe then draws nothing, which
 * is correct: an absent district is not an empty district.
 */
export function shapeForRegion(
  regionId: string,
  bbox?: [number, number, number, number],
): DistrictShape | null {
  // Real, gated geometry, matched on the exact local id.
  const local = regionId.split(':').pop() ?? regionId;
  for (const [key, feature] of Object.entries(REAL)) {
    if (!feature) continue;
    const sparcId = feature.properties.sparcRegionId as string | undefined;
    if (local !== key && sparcId !== regionId) continue;
    const polygons = polygonsFromFeature(feature);
    if (!polygons.length) continue;
    return {
      rings: largestPart(polygons),
      polygons,
      focusBounds: focusBoundsOf(polygons),
      approximate: false,
      label: (feature.properties.sparcDisplayName as string)
        ?? (feature.properties.sparcScope as string)
        ?? key,
    };
  }

  // Catalog city envelope — bounding box only and explicitly approximate.
  const city = cityForRegionId(regionId);
  if (city) {
    return {
      rings: boxRings(city.bbox),
      polygons: [boxRings(city.bbox)],
      focusBounds: city.bbox,
      approximate: true,
      label: city.name,
    };
  }

  if (bbox) {
    return {
      rings: boxRings(bbox), polygons: [boxRings(bbox)],
      focusBounds: bbox, approximate: true, label: regionId,
    };
  }
  return null;
}

/**
 * Intensity for the patch, 0..1, from the percentage change.
 * Log-compressed for the same reason the picker dials are: district-scale
 * change is usually a few percent, and a linear map renders everything
 * identically faint.
 */
export function intensityFor(percentChange: number | null): number {
  if (percentChange === null || !Number.isFinite(percentChange)) return 0.18;
  const mag = Math.min(1, Math.log10(1 + Math.abs(percentChange)) / Math.log10(31));
  return 0.2 + mag * 0.55;
}
