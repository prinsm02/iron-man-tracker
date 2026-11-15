// Full training history = history.csv from the user's PRIVATE data repo (all past sessions, built on
// the desktop) merged with the sessions recorded on this phone. Cached on the phone for offline use.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { listFinished } from './db.ts';
import { getSettings, getToken, saveSettings, type AppEvent } from './settings.ts';
import AsyncStorage2 from '@react-native-async-storage/async-storage';
import { cleanRepo, fromBase64 } from './b64.ts';
import { mergeRows, parseHistoryCsv, type HistRow } from './records.ts';
import type { Stats } from './geo.ts';
import type { SessionMeta } from './export.ts';

const KEY = 'ironman.history.csv';
let cached: HistRow[] = [];

export async function loadHistory() {
  try {
    const d = await AsyncStorage.getItem(DKEY);
    if (d) discover = JSON.parse(d);
  } catch { /* ignore */ }
  try {
    const t = await AsyncStorage.getItem(KEY);
    if (t) cached = parseHistoryCsv(t);
  } catch {
    cached = [];
  }
}

export interface DiscoverEvent { id: string; name: string; date: string; kind: string; place?: string; note?: string; url?: string }
const DKEY = 'ironman.discover.json';
let discover: DiscoverEvent[] = [];
export const getDiscover = () => discover;

async function getRepoFile(path: string): Promise<string | null> {
  const repo = cleanRepo(getSettings().githubRepo);
  const token = await getToken();
  if (!repo || !token) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    return fromBase64((await res.json()).content);
  } catch {
    return null;
  }
}

/** events.json = the user's own events; discover.json = other upcoming events (refreshed weekly on the desktop). */
export async function refreshEvents() {
  const mine = await getRepoFile('events.json');
  if (mine) {
    try {
      const list: AppEvent[] = JSON.parse(mine);
      const s = getSettings();
      const have = new Set(s.events.map((e) => e.id));
      const add = list.filter((e) => !have.has(e.id) && !s.deletedEventIds.includes(e.id));
      if (add.length) await saveSettings({ events: [...s.events, ...add] });
    } catch { /* bad file: ignore */ }
  }
  const d = await getRepoFile('discover.json');
  if (d) {
    try { discover = JSON.parse(d); await AsyncStorage2.setItem(DKEY, d); } catch { /* ignore */ }
  }
}

/** Download history.csv from the private repo (silently does nothing when offline or not set up). */
export async function refreshHistory(): Promise<number> {
  const repo = cleanRepo(getSettings().githubRepo);
  const token = await getToken();
  if (!repo || !token) return cached.length;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/history.csv`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return cached.length;
    const j = await res.json();
    const text = fromBase64(j.content);
    await AsyncStorage.setItem(KEY, text);
    cached = parseHistoryCsv(text);
  } catch {
    // offline: keep the cache
  }
  return cached.length;
}

const ymd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Sessions recorded on this phone, as history rows. */
export function phoneRows(excludeId?: string): HistRow[] {
  return listFinished()
    .filter((r) => r.id !== excludeId)
    .map((r) => {
      const st: Stats = JSON.parse(r.stats || '{}');
      const m: SessionMeta = JSON.parse(r.meta || '{}');
      const pool = r.sport === 'swim_pool';
      const km = (pool ? (m.poolLaps ?? 0) * (m.poolLengthM ?? 0) : st.distanceM ?? 0) / 1000;
      const sec = pool ? m.manualDurationS ?? null : st.movingS ?? null;
      const sport: HistRow['sport'] = r.sport === 'run' ? 'run' : r.sport === 'bike' ? 'bike' : 'swim';
      return { date: ymd(r.started_at), sport, km, sec };
    })
    .filter((r) => r.km > 0.05);
}

/** Everything: desktop history + phone sessions, duplicates removed. */
export const allRows = (excludeId?: string) => mergeRows(cached, phoneRows(excludeId));
export const sessionRow = phoneRows;
