/** Session bets (Android multiplayer). Keep in sync with `server/src/domain/bets.ts`; the server is authoritative. */
export const BET_MULTIPLIERS = [1, 2, 5, 10] as const;
export type BetMultiplier = (typeof BET_MULTIPLIERS)[number];
const BET_BASE_MINUTES = 15;

/** Minimum session length in minutes for a bet; 0 for no bet (1x). */
export function betRequiredMinutes(multiplier: number): number {
  return multiplier > 1 ? multiplier * BET_BASE_MINUTES : 0;
}

/** A bet needs a timer of at least the required time, or no timer at all (`null` = until stopped). */
export function betAllowed(multiplier: number, durationMs: number | null | undefined): boolean {
  if (durationMs === undefined) return false;
  if (multiplier <= 1 || durationMs === null) return true;
  return durationMs >= betRequiredMinutes(multiplier) * 60_000;
}
