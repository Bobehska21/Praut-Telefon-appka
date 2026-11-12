import { buildDayStats } from '@/features/stats';
import type { SessionRecord } from '@/store/types';

/** Minutes of focus mode expected every day. */
export const DAILY_GOAL_MIN = 90;

export interface DailyGoal {
  /** Whole minutes of focus so far today (local day, resets at local midnight). */
  minutes: number;
  goal: number;
  /** 0..1, how far towards the goal. */
  fraction: number;
  reached: boolean;
  /** Bonus points today: 1 per minute beyond the goal. */
  bonus: number;
}

/** Bonus points for a day with `minutes` of focus: nothing up to the goal, then 1 point per minute. */
export function bonusForMinutes(minutes: number): number {
  return Math.max(0, Math.floor(minutes) - DAILY_GOAL_MIN);
}

export function dailyGoal(sessions: SessionRecord[], now: number): DailyGoal {
  const today = buildDayStats(sessions, [], 1, now)[0];
  const minutes = Math.floor(today.focusMs / 60_000);
  return {
    minutes,
    goal: DAILY_GOAL_MIN,
    fraction: Math.min(1, minutes / DAILY_GOAL_MIN),
    reached: minutes >= DAILY_GOAL_MIN,
    bonus: bonusForMinutes(minutes),
  };
}

/** Bonus points earned over the last year, summed day by day (each day has its own 90-minute goal). */
export function totalBonus(sessions: SessionRecord[], now: number, days = 365): number {
  return buildDayStats(sessions, [], days, now).reduce(
    (sum, day) => sum + bonusForMinutes(Math.floor(day.focusMs / 60_000)),
    0,
  );
}
