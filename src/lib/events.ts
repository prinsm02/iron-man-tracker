// The user's own events (races, goals). Stored on the phone in Settings, never in the repo.
import type { AppEvent } from './settings.ts';

export function daysTo(date: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - today) / 86400000);
}

/** Upcoming events, soonest first. */
export function upcoming(events: AppEvent[], now = new Date()): (AppEvent & { days: number })[] {
  return events
    .map((e) => ({ ...e, days: daysTo(e.date, now) }))
    .filter((e) => e.days >= 0)
    .sort((a, b) => a.days - b.days);
}

export const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());

/** YYYY-MM-DD as a local calendar date, so the day does not shift with the timezone. */
export function formatIsoDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('en-ZA', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

export function countdownLabel(days: number): string {
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${-days} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}
