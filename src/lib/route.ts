// Route helpers for the summary map: pace colours for the route replay, and a route name from place names.
import { haversine, type TrackPoint } from './geo.ts';

export type Tier = 'fast' | 'medium' | 'slow';
/** The user's own colours: red = fast, yellow = medium, green = slow. */
export const TIER_COLOR: Record<Tier, string> = { fast: '#ff3b3b', medium: '#ffd23f', slow: '#3ddc84' };

export interface LatLng { latitude: number; longitude: number }
export interface PaceRun { tier: Tier; coords: LatLng[] }

/** Moving points thinned to at most `max`, always keeping the first and last. */
export function thin(points: TrackPoint[], max = 400): TrackPoint[] {
  const p = points.filter((x) => x.moving);
  if (p.length <= max) return p;
  const step = (p.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => p[Math.round(i * step)]);
}

/**
 * Speed of each step between thinned points (smoothed over a few neighbours), then each step gets a tier:
 * the fastest third is 'fast', the slowest third 'slow'. Consecutive steps of the same tier join into one run,
 * so the map draws a handful of coloured lines instead of hundreds.
 */
export function paceRuns(points: TrackPoint[], max = 400): { runs: PaceRun[]; steps: { tier: Tier; to: LatLng }[] } {
  const p = thin(points, max);
  if (p.length < 2) return { runs: [], steps: [] };
  const raw: number[] = [];
  for (let i = 1; i < p.length; i++) {
    const dt = (p[i].t - p[i - 1].t) / 1000;
    raw.push(dt > 0 ? haversine(p[i - 1], p[i]) / dt : 0);
  }
  const W = 2;
  const speed = raw.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(raw.length - 1, i + W); j++) { s += raw[j]; n++; }
    return s / n;
  });
  const sorted = [...speed].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length / 3)];
  const hi = sorted[Math.floor((sorted.length * 2) / 3)];
  const tierOf = (v: number): Tier => (hi === lo ? 'medium' : v >= hi ? 'fast' : v <= lo ? 'slow' : 'medium');
  const ll = (x: TrackPoint): LatLng => ({ latitude: x.lat, longitude: x.lon });
  const steps = speed.map((v, i) => ({ tier: tierOf(v), to: ll(p[i + 1]) }));
  const runs: PaceRun[] = [];
  steps.forEach((s, i) => {
    const from = ll(p[i]);
    const last = runs[runs.length - 1];
    if (last && last.tier === s.tier) last.coords.push(s.to);
    else runs.push({ tier: s.tier, coords: [from, s.to] });
  });
  return { runs, steps };
}

/** The first `n` steps of the replay as coloured runs (the route drawn so far). */
export function runsUpTo(start: LatLng, steps: { tier: Tier; to: LatLng }[], n: number): PaceRun[] {
  const runs: PaceRun[] = [];
  let prev = start;
  for (let i = 0; i < Math.min(n, steps.length); i++) {
    const s = steps[i];
    const last = runs[runs.length - 1];
    if (last && last.tier === s.tier) last.coords.push(s.to);
    else runs.push({ tier: s.tier, coords: [prev, s.to] });
    prev = s.to;
  }
  return runs;
}

export interface Place {
  district?: string | null;
  subregion?: string | null;
  city?: string | null;
  street?: string | null;
  name?: string | null;
}

/** Points along the route to look up (start, quarter, middle, three-quarter, end). */
export function samplePoints<T>(list: T[], n = 5): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

const uniq = (xs: (string | null | undefined)[]) => {
  const out: string[] = [];
  for (const x of xs) {
    const t = (x ?? '').trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
};

/**
 * A short route name from the places along the way: suburbs ("Suburb A / Suburb B / Suburb C"),
 * or, when the whole route is in one suburb, that suburb with its main roads.
 */
export function routeName(places: Place[]): string {
  const suburbs = uniq(places.map((p) => p.district || p.subregion || p.city));
  const streets = uniq(places.map((p) => p.street));
  if (suburbs.length >= 2) return suburbs.slice(0, 4).join(' / ');
  if (suburbs.length === 1) return streets.length ? `${suburbs[0]}: ${streets.slice(0, 2).join(' / ')}` : suburbs[0];
  return streets.slice(0, 3).join(' / ');
}
