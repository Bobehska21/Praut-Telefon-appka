import { describe, expect, it } from 'vitest';

import type { SessionRecord } from '@/store/types';
import { ACHIEVEMENTS } from './achievements';
import { bonusForMinutes, dailyGoal, DAILY_GOAL_MIN, totalBonus } from './daily-goal';
import { totalPoints, totalXp } from './totals';
import { dailyQuests, questGoal, questValue, weeklyQuests } from './quests';
import { levelForXp, levelProgress, rankKey, sessionPoints, xpForLevel } from './xp';

const MIN = 60_000;
// Local time on purpose: quests and achievements use local days and hours.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
const now = at(11, 15); // Wed 11 Nov 2026, 15:00 local

let n = 0;
const session = (
  startedAt: number,
  minutes: number,
  extra: Partial<SessionRecord> = {},
): SessionRecord => ({
  id: `s${n++}`,
  profileId: 'p',
  startedAt,
  endedAt: startedAt + minutes * MIN,
  ...extra,
});

describe('points and XP', () => {
  it('gives 1 point per focused minute and no completion bonus', () => {
    expect(sessionPoints(session(0, 25))).toBe(25);
    expect(sessionPoints(session(0, 25, { completed: true, plannedMs: 25 * MIN }))).toBe(25);
  });
  it('caps points for one very long session', () => {
    expect(sessionPoints(session(0, 600))).toBe(120);
  });
  it('earns nothing below one minute', () => {
    expect(sessionPoints(session(0, 0.5))).toBe(0);
  });
  it('maps XP to levels', () => {
    expect([xpForLevel(1), xpForLevel(2), xpForLevel(3), xpForLevel(4)]).toEqual([0, 100, 300, 600]);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(599)).toBe(3);
    expect(levelForXp(600)).toBe(4);
  });
  it('reports progress inside a level', () => {
    expect(levelProgress(150)).toEqual({ level: 2, into: 50, needed: 200, fraction: 0.25 });
  });
  it('assigns ranks', () => {
    expect([1, 3, 5, 7, 10, 20].map(rankKey)).toEqual(['novice', 'apprentice', 'adept', 'warden', 'master', 'grandmaster']);
  });
});

describe('quests', () => {
  it('are the same for the same day and differ in difficulty', () => {
    const a = dailyQuests('2026-11-11');
    expect(dailyQuests('2026-11-11')).toEqual(a);
    expect(a.map((q) => q.tier)).toEqual(['easy', 'medium', 'hard']);
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
  });
  it('vary across days', () => {
    const keys = new Set<string>();
    for (let d = 1; d <= 28; d++) dailyQuests(`2026-11-${String(d).padStart(2, '0')}`).forEach((q) => keys.add(q.key));
    expect(keys.size).toBeGreaterThan(4);
  });
  it('have two weekly goals', () => {
    expect(weeklyQuests('2026-11-09').map((q) => q.key)).toEqual(['week300', 'days5']);
  });

  const find = (key: string) => {
    // Build the quest directly so the test does not depend on which ones the hash picks.
    const defs: Record<string, [string, number]> = {
      focus20: ['focusDay', 20],
      sessions2: ['sessionsDay', 2],
      long50: ['longSession', 50],
      early: ['earlySession', 10],
      week300: ['focusWeek', 300],
      days5: ['activeDaysWeek', 5],
    };
    const [kind, target] = defs[key];
    return { id: key, key, kind, target, xp: 1, tier: 'easy', period: 'day' } as unknown as Parameters<typeof questValue>[0];
  };

  it('count today\'s focus minutes', () => {
    expect(questValue(find('focus20'), [session(at(11, 9), 15), session(at(11, 12), 10)], now)).toBe(25);
    expect(questValue(find('focus20'), [session(at(10, 9), 60)], now)).toBe(0); // yesterday
  });
  it('count only completed sessions for "sessions"', () => {
    const sessions = [session(at(11, 9), 20, { completed: true }), session(at(11, 11), 20)];
    expect(questValue(find('sessions2'), sessions, now)).toBe(1);
  });
  it('measure the longest completed session today', () => {
    const sessions = [session(at(11, 9), 55, { completed: true }), session(at(11, 12), 70)];
    expect(questValue(find('long50'), sessions, now)).toBe(55);
  });
  it('detect an early session (before 10:00, 10+ minutes)', () => {
    expect(questValue(find('early'), [session(at(11, 8), 20)], now)).toBe(1);
    expect(questValue(find('early'), [session(at(11, 8), 5)], now)).toBe(0);
    expect(questValue(find('early'), [session(at(11, 11), 30)], now)).toBe(0);
    expect(questGoal(find('early'))).toBe(1);
  });
  it('sum the week from Monday', () => {
    const sessions = [session(at(9, 9), 60), session(at(10, 9), 60), session(at(8, 9), 600)]; // 8th is last Sunday
    expect(questValue(find('week300'), sessions, now)).toBe(120);
  });
  it('count active days this week', () => {
    const sessions = [session(at(9, 9), 30), session(at(10, 9), 3), session(at(11, 9), 30)];
    expect(questValue(find('days5'), sessions, now)).toBe(2);
  });
});

