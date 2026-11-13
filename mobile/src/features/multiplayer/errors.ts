import { ApiError } from './api';

const KNOWN = [
  'needs_minutes', 'immune', 'not_wasteman', 'already_killed', 'expired', 'out_of_range', 'blocked',
  'multiplayer_off', 'network', 'unauthorized', 'rate_limited', 'camera_denied', 'validation',
  'username_taken', 'invalid_credentials', 'forbidden',
];

/** Localized, user-facing text for any error from the game server (never the raw server message). */
export function errorText(t: (key: string) => string, e: unknown): string {
  const code = e instanceof ApiError ? e.code : 'unknown';
  return t(`players.errors.${KNOWN.includes(code) ? code : 'unknown'}`);
}
