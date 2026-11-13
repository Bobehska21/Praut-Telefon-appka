import { describe, expect, it } from 'vitest';
import { parsePoints } from './admin-parse';

describe('parsePoints', () => {
  it('accepts whole numbers with an optional sign', () => {
    expect(parsePoints('50')).toBe(50);
    expect(parsePoints('+50')).toBe(50);
    expect(parsePoints(' -20 ')).toBe(-20);
  });
  it('rejects zero, decimals, text and empty input', () => {
    for (const t of ['0', '-0', '1.5', 'abc', '', '1e3', '--5', '1234567']) expect(parsePoints(t), t).toBeNull();
  });
});
