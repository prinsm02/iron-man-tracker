// The recording engine. The background task is defined at module scope (imported from index.ts first),
// so iOS can wake the app with new GPS fixes while the screen is locked.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Speech from 'expo-speech';
import { Pedometer } from 'expo-sensors';
import { acceptFix, smooth, AutoPause, computeStats, haversine, fmtPace, fmtDuration, kmh, estimateKcal } from '../lib/geo.ts';
import type { Fix, Sport, TrackPoint, Stats } from '../lib/geo.ts';
import { createSession, insertPoint, getPoints, setStatus, openSession, finishSession } from '../lib/db.ts';
import type { SessionMeta } from '../lib/export.ts';
import { getSettings } from '../lib/settings.ts';

export const TASK = 'ironman-location';

export type Status = 'idle' | 'recording' | 'paused';

export interface Live {
  id: string | null;
  sport: Sport;
  status: Status;
  startedAt: number;
  autoPaused: boolean;
  distanceM: number; // moving distance so far
  activeMs: number; // time spent recording and not paused
  lastSpeedMs: number;
  gpsAccuracy: number | null;
  path: { latitude: number; longitude: number }[]; // for the live map (moving points only)
  mode: 'background' | 'foreground' | 'none';
  splitM: number; // 1000 (run/bike) or 100 (swim)
  splits: number[]; // seconds for each completed km (or 100 m)
}

const blank = (): Live => ({
  id: null, sport: 'run', status: 'idle', startedAt: 0, autoPaused: false, distanceM: 0, activeMs: 0,
  lastSpeedMs: 0, gpsAccuracy: null, path: [], mode: 'none', splitM: 1000, splits: [],
});

let live: Live = blank();
let lastKept: Fix | null = null;
let lastKeptMoving = false;
let autoPause = new AutoPause('run', true);
let tickAt = 0; // wall clock of the last activeMs update
let nextCallout = 0; // metres
let splitD = 0; // metres into the current split
let splitT = 0; // seconds into the current split
let watchSub: Location.LocationSubscription | null = null;
const listeners = new Set<(l: Live) => void>();

export const getLive = () => live;
export function onLive(l: (x: Live) => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const emit = () => listeners.forEach((l) => l({ ...live }));

function calloutStep(sport: Sport): number {
  const s = getSettings();
  if (sport === 'bike') return s.voiceEveryKmBike * 1000;
  if (sport === 'run') return s.voiceEveryKmRun * 1000;
  return s.voiceEveryMSwim;
}

/** Update activeMs up to now (only counts while recording and not auto-paused). */
function tick(now = Date.now()) {
  if (live.status === 'recording' && !live.autoPaused && tickAt) live.activeMs += now - tickAt;
  tickAt = now;
}

function speak(text: string) {
  if (!getSettings().voice) return;
  try {
    Speech.speak(text, { language: 'en-GB', rate: 1.0 });
  } catch {
    // speech is optional
  }
}

function callout() {
  const sport = live.sport;
  const avg = live.activeMs > 0 ? live.distanceM / (live.activeMs / 1000) : 0;
  const t = fmtDuration(live.activeMs / 1000).replace(/^0:/, '');
  const last = live.splits[live.splits.length - 1];
  const lastTxt = last && live.sport === 'run' ? ` Last kilometre ${fmtPace(1000 / last).replace(':', ' ')}.` : '';
  if (sport === 'bike') {
    speak(`${(live.distanceM / 1000).toFixed(0)} kilometres. Time ${t}. Average ${kmh(avg).toFixed(1)} k p h.`);
  } else if (sport === 'run') {
    speak(`${(live.distanceM / 1000).toFixed(0)} kilometres. Time ${t}. Average pace ${fmtPace(avg).replace(':', ' ')}.${lastTxt}`);
  } else {
    speak(`${Math.round(live.distanceM)} metres. Time ${t}. Pace ${fmtPace(avg, 100).replace(':', ' ')} per hundred.`);
  }
}

/** Handle new raw fixes, from the background task or the foreground watcher. */
export function handleLocations(locs: Location.LocationObject[]) {
  if (!live.id || live.status === 'idle') return;
  for (const l of locs) {
    const raw: Fix = {
      t: l.timestamp,
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      alt: l.coords.altitude ?? null,
      acc: l.coords.accuracy ?? null,
      speed: l.coords.speed ?? null,
    };
    live.gpsAccuracy = raw.acc;
    if (lastKept && raw.t <= lastKept.t) continue;
    if (!acceptFix(lastKept, raw, live.sport)) continue;
    const fix = smooth(lastKept, raw, live.sport);
    tick(fix.t);
    let moving = autoPause.update(lastKept, fix);
    if (live.status === 'paused') moving = false;
    const wasAuto = live.autoPaused;
    live.autoPaused = live.status === 'recording' && !moving;
    if (live.status === 'recording' && wasAuto !== live.autoPaused) {
      speak(live.autoPaused ? 'Auto paused' : 'Resumed');
    }
    const pt: TrackPoint = { ...fix, moving };
    insertPoint(live.id, pt);
    if (moving) {
      // Same rule as computeStats(): count a segment only when both ends are moving.
      if (lastKept && lastKeptMoving) {
        let d = haversine(lastKept, fix);
        let dt = (fix.t - lastKept.t) / 1000;
        live.distanceM += d;
        // per-km (per-100 m for swims) split times, interpolated at the exact crossing point
        while (d > 0 && splitD + d >= live.splitM) {
          const frac = (live.splitM - splitD) / d;
          live.splits = [...live.splits, splitT + dt * frac];
          d -= live.splitM - splitD;
          dt -= dt * frac;
          splitD = 0;
          splitT = 0;
        }
        splitD += d;
        splitT += dt;
      }
      live.path.push({ latitude: pt.lat, longitude: pt.lon });
      live.lastSpeedMs = fix.speed != null && fix.speed >= 0 ? fix.speed : live.lastSpeedMs;
      if (live.distanceM >= nextCallout) {
        callout();
        nextCallout += calloutStep(live.sport);
      }
    } else {
      live.lastSpeedMs = 0;
    }
    lastKeptMoving = moving;
    lastKept = fix;
  }
  emit();
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data) return;
  handleLocations(data.locations);
});

