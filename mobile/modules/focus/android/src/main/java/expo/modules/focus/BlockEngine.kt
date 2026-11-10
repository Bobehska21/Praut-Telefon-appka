package expo.modules.focus

import android.content.Context
import android.os.Handler
import android.os.Looper

/**
 * Decides whether the foreground app is allowed and shows/hides the block
 * overlay. Fed by [FocusService] (UsageStats polling) and, optionally, by
 * [FocusAccessibilityService]. Both call [onForeground] on the main thread;
 * repeated calls for the same package are no-ops.
 */
object BlockEngine {
  private val main = Handler(Looper.getMainLooper())
  private var overlay: BlockOverlay? = null
  private var lastPackage: String? = null
  private var allowed: Set<String> = emptySet()
  private var allowedLoadedAt = 0L

  private const val ALLOWED_TTL_MS = 30_000L

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

    if (isAllowed(app, store, state, pkg)) {
      hideOverlay()
    } else {
      store.addAttempt(System.currentTimeMillis(), pkg)
      overlayFor(app).show()
    }
  }

  /**
   * Called when the user taps "back" on the overlay. Only hides the overlay:
   * `lastPackage` stays, so the stale blocked package is not counted again
   * before the launcher's own foreground event arrives.
   */
  fun onLeftBlockedApp() {
    hideOverlay()
  }

  /** Forget everything; called on start and stop of a session. */
  fun reset() {
    lastPackage = null
    allowedLoadedAt = 0L
    hideOverlay()
  }

  private fun isAllowed(context: Context, store: FocusStore, state: FocusState, pkg: String): Boolean {
    val now = System.currentTimeMillis()
    if (now - allowedLoadedAt > ALLOWED_TTL_MS) {
      val profile = state.profileId?.let { store.allowedApps(it) } ?: emptySet()
      allowed = profile + AppCatalog.alwaysAllowed(context)
      allowedLoadedAt = now
    }
    return pkg in allowed
  }

  private fun overlayFor(context: Context): BlockOverlay =
    overlay ?: BlockOverlay(context).also { overlay = it }

  private fun hideOverlay() {
    if (Looper.myLooper() == Looper.getMainLooper()) overlay?.hide() else main.post { overlay?.hide() }
  }
}
