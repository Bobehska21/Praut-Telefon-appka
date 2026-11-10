package expo.modules.focus

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/**
 * OPTIONAL, off by default: only runs once the user enables it in system
 * Accessibility settings (the "Extended blocking" switch in the app). It reads
 * only the package name of the window that came to the front, never content
 * (`canRetrieveWindowContent="false"`). Google Play reviews apps that declare
 * an AccessibilityService; see README for how to strip it from a Play build.
 */
class FocusAccessibilityService : AccessibilityService() {
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    BlockEngine.onForeground(this, pkg)
  }

  override fun onInterrupt() {}
}
