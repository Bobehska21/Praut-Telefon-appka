package expo.modules.focus

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

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

  // --- stop protection ----------------------------------------------------

  /** "none", "countdown" or "sentence". Mirrored from the JS setting so the launcher can enforce it natively. */
  var unlockGuard: String
    get() = prefs.getString(K_UNLOCK_GUARD, "none") ?: "none"
    set(value) {
      prefs.edit().putString(K_UNLOCK_GUARD, value).apply()
    }
}
