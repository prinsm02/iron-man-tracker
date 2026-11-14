// On-phone storage. Every GPS point is written as it arrives, so a crash or a killed app loses nothing.
import * as SQLite from 'expo-sqlite';
import type { Sport, Stats, TrackPoint } from './geo.ts';
import type { SessionMeta } from './export.ts';

export const db = SQLite.openDatabaseSync('ironman.db');

db.execSync(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL,          -- recording | paused | finished
  meta TEXT,                     -- SessionMeta JSON
  stats TEXT,                    -- Stats JSON, filled on finish
  synced INTEGER NOT NULL DEFAULT 0,
  sync_error TEXT
);
CREATE TABLE IF NOT EXISTS points (
  session_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  alt REAL,
  acc REAL,
  speed REAL,
  moving INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS points_session ON points(session_id, t);
`);

export interface SessionRow {
  id: string;
  sport: Sport;
  started_at: number;
  ended_at: number | null;
  status: 'recording' | 'paused' | 'finished';
  meta: string | null;
  stats: string | null;
  synced: number;
  sync_error: string | null;
}

export function createSession(id: string, sport: Sport, startedAt: number) {
  db.runSync('INSERT INTO sessions (id, sport, started_at, status) VALUES (?, ?, ?, ?)', id, sport, startedAt, 'recording');
}

export function setStatus(id: string, status: SessionRow['status']) {
  db.runSync('UPDATE sessions SET status = ? WHERE id = ?', status, id);
}

export function insertPoint(id: string, p: TrackPoint) {
  db.runSync(
    'INSERT INTO points (session_id, t, lat, lon, alt, acc, speed, moving) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, p.t, p.lat, p.lon, p.alt, p.acc, p.speed, p.moving ? 1 : 0,
  );
}

export function getPoints(id: string): TrackPoint[] {
  return db
    .getAllSync<{ t: number; lat: number; lon: number; alt: number | null; acc: number | null; speed: number | null; moving: number }>(
      'SELECT t, lat, lon, alt, acc, speed, moving FROM points WHERE session_id = ? ORDER BY t',
      id,
    )
    .map((r) => ({ ...r, moving: r.moving === 1 }));
}

export function finishSession(id: string, endedAt: number, meta: SessionMeta, stats: Stats) {
  db.runSync(
    "UPDATE sessions SET status = 'finished', ended_at = ?, meta = ?, stats = ?, synced = 0, sync_error = NULL WHERE id = ?",
    endedAt, JSON.stringify(meta), JSON.stringify(stats), id,
  );
}

export function updateMeta(id: string, meta: SessionMeta, stats: Stats) {
  db.runSync('UPDATE sessions SET meta = ?, stats = ? WHERE id = ?', JSON.stringify(meta), JSON.stringify(stats), id);
}

export function deleteSession(id: string) {
  db.runSync('DELETE FROM points WHERE session_id = ?', id);
  db.runSync('DELETE FROM sessions WHERE id = ?', id);
}

export function listFinished(): SessionRow[] {
  return db.getAllSync<SessionRow>("SELECT * FROM sessions WHERE status = 'finished' ORDER BY started_at DESC");
}

export function getSession(id: string): SessionRow | null {
  return db.getFirstSync<SessionRow>('SELECT * FROM sessions WHERE id = ?', id);
}

/** A session left open when the app was killed (recording or paused). */
export function openSession(): SessionRow | null {
  return db.getFirstSync<SessionRow>("SELECT * FROM sessions WHERE status != 'finished' ORDER BY started_at DESC LIMIT 1");
}

export function unsynced(): SessionRow[] {
  return db.getAllSync<SessionRow>("SELECT * FROM sessions WHERE status = 'finished' AND synced = 0 ORDER BY started_at");
}

export function markSynced(id: string, ok: boolean, error?: string) {
  db.runSync('UPDATE sessions SET synced = ?, sync_error = ? WHERE id = ?', ok ? 1 : 0, ok ? null : error ?? 'error', id);
}
