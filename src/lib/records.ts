// Personal records from the user's history (their private data repo) plus sessions on the phone.
// Pure functions so they are unit tested; no personal data lives in this file.

export interface HistRow {
  date: string; // YYYY-MM-DD
  sport: 'run' | 'bike' | 'swim';
  km: number;
  sec: number | null; // moving time, null when unknown
  indoor?: boolean; // spin bike etc: never counts for speed records
}

export interface RecordItem {
  key: string;
  label: string;
  value: string;
  date: string;
  score: number; // bigger = better, used to detect a new PB
}

const two = (n: number) => String(n).padStart(2, '0');
export const hms = (s: number) => {
  const t = Math.round(s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${two(m)}:${two(x)}` : `${m}:${two(x)}`;
};

/** Parse '1:48:46', '22:07' or '0:39:40' into seconds. */
export function parseTime(s: string): number | null {
  const p = s.trim().replace(/^~/, '').split(':').map(Number);
  if (!p.length || p.some((n) => Number.isNaN(n))) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
}

// Race distances: a session counts if its distance is within the band; time is scaled to the exact distance.
const BANDS: { key: string; label: string; km: number; lo: number; hi: number }[] = [
  { key: 'run5', label: 'Fastest 5 km', km: 5, lo: 4.95, hi: 5.3 },
  { key: 'run10', label: 'Fastest 10 km', km: 10, lo: 9.9, hi: 10.6 },
  { key: 'runHalf', label: 'Fastest half', km: 21.0975, lo: 21.0, hi: 21.6 },
  { key: 'runFull', label: 'Fastest marathon', km: 42.195, lo: 42.0, hi: 43.0 },
];

export function computeRecords(rows: HistRow[]): RecordItem[] {
  const out: RecordItem[] = [];
  const runs = rows.filter((r) => r.sport === 'run' && r.km > 0);
  const rides = rows.filter((r) => r.sport === 'bike' && r.km > 0);
  const swims = rows.filter((r) => r.sport === 'swim' && r.km > 0);

  for (const b of BANDS) {
    let best: HistRow | null = null;
    let bestT = Infinity;
    for (const r of runs) {
      if (r.sec == null || r.km < b.lo || r.km > b.hi) continue;
      const t = (r.sec / r.km) * b.km;
      if (t < bestT) { bestT = t; best = r; }
    }
    if (best) out.push({ key: b.key, label: b.label, value: hms(bestT), date: best.date, score: -bestT });
  }
  const longRun = runs.reduce<HistRow | null>((a, r) => (!a || r.km > a.km ? r : a), null);
  if (longRun) out.push({ key: 'runLong', label: 'Longest run', value: `${longRun.km.toFixed(2)} km`, date: longRun.date, score: longRun.km });

  const outdoor = rides.filter((r) => !r.indoor);
  const longRide = outdoor.reduce<HistRow | null>((a, r) => (!a || r.km > a.km ? r : a), null);
  if (longRide) out.push({ key: 'bikeLong', label: 'Longest ride', value: `${longRide.km.toFixed(1)} km`, date: longRide.date, score: longRide.km });
  let fast: HistRow | null = null;
  let fastV = 0;
  for (const r of outdoor) {
    if (r.sec == null || r.sec <= 0 || r.km < 10) continue; // short spins do not count
    const v = r.km / (r.sec / 3600);
    if (v > fastV) { fastV = v; fast = r; }
  }
  if (fast) out.push({ key: 'bikeFast', label: 'Fastest ride (10 km+)', value: `${fastV.toFixed(1)} km/h`, date: fast.date, score: fastV });

  const longSwim = swims.reduce<HistRow | null>((a, r) => (!a || r.km > a.km ? r : a), null);
  if (longSwim) out.push({ key: 'swimLong', label: 'Longest swim', value: `${Math.round(longSwim.km * 1000)} m`, date: longSwim.date, score: longSwim.km });
  return out;
}

/** Which records a new session beats (compared with the records before it). */
export function newRecords(before: HistRow[], session: HistRow): RecordItem[] {
  const old = new Map(computeRecords(before).map((r) => [r.key, r.score]));
  return computeRecords([...before, session]).filter((r) => r.date === session.date && r.score > (old.get(r.key) ?? -Infinity) && (old.has(r.key) || before.length > 0));
}

/** Merge rows from two sources, dropping duplicates (same day, sport and distance to 0.1 km). */
export function mergeRows(a: HistRow[], b: HistRow[]): HistRow[] {
  const seen = new Set<string>();
  const out: HistRow[] = [];
  for (const r of [...a, ...b]) {
    const k = `${r.date}|${r.sport}|${r.km.toFixed(1)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/** history.csv in the private data repo: date,sport,km,sec,indoor */
export function parseHistoryCsv(text: string): HistRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows: HistRow[] = [];
  for (const line of lines.slice(1)) {
    const [date, sport, km, sec, indoor] = line.split(',');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['run', 'bike', 'swim'].includes(sport)) continue;
    const k = parseFloat(km);
    if (!(k > 0)) continue;
    rows.push({ date, sport: sport as HistRow['sport'], km: k, sec: sec ? Number(sec) : null, indoor: indoor === '1' });
  }
  return rows;
}

export interface Totals { run: number; bike: number; swim: number; all: number; sessions: number }

/** km per sport for this week (Mon to Sun) and this calendar month. */
export function totals(rows: HistRow[], now = new Date()): { week: Totals; month: Totals } {
  const ymd = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const weekStart = ymd(monday);
  const monthStart = `${now.getFullYear()}-${two(now.getMonth() + 1)}-01`;
  const today = ymd(now);
  const blank = (): Totals => ({ run: 0, bike: 0, swim: 0, all: 0, sessions: 0 });
  const week = blank();
  const month = blank();
  for (const r of rows) {
    if (r.date > today) continue;
    for (const [t, start] of [[week, weekStart], [month, monthStart]] as const) {
      if (r.date < start) continue;
      t[r.sport] += r.km;
      t.all += r.km;
      t.sessions += 1;
    }
  }
  return { week, month };
}
