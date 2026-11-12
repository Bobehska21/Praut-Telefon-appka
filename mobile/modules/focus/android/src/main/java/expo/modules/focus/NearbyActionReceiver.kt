package expo.modules.focus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Handles the Accept / Decline buttons on the "another user is nearby" notification. */
class NearbyActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val token = intent.getStringExtra(EXTRA_TOKEN) ?: return
    when (intent.action) {
      ACTION_ACCEPT -> NearbyManager.accept(context, token)
      ACTION_DECLINE -> NearbyManager.decline(context, token)
    }
  }

  companion object {
    const val ACTION_ACCEPT = "expo.modules.focus.NEARBY_ACCEPT"
    const val ACTION_DECLINE = "expo.modules.focus.NEARBY_DECLINE"
    const val EXTRA_TOKEN = "token"
  }
}
