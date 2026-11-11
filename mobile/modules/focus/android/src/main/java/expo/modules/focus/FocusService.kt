package expo.modules.focus

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/**
 * Foreground service that keeps focus mode alive (persistent notification is
 * mandatory) and polls the foreground app. START_STICKY + the alarm and boot
 * receivers restart it after the process is killed.
 */
class FocusService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var detector: ForegroundDetector
  private var lastSeen: String? = null
  private var running = false
  private var lastNearbyCheck = 0L

  private val tick = object : Runnable {
    override fun run() {
      if (!running) return
      val state = FocusStore.get(this@FocusService).state()
      if (!state.active) {
        stopSelf()
        return
      }
      if (state.endsAt in 1..System.currentTimeMillis()) {
        FocusController.stop(this@FocusService)
        return
      }
      // Align Bluetooth with the current state a few times a minute (cheap; it only acts on changes).
      val now = System.currentTimeMillis()
      if (now - lastNearbyCheck > NEARBY_CHECK_MS) {
        lastNearbyCheck = now
        NearbyManager.ensure(this@FocusService)
      }
      detector.poll()?.let { pkg ->
        // Only react to changes: the detector keeps returning the last known package.
        if (pkg != lastSeen) {
          lastSeen = pkg
          BlockEngine.onForeground(this@FocusService, pkg)
        }
      }
      handler.postDelayed(this, POLL_MS)
    }
  }

  override fun onCreate() {
    super.onCreate()
    detector = ForegroundDetector(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForeground must be called promptly after startForegroundService, even if we stop right after.
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    if (!FocusStore.get(this).state().active) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (!running) {
      running = true
      detector.reset()
      lastSeen = null
      handler.post(tick)
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    NearbyManager.stop()
    handler.removeCallbacks(tick)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun buildNotification(): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, getString(R.string.focus_channel_name), NotificationManager.IMPORTANCE_LOW),
      )
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
      else @Suppress("DEPRECATION") Notification.Builder(this)

    return builder
      .setContentTitle(getString(R.string.focus_notification_title))
      .setContentText(getString(R.string.focus_notification_text))
      .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setOngoing(true)
      .setContentIntent(contentIntent)
      .build()
  }

  private companion object {
    const val CHANNEL_ID = "focus_mode"
    const val NOTIFICATION_ID = 4100
    const val POLL_MS = 700L
    const val NEARBY_CHECK_MS = 5_000L
  }
}
