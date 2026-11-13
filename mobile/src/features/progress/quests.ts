import { dateKey, focusMsBetween, startOfDay, startOfWeek, STREAK_MIN_MS } from '@/features/stats';
import type { SessionRecord } from '@/store/types';

export type QuestKind = 'focusDay' | 'sessionsDay' | 'longSession' | 'earlySession' | 'focusWeek' | 'activeDaysWeek';
export type QuestTier = 'easy' | 'medium' | 'hard' | 'weekly';

interface QuestDef {
  key: string;
  kind: QuestKind;
  /** Minutes for time quests, a count otherwise. */
  target: number;
  xp: number;
  tier: QuestTier;
}

export interface Quest extends QuestDef {
  /** Stable per period, e.g. `d:2026-11-09:focus20`. Used to remember that it was claimed. */
  id: string;
  period: 'day' | 'week';
}

const EARLY_HOUR = 10;
const EARLY_MIN_MS = 10 * 60_000;

const POOL: Record<Exclude<QuestTier, 'weekly'>, QuestDef[]> = {
  easy: [
    { key: 'focus20', kind: 'focusDay', target: 20, xp: 20, tier: 'easy' },
    { key: 'session1', kind: 'sessionsDay', target: 1, xp: 20, tier: 'easy' },
  ],
  medium: [
    { key: 'focus45', kind: 'focusDay', target: 45, xp: 40, tier: 'medium' },
    { key: 'sessions2', kind: 'sessionsDay', target: 2, xp: 40, tier: 'medium' },
    { key: 'early', kind: 'earlySession', target: EARLY_HOUR, xp: 40, tier: 'medium' },
  ],
  hard: [
    { key: 'focus90', kind: 'focusDay', target: 90, xp: 70, tier: 'hard' },
    { key: 'long50', kind: 'longSession', target: 50, xp: 70, tier: 'hard' },
  ],
};

const WEEKLY: QuestDef[] = [
  { key: 'week300', kind: 'focusWeek', target: 300, xp: 150, tier: 'weekly' },
  { key: 'days5', kind: 'activeDaysWeek', target: 5, xp: 150, tier: 'weekly' },
];

/** Small deterministic hash, so the same day always yields the same quests, offline. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

/** One easy, one medium and one hard quest for the given local day (`YYYY-MM-DD`). */
export function dailyQuests(dayKey: string): Quest[] {
  const seed = hashString(dayKey);
  return (['easy', 'medium', 'hard'] as const).map((tier, i) => {
    const def = pick(POOL[tier], seed >>> (i * 3));
    return { ...def, id: `d:${dayKey}:${def.key}`, period: 'day' as const };
  });
}

/** Both weekly goals for the week starting on `weekKey` (the Monday, `YYYY-MM-DD`). */
export function weeklyQuests(weekKey: string): Quest[] {
  return WEEKLY.map((def) => ({ ...def, id: `w:${weekKey}:${def.key}`, period: 'week' as const }));
}

export function questKeys(now: number): { day: string; week: string } {
  return { day: dateKey(startOfDay(now)), week: dateKey(startOfWeek(now)) };
}

const wasCompleted = (s: SessionRecord) => s.completed === true;
const minutesOf = (s: SessionRecord) => (s.endedAt - s.startedAt) / 60_000;

/** Current progress towards `quest`, in the quest's own unit (minutes, sessions, days). */
export function questValue(quest: Quest, sessions: SessionRecord[], now: number): number {
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const endedToday = (s: SessionRecord) => s.endedAt >= dayStart;

  switch (quest.kind) {
    case 'focusDay':
      return Math.floor(focusMsBetween(sessions, dayStart, now + 1) / 60_000);
    case 'sessionsDay':
      return sessions.filter((s) => wasCompleted(s) && endedToday(s)).length;
    case 'longSession':
      return Math.floor(
        sessions.filter((s) => wasCompleted(s) && endedToday(s)).reduce((max, s) => Math.max(max, minutesOf(s)), 0),
      );
    case 'earlySession':
      return sessions.some(
        (s) =>
          s.startedAt >= dayStart &&
          new Date(s.startedAt).getHours() < EARLY_HOUR &&
          s.endedAt - s.startedAt >= EARLY_MIN_MS,
      )
        ? 1
        : 0;
    case 'focusWeek':
      return Math.floor(focusMsBetween(sessions, weekStart, now + 1) / 60_000);
    case 'activeDaysWeek': {
      let days = 0;
      for (let i = 0; i < 7; i++) {
        const from = new Date(weekStart);
        from.setDate(from.getDate() + i);
        const to = new Date(from);
        to.setDate(to.getDate() + 1);
        if (focusMsBetween(sessions, from.getTime(), Math.min(to.getTime(), now + 1)) >= STREAK_MIN_MS) days += 1;
      }
      return days;
    }
  }
}

/** The number a quest is measured against: a count, or 1 for the yes/no "early session". */
export function questGoal(quest: Quest): number {
  return quest.kind === 'earlySession' ? 1 : quest.target;
}
