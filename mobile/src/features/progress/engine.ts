import { useAppStore } from '@/store';
import type { SessionRecord } from '@/store/types';
import { ACHIEVEMENTS, type AchievementDef } from './achievements';
import { dailyQuests, questGoal, questKeys, questValue, weeklyQuests, type Quest } from './quests';
import { totalPoints, totalXp } from './totals';
import { levelForXp, levelProgress, rankKey, type LevelProgress, type RankKey } from './xp';

export { totalPoints, totalXp };

interface Totals {
  sessions: SessionRecord[];
  claimed: Record<string, number>;
  achievements: Record<string, { at: number; xp: number }>;
}

export interface QuestView {
  quest: Quest;
  value: number;
  goal: number;
  done: boolean;
  claimed: boolean;
}

export interface AchievementView {
  def: AchievementDef;
  unlockedAt: number | null;
}

export interface ProgressSnapshot {
  xp: number;
  points: number;
  level: LevelProgress;
  rank: RankKey;
  daily: QuestView[];
  weekly: QuestView[];
  achievements: AchievementView[];
}

function questView(quest: Quest, state: Totals, now: number): QuestView {
  const goal = questGoal(quest);
  const value = Math.min(goal, questValue(quest, state.sessions, now));
  return { quest, value, goal, done: value >= goal, claimed: state.claimed[quest.id] !== undefined };
}

export function snapshot(state: Totals, now: number): ProgressSnapshot {
  const xp = totalXp(state);
  const keys = questKeys(now);
  const level = levelProgress(xp);
  return {
    xp,
    points: totalPoints(state.sessions, now),
    level,
    rank: rankKey(level.level),
    daily: dailyQuests(keys.day).map((q) => questView(q, state, now)),
    weekly: weeklyQuests(keys.week).map((q) => questView(q, state, now)),
    achievements: ACHIEVEMENTS.map((def) => ({ def, unlockedAt: state.achievements[def.id]?.at ?? null })),
  };
}

/** Claims a finished quest. Does nothing if it is not done yet or was already claimed. */
export function claim(view: QuestView): void {
  if (!view.done || view.claimed) return;
  useAppStore.getState().claimQuest(view.quest.id, view.quest.xp, view.quest.key, { target: view.quest.target });
  evaluateProgress();
}

/**
 * Unlocks achievements that have been reached and announces level-ups. Safe to call any time
 * (after a session, on app start): it only reacts to things that changed.
 */
export function evaluateProgress(now = Date.now()): void {
  const store = useAppStore.getState();
  for (const def of ACHIEVEMENTS) {
    if (store.achievements[def.id]) continue;
    const current = useAppStore.getState();
    const xp = totalXp(current);
    if (def.check({ sessions: current.sessions, totalXp: xp, now })) {
      useAppStore.getState().unlockAchievement(def.id, def.xp, now);
    }
  }

  const after = useAppStore.getState();
  const level = levelForXp(totalXp(after));
  if (level > after.lastLevelSeen) {
    after.pushReward({ kind: 'level', xp: 0, level });
    after.setLastLevelSeen(level);
  }
}
