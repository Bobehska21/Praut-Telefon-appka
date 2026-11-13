import { request } from '@/features/multiplayer/api';

/**
 * Admin API client. Authorization is done by the server (`accounts.is_admin`, checked on every request); the app only
 * asks `whoami` to decide whether to show the admin screen, and a non-admin gets 404 from every one of these calls.
 */
export interface AdminPlayer {
  id: string;
  username: string | null;
  nickname: string;
  photoUrl: string | null;
  createdAt: string;
  pointsTotal: number;
  isAdmin: boolean;
}

export const adminWhoami = () => request<{ admin: true }>('/v1/admin/whoami');

export const adminListPlayers = (q: string) => request<AdminPlayer[]>(`/v1/admin/players?q=${encodeURIComponent(q)}&limit=30`);

export const adminAdjustPoints = (playerId: string, points: number, note: string) =>
  request<{ pointsToday: number }>(`/v1/admin/players/${encodeURIComponent(playerId)}/points`, {
    method: 'POST',
    body: { points, ...(note.trim() ? { note: note.trim() } : {}) },
  });

export const adminRenamePlayer = (playerId: string, nickname: string, note: string) =>
  request<{ nickname: string }>(`/v1/admin/players/${encodeURIComponent(playerId)}/nickname`, {
    method: 'PUT',
    body: { nickname: nickname.trim(), ...(note.trim() ? { note: note.trim() } : {}) },
  });

export const adminRemovePhoto = (playerId: string, note: string) =>
  request<{ photoUrl: null }>(`/v1/admin/players/${encodeURIComponent(playerId)}/photo`, {
    method: 'DELETE',
    body: note.trim() ? { note: note.trim() } : {},
  });

/** Dev server only (`/v1/dev/*` exists when DEV_FAKE_MINUTES=true): focus minutes that also count toward the running session. */
export const devAddMinutes = (minutes: number, creditSession: boolean) =>
  request<{ focusMinutesToday: number; shields: number }>('/v1/dev/focus-minutes', { method: 'POST', body: { minutes, creditSession } });

export const devSetShields = (count: number) => request<{ shields: number }>('/v1/dev/shields', { method: 'POST', body: { count } });

export { parsePoints } from './admin-parse';
