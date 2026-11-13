import type { BlockedAttempt, SessionRecord } from '@/store/types';

export interface DayStat {
  /** Local date `YYYY-MM-DD`. */
  date: string;
  focusMs: number;
  blocked: number;
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function nextDay(dayStart: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function dateKey(dayStart: number): string {
  const d = new Date(dayStart);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Stats for the last `days` days ending today (oldest first). Sessions that span midnight are split. */
export function buildDayStats(
  sessions: SessionRecord[],
  attempts: BlockedAttempt[],
  days: number,
  now: number,
): DayStat[] {
  const result: DayStat[] = [];
  let cursor = startOfDay(now);
  for (let i = 0; i < days - 1; i++) {
    const d = new Date(cursor);
    d.setDate(d.getDate() - 1);
    cursor = d.getTime();
  }

  for (let i = 0; i < days; i++) {
    const from = cursor;
    const to = nextDay(from);
    const focusMs = sessions.reduce((sum, s) => {
      const overlap = Math.min(s.endedAt, to) - Math.max(s.startedAt, from);
      return overlap > 0 ? sum + overlap : sum;
    }, 0);
    const blocked = attempts.filter((a) => a.at >= from && a.at < to).length;
    result.push({ date: dateKey(from), focusMs, blocked });
    cursor = to;
  }
  return result;
}

/** Focus time (ms) that falls inside [from, to). Sessions crossing the edges are clipped. */
export function focusMsBetween(sessions: SessionRecord[], from: number, to: number): number {
  return sessions.reduce((sum, s) => {
    const overlap = Math.min(s.endedAt, to) - Math.max(s.startedAt, from);
    return overlap > 0 ? sum + overlap : sum;
  }, 0);
}

/** Start of the Monday of the week containing `ts` (local time). */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** A day counts towards the streak with at least this much focus time. */
export const STREAK_MIN_MS = 5 * 60_000;

export interface Streaks {
  current: number;
  best: number;
}

/**
 * Consecutive days with focus time. Today does not break the streak while it is still empty (the day
 * is not over yet), but it extends it as soon as it has `STREAK_MIN_MS`.
 */
export function computeStreaks(sessions: SessionRecord[], now: number): Streaks {
  const days = buildDayStats(sessions, [], 365, now);
  const counted = days.map((d) => d.focusMs >= STREAK_MIN_MS);

  let best = 0;
  let run = 0;
  for (const ok of counted) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }

  let current = 0;
  let i = counted.length - 1;
  if (!counted[i]) i -= 1; // today still empty: look at yesterday
  while (i >= 0 && counted[i]) {
    current += 1;
    i -= 1;
  }
  return { current, best };
}

/** 0 = Sunday ... 6 = Saturday, from a `YYYY-MM-DD` key. */
export function weekdayOf(dateKeyValue: string): number {
  const [y, m, d] = dateKeyValue.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function totalFocusMs(stats: DayStat[]): number {
  return stats.reduce((sum, s) => sum + s.focusMs, 0);
}

export function totalBlocked(stats: DayStat[]): number {
  return stats.reduce((sum, s) => sum + s.blocked, 0);
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
