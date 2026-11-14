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

/** Fixed display order everywhere: Run, Bike, Swim, Pool. */
export const SPORT_ORDER: Sport[] = ['run', 'bike', 'swim_open', 'swim_pool'];
export const ordered = (list: Sport[]) => SPORT_ORDER.filter((s) => list.includes(s));

export const SPORT_LABEL: Record<Sport, string> = {
  run: 'Run',
  bike: 'Bike',
  swim_open: 'Swim',
  swim_pool: 'Swim (pool)',
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

export const MAX_ACCURACY_M = 20;

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

// ---------- live GPS filter ----------
// Why: GPS wanders 5-30 m while the chip locks on and drifts a few metres while you stand still.
// Counting that wander made a few steps read as 15-20 km/h. The filter below:
//  1. waits for a solid lock (3 fixes in a row at <= 15 m) before anything counts,
//  2. only moves the "anchor" once you have really moved further than the GPS error,
//  3. auto-pauses after 6 s without real movement,
//  4. works out current speed from distance over the last 10 s, never from the chip's own speed.

export const GPS_READY_ACC_M = 15;
export const GPS_READY_STREAK = 3;
export const MIN_MOVE_M = 4;
export const SPEED_WINDOW_MS = 10000;

export interface FilterOut {
  point: TrackPoint; // store this point
  countedM: number; // metres added to the session (0 when the segment does not count)
  dtS: number; // seconds of the counted segment
}

export class TrackFilter {
  ready = false;
  moving = true; // false = auto-paused (or waiting to move again after a manual pause)
  private streak = 0;
  private anchor: Fix | null = null;
  private lastMoveT = 0;
  private segBreak = false;
  private cumD = 0;
  private win: { t: number; d: number }[] = [];
  private sport: Sport;
  private autoPause: boolean;

  constructor(sport: Sport, autoPause: boolean) {
    this.sport = sport;
    this.autoPause = autoPause;
  }

  /** Continue after a manual pause or an app restart: the next real movement starts a new segment. */
  breakSegment(at?: Fix) {
    if (at) { this.anchor = at; this.ready = true; }
    this.segBreak = true;
    this.win = [];
  }

  /** Feed one raw GPS fix. Returns the points to store (0, 1 or 2). */
  push(raw: Fix): FilterOut[] {
    const out: FilterOut[] = [];
    const acc = raw.acc ?? 10;
    if (acc > MAX_ACCURACY_M) {
      if (!this.ready) this.streak = 0;
      return out;
    }
    if (!this.ready || !this.anchor) {
      this.streak = acc <= GPS_READY_ACC_M ? this.streak + 1 : 0;
      if (this.streak >= GPS_READY_STREAK) {
        this.ready = true;
        this.anchor = raw;
        this.lastMoveT = raw.t;
        this.moving = true;
        this.win = [{ t: raw.t, d: this.cumD }];
        out.push({ point: { ...raw, moving: true }, countedM: 0, dtS: 0 });
      }
      return out;
    }
    const prev = this.anchor;
    const dt = (raw.t - prev.t) / 1000;
    if (dt <= 0) return out;
    const d = haversine(prev, raw);
    if (d / dt > MAX_SPEED[this.sport]) return out; // GPS jump
    const need = Math.max(MIN_MOVE_M, acc * 0.6, (prev.acc ?? 10) * 0.6);

    if (d >= need) {
      const v = d / dt;
      const realMove = !this.autoPause || v >= PAUSE_SPEED[this.sport];
      if (realMove) {
        const counts = this.moving && !this.segBreak;
        this.moving = true;
        this.segBreak = false;
        this.lastMoveT = raw.t;
        if (counts) {
          this.cumD += d;
          out.push({ point: { ...raw, moving: true }, countedM: d, dtS: dt });
        } else {
          out.push({ point: { ...raw, moving: true }, countedM: 0, dtS: 0 });
        }
        this.win.push({ t: raw.t, d: this.cumD });
        while (this.win.length > 2 && raw.t - this.win[1].t > SPEED_WINDOW_MS) this.win.shift();
        this.anchor = raw;
        return out;
      }
      // slow creep (e.g. walking the bike): move the anchor so drift cannot pile up, but count nothing
      this.anchor = raw;
    }
    if (this.autoPause && this.moving && raw.t - this.lastMoveT >= AUTO_PAUSE_MS) {
      this.moving = false;
      this.win = [];
      out.push({ point: { ...this.anchor, t: raw.t, moving: false }, countedM: 0, dtS: 0 });
    }
    return out;
  }

  /** Current speed in m/s from real distance over the last ~10 s. 0 when standing still. */
  speed(now: number): number {
    if (!this.moving || this.win.length < 2) return 0;
    const last = this.win[this.win.length - 1];
    if (now - last.t > 5000) return 0;
    let first = this.win[0];
    for (const w of this.win) if (last.t - w.t <= SPEED_WINDOW_MS) { first = w; break; }
    const dt = (last.t - first.t) / 1000;
    return dt > 0 ? (last.d - first.d) / dt : 0;
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

export interface ProfilePoint {
  km: number; // distance at the end of this bucket
  alt: number | null; // average altitude in the bucket
  speed: number; // m/s over the bucket
}

/** Distance-based series for the summary graphs: one point per `bucketM` metres of moving distance. */
export function profile(points: TrackPoint[], bucketM = 100): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  let dist = 0, bD = 0, bT = 0, altSum = 0, altN = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!(a.moving && b.moving)) continue;
    const d = haversine(a, b);
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) continue;
    dist += d; bD += d; bT += dt;
    if (b.alt != null) { altSum += b.alt; altN++; }
    if (bD >= bucketM) {
      out.push({ km: dist / 1000, alt: altN ? altSum / altN : null, speed: bD / bT });
      bD = 0; bT = 0; altSum = 0; altN = 0;
    }
  }
  if (bD > bucketM * 0.3 && bT > 0) out.push({ km: dist / 1000, alt: altN ? altSum / altN : null, speed: bD / bT });
  return out;
}
