package expo.modules.focus

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Full-screen "this app is off" screen drawn over a blocked app (SYSTEM_ALERT_WINDOW).
 * All methods must be called on the main thread.
 */
class BlockOverlay(context: Context) {
  private val context = context.applicationContext
  private val windowManager = this.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private var view: View? = null

  val isShowing: Boolean get() = view != null

  fun show() {
    if (view != null) return
    if (!Settings.canDrawOverlays(context)) return

    val bg = context.getColor(R.color.focus_bg)
    val fg = context.getColor(R.color.focus_text)

    val message = TextView(context).apply {
      text = context.getString(R.string.focus_blocked_message)
      setTextColor(fg)
      textSize = 22f
      gravity = Gravity.CENTER
    }
    val back = Button(context).apply {
      text = context.getString(R.string.focus_blocked_back)
      setOnClickListener { goHome(context) }
    }
    val root = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(bg)
      val pad = (24 * resources.displayMetrics.density).toInt()
      setPadding(pad, pad, pad, pad)
      addView(message)
      addView(
        back,
        LinearLayout.LayoutParams(
          LinearLayout.LayoutParams.WRAP_CONTENT,
          LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = pad },
      )
      // The hardware/gesture back key behaves like the button instead of revealing the app.
      isFocusableInTouchMode = true
      setOnKeyListener { _, keyCode, event ->
        if (keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
          goHome(context)
          true
        } else {
          false
        }
      }
    }

    val type =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
      PixelFormat.OPAQUE,
    )

    runCatching {
      windowManager.addView(root, params)
      view = root
      root.requestFocus()
    }
  }

  fun hide() {
    val v = view ?: return
    view = null
    runCatching { windowManager.removeView(v) }
  }

  companion object {
    /** Send the user to the focus launcher (grid of allowed apps). */
    fun goHome(context: Context, blocked: Boolean = false) {
      val intent = Intent(context, LauncherActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra(LauncherActivity.EXTRA_BLOCKED, blocked)
      runCatching { context.startActivity(intent) }
      BlockEngine.onLeftBlockedApp()
    }
  }
}
