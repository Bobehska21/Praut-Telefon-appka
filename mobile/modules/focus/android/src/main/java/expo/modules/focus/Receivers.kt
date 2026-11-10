package expo.modules.focus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-arms focus mode after a reboot or an app update. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> FocusController.tick(context)
    }
  }
}

/** Fires when a timer ends or a schedule window begins. */
class ScheduleReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == FocusController.ACTION_TICK) FocusController.tick(context)
  }
}
