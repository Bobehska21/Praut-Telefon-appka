package expo.modules.focus

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

  override fun definition() = ModuleDefinition {
    Name("Focus")

    AsyncFunction("getInstalledApps") {
      val pm = ctx.packageManager
      AppCatalog.launchableApps(ctx)
        .filter { it.packageName != ctx.packageName && AppCatalog.hasPackage(pm, it.packageName) }
        .map {
          mapOf(
            "id" to it.packageName,
            "label" to it.label,
            "iconUri" to AppCatalog.iconDataUri(it.icon),
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

    AsyncFunction("drainBlockedAttempts") {
      store.drainAttempts().map { mapOf("at" to it.at, "appId" to it.appId) }
    }

    AsyncFunction("startFocus") { profileId: String, durationMs: Double? ->
      val endsAt = durationMs?.let { System.currentTimeMillis() + it.toLong() }
      FocusController.start(ctx, profileId, endsAt)
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
