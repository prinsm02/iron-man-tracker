// Run with: node --test src/lib/geo.test.ts   (Node 23+ strips TypeScript types natively)
import test from 'node:test';
import assert from 'node:assert/strict';
import { haversine, acceptFix, computeStats, AutoPause, fmtPace, fmtDuration, estimateKcal } from './geo.ts';
import type { TrackPoint, Fix } from './geo.ts';
import { buildGpx, csvRow } from './export.ts';
import type { SessionMeta } from './export.ts';

// Walk due north along a meridian: 1 deg latitude = 111 195 m (mean earth radius).
const M_PER_DEG = 111194.9;
function track(n: number, stepM: number, stepS: number, opts: Partial<TrackPoint> = {}): TrackPoint[] {
  const t0 = Date.UTC(2026, 10, 14, 4, 0, 0);
  return Array.from({ length: n }, (_, i) => ({
    t: t0 + i * stepS * 1000,
    lat: -26.18 + (i * stepM) / M_PER_DEG,
    lon: 28.0,
    alt: 1600,
    acc: 5,
    speed: stepM / stepS,
    moving: true,
    ...opts,
  }));
}

test('haversine: 1 km along a meridian', () => {
  const d = haversine({ lat: 0, lon: 0 }, { lat: 1000 / M_PER_DEG, lon: 0 });
  assert.ok(Math.abs(d - 1000) < 0.5, `got ${d}`);
});

test('acceptFix drops poor accuracy and teleports', () => {
  const a: Fix = { t: 0, lat: 0, lon: 0, alt: null, acc: 5, speed: null };
  assert.equal(acceptFix(a, { ...a, t: 1000, acc: 60 }, 'run'), false);
  // 100 m in 1 s while running = 360 km/h: reject
  assert.equal(acceptFix(a, { ...a, t: 1000, lat: 100 / M_PER_DEG }, 'run'), false);
  // 100 m in 1 s is also too fast on a bike
  assert.equal(acceptFix(a, { ...a, t: 1000, lat: 100 / M_PER_DEG }, 'bike'), false);
  // 15 m in 1 s on a bike = 54 km/h: fine
  assert.equal(acceptFix(a, { ...a, t: 1000, lat: 15 / M_PER_DEG }, 'bike'), true);
});

test('computeStats: 5 km run at 6:00/km gives 5 km splits of 360 s', () => {
  // 10 m every 3.6 s = 2.777 m/s = 6:00 /km. 501 points = 5000 m.
  const pts = track(501, 10, 3.6);
  const s = computeStats(pts, 1000);
  assert.ok(Math.abs(s.distanceM - 5000) < 2, `distance ${s.distanceM}`);
  assert.ok(Math.abs(s.movingS - 1800) < 0.01);
  assert.equal(fmtPace(s.avgSpeedMs), '6:00');
  assert.equal(s.splits.length, 5);
  for (const sp of s.splits) assert.ok(Math.abs(sp.durationS - 360) < 0.5, `split ${sp.durationS}`);
  assert.equal(fmtDuration(s.movingS), '0:30:00');
});

test('computeStats: paused points are excluded from distance and time', () => {
  const pts = track(101, 10, 3.6); // 1000 m
  for (let i = 40; i <= 60; i++) pts[i].moving = false; // 20 segments + borders excluded
  const s = computeStats(pts, 1000);
  assert.ok(s.distanceM < 800 && s.distanceM > 750, `distance ${s.distanceM}`);
  assert.ok(s.elapsedS > s.movingS);
});

test('computeStats: elevation with 2 m dead band ignores noise', () => {
  const pts = track(50, 10, 3.6).map((p, i) => ({ ...p, alt: 1600 + (i % 2 ? 1 : 0) })); // +-1 m jitter
  assert.equal(computeStats(pts).elevGainM, 0);
  const climb = track(50, 10, 3.6).map((p, i) => ({ ...p, alt: 1600 + i })); // +49 m
  const s = computeStats(climb);
  assert.ok(s.elevGainM >= 46 && s.elevGainM <= 49, `gain ${s.elevGainM}`);
});

test('AutoPause pauses after 6 s standing still and resumes when moving', () => {
  const ap = new AutoPause('run', true);
  const pts = [
    ...track(5, 10, 3.6),
  ];
  let prev: Fix | null = null;
  for (const p of pts) { assert.equal(ap.update(prev, p), true); prev = p; }
  // stand still for 10 s at robots
  const still = { ...prev!, speed: 0 };
  for (let s = 1; s <= 10; s++) {
    const p = { ...still, t: prev!.t + 1000 };
    ap.update(prev, p);
    prev = p;
  }
  assert.equal(ap.moving, false);
  const go = { ...prev!, t: prev!.t + 3600, lat: prev!.lat + 10 / M_PER_DEG, speed: 2.8 };
  assert.equal(ap.update(prev, go), true);
});

test('AutoPause disabled always moving', () => {
  const ap = new AutoPause('bike', false);
  const a = track(2, 0, 10, { speed: 0 });
  assert.equal(ap.update(a[0], a[1]), true);
});

const meta: SessionMeta = {
  id: 'x', sport: 'run', startedAt: Date.UTC(2026, 10, 14, 4, 0, 0), route: 'Melville, loop',
  runType: 'Easy', bike: '', notes: 'felt "good"', pb: false,
};

test('GPX: one trkseg per moving stretch, valid header', () => {
  const pts = track(10, 10, 3.6);
  pts[4].moving = false;
  const gpx = buildGpx(meta, pts);
  assert.match(gpx, /^<\?xml/);
  assert.equal((gpx.match(/<trkseg>/g) || []).length, 2);
  assert.equal((gpx.match(/<trkpt /g) || []).length, 9);
  assert.match(gpx, /<type>running<\/type>/);
});

test('CSV: run row matches the running log column count and quotes commas', () => {
  const s = computeStats(track(501, 10, 3.6));
  const r = csvRow(meta, s);
  assert.equal(r.file, 'runs.csv');
  assert.match(r.line, /^\d\d \w{3} 2026,Sat,"Melville, loop",5\.00,0:30:00,6:00,/);
  assert.match(r.line, /,Easy,6:00,6:00,6:00,6:00,6:00,"felt ""good""",,,,Iron Man app$/);
  // parse-aware column count
  const cols = r.line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.filter((c) => c !== '').length;
  assert.equal(cols, r.header.split(',').length);
});

test('CSV: pool swim uses laps x length', () => {
  const r = csvRow({ ...meta, sport: 'swim_pool', poolLaps: 40, poolLengthM: 25, manualDurationS: 2400 }, computeStats([]));
  assert.equal(r.file, 'swims.csv');
  assert.match(r.line, /,Pool,"Melville, loop",1000,0:40:00,4:00,25,40,/);
});

test('calories: run ~1 kcal/kg/km, bike by speed', () => {
  assert.equal(estimateKcal('run', 55, 10000, 3600), 550);
  assert.equal(estimateKcal('bike', 55, 28000, 3600), 660); // 28 km/h -> MET 12
  assert.equal(estimateKcal('bike', 55, 15000, 3600), 220); // 15 km/h -> MET 4
});
