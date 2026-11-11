package expo.modules.focus

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.SecureRandom

/** A schedule as pushed from JS. `days`: 0 = Sunday ... 6 = Saturday. */
data class ScheduleItem(
  val profileId: String,
  val days: Set<Int>,
  val startMinute: Int,
  val endMinute: Int,
)

/** `endsAt == 0L` means "until stopped manually". */
data class FocusState(
  val active: Boolean,
  val profileId: String?,
  val startedAt: Long,
  val endsAt: Long,
)

data class BlockedAttempt(val at: Long, val appId: String)

/** Someone nearby who was accepted by the user, with what they chose to share. */
data class Encounter(val at: Long, val nickname: String, val rank: String, val level: Int, val streak: Int)

/**
 * Single source of truth for focus state. Lives in SharedPreferences so it
 * survives process death and reboot; the JS store only mirrors it.
 */
class FocusStore private constructor(context: Context) {
  private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  companion object {
    private const val PREFS = "focus_mode"
    private const val K_ACTIVE = "active"
    private const val K_PROFILE = "profileId"
    private const val K_STARTED = "startedAt"
    private const val K_ENDS = "endsAt"
    private const val K_SCHEDULES = "schedules"
    private const val K_SUPPRESS_UNTIL = "suppressUntil"
    private const val K_ATTEMPTS = "attempts"
    private const val K_ATTEMPT_COUNT = "attemptCount"
    private const val K_UNLOCK_GUARD = "unlockGuard"
    private const val K_NEARBY_ENABLED = "nearbyEnabled"
    private const val K_WASTEMAN = "wasteman"
    private const val K_PLAYER_ID = "playerId"
    private const val K_SERVER_URL = "serverUrl"
    private const val K_SERVER_TOKEN = "serverToken"
    private const val K_LAST_EVENT = "lastEventId"
    private const val K_SYNC_QUEUE = "syncQueue"
    private const val K_NEARBY_PROFILE = "nearbyProfile"
    private const val K_NEARBY_SECRET = "nearbySecret"
    private const val K_NEARBY_SEEN = "nearbySeen"
    private const val K_ENCOUNTERS = "encounters"
    private const val MAX_ENCOUNTERS = 50
    private const val ALLOWED_PREFIX = "allowed_"
    private const val MAX_ATTEMPTS = 2000

    @Volatile private var instance: FocusStore? = null

    fun get(context: Context): FocusStore =
      instance ?: synchronized(this) {
        instance ?: FocusStore(context.applicationContext).also { instance = it }
      }
  }

  // --- whitelist -----------------------------------------------------------

  fun allowedApps(profileId: String): Set<String> =
    HashSet(prefs.getStringSet(ALLOWED_PREFIX + profileId, emptySet()) ?: emptySet())

  fun setAllowedApps(profileId: String, apps: Collection<String>) {
    // putStringSet must receive a fresh set, never the instance returned by getStringSet.
    prefs.edit().putStringSet(ALLOWED_PREFIX + profileId, HashSet(apps)).apply()
  }

  // --- session state -------------------------------------------------------

  fun state(): FocusState =
    FocusState(
      active = prefs.getBoolean(K_ACTIVE, false),
      profileId = prefs.getString(K_PROFILE, null),
      startedAt = prefs.getLong(K_STARTED, 0L),
      endsAt = prefs.getLong(K_ENDS, 0L),
    )

  fun setActive(profileId: String, startedAt: Long, endsAt: Long) {
    prefs.edit()
      .putBoolean(K_ACTIVE, true)
      .putString(K_PROFILE, profileId)
      .putLong(K_STARTED, startedAt)
      .putLong(K_ENDS, endsAt)
      .putInt(K_ATTEMPT_COUNT, 0)
      .apply()
  }

  fun clearActive() {
    prefs.edit()
      .putBoolean(K_ACTIVE, false)
      .remove(K_PROFILE)
      .putLong(K_STARTED, 0L)
      .putLong(K_ENDS, 0L)
      .apply()
  }