describe('achievements', () => {
  const ctx = (sessions: SessionRecord[], totalXp = 0) => ({ sessions, totalXp, now });
  const get = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!;

  it('have unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
  it('unlock the first one after a 5 minute session', () => {
    expect(get('first').check(ctx([session(at(11, 9), 4)]))).toBe(false);
    expect(get('first').check(ctx([session(at(11, 9), 5)]))).toBe(true);
  });
  it('unlock streak achievements', () => {
    const run = [0, 1, 2].map((d) => session(at(11 - d, 9), 30));
    expect(get('streak3').check(ctx(run))).toBe(true);
    expect(get('streak7').check(ctx(run))).toBe(false);
  });
  it('unlock marathon only for a completed 90+ minute session', () => {
    expect(get('marathon').check(ctx([session(at(11, 9), 95)]))).toBe(false);
    expect(get('marathon').check(ctx([session(at(11, 9), 95, { completed: true })]))).toBe(true);
  });
  it('unlock early bird and night owl by start hour', () => {
    expect(get('earlybird').check(ctx([session(at(11, 6), 20)]))).toBe(true);
    expect(get('earlybird').check(ctx([session(at(11, 8), 20)]))).toBe(false);
    expect(get('nightowl').check(ctx([session(at(10, 22, 30), 30, { completed: true })]))).toBe(true);
  });
  it('unlock by total time and level', () => {
    expect(get('hours10').check(ctx([session(0, 600)]))).toBe(true);
    expect(get('level5').check(ctx([], 1000))).toBe(true);
    expect(get('level5').check(ctx([], 999))).toBe(false);
  });
});

describe('daily goal and bonus points', () => {
  it('uses a 90 minute goal', () => {
    expect(DAILY_GOAL_MIN).toBe(90);
  });
  it('pays nothing up to the goal and 1 point per minute beyond it', () => {
    expect([0, 45, 90].map(bonusForMinutes)).toEqual([0, 0, 0]);
    expect([91, 100, 150].map(bonusForMinutes)).toEqual([1, 10, 60]);
  });
  it('tracks progress towards the goal today', () => {
    const goal = dailyGoal([session(at(11, 9), 30), session(at(11, 12), 15)], now);
    expect(goal).toMatchObject({ minutes: 45, goal: 90, fraction: 0.5, reached: false, bonus: 0 });
  });
  it('counts bonus once the goal is reached', () => {
    const goal = dailyGoal([session(at(11, 9), 100), session(at(11, 12), 20)], now);
    expect(goal).toMatchObject({ minutes: 120, fraction: 1, reached: true, bonus: 30 });
  });
  it('resets at local midnight: yesterday does not count today', () => {
    const goal = dailyGoal([session(at(10, 9), 200)], now);
    expect(goal).toMatchObject({ minutes: 0, reached: false, bonus: 0 });
  });
  it('splits a session across midnight between the two days', () => {
    // 23:30 to 01:30 the next day: 30 minutes on the 10th, 90 on the 11th.
    const sessions = [session(at(10, 23, 30), 120)];
    expect(dailyGoal(sessions, at(11, 2)).minutes).toBe(90);
    expect(dailyGoal(sessions, at(11, 2)).reached).toBe(true);
  });
  it('sums bonus over days, each with its own goal', () => {
    const sessions = [session(at(10, 8), 100), session(at(11, 8), 95), session(at(9, 8), 80)];
    expect(totalBonus(sessions, now)).toBe(10 + 5);
  });
});

describe('XP only comes from quests and achievements', () => {
  const sessions = [session(at(11, 9), 100, { completed: true, plannedMs: 100 * MIN })];
  it('gives no XP for focus minutes, however many', () => {
    expect(totalXp({ claimed: {}, achievements: {} })).toBe(0);
  });
  it('adds claimed quests and unlocked achievements', () => {
    expect(totalXp({ claimed: { 'd:2026-11-11:focus20': 20, 'd:2026-11-11:long50': 70 }, achievements: { first: { at: 1, xp: 25 } } })).toBe(115);
  });
  it('gives points for minutes plus the bonus beyond the daily goal, and keeps them out of XP', () => {
    expect(totalPoints(sessions, now)).toBe(100 + 10);
    expect(totalXp({ claimed: {}, achievements: {} })).toBe(0);
  });
});
