// Upload finished sessions to the PRIVATE GitHub data repo through the GitHub Contents API.
// Files: sessions/YYYY/<base>.gpx, sessions/YYYY/<base>.json, and one row appended to runs.csv / rides.csv / swims.csv.
import { buildGpx, baseName, csvRow } from './export.ts';
import type { SessionMeta } from './export.ts';
import type { Stats } from './geo.ts';
import { getPoints, markSynced, unsynced } from './db.ts';
import { getSettings, getToken } from './settings.ts';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function fromBase64(b64: string): string {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) |
      (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    bytes.push((n >> 16) & 255);
    if (i + 2 < clean.length) bytes.push((n >> 8) & 255);
    if (i + 3 < clean.length) bytes.push(n & 255);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

async function api(token: string, method: string, path: string, body?: unknown) {
  const repo = getSettings().githubRepo.trim();
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${encPath(path)}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function getFile(token: string, path: string): Promise<{ sha: string; text: string } | null> {
  const res = await api(token, 'GET', path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} reading ${path}`);
  const j = await res.json();
  return { sha: j.sha, text: fromBase64(j.content) };
}

async function putFile(token: string, path: string, text: string, message: string, sha?: string) {
  const res = await api(token, 'PUT', path, { message, content: toBase64(text), sha });
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status} writing ${path}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

/** Create or overwrite a whole file. */
async function writeFile(token: string, path: string, text: string, message: string) {
  const existing = await getFile(token, path);
  await putFile(token, path, text, message, existing?.sha);
}

/** Append one CSV row, creating the file with its header if needed. Retries on a SHA conflict. */
async function appendCsv(token: string, path: string, header: string, line: string, id: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await getFile(token, path);
    let text = existing ? existing.text : header + '\n';
    // Do not add the same session twice (the id is stored in the JSON, the row is matched exactly).
    if (text.split('\n').includes(line)) return;
    if (!text.endsWith('\n')) text += '\n';
    text += line + '\n';
    try {
      await putFile(token, path, text, `Add ${id} to ${path}`, existing?.sha);
      return;
    } catch (e) {
      if ((e as { status?: number }).status !== 409) throw e;
    }
  }
  throw new Error(`Could not update ${path} (conflict)`);
}

export async function testConnection(): Promise<string> {
  const token = await getToken();
  if (!token) return 'No token saved yet.';
  const repo = getSettings().githubRepo.trim();
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 200) {
    const j = await res.json();
    return j.private ? `Connected to ${repo} (private).` : `Connected to ${repo}, but it is PUBLIC. Make it private.`;
  }
  if (res.status === 404) return `Repo ${repo} not found, or the token cannot see it.`;
  if (res.status === 401) return 'Token rejected. Make a new one.';
  return `GitHub answered ${res.status}.`;
}

let running = false;

/** Upload every finished session that is not on GitHub yet. Safe to call often. */
export async function syncAll(): Promise<{ done: number; failed: number; message: string }> {
  const s = getSettings();
  if (!s.syncEnabled) return { done: 0, failed: 0, message: 'Sync is off.' };
  if (running) return { done: 0, failed: 0, message: 'Already syncing.' };
  const token = await getToken();
  if (!token) return { done: 0, failed: 0, message: 'No GitHub token in Settings.' };
  running = true;
  let done = 0;
  let failed = 0;
  let last = '';
  try {
    for (const row of unsynced()) {
      try {
        const meta: SessionMeta = JSON.parse(row.meta!);
        const stats: Stats = JSON.parse(row.stats!);
        const base = baseName(meta);
        const year = base.slice(0, 4);
        if (meta.sport !== 'swim_pool') {
          await writeFile(token, `sessions/${year}/${base}.gpx`, buildGpx(meta, getPoints(row.id)), `Add ${base}`);
        }
        await writeFile(
          token,
          `sessions/${year}/${base}.json`,
          JSON.stringify({ ...meta, stats, endedAt: row.ended_at }, null, 2),
          `Add ${base} summary`,
        );
        const c = csvRow(meta, stats);
        await appendCsv(token, c.file, c.header, c.line, base);
        markSynced(row.id, true);
        done++;
      } catch (e) {
        failed++;
        last = String((e as Error).message ?? e);
        markSynced(row.id, false, last);
      }
    }
  } finally {
    running = false;
  }
  return { done, failed, message: failed ? `${done} uploaded, ${failed} failed: ${last}` : `${done} uploaded.` };
}
