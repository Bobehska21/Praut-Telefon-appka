package expo.modules.focus

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log

/**
 * Decides whether the foreground app is allowed and, if not, sends the user back to the focus screen.
 * Fed by [FocusAccessibilityService] (the main source: it is pushed a window event for every app that
 * comes to the front) and by [FocusService] (UsageStats polling, a fallback). Both call [onForeground]
 * on the main thread; repeated calls for the same package are no-ops.
 */
object BlockEngine {
  private const val TAG = "FocusBlock"
  private const val ALLOWED_TTL_MS = 30_000L

  /** A blocked app can emit several window events in a row; relaunching more often would flicker. */
  private const val RELAUNCH_DEBOUNCE_MS = 400L

  private val main = Handler(Looper.getMainLooper())
  private var overlay: BlockOverlay? = null
  private var lastPackage: String? = null
  private var lastRelaunchAt = 0L
  private var allowed: Set<String> = emptySet()
  private var allowedLoadedAt = 0L
  private var homePackages: Set<String> = emptySet()

  fun onForeground(context: Context, pkg: String) {
    val app = context.applicationContext
    val store = FocusStore.get(app)
    val state = store.state()
    if (!state.active) {
      hideOverlay()
      return
    }
    if (pkg == lastPackage) return
    lastPackage = pkg

    refreshCachesIfStale(app, store, state)
    if (pkg in allowed) {
      hideOverlay()
      return
    }

    // Pressing Home or opening Recents lands on a launcher. That is leaving, not an attempt to open
    // a forbidden app, so it is not counted in the statistics.
    val isLauncher = pkg in homePackages
    if (!isLauncher) store.addAttempt(System.currentTimeMillis(), pkg)
    Log.i(TAG, "not allowed: $pkg (launcher=$isLauncher)")

    if (Permissions.isGranted(app, "accessibility")) {
      relaunchFocusScreen(app, blocked = !isLauncher)
    } else if (isLauncher) {
      BlockOverlay.goHome(app)
    } else {
      // No accessibility service: the overlay (when permitted) is all we can draw over the app.
      overlayFor(app).show()
    }
  }

  /** Called when the user taps "back" on the overlay. Only hides it; `lastPackage` stays. */
  fun onLeftBlockedApp() {
    hideOverlay()
  }

  /** Forget everything; called on start and stop of a session. */
  fun reset() {
    lastPackage = null
    allowedLoadedAt = 0L
    hideOverlay()
  }

  private fun relaunchFocusScreen(context: Context, blocked: Boolean) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastRelaunchAt < RELAUNCH_DEBOUNCE_MS) return
    lastRelaunchAt = now
    BlockOverlay.goHome(context, blocked)
  }

  private fun refreshCachesIfStale(context: Context, store: FocusStore, state: FocusState) {
    val now = System.currentTimeMillis()
    if (now - allowedLoadedAt <= ALLOWED_TTL_MS) return
    val profile = state.profileId?.let { store.allowedApps(it) } ?: emptySet()
    allowed = profile + AppCatalog.alwaysAllowed(context)
    homePackages = AppCatalog.homePackages(context)
    allowedLoadedAt = now
  }

  private fun overlayFor(context: Context): BlockOverlay =
    overlay ?: BlockOverlay(context).also { overlay = it }

  private fun hideOverlay() {
    if (Looper.myLooper() == Looper.getMainLooper()) overlay?.hide() else main.post { overlay?.hide() }
  }
}
