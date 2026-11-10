import type { Schedule } from '@/store/types';

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * True if `schedule` is active at `now` (local time).
 * A range whose end is <= start wraps past midnight and belongs to the day it
 * starts on: Mon 22:00-06:00 is active Mon 23:00 and Tue 05:00, but not Tue 23:00.
 */
export function isScheduleActive(schedule: Schedule, now: Date): boolean {
  if (!schedule.enabled || schedule.startMinute === schedule.endMinute) return false;
  const minute = minuteOfDay(now);
  const day = now.getDay();
  const wraps = schedule.endMinute < schedule.startMinute;

  if (!wraps) {
    return (
      schedule.days.includes(day) && minute >= schedule.startMinute && minute < schedule.endMinute
    );
  }
  if (minute >= schedule.startMinute) return schedule.days.includes(day);
  if (minute < schedule.endMinute) return schedule.days.includes((day + 6) % 7);
  return false;
}

export function findActiveSchedule(schedules: Schedule[], now: Date): Schedule | null {
  return schedules.find((s) => isScheduleActive(s, now)) ?? null;
}

export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
