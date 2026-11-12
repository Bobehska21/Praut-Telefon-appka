package expo.modules.focus

import java.util.Calendar

/**
 * Kotlin mirror of `src/features/scheduler.ts`. A range whose end is <= start
 * wraps past midnight and belongs to the day it starts on.
 */
object ScheduleMath {
  data class Occurrence(val item: ScheduleItem, val start: Long, val end: Long)

  private const val MINUTE_MS = 60_000L

  /** Occurrences starting from yesterday through a week ahead, sorted by start. */
  fun occurrences(items: List<ScheduleItem>, now: Long): List<Occurrence> {
    val result = ArrayList<Occurrence>()
    for (item in items) {
      if (item.startMinute == item.endMinute) continue
      val lengthMin =
        if (item.endMinute > item.startMinute) item.endMinute - item.startMinute
        else item.endMinute + 24 * 60 - item.startMinute

      for (offset in -1..7) {
        val day = Calendar.getInstance().apply {
          timeInMillis = now
          set(Calendar.HOUR_OF_DAY, 0)
          set(Calendar.MINUTE, 0)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
          add(Calendar.DAY_OF_MONTH, offset)
        }
        val weekday = day.get(Calendar.DAY_OF_WEEK) - 1 // Sunday = 1 -> 0
        if (weekday !in item.days) continue
        day.add(Calendar.MINUTE, item.startMinute)
        val start = day.timeInMillis
        result.add(Occurrence(item, start, start + lengthMin * MINUTE_MS))
      }
    }
    return result.sortedBy { it.start }
  }

  /** The occurrence covering `now` that ends last, ignoring any ending at or before `suppressUntil`. */
  fun activeAt(items: List<ScheduleItem>, now: Long, suppressUntil: Long = 0L): Occurrence? =
    occurrences(items, now)
      .filter { it.start <= now && now < it.end && it.end > suppressUntil }
      .maxByOrNull { it.end }

  fun nextStartAfter(items: List<ScheduleItem>, now: Long): Long? =
    occurrences(items, now).map { it.start }.filter { it > now }.minOrNull()
}
