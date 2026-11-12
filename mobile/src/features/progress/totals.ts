import type { SessionRecord } from '@/store/types';
import { totalBonus } from './daily-goal';
import { sessionPoints } from './xp';

/** XP: only from claimed quests and unlocked achievements. Minutes in focus mode never give XP. */
export function totalXp(state: {
  claimed: Record<string, number>;
  achievements: Record<string, { at: number; xp: number }>;
}): number {
  const fromQuests = Object.values(state.claimed).reduce((sum, xp) => sum + xp, 0);
  const fromAchievements = Object.values(state.achievements).reduce((sum, a) => sum + a.xp, 0);
  return fromQuests + fromAchievements;
}

/** Points earned on this device: 1 per focused minute plus the daily-goal bonus. (Kills are added by the server.) */
export function totalPoints(sessions: SessionRecord[], now: number): number {
  return sessions.reduce((sum, s) => sum + sessionPoints(s), 0) + totalBonus(sessions, now);
}
