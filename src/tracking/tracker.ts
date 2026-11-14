// The recording engine. The background task is defined at module scope (imported from index.ts first),
// so iOS can wake the app with new GPS fixes while the screen is locked.
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Speech from 'expo-speech';
import { Pedometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';

// Felt in the hand or pocket: buzzes on start, pause, resume, finish, GPS lock and every km.
const buzz = (kind: 'start' | 'tap' | 'split' | 'done') => {
  try {
    if (kind === 'done') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'split') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.impactAsync(kind === 'start' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium);
  } catch { /* haptics are optional */ }
};
import { TrackFilter, computeStats, fmtPace, fmtDuration, kmh, estimateKcal } from '../lib/geo.ts';
import type { Fix, Sport, TrackPoint, Stats } from '../lib/geo.ts';
import { createSession, insertPoint, getPoints, setStatus, openSession, finishSession } from '../lib/db.ts';
import type { SessionMeta } from '../lib/export.ts';
import { getSettings } from '../lib/settings.ts';
import { allRows } from '../lib/history.ts';
import { newRecords } from '../lib/records.ts';

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
  gpsReady: boolean; // false until the GPS has a solid lock; nothing counts before that
}

const blank = (): Live => ({
  id: null, sport: 'run', status: 'idle', startedAt: 0, autoPaused: false, distanceM: 0, activeMs: 0,
  lastSpeedMs: 0, gpsAccuracy: null, path: [], mode: 'none', splitM: 1000, splits: [], gpsReady: false,
});

let live: Live = blank();
let filter = new TrackFilter('run', true);
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

const clockRunning = () => live.status === 'recording' && live.gpsReady && !live.autoPaused;

/** Update activeMs up to now (only counts while recording, GPS locked and not auto-paused). */
function tick(now = Date.now()) {
  if (clockRunning() && tickAt) live.activeMs += now - tickAt;
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
    if (live.status === 'paused') continue; // manual pause: ignore GPS until Resume
    const wasReady = live.gpsReady;
    const wasAuto = live.autoPaused;
    tick(Math.max(tickAt, raw.t));
    for (const o of filter.push(raw)) {
      insertPoint(live.id, o.point);
      if (o.point.moving) live.path.push({ latitude: o.point.lat, longitude: o.point.lon });
      if (o.countedM > 0) {
        let d = o.countedM;
        let dt = o.dtS;
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
        if (live.distanceM >= nextCallout) {
          callout();
          buzz('split');
          nextCallout += calloutStep(live.sport);
        }
      }
    }
    live.gpsReady = filter.ready;
    live.autoPaused = live.gpsReady && !filter.moving;
    if (!wasReady && live.gpsReady) { speak('GPS locked'); buzz('tap'); }
    else if (wasReady && wasAuto !== live.autoPaused) speak(live.autoPaused ? 'Auto paused' : 'Resumed');
  }
  live.lastSpeedMs = currentSpeed();
  emit();
}

/** Current speed (m/s) from real distance over the last 10 s; 0 when standing still. */
export function currentSpeed(): number {
  return live.status === 'recording' ? filter.speed(Date.now()) : 0;
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
    distanceInterval: 0, // every fix (~1 per second): the filter decides what counts, and auto-pause needs fixes while standing
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
  splitD = 0;
  splitT = 0;
  filter = new TrackFilter(sport, getSettings().autoPause && sport !== 'swim_pool');
  nextCallout = calloutStep(sport);
}

export async function start(sport: Sport) {
  buzz('start');
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
  buzz('tap');
  if (live.status !== 'recording') return;
  tick();
  live.status = 'paused';
  live.autoPaused = false;
  if (live.id) {
    setStatus(live.id, 'paused');
    // pause marker, so the time and distance while paused never count
    const last = live.path[live.path.length - 1];
    if (last) insertPoint(live.id, { t: Date.now(), lat: last.latitude, lon: last.longitude, alt: null, acc: null, speed: null, moving: false });
  }
  filter.breakSegment();
  speak('Paused');
  emit();
}

export function resume() {
  buzz('tap');
  if (live.status !== 'paused') return;
  tickAt = Date.now();
  live.status = 'recording';
  filter.breakSegment();
  if (live.id) setStatus(live.id, 'recording');
  speak('Resumed');
  emit();
}

/** Live clock for the screen (adds the time since the last fix). */
export function activeSeconds(): number {
  let ms = live.activeMs;
  if (clockRunning() && tickAt) ms += Date.now() - tickAt;
  return ms / 1000;
}

/** Stop GPS, compute final stats, save. Returns the session id for the finish screen. */
export async function finish(): Promise<{ id: string; stats: Stats } | null> {
  buzz('done');
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
  // new personal record? compare with all history before this session
  let pbText = '';
  try {
    const d = new Date(live.startedAt);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const sport = live.sport === 'run' ? 'run' : live.sport === 'bike' ? 'bike' : 'swim';
    const beat = newRecords(allRows(id), { date, sport, km: stats.distanceM / 1000, sec: stats.movingS });
    if (beat.length && stats.distanceM > 1000) {
      meta.pb = true;
      pbText = ` New personal record: ${beat.map((b) => b.label).join(', ')}.`;
    }
  } catch {
    // records are optional
  }
  finishSession(id, Date.now(), meta, stats);
  speak(`Finished. ${(stats.distanceM / 1000).toFixed(2)} kilometres.${pbText}`);
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
    // the app was closed, so the gap until now must not count: start a fresh segment from the last point
    filter.breakSegment(last);
    live.gpsReady = true;
    insertPoint(row.id, { ...last, t: Date.now(), moving: false });
  }
  while (nextCallout <= live.distanceM) nextCallout += calloutStep(row.sport);
  tickAt = Date.now();
  await startGps(row.sport);
  emit();
  return true;
}
