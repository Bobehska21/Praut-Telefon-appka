package expo.modules.focus

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.FrameLayout

/**
 * Two overlay windows owned by the accessibility service (TYPE_ACCESSIBILITY_OVERLAY, which needs no
 * extra permission). Both leave the status bar alone, so the notification shade stays usable.
 *
 * - Curtain: an opaque screen shown the instant a non-allowed app appears, before the focus screen
 *   has finished launching, so the launcher or Recents never flash. It removes itself after a short
 *   timeout, so a failed launch can never trap the user behind it.
 * - Navigation guard: an invisible strip over the bottom navigation bar while the focus screen is in
 *   front. It swallows touches, so the Back/Home/Recents buttons cannot be pressed or swiped into view.
 *
 * All methods must be called on the main thread.
 */
class FocusWindows(private val service: AccessibilityService) {
  private val windowManager = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private val handler = Handler(Looper.getMainLooper())
  private var curtain: View? = null
  private var navGuard: View? = null
  private val dropCurtain = Runnable { hideCurtain() }

  fun showCurtain() {
    if (curtain == null) {
      val view = FrameLayout(service).apply { setBackgroundColor(service.getColor(R.color.focus_bg)) }
      val (_, height) = areaBelowStatusBar()
      val params = baseParams(height, PixelFormat.OPAQUE)
      if (add(view, params)) curtain = view
    }
    handler.removeCallbacks(dropCurtain)
    handler.postDelayed(dropCurtain, CURTAIN_MAX_MS)
  }

  fun hideCurtain() {
    handler.removeCallbacks(dropCurtain)
    curtain?.let { remove(it) }
    curtain = null
  }

  fun setNavGuard(on: Boolean) {
    if (!on) {
      navGuard?.let { remove(it) }
      navGuard = null
      return
    }
    if (navGuard != null) return
    val view = View(service)
    if (add(view, baseParams(navigationBarHeight(), PixelFormat.TRANSPARENT))) navGuard = view
  }

  /** Removes everything; called when focus mode ends or the service goes away. */
  fun clear() {
    hideCurtain()
    setNavGuard(false)
  }

  // --- helpers ---------------------------------------------------------------

  private fun baseParams(height: Int, format: Int) = WindowManager.LayoutParams(
    WindowManager.LayoutParams.MATCH_PARENT,
    height,
    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
    format,
  ).apply { gravity = Gravity.BOTTOM }

  private fun add(view: View, params: WindowManager.LayoutParams): Boolean =
    runCatching { windowManager.addView(view, params) }.isSuccess

  private fun remove(view: View) {
    runCatching { windowManager.removeView(view) }
  }

  /** Screen size minus the status bar, so the notification shade can still be pulled down. */
  private fun areaBelowStatusBar(): Pair<Int, Int> {
    val total: Int
    val statusBar: Int
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = windowManager.currentWindowMetrics
      total = metrics.bounds.height()
      statusBar = metrics.windowInsets.getInsetsIgnoringVisibility(WindowInsets.Type.statusBars()).top
    } else {
      total = service.resources.displayMetrics.heightPixels
      statusBar = dimen("status_bar_height")
    }
    return metricsWidth() to (total - statusBar)
  }

  private fun metricsWidth(): Int = service.resources.displayMetrics.widthPixels

  private fun navigationBarHeight(): Int {
    val fromInsets =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        windowManager.currentWindowMetrics.windowInsets
          .getInsetsIgnoringVisibility(WindowInsets.Type.navigationBars()).bottom
      } else {
        dimen("navigation_bar_height")
      }
    // A little extra: the transient bar can be a few pixels taller than the resting inset.
    return (if (fromInsets > 0) fromInsets else (48 * service.resources.displayMetrics.density).toInt()) + 8
  }

  private fun dimen(name: String): Int {
    val id = service.resources.getIdentifier(name, "dimen", "android")
    return if (id > 0) service.resources.getDimensionPixelSize(id) else 0
  }

  private companion object {
    const val CURTAIN_MAX_MS = 1500L
  }
}
