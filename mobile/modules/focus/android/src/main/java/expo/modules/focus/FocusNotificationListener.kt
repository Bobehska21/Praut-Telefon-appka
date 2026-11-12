package expo.modules.focus

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * While focus mode is on, removes notifications from apps that are not allowed, so the phone only
 * shows what the focus profile permits. Notifications from the always-allowed packages (phone,
 * messages, system, this app) are left alone.
 *
 * Privacy: it only looks at the package name of each notification and dismisses it. It never reads
 * the title or text, and nothing leaves the device. Dismissed notifications are not restored when
 * focus mode ends. The system gives the app no way to hold them back for later.
 */
class FocusNotificationListener : NotificationListenerService() {
  override fun onListenerConnected() {
    super.onListenerConnected()
    instance = this
    sweep()
  }

  override fun onListenerDisconnected() {
    if (instance === this) instance = null
    super.onListenerDisconnected()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn != null) dismissIfNotAllowed(sbn)
  }

  /** Clears everything already in the shade from apps that are not allowed. */
  fun sweep() {
    val current = runCatching { activeNotifications }.getOrNull() ?: return
    current.forEach(::dismissIfNotAllowed)
  }

  private fun dismissIfNotAllowed(sbn: StatusBarNotification) {
    if (!FocusStore.get(this).state().active) return
    if (sbn.packageName in BlockEngine.allowedPackages(this)) return
    runCatching { cancelNotification(sbn.key) }
  }

  companion object {
    @Volatile private var instance: FocusNotificationListener? = null

    /** Called when focus mode starts, so notifications that arrived earlier disappear at once. */
    fun sweepNow() {
      instance?.sweep()
    }
  }
}
