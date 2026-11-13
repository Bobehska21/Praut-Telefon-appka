import type { ActiveSession } from '@/store';
import type { SessionRecord } from '@/store/types';

/** Finished sessions plus the running one (counted up to `now`), so progress moves while focus is on. */
export function withLiveSession(
  sessions: SessionRecord[],
  active: ActiveSession | null,
  now: number,
): SessionRecord[] {
  if (!active) return sessions;
  return [...sessions, { id: 'live', profileId: active.profileId, startedAt: active.startedAt, endedAt: now }];
}
