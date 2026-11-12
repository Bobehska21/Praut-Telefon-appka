/** Session bets: the player picks a multiplier before a session. 1 = no bet (the original behaviour, never any bonus or penalty). */
export const BET_MULTIPLIERS = [1, 2, 5, 10] as const;
export type BetMultiplier = (typeof BET_MULTIPLIERS)[number];
/** Credited focus time a bet session must reach per unit of multiplier (2x = 30 min, 5x = 75 min, 10x = 150 min). */
export const BET_BASE_MS = 15 * 60_000;

export function requiredMsFor(multiplier: number): number {
  return multiplier > 1 ? multiplier * BET_BASE_MS : 0;
}

export interface BetOutcome {
  kind: 'none' | 'bonus' | 'penalty';
  /** Signed points to write to the ledger (positive bonus, negative penalty); 0 for 'none'. */
  points: number;
}

/**
 * Pure: what happens when a session with `multiplier` ends having earned `pointsEarned` from heartbeats.
 * Reached the required time: bonus (multiplier - 1) x pointsEarned. Ended earlier: the same amount is lost, but
 * never more than the day's net, so the day never goes below 0 (same guarantee as the kill penalty).
 */
export function betOutcome(multiplier: number, creditedMs: number, pointsEarned: number, dayNet: number): BetOutcome {
  if (multiplier <= 1 || pointsEarned <= 0) return { kind: 'none', points: 0 };
  const amount = (multiplier - 1) * pointsEarned;
  if (creditedMs >= requiredMsFor(multiplier)) return { kind: 'bonus', points: amount };
  const lost = Math.min(amount, Math.max(0, dayNet));
  return lost > 0 ? { kind: 'penalty', points: -lost } : { kind: 'none', points: 0 };
}
