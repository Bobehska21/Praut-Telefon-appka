import { describe, expect, it } from 'vitest';

import { isScheduleActive } from './scheduler';
import { buildDayStats, computeStreaks, formatDuration, totalBlocked, totalFocusMs, weekdayOf } from './stats';
import { COUNTDOWN_SECONDS, countdownRemaining, isSentenceMatch } from './unlock-guard';
import type { Schedule } from '@/store/types';

const base: Schedule = {
  id: 's',
  profileId: 'p',
  days: [1], // Monday
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  enabled: true,
};

// 2026-11-09 is a Monday (TZ=UTC in vitest config).
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 10, 8 + day, h, m));

describe('unlock guard', () => {
  it('matches a sentence ignoring case and extra whitespace', () => {
    expect(isSentenceMatch('  chci  TEĎ přerušit soustředění. ', 'Chci teď přerušit soustředění.')).toBe(true);
  });
  it('rejects a different sentence and does not ignore diacritics', () => {
    expect(isSentenceMatch('Chci ted prerusit soustredeni.', 'Chci teď přerušit soustředění.')).toBe(false);
  });
  it('counts down and never goes below zero', () => {
    expect(countdownRemaining(0, 0)).toBe(COUNTDOWN_SECONDS);
    expect(countdownRemaining(0, 10_000)).toBe(COUNTDOWN_SECONDS - 10);
    expect(countdownRemaining(0, 999_999)).toBe(0);
  });
});

describe('scheduler', () => {
  it('is active inside the range on a selected day', () => {
    expect(isScheduleActive(base, at(1, 10))).toBe(true);
  });
  it('is inactive at the end boundary and on other days', () => {
    expect(isScheduleActive(base, at(1, 17))).toBe(false);
    expect(isScheduleActive(base, at(2, 10))).toBe(false);
  });
  it('is inactive when disabled or empty range', () => {
    expect(isScheduleActive({ ...base, enabled: false }, at(1, 10))).toBe(false);
    expect(isScheduleActive({ ...base, endMinute: base.startMinute }, at(1, 10))).toBe(false);
  });
  it('handles ranges wrapping past midnight', () => {
    const night: Schedule = { ...base, startMinute: 22 * 60, endMinute: 6 * 60 };
    expect(isScheduleActive(night, at(1, 23))).toBe(true); // Mon 23:00
    expect(isScheduleActive(night, at(2, 5))).toBe(true); // Tue 05:00, started Monday
    expect(isScheduleActive(night, at(2, 23))).toBe(false); // Tue 23:00, Tuesday not selected
    expect(isScheduleActive(night, at(1, 5))).toBe(false); // Mon 05:00, Sunday not selected
  });
});

describe('stats', () => {
  const now = Date.UTC(2026, 10, 9, 12); // Mon 12:00
  const hour = 3_600_000;

  it('splits a session across midnight', () => {
    const start = Date.UTC(2026, 10, 8, 23); // Sun 23:00
    const stats = buildDayStats([{ id: 'r', profileId: 'p', startedAt: start, endedAt: start + 2 * hour }], [], 2, now);
    expect(stats.map((s) => s.date)).toEqual(['2026-11-08', '2026-11-09']);
    expect(stats.map((s) => s.focusMs)).toEqual([hour, hour]);
  });
  it('counts blocked attempts per day', () => {
    const stats = buildDayStats([], [{ at: now }, { at: now - 1000 }, { at: now - 48 * hour }], 7, now);
    expect(stats).toHaveLength(7);
    expect(totalBlocked(stats)).toBe(3);
    expect(stats[6].blocked).toBe(2);
  });
  it('sums focus time and formats it', () => {
    const stats = buildDayStats([{ id: 'r', profileId: 'p', startedAt: now - hour, endedAt: now }], [], 7, now);
    expect(totalFocusMs(stats)).toBe(hour);
    expect(formatDuration(90 * 60_000)).toBe('1 h 30 min');
    expect(formatDuration(25 * 60_000)).toBe('25 min');
  });
});

describe('streaks', () => {
  const now = Date.UTC(2026, 10, 9, 12); // Mon 12:00
  const day = 24 * 3_600_000;
  const session = (daysAgo: number, minutes = 30) => ({
    id: `s${daysAgo}`,
    profileId: 'p',
    startedAt: now - daysAgo * day - 3_600_000,
    endedAt: now - daysAgo * day - 3_600_000 + minutes * 60_000,
  });

  it('counts consecutive days including today', () => {
    expect(computeStreaks([session(0), session(1), session(2)], now)).toEqual({ current: 3, best: 3 });
  });
  it('does not break the streak while today is still empty', () => {
    expect(computeStreaks([session(1), session(2)], now).current).toBe(2);
  });
  it('breaks on a missing day and remembers the best run', () => {
    const result = computeStreaks([session(0), session(2), session(3), session(4)], now);
    expect(result).toEqual({ current: 1, best: 3 });
  });
  it('ignores days with less than 5 minutes of focus', () => {
    expect(computeStreaks([session(0, 4), session(1, 30)], now).current).toBe(1);
  });
  it('is zero without sessions', () => {
    expect(computeStreaks([], now)).toEqual({ current: 0, best: 0 });
  });
  it('reads the weekday from a date key', () => {
    expect(weekdayOf('2026-11-09')).toBe(1); // Monday
  });
});
