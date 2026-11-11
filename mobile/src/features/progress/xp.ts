import type { SessionRecord } from '@/store/types';

/**
 * Two currencies:
 * - XP: earned ONLY by completing quests (and achievements). It decides level and rank.
 * - Points: earned by minutes spent in focus mode (and, with multiplayer, by kills). See `daily-goal.ts`.
 */

/** Up to this many minutes of one session earn points, so a phone left on overnight is not a free win. */
export const MAX_SESSION_POINT_MINUTES = 120;

export function sessionMinutes(s: Pick<SessionRecord, 'startedAt' | 'endedAt'>): number {
  return Math.max(0, (s.endedAt - s.startedAt) / 60_000);
}

/** 1 point per focused minute (before the daily-goal bonus, which is added per day). */
export function sessionPoints(s: SessionRecord): number {
  return Math.min(MAX_SESSION_POINT_MINUTES, Math.floor(sessionMinutes(s)));
}

/** Total XP needed to reach `level` (level 1 starts at 0): 0, 100, 300, 600, 1000 ... */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  needed: number;
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const needed = xpForLevel(level + 1) - base;
  return { level, into: xp - base, needed, fraction: (xp - base) / needed };
}

export type RankKey = 'novice' | 'apprentice' | 'adept' | 'warden' | 'master' | 'grandmaster';

export function rankKey(level: number): RankKey {
  if (level < 3) return 'novice';
  if (level < 5) return 'apprentice';
  if (level < 7) return 'adept';
  if (level < 10) return 'warden';
  if (level < 15) return 'master';
  return 'grandmaster';
}
