import { computeStreaks } from '@/features/stats';
import type { SessionRecord } from '@/store/types';
import { levelForXp, sessionMinutes } from './xp';

export interface AchievementContext {
  sessions: SessionRecord[];
  totalXp: number;
  now: number;
}

export interface AchievementDef {
  id: string;
  /** Ionicons name. */
  icon: string;
  xp: number;
  check: (ctx: AchievementContext) => boolean;
}

const completed = (ctx: AchievementContext) => ctx.sessions.filter((s) => s.completed === true);
const totalHours = (ctx: AchievementContext) =>
  ctx.sessions.reduce((sum, s) => sum + sessionMinutes(s), 0) / 60;
const bestStreak = (ctx: AchievementContext) => computeStreaks(ctx.sessions, ctx.now).best;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', icon: 'flame', xp: 25, check: (c) => c.sessions.some((s) => sessionMinutes(s) >= 5) },
  { id: 'sessions10', icon: 'checkmark-done', xp: 50, check: (c) => completed(c).length >= 10 },
  { id: 'sessions50', icon: 'ribbon', xp: 150, check: (c) => completed(c).length >= 50 },
  { id: 'streak3', icon: 'trending-up', xp: 40, check: (c) => bestStreak(c) >= 3 },
  { id: 'streak7', icon: 'calendar', xp: 100, check: (c) => bestStreak(c) >= 7 },
  { id: 'streak30', icon: 'trophy', xp: 400, check: (c) => bestStreak(c) >= 30 },
  { id: 'hours10', icon: 'hourglass', xp: 100, check: (c) => totalHours(c) >= 10 },
  { id: 'hours50', icon: 'time', xp: 300, check: (c) => totalHours(c) >= 50 },
  {
    id: 'marathon',
    icon: 'infinite',
    xp: 80,
    check: (c) => completed(c).some((s) => sessionMinutes(s) >= 90),
  },
  {
    id: 'earlybird',
    icon: 'sunny',
    xp: 60,
    check: (c) => c.sessions.some((s) => new Date(s.startedAt).getHours() < 7 && sessionMinutes(s) >= 15),
  },
  {
    id: 'nightowl',
    icon: 'moon',
    xp: 60,
    check: (c) => completed(c).some((s) => new Date(s.startedAt).getHours() >= 22),
  },
  { id: 'level5', icon: 'shield', xp: 120, check: (c) => levelForXp(c.totalXp) >= 5 },
];
