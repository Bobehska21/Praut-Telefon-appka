import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { mmkvStorage } from './storage';
import type { BlockedAttempt, Profile, Schedule, SessionRecord, Settings } from './types';

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
      },
      session: null,
      sessions: [],
      attempts: [],

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
        const record: SessionRecord = {
          id: uid('r'),
          profileId: session.profileId,
          startedAt: session.startedAt,
          endedAt,
        };
        set({ session: null, sessions: [...sessions, record].slice(-MAX_SESSIONS) });
      },
      recordAttempt: (attempt) =>
        set((s) => ({ attempts: [...s.attempts, attempt].slice(-MAX_ATTEMPTS) })),
    }),
    {
      name: 'focus-mode-state',
      version: 1,
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
