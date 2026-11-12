import { describe, expect, it } from 'vitest';
import { betMinMinutes, betProblem } from './bets';

const MIN = 60_000;

describe('bets', () => {
  it('minimum timer: 15 min per unit, none without a bet', () => {
    expect([1, 2, 5, 10].map(betMinMinutes)).toEqual([0, 30, 75, 150]);
  });
  it('no bet never has a problem', () => {
    expect(betProblem(1, 0, null, 0)).toBeNull();
    expect(betProblem(1, 0, undefined, 0)).toBeNull();
  });
  it('a bet needs a timer of at least the minimum (no open-ended session)', () => {
    expect(betProblem(2, 100, null, 110)).toBe('timer_required');
    expect(betProblem(2, 100, undefined, 110)).toBe('timer_too_short');
    expect(betProblem(2, 100, 29 * MIN, 110)).toBe('timer_too_short');
    expect(betProblem(2, 100, 30 * MIN, 110)).toBeNull();
  });
  it('the stake is 1 point up to the net points of today', () => {
    expect(betProblem(2, 0, 30 * MIN, 110)).toBe('stake_missing');
    expect(betProblem(2, 1.5, 30 * MIN, 110)).toBe('stake_missing');
    expect(betProblem(2, 110, 30 * MIN, 110)).toBeNull();
    expect(betProblem(2, 111, 30 * MIN, 110)).toBe('stake_too_high');
    expect(betProblem(2, 1, 30 * MIN, -4)).toBe('stake_too_high');
  });
});
