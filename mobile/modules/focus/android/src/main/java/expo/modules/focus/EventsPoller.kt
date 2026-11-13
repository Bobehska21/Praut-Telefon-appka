package expo.modules.focus

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Long-polls the server for events addressed to this player (for now: "you were killed") while the
 * foreground service runs, and turns them into notifications. No Firebase: the service keeps the
 * connection, which is why a wasteman keeps the service alive. Events that arrive while the service is
 * stopped are fetched the next time the app opens.
 */
class EventsPoller(private val context: Context) : Thread("focus-events") {
  @Volatile private var running = true

  fun finish() {
    running = false
    interrupt()
  }

  override fun run() {
    val store = FocusStore.get(context)
    var failures = 0
    while (running) {
      if (!ServerClient.configured(context) || !store.nearbyEnabled) {
        sleepQuietly(15_000)
        continue
      }
      val response = ServerClient.request(context, "GET", "/v1/events?after=${store.lastEventId}&wait=25", null, readTimeoutMs = 40_000)
      if (!running) return
      if (!response.ok) {
        // Back off on errors so a down server is not hammered.
        failures = minOf(failures + 1, 5)
        sleepQuietly(2_000L * (1 shl failures))
        continue
      }
      failures = 0
      handle(store, response.body)
    }
  }

  private fun handle(store: FocusStore, body: String) {
    val events: JSONArray = try {
      val json = body.trim()
      if (json.startsWith("[")) JSONArray(json) else JSONObject(json).optJSONArray("events") ?: JSONArray()
    } catch (_: Exception) {
      return
    }
    for (i in 0 until events.length()) {
      val event = events.optJSONObject(i) ?: continue
      store.lastEventId = maxOf(store.lastEventId, event.optLong("id"))
      val payload = event.optJSONObject("payload") ?: JSONObject()
      when (event.optString("kind")) {
        "killed" -> notifyKilled(payload)
        "shield_earned" -> notifyShield(
          context.getString(R.string.focus_shield_earned_title),
          context.getString(R.string.focus_shield_earned_text, payload.optInt("shields")),
        )
        "shield_blocked" -> notifyShield(
          context.getString(R.string.focus_shield_blocked_title),
          context.getString(
            R.string.focus_shield_blocked_text,
            payload.optString("killerNickname").ifBlank { context.getString(R.string.focus_nearby_anonymous_player) },
            payload.optInt("shields"),
          ),
        )
        // An admin changed the player's nickname or removed their photo: say so, and what the nickname is now.
        "admin_nickname" -> notifyShield(
          context.getString(R.string.focus_admin_nickname_title),
          context.getString(R.string.focus_admin_nickname_text, payload.optString("nickname")),
        )
        "admin_photo" -> notifyShield(
          context.getString(R.string.focus_admin_photo_title),
          context.getString(R.string.focus_admin_photo_text),
        )
      }
    }
  }

  private fun notifyKilled(payload: JSONObject) {
    val nickname = payload.optString("killerNickname").ifBlank { context.getString(R.string.focus_nearby_anonymous_player) }
    val lost = payload.optInt("pointsLost")
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, context.getString(R.string.focus_killed_channel), NotificationManager.IMPORTANCE_HIGH))
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID)
    else @Suppress("DEPRECATION") Notification.Builder(context)
    // Says who and how many points, and nothing else: no revenge button, no other advantage.
    val notification = builder
      .setContentTitle(context.getString(R.string.focus_killed_title))
      .setContentText(context.getString(R.string.focus_killed_text, nickname, lost))
      .setSmallIcon(android.R.drawable.ic_dialog_alert)
      .setAutoCancel(true)
      .build()
    manager.notify(System.currentTimeMillis().toInt(), notification)
    Log.i("FocusEvents", "killed notification shown")
  }

  private fun notifyShield(title: String, text: String) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, context.getString(R.string.focus_killed_channel), NotificationManager.IMPORTANCE_HIGH))
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID)
    else @Suppress("DEPRECATION") Notification.Builder(context)
    manager.notify(
      System.currentTimeMillis().toInt(),
      builder.setContentTitle(title).setContentText(text).setSmallIcon(android.R.drawable.ic_dialog_info).setAutoCancel(true).build(),
    )
  }

  private fun sleepQuietly(ms: Long) {
    try {
      sleep(ms)
    } catch (_: InterruptedException) {
      // finish() interrupts the sleep
    }
  }

  private companion object {
    const val CHANNEL_ID = "focus_killed"
  }
}
