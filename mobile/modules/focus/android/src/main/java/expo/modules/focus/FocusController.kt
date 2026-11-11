package expo.modules.focus

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/** Start/stop/status for focus mode plus the alarm that drives timers and schedules. */
object FocusController {
  private const val TAG = "FocusController"
  const val ACTION_TICK = "expo.modules.focus.TICK"
  private const val ALARM_REQUEST_CODE = 4101

  fun start(context: Context, profileId: String, endsAt: Long?) {
    val app = context.applicationContext
    FocusStore.get(app).setActive(profileId, System.currentTimeMillis(), endsAt ?: 0L)
    BlockEngine.reset()
    startService(app)
    scheduleNextAlarm(app)
    BlockOverlay.goHome(app) // show the grid of allowed apps immediately
  }

  fun stop(context: Context) {
    val app = context.applicationContext
    val store = FocusStore.get(app)
    val now = System.currentTimeMillis()

    // If the user stops inside a schedule window, do not let the next alarm restart it.
    ScheduleMath.activeAt(store.schedules(), now)?.let { store.suppressUntil = it.end }

    store.clearActive()
    BlockEngine.reset()
    app.stopService(Intent(app, FocusService::class.java))
    scheduleNextAlarm(app)
  }

  fun status(context: Context): Map<String, Any?> {
    val store = FocusStore.get(context)
    val s = store.state()
    return mapOf(
      "active" to s.active,
      "profileId" to s.profileId,
      "startedAt" to (if (s.active) s.startedAt else null),
      "endsAt" to (if (s.active && s.endsAt > 0L) s.endsAt else null),
      "blockedAttempts" to store.attemptCount(),
    )
  }

  /** Alarm, boot and package-replaced entry point: align state with timers and schedules. */
  fun tick(context: Context) {
    val app = context.applicationContext
    val store = FocusStore.get(app)
    val now = System.currentTimeMillis()
    var state = store.state()

    if (state.active && state.endsAt in 1..now) {
      stop(app)
      state = store.state()
    }

    if (!state.active) {
      val occurrence = ScheduleMath.activeAt(store.schedules(), now, store.suppressUntil)
      if (occurrence != null) {
        start(app, occurrence.item.profileId, occurrence.end)
        return
      }
    } else {
      // Process was killed or the device rebooted: make sure the service is running again.
      startService(app)
    }
    scheduleNextAlarm(app)
  }

  /** Recomputes the single alarm: the earlier of the timer end and the next schedule start. */
  fun scheduleNextAlarm(context: Context) {
    val app = context.applicationContext
    val store = FocusStore.get(app)
    val now = System.currentTimeMillis()
    val state = store.state()

    val candidates = ArrayList<Long>()
    if (state.active && state.endsAt > now) candidates.add(state.endsAt)
    ScheduleMath.nextStartAfter(store.schedules(), now)?.let(candidates::add)

    val alarms = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pending = tickIntent(app)
    val next = candidates.minOrNull()
    if (next == null) {
      alarms.cancel(pending)
      return
    }

    val exactAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()
    runCatching {
      if (exactAllowed) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
      else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
    }.onFailure { Log.w(TAG, "Could not schedule alarm", it) }
  }

  private fun tickIntent(context: Context): PendingIntent {
    val intent = Intent(context, ScheduleReceiver::class.java).setAction(ACTION_TICK)
    return PendingIntent.getBroadcast(
      context,
      ALARM_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun startService(context: Context) {
    val intent = Intent(context, FocusService::class.java)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
    } catch (e: Exception) {
      // Android 12+ refuses foreground services started from the background unless an exemption
      // applies (exact alarm, boot, app visible). Blocking resumes the next time the app opens.
      Log.w(TAG, "Could not start FocusService", e)
    }
  }
}
