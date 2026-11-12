import { describe, expect, it } from 'vitest';
import { betAllowed, betRequiredMinutes } from './bets';

describe('bets', () => {
  it('required minutes: 15 per unit, none without a bet', () => {
    expect([1, 2, 5, 10].map(betRequiredMinutes)).toEqual([0, 30, 75, 150]);
  });
  it('a bet needs a long enough timer or no timer', () => {
    expect(betAllowed(5, 74 * 60_000)).toBe(false);
    expect(betAllowed(5, 75 * 60_000)).toBe(true);
    expect(betAllowed(10, null)).toBe(true);
    expect(betAllowed(1, 60_000)).toBe(true);
    expect(betAllowed(1, undefined)).toBe(false);
  });
});
