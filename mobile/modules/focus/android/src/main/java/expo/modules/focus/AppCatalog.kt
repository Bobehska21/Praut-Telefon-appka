package expo.modules.focus

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.provider.Telephony
import android.telecom.TelecomManager
import android.util.Base64
import android.view.inputmethod.InputMethodManager
import java.io.ByteArrayOutputStream

data class LaunchableApp(val packageName: String, val label: String, val icon: Drawable)

object AppCatalog {
  /**
   * Phone, messages and emergency calling are always allowed. Packages that are
   * not apps the user "uses" but that the system shows on top (keyboard, system
   * UI, permission dialogs) are allowed too, otherwise they would trigger the block screen.
   */
  fun alwaysAllowed(context: Context): Set<String> {
    val set = hashSetOf(
      context.packageName,
      "android",
      "com.android.systemui",
      "com.android.phone",
      "com.android.server.telecom",
      "com.android.incallui",
      "com.android.emergency",
      "com.android.dialer",
      "com.google.android.dialer",
      "com.android.mms",
      "com.google.android.apps.messaging",
      "com.samsung.android.dialer",
      "com.samsung.android.messaging",
      "com.google.android.permissioncontroller",
      "com.android.permissioncontroller",
    )

    runCatching {
      context.getSystemService(TelecomManager::class.java)?.defaultDialerPackage?.let(set::add)
    }
    runCatching { Telephony.Sms.getDefaultSmsPackage(context)?.let(set::add) }
    runCatching {
      context.getSystemService(InputMethodManager::class.java)
        ?.enabledInputMethodList
        ?.forEach { set.add(it.packageName) }
    }
    runCatching {
      val dial = Intent(Intent.ACTION_DIAL)
      context.packageManager.queryIntentActivities(dial, 0).forEach { set.add(it.activityInfo.packageName) }
    }
    return set
  }

  /**
   * Packages that act as a home screen (other than ours). While focus mode is on, reaching one of
   * them means "the user pressed Home", so we show our own grid instead. Settings' FallbackHome is
   * excluded: it is a placeholder, not a launcher, and sits in the Settings package.
   */
  fun homePackages(context: Context): Set<String> {
    val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    return context.packageManager.queryIntentActivities(home, 0)
      .filter {
        it.activityInfo.packageName != context.packageName &&
          it.activityInfo.packageName != "com.android.settings" &&
          !it.activityInfo.name.contains("FallbackHome", ignoreCase = true)
      }
      .map { it.activityInfo.packageName }
      .toSet()
  }

  /** Every app that has a launcher entry, one per package, sorted by label. */
  fun launchableApps(context: Context): List<LaunchableApp> {
    val pm = context.packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val resolved: List<ResolveInfo> = pm.queryIntentActivities(intent, 0)
    return resolved
      .distinctBy { it.activityInfo.packageName }
      .map {
        LaunchableApp(
          packageName = it.activityInfo.packageName,
          label = it.loadLabel(pm).toString(),
          icon = it.loadIcon(pm),
        )
      }
      .sortedBy { it.label.lowercase() }
  }

  fun hasPackage(pm: PackageManager, packageName: String): Boolean =
    runCatching { pm.getApplicationInfo(packageName, 0) }.isSuccess

  /** `data:image/png;base64,...` at `sizePx` square. */
  fun iconDataUri(icon: Drawable, sizePx: Int = 96): String {
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    icon.setBounds(0, 0, sizePx, sizePx)
    icon.draw(canvas)
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    bitmap.recycle()
    return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }
}
