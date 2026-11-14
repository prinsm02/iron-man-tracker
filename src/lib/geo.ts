// Pure maths for GPS tracking. No React Native imports, so it can be unit tested with plain Node.

export type Sport = 'run' | 'bike' | 'swim_open' | 'swim_pool';

export interface Fix {
  t: number; // ms epoch
  lat: number;
  lon: number;
  alt: number | null;
  acc: number | null; // horizontal accuracy in metres
  speed: number | null; // m/s from the GPS chip, may be null or -1
}

export interface TrackPoint extends Fix {
  moving: boolean; // false = auto-paused or manually paused; excluded from distance
}

export const SPORT_LABEL: Record<Sport, string> = {
  run: 'Run',
  bike: 'Bike',
  swim_open: 'Open-water swim',
  swim_pool: 'Pool swim',
};

// Max believable speed per sport (m/s). Anything faster between two fixes is a GPS jump.
export const MAX_SPEED: Record<Sport, number> = {
  run: 9, // 32 km/h
  bike: 25, // 90 km/h
  swim_open: 3.5,
  swim_pool: 3.5,
};

// Below this speed for AUTO_PAUSE_MS the session auto-pauses.
export const PAUSE_SPEED: Record<Sport, number> = {
  run: 0.8,
  bike: 1.5,
  swim_open: 0.15,
  swim_pool: 0,
};
export const AUTO_PAUSE_MS = 6000;

export const MAX_ACCURACY_M = 25;

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Decide whether a new fix is good enough to keep, given the last kept fix. */
export function acceptFix(prev: Fix | null, next: Fix, sport: Sport): boolean {
  if (next.acc != null && next.acc > MAX_ACCURACY_M) return false;
  if (!prev) return true;
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return false;
  const v = haversine(prev, next) / dt;
  return v <= MAX_SPEED[sport];
}

/** Light smoothing: blend the new fix towards the previous one. Stronger for swims (noisy, phone near water). */
export function smooth(prev: Fix | null, next: Fix, sport: Sport): Fix {
  if (!prev) return next;
  const k = sport === 'swim_open' ? 0.5 : 0.8; // weight of the new fix
  return {
    ...next,
    lat: prev.lat + (next.lat - prev.lat) * k,
    lon: prev.lon + (next.lon - prev.lon) * k,
  };
}

/** Auto-pause state machine. Returns whether the athlete counts as moving at this fix. */
export class AutoPause {
  private slowSince: number | null = null;
  moving = true;
  private sport: Sport;
  private enabled: boolean;
  constructor(sport: Sport, enabled: boolean) {
    this.sport = sport;
    this.enabled = enabled;
  }
  update(prev: Fix | null, next: Fix): boolean {
    if (!this.enabled || !prev) return (this.moving = true);
    const dt = (next.t - prev.t) / 1000;
    const derived = dt > 0 ? haversine(prev, next) / dt : 0;
    const v = next.speed != null && next.speed >= 0 ? next.speed : derived;
    const threshold = PAUSE_SPEED[this.sport];
    if (v < threshold) {
      if (this.slowSince == null) this.slowSince = prev.t;
      if (next.t - this.slowSince >= AUTO_PAUSE_MS) this.moving = false;
    } else {
      this.slowSince = null;
      this.moving = true;
    }
    return this.moving;
  }
}

export interface Split {
  index: number; // 1-based
  distanceM: number; // usually the split length, last one may be partial
  durationS: number;
}

export interface Stats {
  distanceM: number;
  movingS: number;
  elapsedS: number;
  elevGainM: number;
  elevLossM: number;
  maxSpeedMs: number;
  avgSpeedMs: number;
  splits: Split[];
}

/**
 * Compute totals from the point list. Distance and moving time only count segments where both
 * ends are moving. splitM = split length (1000 for run/bike km splits, 100 for swims).
 */
export function computeStats(points: TrackPoint[], splitM = 1000): Stats {
  let distanceM = 0;
  let movingS = 0;
  let elevGainM = 0;
  let elevLossM = 0;
  let maxSpeedMs = 0;
  const splits: Split[] = [];
  let splitDist = 0;
  let splitTime = 0;
  let lastAlt: number | null = null;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!(a.moving && b.moving)) continue;
    const d = haversine(a, b);
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) continue;
    distanceM += d;
    movingS += dt;
    const segV = d / dt;
    // Max speed from segments of at least 3 s, to avoid single-fix spikes.
    if (dt >= 3 && segV > maxSpeedMs) maxSpeedMs = segV;
    if (b.alt != null) {
      if (lastAlt != null) {
        const dz = b.alt - lastAlt;
        // 2 m dead band against GPS altitude noise
        if (dz >= 2) { elevGainM += dz; lastAlt = b.alt; }
        else if (dz <= -2) { elevLossM -= dz; lastAlt = b.alt; }
      } else lastAlt = b.alt;
    }
    // splits: interpolate the crossing time
    let remainingD = d;
    let remainingT = dt;
    while (splitDist + remainingD >= splitM) {
      const need = splitM - splitDist;
      const frac = need / remainingD;
      splitTime += remainingT * frac;
      splits.push({ index: splits.length + 1, distanceM: splitM, durationS: splitTime });
      remainingD -= need;
      remainingT -= remainingT * frac;
      splitDist = 0;
      splitTime = 0;
    }
    splitDist += remainingD;
    splitTime += remainingT;
  }
  if (splitDist > 1) splits.push({ index: splits.length + 1, distanceM: splitDist, durationS: splitTime });

  const elapsedS = points.length > 1 ? (points[points.length - 1].t - points[0].t) / 1000 : 0;
  return {
    distanceM,
    movingS,
    elapsedS,
    elevGainM,
    elevLossM,
    maxSpeedMs,
    avgSpeedMs: movingS > 0 ? distanceM / movingS : 0,
    splits,
  };
}

// ---------- formatting ----------

export function fmtDuration(s: number): string {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return `${h}:${mm}:${ss}`;
}

/** min:sec per `per` metres (1000 for km, 100 for swim). */
export function fmtPace(speedMs: number, per = 1000): string {
  if (!speedMs || speedMs <= 0.05) return '--:--';
  const secs = Math.round(per / speedMs);
  if (secs > 59 * 60) return '--:--';
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export const kmh = (ms: number) => ms * 3.6;
export const km = (m: number) => m / 1000;

/**
 * Rough calorie estimate. Run: ~1 kcal per kg per km plus climb. Bike and swim: MET x kg x hours,
 * with the bike MET picked from average speed.
 */
export function estimateKcal(sport: Sport, kg: number, distanceM: number, movingS: number, elevGainM = 0): number {
  const h = movingS / 3600;
  if (sport === 'run') return Math.round(kg * (distanceM / 1000) * 1.0 + kg * elevGainM * 0.01);
  if (sport === 'bike') {
    const v = h > 0 ? distanceM / 1000 / h : 0;
    const met = v < 16 ? 4 : v < 19 ? 6.8 : v < 22 ? 8 : v < 25 ? 10 : 12;
    return Math.round(met * kg * h);
  }
  return Math.round(8 * kg * h); // swimming, moderate effort
}
