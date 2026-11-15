// Run with: node --test src/lib/geo.test.ts   (Node 23+ strips TypeScript types natively)
import test from 'node:test';
import assert from 'node:assert/strict';
import { haversine, acceptFix, computeStats, TrackFilter, fmtPace, fmtDuration, estimateKcal, profile } from './geo.ts';
import { upcoming, daysTo } from './events.ts';
import type { TrackPoint, Fix } from './geo.ts';
import { buildGpx, csvRow } from './export.ts';
import type { SessionMeta } from './export.ts';

// Walk due north along a meridian: 1 deg latitude = 111 195 m (mean earth radius).
const M_PER_DEG = 111194.9;
function track(n: number, stepM: number, stepS: number, opts: Partial<TrackPoint> = {}): TrackPoint[] {
  const t0 = Date.UTC(2026, 10, 14, 4, 0, 0);
  return Array.from({ length: n }, (_, i) => ({
    t: t0 + i * stepS * 1000,
    lat: 0 + (i * stepM) / M_PER_DEG,
    lon: 0,
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

// ---- live GPS filter (field bug: a few steps on bike mode showed 14-19 km/h) ----
// Deterministic "random" so the test is repeatable.
function rng(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const t0 = Date.UTC(2026, 10, 14, 13, 30, 0);
const fixAt = (i: number, northM: number, jitterM: number, acc: number, r: () => number): Fix => ({
  t: t0 + i * 1000,
  lat: 0 + (northM + (r() - 0.5) * 2 * jitterM) / M_PER_DEG,
  lon: 0 + ((r() - 0.5) * 2 * jitterM) / M_PER_DEG,
  alt: 1750, acc, speed: 5, // chip speed deliberately wrong: the filter must not trust it
});
function run(f: TrackFilter, fixes: Fix[]) {
  let dist = 0;
  const pts: TrackPoint[] = [];
  for (const x of fixes) for (const o of f.push(x)) { dist += o.countedM; pts.push(o.point); }
  return { dist, pts };
}

test('filter: nothing counts until 3 fixes in a row are accurate', () => {
  const r = rng(1);
  const f = new TrackFilter('bike', true);
  const bad = Array.from({ length: 5 }, (_, i) => fixAt(i, 0, 15, 30, r));
  assert.equal(run(f, bad).pts.length, 0);
  assert.equal(f.ready, false);
  const good = Array.from({ length: 3 }, (_, i) => fixAt(5 + i, 0, 2, 8, r));
  run(f, good);
  assert.equal(f.ready, true);
});

test('filter: standing still with GPS drift on bike mode = 0 km, 0 km/h, auto-pauses', () => {
  const r = rng(7);
  const f = new TrackFilter('bike', true);
  const fixes = Array.from({ length: 40 }, (_, i) => fixAt(i, 0, 3, 8, r)); // +-3 m wander, 8 m accuracy
  const { dist } = run(f, fixes);
  assert.equal(dist, 0);
  assert.equal(f.speed(fixes[fixes.length - 1].t), 0);
  assert.equal(f.moving, false);
});

test('filter: walking a few steps on bike mode does not count as riding', () => {
  const r = rng(3);
  const f = new TrackFilter('bike', true);
  const fixes = Array.from({ length: 30 }, (_, i) => fixAt(i, i < 3 ? 0 : (i - 3) * 1.3, 2, 6, r));
  const { dist } = run(f, fixes);
  assert.equal(dist, 0, `counted ${dist} m`);
  assert.equal(f.speed(fixes[fixes.length - 1].t), 0);
});

test('filter: a real 1 km ride at 25 km/h with 2 m jitter measures 1 km within 4%', () => {
  const r = rng(11);
  const f = new TrackFilter('bike', true);
  const v = 25 / 3.6;
  const fixes = Array.from({ length: 3 + 145 }, (_, i) => fixAt(i, i < 3 ? 0 : (i - 3) * v, 2, 5, r));
  const { dist } = run(f, fixes);
  assert.ok(Math.abs(dist - 1000) < 40, `distance ${dist}`);
  const sp = f.speed(fixes[fixes.length - 1].t) * 3.6;
  assert.ok(sp > 22 && sp < 28, `speed ${sp} km/h`);
});

test('filter: a run at 6:00/km counts, then auto-pauses at the robot and resumes', () => {
  const r = rng(5);
  const f = new TrackFilter('run', true);
  const v = 1000 / 360;
  const fixes: Fix[] = [];
  for (let i = 0; i < 3; i++) fixes.push(fixAt(i, 0, 1, 5, r));
  for (let i = 3; i < 63; i++) fixes.push(fixAt(i, (i - 3) * v, 1, 5, r)); // 60 s running
  const stopAt = 60 * v;
  for (let i = 63; i < 83; i++) fixes.push(fixAt(i, stopAt, 2, 6, r)); // 20 s at the robot
  const first = run(f, fixes);
  assert.equal(f.moving, false);
  assert.ok(Math.abs(first.dist - 60 * v) < 12, `distance ${first.dist}`);
  const more = Array.from({ length: 30 }, (_, k) => fixAt(83 + k, stopAt + (k + 1) * v, 1, 5, r));
  const second = run(f, more);
  assert.equal(f.moving, true);
  // the saved summary (computeStats over the stored points) must equal what the live screen counted
  const saved = computeStats([...first.pts, ...second.pts]);
  assert.ok(Math.abs(saved.distanceM - (first.dist + second.dist)) < 0.01, `saved ${saved.distanceM} live ${first.dist + second.dist}`);
  assert.ok(saved.movingS < 95, `moving ${saved.movingS} s (robot stop must not count)`);
});

const meta: SessionMeta = {
  id: 'x', sport: 'run', startedAt: Date.UTC(2026, 10, 14, 4, 0, 0), route: 'River, loop',
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
  assert.match(r.line, /^\d\d \w{3} 2026,Sat,"River, loop",5\.00,0:30:00,6:00,/);
  assert.match(r.line, /,Easy,6:00,6:00,6:00,6:00,6:00,"felt ""good""",,,,Mzansi Go app$/);
  // parse-aware column count
  const cols = r.line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.filter((c) => c !== '').length;
  assert.equal(cols, r.header.split(',').length);
});

test('CSV: pool swim uses laps x length', () => {
  const r = csvRow({ ...meta, sport: 'swim_pool', poolLaps: 40, poolLengthM: 25, manualDurationS: 2400 }, computeStats([]));
  assert.equal(r.file, 'swims.csv');
  assert.match(r.line, /,Pool,"River, loop",1000,0:40:00,4:00,25,40,/);
});

test('calories: run ~1 kcal/kg/km, bike by speed', () => {
  assert.equal(estimateKcal('run', 55, 10000, 3600), 550);
  assert.equal(estimateKcal('bike', 55, 28000, 3600), 660); // 28 km/h -> MET 12
  assert.equal(estimateKcal('bike', 55, 15000, 3600), 220); // 15 km/h -> MET 4
});

test('profile: 1 km run gives 10 points of 100 m with the right pace and climb', () => {
  const pts = track(101, 10, 3.6).map((p, i) => ({ ...p, alt: 1600 + i * 0.5 }));
  const pr = profile(pts, 100);
  assert.equal(pr.length, 10);
  assert.equal(fmtPace(pr[0].speed), '6:00');
  assert.ok(pr[9].alt! > pr[0].alt!);
});

test('events: only upcoming, soonest first', () => {
  const now = new Date(2026, 10, 14);
  const ev = [
    { id: 'a', name: 'Later', date: '2027-04-18', kind: 'Triathlon' },
    { id: 'b', name: 'Past', date: '2026-01-01', kind: 'Run' },
    { id: 'c', name: 'Soon', date: '2026-11-29', kind: 'Run' },
  ];
  assert.deepEqual(upcoming(ev, now).map((e) => e.name), ['Soon', 'Later']);
  assert.equal(daysTo('2026-11-29', now), 15);
});

// ---- records (sample numbers only, no personal data) ----
import { computeRecords, newRecords, mergeRows, parseHistoryCsv, parseTime } from './records.ts';

test('records: race bands, longest, fastest ride, spin bike excluded', () => {
  const rows = parseHistoryCsv([
    'date,sport,km,sec,indoor',
    '2026-01-01,run,5.00,1500,0', // 25:00
    '2026-02-01,run,5.02,1440,0', // faster: 23:54 for 5 km
    '2026-03-01,run,21.10,7200,0',
    '2026-04-01,run,30.00,12000,0',
    '2026-05-01,bike,40.0,6000,0', // 24 km/h
    '2026-05-02,bike,10.0,1200,1', // 30 km/h but indoor
    '2026-05-03,bike,5.0,600,0', // 30 km/h but under 10 km
  ].join('\n'));
  const r = Object.fromEntries(computeRecords(rows).map((x) => [x.key, x]));
  assert.equal(r.run5.value, '23:54');
  assert.equal(r.run5.date, '2026-02-01');
  assert.equal(r.runLong.value, '30.00 km');
  assert.equal(r.bikeFast.value, '24.0 km/h');
  assert.equal(r.bikeLong.value, '40.0 km');
  assert.ok(r.runHalf);
  assert.equal(r.run10, undefined);
});

test('records: a new session flags only the records it beats', () => {
  const before = [{ date: '2026-01-01', sport: 'run' as const, km: 5, sec: 1500 }];
  const beat = newRecords(before, { date: '2026-11-14', sport: 'run', km: 5.0, sec: 1400 });
  assert.deepEqual(beat.map((x) => x.key).sort(), ['run5', 'runLong'].sort().filter((k) => k !== 'runLong'));
  assert.equal(newRecords(before, { date: '2026-11-14', sport: 'run', km: 5.0, sec: 1600 }).length, 0);
});

test('records: merge drops duplicates, parseTime handles h:mm:ss and mm:ss', () => {
  const a = [{ date: '2026-01-01', sport: 'run' as const, km: 5.01, sec: 1500 }];
  const b = [{ date: '2026-01-01', sport: 'run' as const, km: 5.02, sec: 1500 }, { date: '2026-01-02', sport: 'bike' as const, km: 20, sec: 3600 }];
  assert.equal(mergeRows(a, b).length, 2);
  assert.equal(parseTime('1:48:46'), 6526);
  assert.equal(parseTime('22:07'), 1327);
  assert.equal(parseTime('~29.3'), null);
});

test('totals: week (Mon-Sun) and month per sport plus combined', async () => {
  const { totals } = await import('./records.ts');
  const now = new Date(2026, 10, 14); // Sat 14 Nov 2026
  const t = totals([
    { date: '2026-11-08', sport: 'bike', km: 40, sec: 6000 }, // Sun before: month only
    { date: '2026-11-09', sport: 'bike', km: 10, sec: 1800 }, // Monday: week
    { date: '2026-11-11', sport: 'run', km: 10, sec: 3700 },
    { date: '2026-10-31', sport: 'run', km: 5, sec: 1500 }, // last month
  ], now);
  assert.deepEqual([t.week.run, t.week.bike, t.week.all, t.week.sessions], [10, 10, 20, 2]);
  assert.deepEqual([t.month.run, t.month.bike, t.month.all, t.month.sessions], [10, 50, 60, 3]);
});
