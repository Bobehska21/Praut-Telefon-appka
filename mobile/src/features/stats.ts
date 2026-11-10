import type { BlockedAttempt, SessionRecord } from '@/store/types';

export interface DayStat {
  /** Local date `YYYY-MM-DD`. */
  date: string;
  focusMs: number;
  blocked: number;
}

function startOfDay(ts: number): number {
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
