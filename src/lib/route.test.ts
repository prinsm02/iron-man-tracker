// Run with: node --test src/lib/route.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { paceRuns, routeName, runsUpTo, samplePoints, thin } from './route.ts';
import type { TrackPoint } from './geo.ts';
import { cleanRepo, fromBase64, toBase64 } from './b64.ts';

const M_PER_DEG = 111194.9;
// 30 steps of 10 m: slow (10 s), medium (5 s), fast (2.5 s), 10 steps each
function track(): TrackPoint[] {
  const out: TrackPoint[] = [];
  let t = 0;
  for (let i = 0; i <= 30; i++) {
    out.push({ t, lat: (i * 10) / M_PER_DEG, lon: 0, alt: null, acc: 5, speed: null, moving: true } as TrackPoint);
    t += (i < 10 ? 10 : i < 20 ? 5 : 2.5) * 1000;
  }
  return out;
}

test('pace runs: slow start is green, fast end is red', () => {
  const { runs, steps } = paceRuns(track());
  assert.equal(steps.length, 30);
  assert.equal(runs[0].tier, 'slow');
  assert.equal(runs[runs.length - 1].tier, 'fast');
  assert.ok(runs.some((r) => r.tier === 'medium'));
  // runs share their joining point, so the line has no gaps
  for (let i = 1; i < runs.length; i++) assert.deepEqual(runs[i].coords[0], runs[i - 1].coords[runs[i - 1].coords.length - 1]);
});

test('pace runs: steady pace is all medium', () => {
  const p = track().map((x, i) => ({ ...x, t: i * 5000 }));
  assert.ok(paceRuns(p).runs.every((r) => r.tier === 'medium'));
});

test('replay draws the route step by step', () => {
  const pts = track();
  const { steps } = paceRuns(pts);
  const start = { latitude: pts[0].lat, longitude: pts[0].lon };
  assert.equal(runsUpTo(start, steps, 0).length, 0);
  const all = runsUpTo(start, steps, steps.length);
  assert.equal(all.reduce((s, r) => s + r.coords.length - 1, 0), steps.length);
});

test('thin keeps first and last and caps the count', () => {
  const p = Array.from({ length: 1000 }, (_, i) => ({ t: i, lat: i, lon: 0, moving: true }) as unknown as TrackPoint);
  const t = thin(p, 100);
  assert.equal(t.length, 100);
  assert.equal(t[0].lat, 0);
  assert.equal(t[99].lat, 999);
});

test('route name: suburbs in order, no repeats', () => {
  assert.equal(routeName([{ district: 'Alpha' }, { district: 'Beta' }, { district: 'alpha' }, { district: 'Gamma' }]), 'Alpha / Beta / Gamma');
});

test('route name: one suburb adds its roads', () => {
  assert.equal(routeName([{ district: 'Alpha', street: 'First Ave' }, { district: 'Alpha', street: 'Main Rd' }]), 'Alpha: First Ave / Main Rd');
  assert.equal(routeName([{ street: 'Main Rd' }, { street: 'Hill St' }]), 'Main Rd / Hill St');
  assert.equal(routeName([{ subregion: 'Region' }, { city: 'Town' }]), 'Region / Town');
});

test('sample points: start, middle, end', () => {
  assert.deepEqual(samplePoints([1, 2, 3, 4, 5, 6, 7, 8, 9], 3), [1, 5, 9]);
  assert.deepEqual(samplePoints([1, 2], 5), [1, 2]);
});

test('base64 round trip keeps accents, emoji and new lines', () => {
  const txt = 'Date,Route\n15 Nov 2026,"Café loop ✓ 🏃"\n';
  assert.equal(fromBase64(toBase64(txt)), txt);
  assert.equal(toBase64('Man'), 'TWFu');
  assert.equal(toBase64('é'), 'w6k=');
  assert.equal(fromBase64('w6k=\n'), 'é');
});

test('repo name accepts owner/name or a pasted link', () => {
  assert.equal(cleanRepo(' someone/my-data '), 'someone/my-data');
  assert.equal(cleanRepo('https://github.com/someone/my-data.git'), 'someone/my-data');
  assert.equal(cleanRepo('https://github.com/someone/my-data/'), 'someone/my-data');
  assert.equal(cleanRepo('my-data'), '');
  assert.equal(cleanRepo(''), '');
});
