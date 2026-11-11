package expo.modules.focus

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/**
 * Main enforcement of focus mode: Android pushes a window event the moment any app (including the
 * launcher, Recents and Settings) comes to the front, so a forbidden one is replaced by the focus
 * screen immediately instead of after a polling interval.
 *
 * Privacy: reads ONLY the package name of the window that came to the front
 * (`canRetrieveWindowContent="false"`). It never reads text or content, and sends nothing anywhere.
 * Google Play requires this to be disclosed prominently; see the onboarding text and README.
 */
class FocusAccessibilityService : AccessibilityService() {
  override fun onServiceConnected() {
    super.onServiceConnected()
    focusWindows = FocusWindows(this)
    // After a reboot the system starts this service again; if focus mode is still on (restored by
    // BootReceiver), bring the focus screen up straight away.
    if (FocusStore.get(this).state().active) BlockOverlay.goHome(this)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString()?.takeIf { it.isNotBlank() } ?: return
    BlockEngine.onForeground(this, pkg)
  }

  override fun onInterrupt() {}

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    focusWindows?.clear()
    focusWindows = null
    return super.onUnbind(intent)
  }

  companion object {
    /** Overlay windows; only exists while the service is connected. Main thread only. */
    @Volatile var focusWindows: FocusWindows? = null
  }
}
