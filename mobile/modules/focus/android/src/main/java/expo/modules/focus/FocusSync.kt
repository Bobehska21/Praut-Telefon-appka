package expo.modules.focus

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Tells the game server when focus mode starts, runs (heartbeats) and stops, and queues the start/stop
 * events while there is no connection so they are delivered later, in order.
 *
 * The server is authoritative: it credits minutes from the heartbeats and decides who is a wasteman.
 * A stop that could not be delivered is sent later; the player becomes a wasteman on the server only
 * once it arrives (documented limit of server-side checks: going offline delays it, nothing more).
 */
object FocusSync {
  private const val TAG = "FocusSync"
  private const val MAX_QUEUE = 50
  private const val MAX_AGE_MS = 24L * 60 * 60 * 1000

  private val io = Executors.newSingleThreadExecutor()

  private fun enabled(context: Context): Boolean {
    val store = FocusStore.get(context)
    return store.nearbyEnabled && ServerClient.configured(context)
  }

  /** `multiplier` > 1 is a session bet (the server validates 1, 2, 5, 10 and the required duration). */
  fun onStarted(context: Context, multiplier: Int = 1) {
    if (!enabled(context)) return
    enqueue(context, "/v1/focus/start", JSONObject().apply { if (multiplier > 1) put("multiplier", multiplier) })
  }

  fun onStopped(context: Context, manual: Boolean) {
    if (!enabled(context)) return
    enqueue(context, "/v1/focus/stop", JSONObject().put("reason", if (manual) "manual" else "expired"))
  }

  /** One minute of focus. Not queued: a missed heartbeat simply credits less, which is the safe direction. */
  fun heartbeat(context: Context) {
    if (!enabled(context)) return
    val app = context.applicationContext
    io.execute {
      flush(app) // deliver anything queued first, so the server sees events in order
      val response = ServerClient.request(app, "POST", "/v1/focus/heartbeat", JSONObject())
      if (!response.ok && response.status != 0) Log.w(TAG, "heartbeat rejected: ${response.status}")
    }
  }

  /** Try to deliver queued events now (called when the service ticks). */
  fun flushAsync(context: Context) {
    if (!enabled(context)) return
    val app = context.applicationContext
    io.execute { flush(app) }
  }

  // --- queue -------------------------------------------------------------------------------

  private fun enqueue(context: Context, path: String, body: JSONObject) {
    val app = context.applicationContext
    val store = FocusStore.get(app)
    synchronized(this) {
      val queue = store.syncQueue()
      queue.put(JSONObject().put("path", path).put("body", body).put("at", System.currentTimeMillis()))
      store.setSyncQueue(trim(queue))
    }
    io.execute { flush(app) }
  }

  private fun trim(queue: JSONArray): JSONArray {
    val cutoff = System.currentTimeMillis() - MAX_AGE_MS
    val kept = ArrayList<JSONObject>()
    for (i in 0 until queue.length()) {
      val item = queue.getJSONObject(i)
      if (item.optLong("at") >= cutoff) kept.add(item)
    }
    val result = JSONArray()
    kept.takeLast(MAX_QUEUE).forEach(result::put)
    return result
  }

  /** Sends queued events oldest first and stops at the first connection failure; keeps the rest for later. */
  private fun flush(app: Context) {
    val store = FocusStore.get(app)
    while (true) {
      val item = synchronized(this) { store.syncQueue().optJSONObject(0) } ?: return
      val response = ServerClient.request(app, "POST", item.getString("path"), item.optJSONObject("body") ?: JSONObject())
      if (response.status == 0) return // offline: try again later
      // Delivered, or rejected for good (4xx): either way do not send it again.
      synchronized(this) {
        val queue = store.syncQueue()
        val rest = JSONArray()
        for (i in 1 until queue.length()) rest.put(queue.get(i))
        store.setSyncQueue(rest)
      }
      if (!response.ok) Log.w(TAG, "${item.getString("path")} rejected: ${response.status}")
    }
  }
}
