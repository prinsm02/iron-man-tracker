import test from 'node:test';
import assert from 'node:assert/strict';
import { acwrSeries, computeAcwr, zoneFor } from './acwr.ts';
import type { HistRow } from './records.ts';

const NOW = new Date(2026, 10, 14); // 14 Nov 2026, local

function iso(daysAgo: number): string {
  const d = new Date(2026, 10, 14 - daysAgo);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function row(daysAgo: number, km: number, sport: HistRow['sport'] = 'run'): HistRow {
  return { date: iso(daysAgo), sport, km, sec: 3600 };
}

test('zone boundaries use the rounded ratio', () => {
  assert.equal(zoneFor(null).zone, null);
  assert.equal(zoneFor(0.79).zone, 'undertraining');
  assert.equal(zoneFor(0.8).zone, 'safe');
  assert.equal(zoneFor(1.29).zone, 'safe');
  assert.equal(zoneFor(1.3).zone, 'monitor');
  assert.equal(zoneFor(1.49).zone, 'monitor');
  assert.equal(zoneFor(1.5).zone, 'danger');
  assert.equal(zoneFor(2).label, 'Danger');
  assert.equal(zoneFor(1).label, 'Safe zone');
});

test('no sessions in 28 days is null', () => {
  const r = computeAcwr([], NOW);
  assert.equal(r.acwr, null);
  assert.equal(r.sessions28, 0);
  assert.equal(r.label, 'No sessions in 28 days');
});

test('steady week is 1.00 and in the safe zone', () => {
  const rows = [0, 7, 14, 21].map((d) => row(d, 10));
  const r = computeAcwr(rows, NOW);
  assert.equal(r.k7, 10);
  assert.equal(r.k28, 40);
  assert.equal(r.acwr, 1);
  assert.equal(r.zone, 'safe');
});

test('a spike in the last 7 days is danger', () => {
  const rows = [row(0, 30), row(10, 10)];
  const r = computeAcwr(rows, NOW);
  assert.equal(r.k7, 30);
  assert.equal(r.k28, 40);
  assert.equal(r.acwr, 3);
  assert.equal(r.zone, 'danger');
});

test('the day exactly 7 ago counts for 28 days only', () => {
  const rows = [row(7, 10), row(0, 5)];
  const r = computeAcwr(rows, NOW);
  assert.equal(r.k7, 5);
  assert.equal(r.k28, 15);
  assert.equal(r.acwr, Math.round((5 / (15 / 4)) * 100) / 100);
});

test('the day exactly 28 ago is outside the window', () => {
  const only = computeAcwr([row(28, 40)], NOW);
  assert.equal(only.acwr, null);
  const kept = computeAcwr([row(27, 40)], NOW);
  assert.equal(kept.k28, 40);
  assert.equal(kept.k7, 0);
  assert.equal(kept.acwr, 0);
  assert.equal(kept.zone, 'undertraining');
});

test('future sessions are ignored', () => {
  const d = new Date(2026, 10, 16);
  const two = (n: number) => String(n).padStart(2, '0');
  const future = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  const r = computeAcwr([{ date: future, sport: 'run', km: 50, sec: 1 }], NOW);
  assert.equal(r.acwr, null);
});

test('sport filter ignores other sports; all adds them', () => {
  const rows = [row(0, 10, 'run'), row(1, 20, 'bike'), row(2, 2, 'swim')];
  assert.equal(computeAcwr(rows, NOW, 'run').k7, 10);
  assert.equal(computeAcwr(rows, NOW, 'bike').k7, 20);
  assert.equal(computeAcwr(rows, NOW, 'swim').k7, 2);
  assert.equal(computeAcwr(rows, NOW, 'all').k7, 32);
  assert.equal(computeAcwr(rows, NOW, 'bike').sessions28, 1);
});

test('ratio rounds to 2 decimal places before the zone', () => {
  // 13 / (40 / 4) = 1.30 monitor; 12.9 / 10 = 1.29 safe
  assert.equal(computeAcwr([row(0, 13), row(10, 27)], NOW).acwr, 1.3);
  assert.equal(computeAcwr([row(0, 13), row(10, 27)], NOW).zone, 'monitor');
  assert.equal(computeAcwr([row(0, 12.9), row(10, 27.1)], NOW).acwr, 1.29);
  assert.equal(computeAcwr([row(0, 12.9), row(10, 27.1)], NOW).zone, 'safe');
  assert.equal(computeAcwr([row(0, 14.9), row(10, 25.1)], NOW).zone, 'monitor');
  assert.equal(computeAcwr([row(0, 15), row(10, 25)], NOW).zone, 'danger');
});

test('weekly series ends on today and matches the current ratio', () => {
  const rows = [0, 7, 14, 21, 28, 35].map((d) => row(d, 10));
  const series = acwrSeries(rows, 8, NOW, 'run');
  assert.equal(series.length, 8);
  assert.equal(series[7].date, '2026-11-14');
  assert.equal(series[0].date, '2026-09-26');
  assert.equal(series[7].acwr, computeAcwr(rows, NOW, 'run').acwr);
  assert.equal(series[0].acwr, null);
});
