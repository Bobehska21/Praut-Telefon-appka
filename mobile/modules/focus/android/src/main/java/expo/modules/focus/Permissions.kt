package expo.modules.focus

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.AppOpsManager
import android.app.NotificationManager
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings

/** Names match the `PermissionName` union in `src/modules/focus/types.ts`. */
object Permissions {
  val names = listOf(
    "usageAccess",
    "overlay",
    "notifications",
    "batteryOptimization",
    "defaultLauncher",
    "accessibility",
    "exactAlarm",
  )

  private const val NOTIFICATION_REQUEST_CODE = 4102
  private const val ROLE_REQUEST_CODE = 4103

  fun isGranted(context: Context, name: String): Boolean = when (name) {
    "usageAccess" -> usageAccess(context)
    "overlay" -> Settings.canDrawOverlays(context)
    "notifications" -> notifications(context)
    "batteryOptimization" ->
      context.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(context.packageName) == true
    "defaultLauncher" -> defaultLauncher(context)
    "accessibility" -> accessibility(context)
    "exactAlarm" ->
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        context.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == true
    else -> false
  }

  fun state(context: Context, name: String): String =
    if (name in names) (if (isGranted(context, name)) "granted" else "denied") else "unknown"

  /**
   * Opens the right system screen for `name`. Most of these are settings pages
   * where the user flips a switch, so the new state is only known after they return.
   */
  fun request(context: Context, activity: Activity?, name: String) {
    if (name == "notifications" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && activity != null) {
      activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_REQUEST_CODE)
      return
    }
    if (name == "defaultLauncher" && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && activity != null) {
      val roles = context.getSystemService(RoleManager::class.java)
      if (roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME) && !roles.isRoleHeld(RoleManager.ROLE_HOME)) {
        runCatching { activity.startActivityForResult(roles.createRequestRoleIntent(RoleManager.ROLE_HOME), ROLE_REQUEST_CODE) }
        return
      }
    }
    val intent = settingsIntent(context, name) ?: return
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
  }

  private fun settingsIntent(context: Context, name: String): Intent? {
    val pkgUri = Uri.parse("package:${context.packageName}")
    return when (name) {
      "usageAccess" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, pkgUri)
      "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri)
      "notifications" ->
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      // The list screen, not the per-app prompt: the prompt needs a Play-restricted permission.
      "batteryOptimization" -> Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      "defaultLauncher" -> Intent(Settings.ACTION_HOME_SETTINGS)
      "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      "exactAlarm" ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkgUri)
        else null
      else -> null
    }
  }

  private fun usageAccess(context: Context): Boolean {
    val ops = context.getSystemService(AppOpsManager::class.java) ?: return false
    val mode =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        @Suppress("DEPRECATION")
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      } else {
        @Suppress("DEPRECATION")
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  private fun notifications(context: Context): Boolean {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return false
    }
    return context.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() != false
  }

  private fun defaultLauncher(context: Context): Boolean {
    val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    val resolved = context.packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)
    return resolved?.activityInfo?.packageName == context.packageName
  }

  private fun accessibility(context: Context): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
      ?: return false
    val ours = ComponentName(context, FocusAccessibilityService::class.java).flattenToString()
    return enabled.split(':').any { it.equals(ours, ignoreCase = true) }
  }
}
