// GPX + CSV builders. Pure, so they are unit tested with plain Node.
import type { Sport, Stats, TrackPoint } from './geo.ts';
import { SPORT_LABEL, fmtDuration, fmtPace, kmh, km } from './geo.ts';

export interface SessionMeta {
  id: string;
  sport: Sport;
  startedAt: number; // ms
  route: string; // free text, e.g. "River loop"
  runType: string; // Easy / Tempo / Long / Intervals / Race (run) or Session Type (bike)
  bike: string; // bike name for rides
  notes: string;
  pb: boolean;
  poolLengthM?: number;
  poolLaps?: number;
  manualDurationS?: number;
  cadenceSpm?: number; // average steps per minute (runs)
  kcal?: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function logDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export const logDay = (ms: number) => DAYS[new Date(ms).getDay()];

/** File-safe base name: "2026-11-14 0612 Run" */
export function baseName(meta: SessionMeta): string {
  const d = new Date(meta.startedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  const label = SPORT_LABEL[meta.sport].replace(/[^A-Za-z]+/g, ' ').trim().replace(/ /g, '-');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())} ${label}`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildGpx(meta: SessionMeta, points: TrackPoint[]): string {
  const type = meta.sport === 'bike' ? 'cycling' : meta.sport === 'run' ? 'running' : 'swimming';
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    '<gpx version="1.1" creator="Iron Man Tracker" xmlns="http://www.topografix.com/GPX/1/1">',
  );
  out.push(`<metadata><time>${new Date(meta.startedAt).toISOString()}</time></metadata>`);
  out.push(`<trk><name>${esc(baseName(meta))}</name><type>${type}</type>`);
  // New <trkseg> after every pause so Strava does not draw a straight line across a gap.
  let open = false;
  for (const p of points) {
    if (!p.moving) {
      if (open) { out.push('</trkseg>'); open = false; }
      continue;
    }
    if (!open) { out.push('<trkseg>'); open = true; }
    const ele = p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : '';
    out.push(
      `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${new Date(p.t).toISOString()}</time></trkpt>`,
    );
  }
  if (open) out.push('</trkseg>');
  out.push('</trk></gpx>');
  return out.join('\n');
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (cells: (string | number)[]) => cells.map(csvCell).join(',');

// Same columns as a typical running log, plus Source at the end.
export const RUN_HEADER =
  'Date,Day,Route / Location,Distance (km),Time,Avg Pace (min/km),Avg Speed (km/h),Max Speed (km/h),Elev Gain (m),Elev Loss (m),Run Type,KM1,KM2,KM3,KM4,KM5,Notes,PB?,Cadence (spm),Calories,Source';

// Same columns as a typical cycling log, plus extras at the end.
export const RIDE_HEADER =
  'Date,Day,Type,Bike,Distance (km),Duration,Avg Speed (km/h),Location,Session Type,Notes,Max Speed (km/h),Elev Gain (m),Calories,Source';

export const SWIM_HEADER =
  'Date,Day,Type,Location,Distance (m),Duration,Pace (min/100m),Pool Length (m),Laps,Notes,Calories,Source';

export function csvRow(meta: SessionMeta, s: Stats): { file: 'runs.csv' | 'rides.csv' | 'swims.csv'; header: string; line: string } {
  const date = logDate(meta.startedAt);
  const day = logDay(meta.startedAt);
  const src = 'Iron Man app';
  if (meta.sport === 'run') {
    const kms = [0, 1, 2, 3, 4].map((i) => {
      const sp = s.splits[i];
      return sp && sp.distanceM >= 999 ? fmtPace(1000 / sp.durationS) : '';
    });
    return {
      file: 'runs.csv',
      header: RUN_HEADER,
      line: row([
        date, day, meta.route, km(s.distanceM).toFixed(2), fmtDuration(s.movingS), fmtPace(s.avgSpeedMs),
        kmh(s.avgSpeedMs).toFixed(1), kmh(s.maxSpeedMs).toFixed(1), Math.round(s.elevGainM), Math.round(s.elevLossM),
        meta.runType, ...kms, meta.notes, meta.pb ? 'Yes' : '', meta.cadenceSpm ?? '', meta.kcal ?? '', src,
      ]),
    };
  }
  if (meta.sport === 'bike') {
    return {
      file: 'rides.csv',
      header: RIDE_HEADER,
      line: row([
        date, day, 'Outdoor Ride', meta.bike, km(s.distanceM).toFixed(1), fmtDuration(s.movingS),
        kmh(s.avgSpeedMs).toFixed(1), meta.route, meta.runType || 'Outdoor', meta.notes,
        kmh(s.maxSpeedMs).toFixed(1), Math.round(s.elevGainM), meta.kcal ?? '', src,
      ]),
    };
  }
  const pool = meta.sport === 'swim_pool';
  const distM = pool ? (meta.poolLaps ?? 0) * (meta.poolLengthM ?? 0) : s.distanceM;
  const durS = pool ? meta.manualDurationS ?? 0 : s.movingS;
  return {
    file: 'swims.csv',
    header: SWIM_HEADER,
    line: row([
      date, day, pool ? 'Pool' : 'Open water', meta.route, Math.round(distM), fmtDuration(durS),
      durS > 0 ? fmtPace(distM / durS, 100) : '', pool ? meta.poolLengthM ?? '' : '', pool ? meta.poolLaps ?? '' : '',
      meta.notes, meta.kcal ?? '', src,
    ]),
  };
}
