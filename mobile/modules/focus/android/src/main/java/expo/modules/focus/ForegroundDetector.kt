package expo.modules.focus

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context

/**
 * Tracks the foreground package with UsageStatsManager (needs PACKAGE_USAGE_STATS).
 * Polled by [FocusService]; there is no push callback for this API, so the
 * latency is the poll interval.
 */
class ForegroundDetector(context: Context) {
  private val usage = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
  private var lastQueryEnd = 0L
  private var current: String? = null

  /** Returns the package currently in the foreground, or null if unknown. */
  fun poll(now: Long = System.currentTimeMillis()): String? {
    val manager = usage ?: return null

    if (lastQueryEnd == 0L) {
      // First poll: no events seen yet, so seed from "most recently used" in the last day.
      current = runCatching {
        manager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - DAY_MS, now)
          ?.maxByOrNull { it.lastTimeUsed }
          ?.packageName
      }.getOrNull()
      lastQueryEnd = now
      return current
    }

    // Overlap by a couple of seconds so an event at a window boundary is not lost.
    val from = lastQueryEnd - OVERLAP_MS
    val events = runCatching { manager.queryEvents(from, now) }.getOrNull() ?: return current
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      // ACTIVITY_RESUMED (29) shares its value with the deprecated MOVE_TO_FOREGROUND (1).
      // Pauses are ignored: the next RESUMED event names the new foreground app.
      if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) current = event.packageName
    }
    lastQueryEnd = now
    return current
  }

  fun reset() {
    lastQueryEnd = 0L
    current = null
  }

  private companion object {
    const val DAY_MS = 24L * 60 * 60 * 1000
    const val OVERLAP_MS = 2_000L
  }
}
