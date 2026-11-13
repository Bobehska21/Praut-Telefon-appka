package expo.modules.focus

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Result of a call to the game server: HTTP status (0 = no connection) and the raw body. */
data class ServerResponse(val status: Int, val body: String) {
  val ok: Boolean get() = status in 200..299
}

/**
 * Minimal HTTP client for the game server, used by the foreground service (JS cannot be relied on in the
 * background). Reads the server URL and bearer token that JS stored after joining.
 */
object ServerClient {
  private const val CONNECT_TIMEOUT_MS = 5_000

  fun configured(context: Context): Boolean {
    val store = FocusStore.get(context)
    return !store.serverUrl.isNullOrBlank() && !store.serverToken.isNullOrBlank() && store.playerId != null
  }

  /** Blocking; call from a background thread. */
  fun request(context: Context, method: String, path: String, body: JSONObject? = null, readTimeoutMs: Int = 15_000): ServerResponse {
    val store = FocusStore.get(context)
    val base = store.serverUrl ?: return ServerResponse(0, "")
    val token = store.serverToken ?: return ServerResponse(0, "")
    return try {
      val connection = (URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = CONNECT_TIMEOUT_MS
        readTimeout = readTimeoutMs
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "application/json")
        if (body != null) {
          doOutput = true
          setRequestProperty("Content-Type", "application/json")
        }
      }
      if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
      connection.disconnect()
      ServerResponse(status, text)
    } catch (_: Exception) {
      ServerResponse(0, "")
    }
  }
}
