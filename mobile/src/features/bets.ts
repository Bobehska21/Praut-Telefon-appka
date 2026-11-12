/** Session bets (Android multiplayer). Keep in sync with `server/src/domain/bets.ts`; the server is authoritative. */
export const BET_MULTIPLIERS = [1, 2, 5, 10] as const;
export type BetMultiplier = (typeof BET_MULTIPLIERS)[number];
const BET_BASE_MINUTES = 15;

export interface Bet {
  multiplier: BetMultiplier;
  stakePoints: number;
}

/** Shortest timer in minutes for a bet; 0 for no bet (1x). */
export function betMinMinutes(multiplier: number): number {
  return multiplier > 1 ? multiplier * BET_BASE_MINUTES : 0;
}

export type BetProblem = 'timer_required' | 'timer_too_short' | 'stake_missing' | 'stake_too_high' | null;

/**
 * Why a bet cannot start. `durationMs`: `null` = until stopped (not allowed for a bet), `undefined` = invalid input.
 * `maxStake` = net points of today (the stake can never exceed it).
 */
export function betProblem(multiplier: number, stakePoints: number, durationMs: number | null | undefined, maxStake: number): BetProblem {
  if (multiplier <= 1) return null;
  if (durationMs === null) return 'timer_required';
  if (durationMs === undefined || durationMs < betMinMinutes(multiplier) * 60_000) return 'timer_too_short';
  if (!Number.isInteger(stakePoints) || stakePoints < 1) return 'stake_missing';
  if (stakePoints > Math.max(0, maxStake)) return 'stake_too_high';
  return null;
}
