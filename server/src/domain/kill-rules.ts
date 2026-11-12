import type { ErrorCode } from '../errors';
import { effectiveState, type PlayerRow } from '../players';
import { REQUIRED_MINUTES } from './points';

export interface KillBlocker {
  code: ErrorCode;
  message: string;
  extra: Record<string, unknown>;
}

export interface KillContext {
  killer: PlayerRow;
  victim: PlayerRow;
  blocked: boolean;
  /** Whole credited focus minutes of the killer in the killer's local day. */
  killerMinutes: number;
  now: Date;
}

/** The single source of truth for "may killer kill victim right now". Returns null when allowed. */
export function killBlocker(c: KillContext): KillBlocker | null {
  const { killer, victim, now } = c;
  if (killer.id === victim.id) return { code: 'forbidden', message: 'You cannot target yourself', extra: {} };
  if (killer.banned_at || victim.banned_at) return { code: 'forbidden', message: 'Not allowed', extra: {} };
  if (!killer.multiplayer_enabled || !victim.multiplayer_enabled) {
    return { code: 'multiplayer_off', message: 'Multiplayer is off for one of the players', extra: {} };
  }
  if (c.blocked) return { code: 'blocked', message: 'One of the players blocked the other', extra: {} };
  if (c.killerMinutes < REQUIRED_MINUTES) {
    return { code: 'needs_minutes', message: 'Not enough focus minutes today', extra: { missingMinutes: REQUIRED_MINUTES - c.killerMinutes } };
  }
  if (effectiveState(victim, now) !== 'wasteman') return { code: 'not_wasteman', message: 'Target is not a wasteman', extra: {} };
  if (victim.immune_until && victim.immune_until > now) {
    return { code: 'immune', message: 'Target is immune', extra: { immuneUntil: victim.immune_until.toISOString() } };
  }
  return null;
}
