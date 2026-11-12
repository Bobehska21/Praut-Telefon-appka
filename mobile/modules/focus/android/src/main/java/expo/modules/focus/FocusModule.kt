package expo.modules.focus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import android.util.Log
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS-facing side of the Android implementation. Function names and result
 * shapes mirror `FocusModuleApi` in `src/modules/focus/types.ts`.
 */
class FocusModule : Module() {
  private val ctx
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val store get() = FocusStore.get(ctx)

  private var packagesReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("Focus")

    Events("onPackagesChanged")

    // Tell JS when an app is installed, removed or updated so the picker can refresh itself.
    OnCreate {
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_PACKAGE_ADDED)
        addAction(Intent.ACTION_PACKAGE_REMOVED)
        addAction(Intent.ACTION_PACKAGE_REPLACED)
        addDataScheme("package")
      }
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          sendEvent("onPackagesChanged", mapOf("packageName" to (intent.data?.schemeSpecificPart ?: "")))
        }
      }
      packagesReceiver = receiver
      // System broadcasts, so the receiver must be exported on Android 13+.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ctx.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
      } else {
        ctx.registerReceiver(receiver, filter)
      }
    }

    OnDestroy {
      packagesReceiver?.let { runCatching { ctx.unregisterReceiver(it) } }
      packagesReceiver = null
    }

    AsyncFunction("getInstalledApps") {
      val pm = ctx.packageManager
      val apps = AppCatalog.launchableApps(ctx)
        .filter { it.packageName != ctx.packageName && AppCatalog.hasPackage(pm, it.packageName) }
      // Compare this number with the apps on the home screen; fewer means package visibility is limited.
      Log.i("FocusModule", "getInstalledApps: ${apps.size} launchable apps")
      apps.map {
        mapOf(
          "id" to it.packageName,
          "label" to it.label,
          "iconUri" to AppCatalog.cachedIconDataUri(ctx, it),
        )
      }
    }

    AsyncFunction("setAllowedApps") { profileId: String, appIds: List<String> ->
      store.setAllowedApps(profileId, appIds)
    }

    AsyncFunction("setSchedules") { items: List<Map<String, Any?>> ->
      store.setSchedules(
        items.map { item ->
          ScheduleItem(
            profileId = item["profileId"] as String,
            days = (item["days"] as List<*>).map { (it as Number).toInt() }.toSet(),
            startMinute = (item["startMinute"] as Number).toInt(),
            endMinute = (item["endMinute"] as Number).toInt(),
          )
        },
      )
      // Schedules may have just become active, or the next start may have changed.
      FocusController.tick(ctx)
    }

    AsyncFunction("setUnlockGuard") { mode: String ->
      store.unlockGuard = if (mode == "countdown" || mode == "sentence") mode else "none"
    }

    AsyncFunction("setNearby") { enabled: Boolean, nickname: String, rank: String, level: Int, streak: Int ->
      store.nearbyEnabled = enabled
      store.setNearbyProfile(nickname, rank, level, streak)
    }

    // --- multiplayer ---------------------------------------------------------------------------

    /** Public half of this device's signing key; the server stores it when the player registers. */
    AsyncFunction("getDevicePublicKey") {
      DeviceKey.publicKeyBase64()
    }

    /** Remember the server-issued player id (needed to sign proximity proofs) or clear it with an empty string. */
    AsyncFunction("setPlayerId") { playerId: String ->
      store.playerId = playerId.ifBlank { null }
      if (playerId.isBlank()) store.wasteman = false
    }

    /** The server is authoritative for the wasteman state; JS pushes its view here after each sync. */
    AsyncFunction("setWasteman") { wasteman: Boolean ->
      store.wasteman = wasteman && store.playerId != null && store.nearbyEnabled
      FocusController.tick(ctx)
    }

    /** Server address and bearer token for the background sync; empty strings clear them. */
    AsyncFunction("setServer") { url: String, token: String ->
      store.serverUrl = url.ifBlank { null }
      store.serverToken = token.ifBlank { null }
      if (token.isBlank()) {
        store.lastEventId = 0L
        store.setSyncQueue(org.json.JSONArray())
      }
    }

    AsyncFunction("getTodayToken") {
      NearbyManager.todayToken(ctx)
    }

    AsyncFunction("getNearbyTokens") {
      NearbyManager.nearbyTokens()
    }

    /** Killer side: exchange the server's challenge with the wasteman over Bluetooth and return their signature. */
    AsyncFunction("requestKillProof") { token: String, payload: String, promise: Promise ->
      Handler(Looper.getMainLooper()).post {
        NearbyManager.requestKillProof(ctx, token, payload) { signature, error ->
          if (signature != null) promise.resolve(signature)
          else promise.reject(CodedException(error ?: "failed", "Could not get a proximity proof: ${error ?: "failed"}", null))
        }
      }
    }

    AsyncFunction("getNearbyEncounters") {
      store.encounters().map {
        mapOf("at" to it.at, "nickname" to it.nickname, "rank" to it.rank, "level" to it.level, "streak" to it.streak)
      }
    }

    AsyncFunction("drainBlockedAttempts") {
      store.drainAttempts().map { mapOf("at" to it.at, "appId" to it.appId) }
    }

    AsyncFunction("startFocus") { profileId: String, durationMs: Double?, multiplier: Int? ->
      val endsAt = durationMs?.let { System.currentTimeMillis() + it.toLong() }
      FocusController.start(ctx, profileId, endsAt, multiplier ?: 1)
      FocusController.status(ctx)
    }

    AsyncFunction("stopFocus") {
      FocusController.stop(ctx)
      FocusController.status(ctx)
    }

    AsyncFunction("getStatus") {
      FocusController.status(ctx)
    }

    AsyncFunction("getPermissions") {
      Permissions.names.associateWith { Permissions.state(ctx, it) }
    }

    AsyncFunction("requestPermission") { name: String ->
      if (name !in Permissions.names) {
        throw CodedException("UNKNOWN_PERMISSION", "Unknown permission: $name", null)
      }
      // Opens the system screen. For settings pages the real answer is only known after the user
      // comes back, so the caller must re-read getPermissions() when the app returns to foreground.
      if (!Permissions.isGranted(ctx, name)) {
        Permissions.request(ctx, appContext.currentActivity, name)
      }
      Permissions.state(ctx, name)
    }
  }
}
