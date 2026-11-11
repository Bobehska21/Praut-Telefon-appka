import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStorage } from './storage';
import { sessionMinutes, sessionXp } from '@/features/progress/xp';
import type { BlockedAttempt, Profile, RewardEvent, Schedule, SessionRecord, Settings } from './types';

export * from './types';

/** Keep history bounded so persisted state stays small. */
const MAX_SESSIONS = 500;
const MAX_ATTEMPTS = 2000;

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export interface ActiveSession {
  profileId: string;
  startedAt: number;
  endsAt: number | null;
}

interface AppState {
  profiles: Profile[];
  selectedProfileId: string;
  schedules: Schedule[];
  settings: Settings;
  session: ActiveSession | null;
  sessions: SessionRecord[];
  attempts: BlockedAttempt[];
  /** Quest id -> XP granted when it was claimed (kept, so later rule changes never rewrite history). */
  claimed: Record<string, number>;
  /** Achievement id -> when it unlocked and the XP it gave. */
  achievements: Record<string, { at: number; xp: number }>;
  lastLevelSeen: number;
  rewardQueue: RewardEvent[];

  addProfile: (name: string) => string;
  renameProfile: (id: string, name: string) => void;
  deleteProfile: (id: string) => void;
  selectProfile: (id: string) => void;
  toggleApp: (profileId: string, appId: string) => void;
  setSelection: (profileId: string, selectionId: string, count: number) => void;

  addSchedule: (schedule: Omit<Schedule, 'id'>) => void;
  updateSchedule: (id: string, patch: Partial<Omit<Schedule, 'id'>>) => void;
  removeSchedule: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;

  beginSession: (session: ActiveSession) => void;
  endSession: (endedAt: number) => void;
  recordAttempt: (attempt: BlockedAttempt) => void;

  claimQuest: (id: string, xp: number, ref: string, params: Record<string, string | number>) => void;
  unlockAchievement: (id: string, xp: number, at: number) => void;
  setLastLevelSeen: (level: number) => void;
  pushReward: (event: Omit<RewardEvent, 'id'>) => void;
  popReward: () => void;
}

const defaultProfiles: Profile[] = [
  { id: 'work', name: 'Práce', allowedAppIds: [], selectionId: null, selectionCount: 0 },
  { id: 'study', name: 'Učení', allowedAppIds: [], selectionId: null, selectionCount: 0 },
  { id: 'sleep', name: 'Spánek', allowedAppIds: [], selectionId: null, selectionCount: 0 },
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profiles: defaultProfiles,
      selectedProfileId: defaultProfiles[0].id,
      schedules: [],
      settings: {
        unlockGuard: 'none',
        accessibilityMode: false,
        onboardingDone: false,
        language: 'system',
        nickname: '',
        nearbyEnabled: true,
      },
      session: null,
      sessions: [],
      attempts: [],
      claimed: {},
      achievements: {},
      lastLevelSeen: 1,
      rewardQueue: [],

      addProfile: (name) => {
        const id = uid('p');
        set((s) => ({
          profiles: [
            ...s.profiles,
            { id, name: name.trim(), allowedAppIds: [], selectionId: null, selectionCount: 0 },
          ],
        }));
        return id;
      },
      renameProfile: (id, name) =>
        set((s) => ({ profiles: s.profiles.map((p) => (p.id === id ? { ...p, name } : p)) })),
      deleteProfile: (id) =>
        set((s) => {
          // Never leave the app without a profile, and never delete the one that is running.
          if (s.profiles.length <= 1 || s.session?.profileId === id) return s;
          const profiles = s.profiles.filter((p) => p.id !== id);
          return {
            profiles,
            schedules: s.schedules.filter((sc) => sc.profileId !== id),
            selectedProfileId: s.selectedProfileId === id ? profiles[0].id : s.selectedProfileId,
          };
        }),
      selectProfile: (id) => set({ selectedProfileId: id }),
      toggleApp: (profileId, appId) =>
        set((s) => ({
          profiles: s.profiles.map((p) => {
            if (p.id !== profileId) return p;
            const has = p.allowedAppIds.includes(appId);
            return {
              ...p,
              allowedAppIds: has
                ? p.allowedAppIds.filter((a) => a !== appId)
                : [...p.allowedAppIds, appId],
            };
          }),
        })),
      setSelection: (profileId, selectionId, count) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === profileId ? { ...p, selectionId, selectionCount: count } : p,
          ),
        })),

      addSchedule: (schedule) =>
        set((s) => ({ schedules: [...s.schedules, { ...schedule, id: uid('s') }] })),
      updateSchedule: (id, patch) =>
        set((s) => ({
          schedules: s.schedules.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)),
        })),
      removeSchedule: (id) => set((s) => ({ schedules: s.schedules.filter((sc) => sc.id !== id) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      beginSession: (session) => set({ session }),
      endSession: (endedAt) => {
        const { session, sessions } = get();
        if (!session) return;
        const planned = session.endsAt === null ? null : session.endsAt - session.startedAt;
        const record: SessionRecord = {
          id: uid('r'),
          profileId: session.profileId,
          startedAt: session.startedAt,
          endedAt,
          plannedMs: planned,
          // Ran to its planned end (a few seconds of slack for timer jitter) rather than being stopped early.
          completed: session.endsAt !== null && endedAt >= session.endsAt - 5000,
        };
        set({ session: null, sessions: [...sessions, record].slice(-MAX_SESSIONS) });
        // Under a minute earns nothing, so there is nothing to celebrate.
        if (sessionMinutes(record) >= 1) {
          get().pushReward({ kind: 'session', xp: sessionXp(record), params: { minutes: Math.floor(sessionMinutes(record)) }, ref: record.completed ? 'completed' : 'stopped' });
        }
      },
      recordAttempt: (attempt) =>
        set((s) => ({ attempts: [...s.attempts, attempt].slice(-MAX_ATTEMPTS) })),

      claimQuest: (id, xp, ref, params) => {
        if (get().claimed[id] !== undefined) return; // already claimed: never pay twice
        set((s) => ({ claimed: { ...s.claimed, [id]: xp } }));
        get().pushReward({ kind: 'quest', xp, ref, params });
      },
      unlockAchievement: (id, xp, at) => {
        if (get().achievements[id]) return;
        set((s) => ({ achievements: { ...s.achievements, [id]: { at, xp } } }));
        get().pushReward({ kind: 'achievement', xp, ref: id });
      },
      setLastLevelSeen: (level) => set({ lastLevelSeen: level }),
      pushReward: (event) =>
        set((s) => ({ rewardQueue: [...s.rewardQueue, { ...event, id: uid('e') }].slice(-20) })),
      popReward: () => set((s) => ({ rewardQueue: s.rewardQueue.slice(1) })),
    }),
    {
      name: 'focus-mode-state',
      version: 1,
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