export type PermissionResult = 'always' | 'whenInUse' | 'denied';

export async function ensurePermissions(): Promise<PermissionResult> {
  try { await Pedometer.requestPermissionsAsync(); } catch { /* motion is optional */ }
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted' ? 'always' : 'whenInUse';
  } catch {
    return 'whenInUse';
  }
}

async function startGps(sport: Sport) {
  const opts = {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: sport === 'bike' ? 5 : 3,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: { notificationTitle: 'Iron Man', notificationBody: 'Recording your session' },
  };
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
    await Location.startLocationUpdatesAsync(TASK, opts);
    live.mode = 'background';
  } catch {
    // Expo Go cannot run background location: fall back to foreground-only (screen must stay on).
    watchSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: opts.distanceInterval },
      (loc) => handleLocations([loc]),
    );
    live.mode = 'foreground';
  }
}

async function stopGps() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  } catch {
    // not started
  }
  watchSub?.remove();
  watchSub = null;
  live.mode = 'none';
}

function resetCounters(sport: Sport) {
  lastKept = null;
  lastKeptMoving = false;
  splitD = 0;
  splitT = 0;
  autoPause = new AutoPause(sport, getSettings().autoPause && sport !== 'swim_pool');
  nextCallout = calloutStep(sport);
}

export async function start(sport: Sport) {
  const id = `${Date.now()}`;
  const now = Date.now();
  createSession(id, sport, now);
  live = { ...blank(), id, sport, status: 'recording', startedAt: now, splitM: sport.startsWith('swim') ? 100 : 1000 };
  resetCounters(sport);
  tickAt = now;
  emit();
  await startGps(sport);
  speak(`${sport === 'bike' ? 'Ride' : sport === 'run' ? 'Run' : 'Swim'} started`);
  emit();
}

export function pause() {
  if (live.status !== 'recording') return;
  tick();
  live.status = 'paused';
  live.autoPaused = false;
  if (live.id) setStatus(live.id, 'paused');
  speak('Paused');
  emit();
}

export function resume() {
  if (live.status !== 'paused') return;
  tickAt = Date.now();
  live.status = 'recording';
  if (live.id) setStatus(live.id, 'recording');
  speak('Resumed');
  emit();
}

/** Live clock for the screen (adds the time since the last fix). */
export function activeSeconds(): number {
  let ms = live.activeMs;
  if (live.status === 'recording' && !live.autoPaused && tickAt) ms += Date.now() - tickAt;
  return ms / 1000;
}

/** Stop GPS, compute final stats, save. Returns the session id for the finish screen. */
export async function finish(): Promise<{ id: string; stats: Stats } | null> {
  if (!live.id) return null;
  tick();
  await stopGps();
  const id = live.id;
  const points = getPoints(id);
  const stats = computeStats(points, live.sport.startsWith('swim') ? 100 : 1000);
  const s = getSettings();
  const meta: SessionMeta = {
    id, sport: live.sport, startedAt: live.startedAt, route: '', runType: live.sport === 'bike' ? 'Outdoor' : 'Easy',
    bike: s.bikeName, notes: '', pb: false,
    kcal: estimateKcal(live.sport, s.weightKg, stats.distanceM, stats.movingS, stats.elevGainM),
  };
  if (live.sport === 'run' && stats.movingS > 60) {
    // Steps come from the iPhone motion chip (it counts even while the app sleeps), so ask for the whole session.
    try {
      if (await Pedometer.isAvailableAsync()) {
        const r = await Pedometer.getStepCountAsync(new Date(live.startedAt), new Date());
        if (r.steps > 0) meta.cadenceSpm = Math.round(r.steps / (stats.movingS / 60));
      }
    } catch {
      // cadence is optional
    }
  }
  finishSession(id, Date.now(), meta, stats);
  speak(`Finished. ${(stats.distanceM / 1000).toFixed(2)} kilometres.`);
  live = blank();
  emit();
  return { id, stats };
}

/** After the app was killed mid-session: rebuild the live state from the saved points. */
export async function restore(): Promise<boolean> {
  const row = openSession();
  if (!row) return false;
  const points = getPoints(row.id);
  const unit = row.sport.startsWith('swim') ? 100 : 1000;
  const stats = computeStats(points, unit);
  live = {
    ...blank(),
    id: row.id,
    sport: row.sport,
    status: row.status === 'paused' ? 'paused' : 'recording',
    startedAt: row.started_at,
    distanceM: stats.distanceM,
    activeMs: stats.movingS * 1000,
    path: points.filter((p) => p.moving).map((p) => ({ latitude: p.lat, longitude: p.lon })),
    splitM: unit,
    splits: stats.splits.filter((x) => x.distanceM >= unit - 1).map((x) => x.durationS),
  };
  resetCounters(row.sport);
  const part = stats.splits[stats.splits.length - 1];
  if (part && part.distanceM < unit - 1) { splitD = part.distanceM; splitT = part.durationS; }
  const last = points[points.length - 1];
  if (last) {
    lastKept = last;
    lastKeptMoving = last.moving;
  }
  while (nextCallout <= live.distanceM) nextCallout += calloutStep(row.sport);
  tickAt = Date.now();
  await startGps(row.sport);
  emit();
  return true;
}
