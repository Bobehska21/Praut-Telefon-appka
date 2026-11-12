/** A shield is earned by 5 hours of CREDITED focus time (heartbeat credit only) in ONE uninterrupted session. */
export const SHIELD_SESSION_MS = 5 * 3_600_000;
export const SHIELD_MAX = 3;
/** Immunity after a shield absorbed an attack (instead of the normal 1 hour), so shields cannot be sniped in a row. */
export const SHIELD_BLOCK_IMMUNITY_MS = 10 * 60_000;

export interface ShieldAward {
  creditedAfter: number;
  /** The session reached 5 h for the first time: mark it awarded (even when the cap means no shield is granted). */
  markAwarded: boolean;
  /** A shield was actually added (shields < cap). */
  granted: boolean;
  shields: number;
}

/** Pure: effect of adding `creditMs` to a session that has `creditedBefore` and may already be awarded. */
export function shieldAward(creditedBefore: number, creditMs: number, alreadyAwarded: boolean, shields: number): ShieldAward {
  const creditedAfter = creditedBefore + creditMs;
  const markAwarded = !alreadyAwarded && creditedAfter >= SHIELD_SESSION_MS;
  const granted = markAwarded && shields < SHIELD_MAX;
  return { creditedAfter, markAwarded, granted, shields: granted ? shields + 1 : shields };
}

/** Pure: what a kill does to a victim holding `shields`. */
export function shieldAbsorbs(shields: number): { blocked: boolean; remaining: number } {
  return shields > 0 ? { blocked: true, remaining: shields - 1 } : { blocked: false, remaining: shields };
}