  /** A manual stop inside a schedule window must not be undone by the next alarm. */
  var suppressUntil: Long
    get() = prefs.getLong(K_SUPPRESS_UNTIL, 0L)
    set(value) {
      prefs.edit().putLong(K_SUPPRESS_UNTIL, value).apply()
    }

  // --- schedules -----------------------------------------------------------

  fun schedules(): List<ScheduleItem> {
    val raw = prefs.getString(K_SCHEDULES, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        val days = o.getJSONArray("days")
        ScheduleItem(
          profileId = o.getString("profileId"),
          days = (0 until days.length()).map { days.getInt(it) }.toSet(),
          startMinute = o.getInt("startMinute"),
          endMinute = o.getInt("endMinute"),
        )
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun setSchedules(items: List<ScheduleItem>) {
    val arr = JSONArray()
    for (s in items) {
      arr.put(
        JSONObject()
          .put("profileId", s.profileId)
          .put("days", JSONArray(s.days.toList()))
          .put("startMinute", s.startMinute)
          .put("endMinute", s.endMinute),
      )
    }
    prefs.edit().putString(K_SCHEDULES, arr.toString()).apply()
  }

  // --- blocked attempts ----------------------------------------------------

  @Synchronized
  fun addAttempt(at: Long, appId: String) {
    // One "<epoch>|<package>" per line. Package names never contain '|' or '\n'.
    val lines = (prefs.getString(K_ATTEMPTS, "") ?: "").split('\n').filter { it.isNotEmpty() }
    val next = (lines + "$at|$appId").takeLast(MAX_ATTEMPTS)
    prefs.edit()
      .putString(K_ATTEMPTS, next.joinToString("\n"))
      .putInt(K_ATTEMPT_COUNT, prefs.getInt(K_ATTEMPT_COUNT, 0) + 1)
      .apply()
  }

  /** Returns attempts recorded since the last call and clears them. */
  @Synchronized
  fun drainAttempts(): List<BlockedAttempt> {
    val lines = (prefs.getString(K_ATTEMPTS, "") ?: "").split('\n').filter { it.isNotEmpty() }
    prefs.edit().remove(K_ATTEMPTS).apply()
    return lines.mapNotNull { line ->
      val sep = line.indexOf('|')
      val at = line.substring(0, if (sep < 0) line.length else sep).toLongOrNull()
      if (at == null) null else BlockedAttempt(at, if (sep < 0) "" else line.substring(sep + 1))
    }
  }

  fun attemptCount(): Int = prefs.getInt(K_ATTEMPT_COUNT, 0)

  // --- nearby users (Bluetooth) ------------------------------------------

  /** Whether this user takes part in nearby detection. On by default; it still needs the Bluetooth permission. */
  var nearbyEnabled: Boolean
    get() = prefs.getBoolean(K_NEARBY_ENABLED, true)
    set(value) {
      prefs.edit().putBoolean(K_NEARBY_ENABLED, value).apply()
    }

  /**
   * True after the user manually stopped a running focus mode while taking part in multiplayer, until
   * focus mode is started again. The server is authoritative; this lets the phone stay visible over
   * Bluetooth (so it can be found and killed) even when it is offline.
   */
  var wasteman: Boolean
    get() = prefs.getBoolean(K_WASTEMAN, false)
    set(value) {
      prefs.edit().putBoolean(K_WASTEMAN, value).apply()
    }

  /** This player's id on the server (`null` until registered). Needed to sign proximity proofs. */
  var playerId: String?
    get() = prefs.getString(K_PLAYER_ID, null)
    set(value) {
      prefs.edit().putString(K_PLAYER_ID, value).apply()
    }

  /** Game server base URL and bearer token, given by JS after joining. Private to this app (app sandbox). */
  var serverUrl: String?
    get() = prefs.getString(K_SERVER_URL, null)
    set(value) {
      prefs.edit().putString(K_SERVER_URL, value).apply()
    }

  var serverToken: String?
    get() = prefs.getString(K_SERVER_TOKEN, null)
    set(value) {
      prefs.edit().putString(K_SERVER_TOKEN, value).apply()
    }

  var lastEventId: Long
    get() = prefs.getLong(K_LAST_EVENT, 0L)
    set(value) {
      prefs.edit().putLong(K_LAST_EVENT, value).apply()
    }

  /** Focus start/stop events waiting for a connection, oldest first. */
  fun syncQueue(): JSONArray = try { JSONArray(prefs.getString(K_SYNC_QUEUE, "[]")) } catch (_: Exception) { JSONArray() }

  fun setSyncQueue(queue: JSONArray) {
    prefs.edit().putString(K_SYNC_QUEUE, queue.toString()).apply()
  }

  /** Random per-install key. Never leaves the device; only a daily token derived from it is broadcast. */
  @Synchronized
  fun nearbySecret(): ByteArray {
    val existing = prefs.getString(K_NEARBY_SECRET, null)
    if (existing != null) return android.util.Base64.decode(existing, android.util.Base64.NO_WRAP)
    val fresh = ByteArray(32).also { SecureRandom().nextBytes(it) }
    prefs.edit().putString(K_NEARBY_SECRET, android.util.Base64.encodeToString(fresh, android.util.Base64.NO_WRAP)).apply()
    return fresh
  }

  /** What other users see after they accept: a chosen nickname (optional), rank, level and streak. Nothing else. */
  fun setNearbyProfile(nickname: String, rank: String, level: Int, streak: Int) {
    val json = JSONObject()
      .put("n", nickname.trim().take(20))
      .put("r", rank)
      .put("l", level)
      .put("s", streak)
    prefs.edit().putString(K_NEARBY_PROFILE, json.toString()).apply()
  }

  fun nearbyProfileBytes(): ByteArray =
    (prefs.getString(K_NEARBY_PROFILE, null) ?: JSONObject().put("n", "").put("r", "novice").put("l", 1).put("s", 0).toString())
      .toByteArray(Charsets.UTF_8)

  /** Returns true the first time a token is seen on `day` (a new day means a new token anyway). */
  @Synchronized
  fun markNearbySeen(token: String, day: String): Boolean {
    val seen = try { JSONObject(prefs.getString(K_NEARBY_SEEN, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    if (seen.optString(token) == day) return false
    // Keep only today's tokens so the list never grows.
    val fresh = JSONObject()
    for (key in seen.keys()) if (seen.optString(key) == day) fresh.put(key, day)
    fresh.put(token, day)
    prefs.edit().putString(K_NEARBY_SEEN, fresh.toString()).apply()
    return true
  }

  @Synchronized
  fun addEncounter(encounter: Encounter) {
    val list = encounters().toMutableList()
    list.add(0, encounter)
    val arr = JSONArray()
    for (e in list.take(MAX_ENCOUNTERS)) {
      arr.put(JSONObject().put("at", e.at).put("n", e.nickname).put("r", e.rank).put("l", e.level).put("s", e.streak))
    }
    prefs.edit().putString(K_ENCOUNTERS, arr.toString()).apply()
  }

  fun encounters(): List<Encounter> {
    val raw = prefs.getString(K_ENCOUNTERS, null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map {
        val o = arr.getJSONObject(it)
        Encounter(o.getLong("at"), o.optString("n"), o.optString("r", "novice"), o.optInt("l", 1), o.optInt("s", 0))
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  // --- stop protection ----------------------------------------------------

  /** "none", "countdown" or "sentence". Mirrored from the JS setting so the launcher can enforce it natively. */
  var unlockGuard: String
    get() = prefs.getString(K_UNLOCK_GUARD, "none") ?: "none"
    set(value) {
      prefs.edit().putString(K_UNLOCK_GUARD, value).apply()
    }
}
