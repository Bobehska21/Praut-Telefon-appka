package expo.modules.focus

import android.app.Activity
import android.content.Intent
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
      setPadding(pad, dp(32), pad, pad)
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
        addView(header)
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
    val other = packageManager.queryIntentActivities(home, 0)
      .firstOrNull { it.activityInfo.packageName != packageName } ?: return false
    val intent = Intent(home)
      .setClassName(other.activityInfo.packageName, other.activityInfo.name)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return runCatching { startActivity(intent) }.isSuccess.also { if (it) finish() }
  }

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
  }
}
