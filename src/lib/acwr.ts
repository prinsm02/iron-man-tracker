// Acute:chronic workload ratio (ACWR).
// k7 = kilometres in the last 7 days, k28 = kilometres in the last 28 days.
// acwr = k7 / (k28 / 4), rounded to 2 decimal places.
// A session on the day exactly N days ago is outside the N-day window
// (the far end is exclusive) and a session today is inside it.
// The ratio is null when the 28-day window has no sessions.

import type { HistRow } from './records.ts';

export type LoadSport = 'all' | 'run' | 'bike' | 'swim';
export type AcwrZone = 'undertraining' | 'safe' | 'monitor' | 'danger';
export type AcwrTone = 'ok' | 'warn' | 'bad' | 'dim';

export interface AcwrResult {
  k7: number;
  k28: number;
  sessions7: number;
  sessions28: number;
  acwr: number | null;
  zone: AcwrZone | null;
  label: string;
}

export interface AcwrPoint {
  date: string;
  label: string;
  acwr: number | null;
  zone: AcwrZone | null;
  zoneLabel: string;
  k7: number;
  k28: number;
}

const DAY = 86400000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function parseDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

export function ymd(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

function inWindow(rows: HistRow[], days: number, todayMs: number, sport: LoadSport) {
  const from = todayMs - days * DAY;
  let km = 0;
  let sessions = 0;
  for (const r of rows) {
    if (sport !== 'all' && r.sport !== sport) continue;
    const t = parseDay(r.date);
    if (t > from && t <= todayMs) {
      km += r.km;
      sessions += 1;
    }
  }
  return { km, sessions };
}

/** Zone for an already-rounded ratio. Null stays null. */
export function zoneFor(acwr: number | null): { zone: AcwrZone | null; label: string } {
  if (acwr == null || Number.isNaN(acwr)) return { zone: null, label: 'No sessions in 28 days' };
  if (acwr < 0.8) return { zone: 'undertraining', label: 'Undertraining' };
  if (acwr < 1.3) return { zone: 'safe', label: 'Safe zone' };
  if (acwr < 1.5) return { zone: 'monitor', label: 'Monitor' };
  return { zone: 'danger', label: 'Danger' };
}

export function acwrTone(zone: AcwrZone | null): AcwrTone {
  if (zone === 'safe') return 'ok';
  if (zone === 'danger') return 'bad';
  if (zone === 'undertraining' || zone === 'monitor') return 'warn';
  return 'dim';
}

export function computeAcwr(rows: HistRow[], now = new Date(), sport: LoadSport = 'all'): AcwrResult {
  const todayMs = startOfDay(now);
  const a = inWindow(rows, 7, todayMs, sport);
  const b = inWindow(rows, 28, todayMs, sport);
  if (b.sessions === 0 || !(b.km > 0)) {
    return {
      k7: a.km, k28: b.km, sessions7: a.sessions, sessions28: b.sessions,
      acwr: null, zone: null, label: 'No sessions in 28 days',
    };
  }
  const acwr = Math.round((a.km / (b.km / 4)) * 100) / 100;
  const z = zoneFor(acwr);
  return { k7: a.km, k28: b.km, sessions7: a.sessions, sessions28: b.sessions, acwr, zone: z.zone, label: z.label };
}

/** One point per week for the last `weeks` weeks, oldest first. The last point is `now`. */
export function acwrSeries(rows: HistRow[], weeks = 8, now = new Date(), sport: LoadSport = 'all'): AcwrPoint[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: weeks }, (_, i) => {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (weeks - 1 - i) * 7);
    const r = computeAcwr(rows, end, sport);
    return {
      date: ymd(end),
      label: end.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }),
      acwr: r.acwr,
      zone: r.zone,
      zoneLabel: r.label,
      k7: r.k7,
      k28: r.k28,
    };
  });
}
