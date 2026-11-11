package expo.modules.focus

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.SystemClock
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.widget.Button
import android.widget.EditText
import java.util.Locale
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.ViewGroup
import android.window.OnBackInvokedDispatcher
import android.widget.BaseAdapter
import android.widget.GridView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Date

/**
 * The focus screen: a full-screen grid of the allowed apps with a Stop button. Shown the moment focus
 * mode starts and again whenever the user leaves for something that is not allowed. It is a normal
 * activity (the app does not have to be the default home app); if the user did choose it as their
 * home app it shows every app while focus mode is off. The status bar is left visible and
 * pull-down-able: no immersive mode and no screen pinning.
 */
class LauncherActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var header: TextView
  private lateinit var stopButton: Button
  private lateinit var banner: TextView
  private lateinit var grid: GridView
  private val adapter = AppAdapter()
  private var shownActive: Boolean? = null

  private val watcher = object : Runnable {
    override fun run() {
      // Focus may end (timer, schedule) while this screen is visible.
      if (FocusStore.get(this@LauncherActivity).state().active != shownActive) refresh()
      handler.postDelayed(this, WATCH_MS)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val pad = dp(16)

    header = TextView(this).apply {
      setTextColor(getColor(R.color.focus_text))
      textSize = 18f
    }
    // The way out of focus mode must always be right here, next to the allowed apps.
    stopButton = Button(this).apply {
      text = getString(R.string.focus_stop)
      setOnClickListener { requestStop() }
    }
    val headerRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(pad, dp(32), pad, pad)
      addView(header, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
      addView(stopButton)
    }
    banner = TextView(this).apply {
      text = getString(R.string.focus_blocked_message)
      setTextColor(getColor(R.color.focus_text))
      textSize = 14f
      gravity = Gravity.CENTER
      setPadding(dp(16), dp(8), dp(16), dp(8))
      visibility = View.GONE
    }
    grid = GridView(this).apply {
      numColumns = 4
      verticalSpacing = dp(12)
      horizontalSpacing = dp(4)
      stretchMode = GridView.STRETCH_COLUMN_WIDTH
      setPadding(pad, 0, pad, pad)
      clipToPadding = false
      this.adapter = this@LauncherActivity.adapter
      setOnItemClickListener { _, _, position, _ -> launch(this@LauncherActivity.adapter.getItem(position)) }
    }
    setContentView(
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(getColor(R.color.focus_bg))
        addView(headerRow)
        addView(banner)
        addView(grid, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
      },
    )

    // With targetSdk 33+ the system uses predictive back and no longer calls onBackPressed(), so the
    // callback must be registered or Back would close this screen and reveal what is underneath.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {}
    }
    showBannerIfBlocked(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    showBannerIfBlocked(intent)
  }

  /** Tells the user why they were sent back, for a few seconds. */
  private fun showBannerIfBlocked(intent: Intent?) {
    if (intent?.getBooleanExtra(EXTRA_BLOCKED, false) != true) return
    banner.visibility = View.VISIBLE
    handler.removeCallbacks(hideBanner)
    handler.postDelayed(hideBanner, BANNER_MS)
  }

  private val hideBanner = Runnable { banner.visibility = View.GONE }

  override fun onResume() {
    super.onResume()
    hideNavigationBar()
    refresh()
    handler.postDelayed(watcher, WATCH_MS)
  }

  override fun onPause() {
    handler.removeCallbacks(watcher)
    super.onPause()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideNavigationBar()
  }

  /**
   * Hides the bottom navigation bar (a swipe only reveals it briefly). The status bar is left alone:
   * it must stay visible and pull-down-able. The buttons cannot be disabled outright without screen
   * pinning, which would also lock the notification shade, so Home/Recents are instead neutralised by
   * the accessibility service, which brings this screen straight back.
   */
  private fun hideNavigationBar() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.insetsController?.let {
        it.hide(WindowInsets.Type.navigationBars())
        it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      }
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility =
        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
  }

  // Android 12 and older: the same "Back does nothing" rule.
  @Suppress("OVERRIDE_DEPRECATION")
  override fun onBackPressed() {}

  private fun refresh() {
    val store = FocusStore.get(this)
    val state = store.state()
    shownActive = state.active
    stopButton.visibility = if (state.active) View.VISIBLE else View.GONE

    // Not the default home app: nothing to show once focus mode is over, so just close. (Forwarding
    // to another launcher caused an endless ping-pong on HyperOS, which showed a black screen.)
    if (!state.active && !Permissions.isGranted(this, "defaultLauncher")) {
      finish()
      return
    }

    val all = AppCatalog.launchableApps(this)
    if (state.active) {
      val allowed = (state.profileId?.let { store.allowedApps(it) } ?: emptySet()) + AppCatalog.alwaysAllowed(this)
      adapter.items = all.filter { it.packageName in allowed }
      header.text =
        if (state.endsAt > 0L) {
          getString(R.string.focus_until, DateFormat.getTimeFormat(this).format(Date(state.endsAt)))
        } else {
          getString(R.string.focus_active)
        }
    } else {
      adapter.items = all
      header.text = getString(R.string.focus_inactive)
    }
    adapter.notifyDataSetChanged()
  }

  private fun requestStop() {
    when (FocusStore.get(this).unlockGuard) {
      "countdown" -> showCountdownDialog()
      "sentence" -> showSentenceDialog()
      else -> showConfirmDialog()
    }
  }

  /** No extra protection configured: still ask once, so a stray tap does not end focus mode. */
  private fun showConfirmDialog() {
    AlertDialog.Builder(this)
      .setTitle(R.string.focus_unlock_title)
      .setPositiveButton(R.string.focus_confirm_stop) { _, _ -> stopNow() }
      .setNegativeButton(R.string.focus_keep, null)
      .show()
  }

  private fun stopNow() {
    FocusController.stop(this)
    refresh()
  }

  private fun showCountdownDialog() {
    val dialog = AlertDialog.Builder(this)
      .setTitle(R.string.focus_unlock_title)
      .setMessage(getString(R.string.focus_unlock_countdown, COUNTDOWN_SECONDS))
      .setPositiveButton(R.string.focus_confirm_stop, null)
      .setNegativeButton(R.string.focus_keep, null)
      .create()
    dialog.show()
    // Set after show() so the button does not auto-dismiss before the countdown is over.
    val confirm = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
    confirm.isEnabled = false
    confirm.setOnClickListener {
      dialog.dismiss()
      stopNow()
    }
    val startedAt = SystemClock.elapsedRealtime()
    val ticker = object : Runnable {
      override fun run() {
        val left = COUNTDOWN_SECONDS - ((SystemClock.elapsedRealtime() - startedAt) / 1000).toInt()
        if (left <= 0) {
          dialog.setMessage(getString(R.string.focus_unlock_ready))
          confirm.isEnabled = true
        } else {
          dialog.setMessage(getString(R.string.focus_unlock_countdown, left))
          handler.postDelayed(this, 500)
        }
      }
    }
    handler.post(ticker)
    dialog.setOnDismissListener { handler.removeCallbacks(ticker) }
  }

  private fun showSentenceDialog() {
    val sentence = getString(R.string.focus_unlock_sentence)
    val input = EditText(this).apply {
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
      hint = sentence
    }
    val dialog = AlertDialog.Builder(this)
      .setTitle(R.string.focus_unlock_title)
      .setMessage(getString(R.string.focus_unlock_type, sentence))
      .setView(input)
      .setPositiveButton(R.string.focus_confirm_stop, null)
      .setNegativeButton(R.string.focus_keep, null)
      .create()
    dialog.show()
    val confirm = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
    confirm.isEnabled = false
    confirm.setOnClickListener {
      dialog.dismiss()
      stopNow()
    }
    input.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
      override fun afterTextChanged(s: Editable?) {
        confirm.isEnabled = normalize(s?.toString().orEmpty()) == normalize(sentence)
      }
    })
  }

  /** Same rule as the JS side: trim, collapse whitespace, ignore case. */
  private fun normalize(text: String): String =
    text.trim().replace(Regex("\\s+"), " ").lowercase(Locale.getDefault())

  private fun launch(app: LaunchableApp) {
    val intent = packageManager.getLaunchIntentForPackage(app.packageName) ?: return
    startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private inner class AppAdapter : BaseAdapter() {
    var items: List<LaunchableApp> = emptyList()

    override fun getCount() = items.size
    override fun getItem(position: Int) = items[position]
    override fun getItemId(position: Int) = position.toLong()

    override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
      val app = items[position]
      val cell = (convertView as? LinearLayout) ?: LinearLayout(this@LauncherActivity).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(dp(4), dp(4), dp(4), dp(4))
        addView(ImageView(context).apply { layoutParams = LinearLayout.LayoutParams(dp(56), dp(56)) })
        addView(
          TextView(context).apply {
            setTextColor(getColor(R.color.focus_text))
            textSize = 12f
            gravity = Gravity.CENTER
            maxLines = 2
          },
        )
      }
      (cell.getChildAt(0) as ImageView).setImageDrawable(app.icon)
      (cell.getChildAt(1) as TextView).text = app.label
      return cell
    }
  }

  companion object {
    const val EXTRA_BLOCKED = "expo.modules.focus.BLOCKED"
    const val WATCH_MS = 1500L
    const val BANNER_MS = 3500L
    const val COUNTDOWN_SECONDS = 30
  }
}
