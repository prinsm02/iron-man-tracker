// Upload finished sessions to the PRIVATE GitHub data repo through the GitHub Contents API.
// Files: sessions/YYYY/<base>.gpx, sessions/YYYY/<base>.json, and one row appended to runs.csv / rides.csv / swims.csv.
import { buildGpx, baseName, csvRow } from './export.ts';
import type { SessionMeta } from './export.ts';
import type { Stats } from './geo.ts';
import { getPoints, markSynced, unsynced } from './db.ts';
import { getSettings, getToken } from './settings.ts';

export { cleanRepo, fromBase64, toBase64 } from './b64.ts';
import { cleanRepo, fromBase64, toBase64 } from './b64.ts';

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

async function api(token: string, method: string, path: string, body?: unknown) {
  const repo = cleanRepo(getSettings().githubRepo);
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
  if (!res.ok) throw new Error(explain(res.status, `reading ${path}`));
  const j = await res.json();
  return { sha: j.sha, text: fromBase64(j.content) };
}

async function putFile(token: string, path: string, text: string, message: string, sha?: string) {
  const res = await api(token, 'PUT', path, { message, content: toBase64(text), sha });
  if (!res.ok) {
    const err = new Error(explain(res.status, `writing ${path}`)) as Error & { status?: number };
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

function explain(status: number, what: string): string {
  if (status === 401) return `GitHub said the token is wrong or expired (401) ${what}. Make a new token.`;
  if (status === 403) return `The token may not write to this repo (403) ${what}. Give it Contents: Read and write.`;
  if (status === 404) return `Repo not found, or the token cannot see it (404) ${what}.`;
  if (status === 409) return `GitHub conflict (409) ${what}. It will retry.`;
  if (status === 422) return `GitHub refused the file (422) ${what}.`;
  return `GitHub answered ${status} ${what}.`;
}

/** What is still missing before uploads can work, or '' when ready. */
export async function setupProblem(): Promise<string> {
  if (!cleanRepo(getSettings().githubRepo)) return 'Add your private data repo (owner/name) in Settings > GitHub results.';
  if (!(await getToken())) return 'Save a GitHub token in Settings > GitHub results.';
  return '';
}

export async function testConnection(): Promise<string> {
  const problem = await setupProblem();
  if (problem) return problem;
  const token = (await getToken())!;
  const repo = cleanRepo(getSettings().githubRepo);
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (res.status === 200) {
      const j = await res.json();
      const canWrite = j.permissions ? j.permissions.push !== false : true;
      if (!canWrite) return `Connected to ${repo}, but the token can only read. Give it Contents: Read and write.`;
      return j.private ? `Connected to ${repo} (private). Uploads are ready.` : `Connected to ${repo}, but it is PUBLIC. Make it private.`;
    }
    return explain(res.status, 'checking the repo');
  } catch {
    return 'No internet connection. Try again with signal.';
  }
}

/** Sessions wait this long after finishing (so you can still name them) before the automatic upload. */
export const AUTO_UPLOAD_DELAY_MS = 5 * 60 * 1000;

let running = false;

/**
 * Upload every finished session that is not on GitHub yet. Safe to call often.
 * manual = the Upload button: runs even when automatic upload is off, and sends brand-new sessions straight away.
 * now = the id of a session that was just saved, so it goes up without waiting.
 */
export async function syncAll(opts: { manual?: boolean; now?: string } = {}): Promise<{ done: number; failed: number; waiting: number; message: string }> {
  const s = getSettings();
  if (!opts.manual && !s.syncEnabled) return { done: 0, failed: 0, waiting: 0, message: '' };
  const problem = await setupProblem();
  if (problem) return { done: 0, failed: 0, waiting: 0, message: opts.manual ? problem : '' };
  if (running) return { done: 0, failed: 0, waiting: 0, message: 'Already uploading.' };
  const token = (await getToken())!;
  running = true;
  let done = 0;
  let failed = 0;
  let waiting = 0;
  let last = '';
  try {
    for (const row of unsynced()) {
      const fresh = row.ended_at != null && Date.now() - row.ended_at < AUTO_UPLOAD_DELAY_MS;
      if (!opts.manual && fresh && row.id !== opts.now) { waiting++; continue; }
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
        const m = String((e as Error).message ?? e);
        last = /network request failed/i.test(m) ? 'No internet connection.' : m;
        markSynced(row.id, false, last);
      }
    }
  } finally {
    running = false;
  }
  const message = failed
    ? `${done} uploaded, ${failed} failed: ${last}`
    : done
      ? `${done} session${done === 1 ? '' : 's'} uploaded to GitHub.`
      : opts.manual ? 'Everything is already on GitHub.' : '';
  return { done, failed, waiting, message };
}
