/**
 * Session bets: before a session the player stakes X points, picks a multiplier and the timer length.
 * Reached the timer -> +X x (multiplier - 1). Ended earlier -> -X (capped at the day's net, never below 0).
 * 1 = no bet (the original behaviour, never any bonus or penalty).
 */
export const BET_MULTIPLIERS = [1, 2, 5, 10] as const;
export type BetMultiplier = (typeof BET_MULTIPLIERS)[number];
/** A bet session must be at least this long per unit of multiplier (2x = 30 min, 5x = 75 min, 10x = 150 min). */
export const BET_BASE_MS = 15 * 60_000;
/** Heartbeats can be missed (network, Doze), so credit this much short of the timer still counts as completed. */
export const BET_GRACE_MS = 2 * 60_000;

/** Shortest timer allowed for a bet with `multiplier`; 0 for no bet. */
export function minBetDurationMs(multiplier: number): number {
  return multiplier > 1 ? multiplier * BET_BASE_MS : 0;
}

export interface BetStart {
  multiplier: number;
  stakePoints: number;
  /** The timer length the player chose. */
  durationMs: number;
}

/** Pure: `null` when the bet is acceptable, otherwise a short reason. `dayNet` = the player's net points today. */
export function betStartProblem(b: BetStart, dayNet: number): string | null {
  if (b.multiplier <= 1) return null;
  if (b.durationMs < minBetDurationMs(b.multiplier)) return `A ${b.multiplier}x bet needs a timer of at least ${minBetDurationMs(b.multiplier) / 60_000} minutes`;
  if (b.stakePoints < 1) return 'Stake at least 1 point';
  if (b.stakePoints > Math.max(0, dayNet)) return `You can stake at most your net points of today (${Math.max(0, dayNet)})`;
  return null;
}

export interface BetOutcome {
  kind: 'none' | 'bonus' | 'penalty';
  /** Signed points to write to the ledger (positive bonus, negative penalty); 0 for 'none'. */
  points: number;
}

/** Pure: what happens when a bet session ends having credited `creditedMs` of its `requiredMs` timer. */
export function betOutcome(multiplier: number, stakePoints: number, creditedMs: number, requiredMs: number, dayNet: number): BetOutcome {
  if (multiplier <= 1 || stakePoints <= 0) return { kind: 'none', points: 0 };
  if (creditedMs >= requiredMs - BET_GRACE_MS) return { kind: 'bonus', points: stakePoints * (multiplier - 1) };
  const lost = Math.min(stakePoints, Math.max(0, dayNet));
  return lost > 0 ? { kind: 'penalty', points: -lost } : { kind: 'none', points: 0 };
}
