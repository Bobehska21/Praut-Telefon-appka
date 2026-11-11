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
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.format.DateFormat
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.GridView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Date

/**
 * Minimal home screen. While focus mode is on it shows only the allowed apps.
 * While it is off it hands over to the user's regular launcher, and falls back
 * to showing every app if there is none.
 */
class LauncherActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var header: TextView
  private lateinit var stopButton: Button
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
        addView(grid, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
      },
    )
  }

  override fun onResume() {
    super.onResume()
    refresh()
    handler.postDelayed(watcher, WATCH_MS)
  }

  override fun onPause() {
    handler.removeCallbacks(watcher)
    super.onPause()
  }

  // A home screen has nowhere to go back to.
  @Suppress("OVERRIDE_DEPRECATION")
  override fun onBackPressed() {}

  private fun refresh() {
    val store = FocusStore.get(this)
    val state = store.state()
    shownActive = state.active
    stopButton.visibility = if (state.active) View.VISIBLE else View.GONE

    if (!state.active && forwardToOtherLauncher()) return

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

  /** Returns true if another launcher was started and this activity finished. */
  private fun forwardToOtherLauncher(): Boolean {
    val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
    // Skip ourselves and the system's placeholder home (Settings' FallbackHome is a blank black
    // screen, which left users stuck). With no real launcher left we show the full app grid instead.
    val other = packageManager.queryIntentActivities(home, 0)
      .firstOrNull {
        it.activityInfo.packageName != packageName &&
          it.activityInfo.packageName != "com.android.settings" &&
          !it.activityInfo.name.contains("FallbackHome", ignoreCase = true)
      } ?: return false
    val intent = Intent(home)
      .setClassName(other.activityInfo.packageName, other.activityInfo.name)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return runCatching { startActivity(intent) }.isSuccess.also { if (it) finish() }
  }

  private fun requestStop() {
    when (FocusStore.get(this).unlockGuard) {
      "countdown" -> showCountdownDialog()
      "sentence" -> showSentenceDialog()
      else -> stopNow()
    }
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

  private companion object {
    const val WATCH_MS = 1500L
    const val COUNTDOWN_SECONDS = 30
  }
}
