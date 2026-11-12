package expo.modules.focus

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.Calendar
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Bluetooth Low Energy presence for multiplayer. Runs while focus mode is on, and also while the
 * player is a "wasteman" (focus switched off by hand), so that a wasteman can be found. Needs the user's
 * switch on, Bluetooth on and the runtime permissions; stops with the foreground service.
 *
 * Privacy design:
 * - The advertisement carries our service UUID and a 7-byte payload: a 6-byte token and a status byte
 *   (0 = in focus mode, 1 = wasteman). No name, no location. The token is an HMAC of the local date
 *   under a random per-install key, so it changes every midnight: the same person is recognised at
 *   most once a day and cannot be followed for longer than a day.
 * - A sighting of someone in focus mode raises a notification with Accept / Decline; nothing about them
 *   is read until Accept. Wastemen never raise a notification (players watch the list themselves).
 * - The status byte is only a hint for the notification. Who is really a wasteman, immune or killable
 *   is decided by the server; a lying phone gains nothing.
 *
 * Kill proof: the killer's phone connects to the wasteman's GATT server, writes the server-issued
 * challenge and reads back a signature made with the wasteman's device key. The server verifies it.
 * Being able to connect and read it shows the two phones were within Bluetooth range just now.
 *
 * Call [ensure] on the main thread; it starts or stops everything to match the current state.
 */
@SuppressLint("MissingPermission") // every entry point checks Permissions.hasBluetooth first
object NearbyManager {
  private const val TAG = "FocusNearby"
  private const val CHANNEL_ID = "focus_nearby"
  private const val TOKEN_BYTES = 6
  private const val STATUS_FOCUS = 0
  private const val STATUS_WASTEMAN = 1
  private const val READ_TIMEOUT_MS = 12_000L
  private const val PROOF_TIMEOUT_MS = 10_000L
  private const val PROOF_MAX_AGE_MS = 25_000L
  private const val SIGHTING_MAX_AGE_MS = 3 * 60_000L

  /** Company id 0xFFFF is reserved for testing; it only carries our token and status inside the scan response. */
  private const val MANUFACTURER_ID = 0xFFFF

  val SERVICE_UUID: UUID = UUID.fromString("7b1f6f3e-4a52-4c3b-9d9a-5e5f0c0f1e01")
  private val PROFILE_UUID: UUID = UUID.fromString("7b1f6f3e-4a52-4c3b-9d9a-5e5f0c0f1e02")
  private val CHALLENGE_UUID: UUID = UUID.fromString("7b1f6f3e-4a52-4c3b-9d9a-5e5f0c0f1e03")
  private val RESPONSE_UUID: UUID = UUID.fromString("7b1f6f3e-4a52-4c3b-9d9a-5e5f0c0f1e04")

  private class Sighting(val device: BluetoothDevice, val status: Int, val rssi: Int, val seenAt: Long)
  private class Proof(val bytes: ByteArray, val at: Long)

  private val main = Handler(Looper.getMainLooper())
  private val waiting = ConcurrentHashMap<String, BluetoothDevice>() // token -> device awaiting Accept/Decline
  private val sightings = ConcurrentHashMap<String, Sighting>() // token -> most recent sighting
  private val writeBuffers = ConcurrentHashMap<String, ByteArrayOutputStream>() // device address -> challenge being written
  private val proofs = ConcurrentHashMap<String, Proof>() // device address -> signature to hand to that device

  private var running = false
  private var tokenDay: String? = null
  private var advertisedStatus: Int? = null
  private var gattServer: BluetoothGattServer? = null
  private var advertiseCallback: AdvertiseCallback? = null
  private var scanCallback: ScanCallback? = null

  // ---------------------------------------------------------------------------------- lifecycle

  fun ensure(context: Context) {
    val app = context.applicationContext
    val store = FocusStore.get(app)
    val adapter = adapterOf(app)
    val focusOn = store.state().active
    val shouldRun = (focusOn || store.wasteman) &&
      store.nearbyEnabled &&
      Permissions.hasBluetooth(app) &&
      adapter?.isEnabled == true

    if (!shouldRun) {
      if (running) stop()
      return
    }
    val today = dayKey()
    val status = if (focusOn) STATUS_FOCUS else STATUS_WASTEMAN
    // New token at midnight, new status byte when focus mode is switched on or off.
    if (running && (tokenDay != today || advertisedStatus != status)) restartAdvertising(app, adapter!!, today, status)
    if (!running) start(app, adapter!!, today, status)
    pruneSightings()
  }

  fun stop() {
    if (!running && gattServer == null) return
    running = false
    val adapter = BluetoothAdapter.getDefaultAdapter()
    runCatching { advertiseCallback?.let { adapter?.bluetoothLeAdvertiser?.stopAdvertising(it) } }
    runCatching { scanCallback?.let { adapter?.bluetoothLeScanner?.stopScan(it) } }
    runCatching { gattServer?.close() }
    advertiseCallback = null
    scanCallback = null
    gattServer = null
    tokenDay = null
    advertisedStatus = null
    waiting.clear()
    sightings.clear()
    writeBuffers.clear()
    proofs.clear()
    Log.i(TAG, "stopped")
  }

  private fun start(context: Context, adapter: BluetoothAdapter, day: String, status: Int) {
    running = true
    openGattServer(context)
    startAdvertising(context, adapter, day, status)
    startScanning(context, adapter)
    Log.i(TAG, "started")
  }

  private fun restartAdvertising(context: Context, adapter: BluetoothAdapter, day: String, status: Int) {
    runCatching { advertiseCallback?.let { adapter.bluetoothLeAdvertiser?.stopAdvertising(it) } }
    startAdvertising(context, adapter, day, status)
  }

  // ----------------------------------------------------------------------------- advertising

  private fun startAdvertising(context: Context, adapter: BluetoothAdapter, day: String, status: Int) {
    val advertiser = adapter.bluetoothLeAdvertiser ?: return
    tokenDay = day
    advertisedStatus = status

    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
      .setConnectable(true)
      .setTimeout(0)
      .build()
    // Packet 1: just our service UUID (what scanners filter on). Packet 2 (scan response): token + status.
    val data = AdvertiseData.Builder().setIncludeDeviceName(false).addServiceUuid(ParcelUuid(SERVICE_UUID)).build()
    val payload = dailyToken(context, day) + byteArrayOf(status.toByte())
    val response = AdvertiseData.Builder().setIncludeDeviceName(false).addManufacturerData(MANUFACTURER_ID, payload).build()

    val callback = object : AdvertiseCallback() {
      override fun onStartFailure(errorCode: Int) {
        Log.w(TAG, "advertising failed: $errorCode")
      }
    }
    advertiseCallback = callback
    advertiser.startAdvertising(settings, data, response, callback)
  }

  // ------------------------------------------------------------------------------- scanning

  private fun startScanning(context: Context, adapter: BluetoothAdapter) {
    val scanner = adapter.bluetoothLeScanner ?: return
    val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(SERVICE_UUID)).build()
    val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_BALANCED).build()
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val payload = result.scanRecord?.getManufacturerSpecificData(MANUFACTURER_ID) ?: return
        if (payload.size < TOKEN_BYTES) return
        val token = payload.copyOfRange(0, TOKEN_BYTES)
        // Older builds sent only the token; no status byte means "in focus mode".
        val status = if (payload.size > TOKEN_BYTES) payload[TOKEN_BYTES].toInt() else STATUS_FOCUS
        main.post { onSighting(context, token, status, result.rssi, result.device) }
      }

      override fun onScanFailed(errorCode: Int) {
        Log.w(TAG, "scan failed: $errorCode")
      }
    }
    scanCallback = callback
    scanner.startScan(listOf(filter), settings, callback)
  }

  private fun onSighting(context: Context, token: ByteArray, status: Int, rssi: Int, device: BluetoothDevice) {
    if (!running) return
    if (token.contentEquals(dailyToken(context, dayKey()))) return
    val hex = token.toHex()
    // Always remember who is around: the nearby list and kill proofs use this.
    sightings[hex] = Sighting(device, status, rssi, System.currentTimeMillis())

    // The Accept/Decline notification is only for players in focus mode, never for wastemen, and at most
    // once per person per day however often they are sighted.
    if (status != STATUS_FOCUS) return
    if (!FocusStore.get(context).markNearbySeen(hex, dayKey())) return
    waiting[hex] = device
    Log.i(TAG, "new user nearby, asking")
    postFoundNotification(context, hex)
  }

  private fun pruneSightings() {
    val cutoff = System.currentTimeMillis() - SIGHTING_MAX_AGE_MS
    sightings.entries.removeIf { it.value.seenAt < cutoff }
    val proofCutoff = System.currentTimeMillis() - PROOF_MAX_AGE_MS
    proofs.entries.removeIf { it.value.at < proofCutoff }
  }

  /** Tokens seen in the last few minutes, for the nearby list (JS asks the server who they are). */
  fun nearbyTokens(): List<Map<String, Any>> {
    pruneSightings()
    return sightings.entries.map {
      mapOf("token" to it.key, "status" to if (it.value.status == STATUS_WASTEMAN) "wasteman" else "focus", "rssi" to it.value.rssi, "seenAt" to it.value.seenAt)
    }
  }

  /** Today's token and date, so the app can register it with the server. */
  fun todayToken(context: Context): Map<String, String> {
    val day = dayKey()
    return mapOf("token" to dailyToken(context.applicationContext, day).toHex(), "day" to day)
  }

  // --------------------------------------------------------------------------- GATT server

  private fun openGattServer(context: Context) {
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager ?: return
    val callback = object : BluetoothGattServerCallback() {
      override fun onCharacteristicReadRequest(device: BluetoothDevice, requestId: Int, offset: Int, characteristic: BluetoothGattCharacteristic) {
        val server = gattServer ?: return
        val value = when (characteristic.uuid) {
          PROFILE_UUID -> FocusStore.get(context).nearbyProfileBytes()
          RESPONSE_UUID -> proofs[device.address]?.takeIf { System.currentTimeMillis() - it.at < PROOF_MAX_AGE_MS }?.bytes
          else -> null
        }
        if (value == null) {
          server.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
        } else if (offset > value.size) {
          server.sendResponse(device, requestId, BluetoothGatt.GATT_INVALID_OFFSET, offset, null)
        } else {
          server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value.copyOfRange(offset, value.size))
        }
      }

      override fun onCharacteristicWriteRequest(
        device: BluetoothDevice, requestId: Int, characteristic: BluetoothGattCharacteristic,
        preparedWrite: Boolean, responseNeeded: Boolean, offset: Int, value: ByteArray?,
      ) {
        val server = gattServer ?: return
        if (characteristic.uuid != CHALLENGE_UUID || value == null) {
          if (responseNeeded) server.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
          return
        }
        val buffer = writeBuffers.getOrPut(device.address) { ByteArrayOutputStream() }
        if (!preparedWrite || offset == 0) buffer.reset()
        buffer.write(value)
        if (!preparedWrite) signChallenge(context, device)
        if (responseNeeded) server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
      }

      override fun onExecuteWrite(device: BluetoothDevice, requestId: Int, execute: Boolean) {
        if (execute) signChallenge(context, device) else writeBuffers.remove(device.address)
        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
      }
    }
    val server = manager.openGattServer(context, callback) ?: return
    val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
    service.addCharacteristic(BluetoothGattCharacteristic(PROFILE_UUID, BluetoothGattCharacteristic.PROPERTY_READ, BluetoothGattCharacteristic.PERMISSION_READ))
    service.addCharacteristic(BluetoothGattCharacteristic(CHALLENGE_UUID, BluetoothGattCharacteristic.PROPERTY_WRITE, BluetoothGattCharacteristic.PERMISSION_WRITE))
    service.addCharacteristic(BluetoothGattCharacteristic(RESPONSE_UUID, BluetoothGattCharacteristic.PROPERTY_READ, BluetoothGattCharacteristic.PERMISSION_READ))
    server.addService(service)
    gattServer = server
  }

  /**
   * A killer wrote a server-issued challenge. Sign it, but only while this phone really is a wasteman
   * taking part in multiplayer. The server checks the rest (signature, expiry, rules).
   */
  private fun signChallenge(context: Context, device: BluetoothDevice) {
    val raw = writeBuffers.remove(device.address)?.toByteArray() ?: return
    val store = FocusStore.get(context)
    val playerId = store.playerId
    if (playerId == null || !store.wasteman || !store.nearbyEnabled || store.state().active) return
    val parts = String(raw, Charsets.UTF_8).split('|')
    if (parts.size != 3 || parts.any { it.isEmpty() || it.length > 64 }) return
    val canonical = "focus-kill-v1|${parts[0]}|${parts[1]}|$playerId|${parts[2]}"
    val signature = runCatching { DeviceKey.sign(canonical.toByteArray(Charsets.UTF_8)) }.getOrNull() ?: return
    proofs[device.address] = Proof(signature.toByteArray(Charsets.UTF_8), System.currentTimeMillis())
    Log.i(TAG, "signed a kill challenge")
  }

  // ----------------------------------------------------------------- kill proof (killer side)

  /**
   * Connects to the wasteman seen with `token`, writes `payload` (`challengeId|nonce|killerPlayerId`) to
   * the challenge characteristic and reads back the signature. Calls back once with the signature, or an error code.
   */
  fun requestKillProof(context: Context, token: String, payload: String, done: (String?, String?) -> Unit) {
    val app = context.applicationContext
    val device = sightings[token]?.device
    if (device == null) {
      done(null, "out_of_range")
      return
    }
    var finished = false
    var gattRef: BluetoothGatt? = null
    fun finish(signature: String?, error: String?) {
      if (finished) return
      finished = true
      runCatching { gattRef?.disconnect(); gattRef?.close() }
      done(signature, error)
    }

    val callback = object : BluetoothGattCallback() {
      override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
        if (newState == BluetoothProfile.STATE_CONNECTED) {
          // A larger MTU so the challenge fits in one write.
          if (!gatt.requestMtu(247)) gatt.discoverServices()
        } else {
          finish(null, "out_of_range")
        }
      }

      override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
        gatt.discoverServices()
      }

      override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
        val characteristic = gatt.getService(SERVICE_UUID)?.getCharacteristic(CHALLENGE_UUID)
        if (status != BluetoothGatt.GATT_SUCCESS || characteristic == null) return finish(null, "not_available")
        val bytes = payload.toByteArray(Charsets.UTF_8)
        val started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          gatt.writeCharacteristic(characteristic, bytes, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == android.bluetooth.BluetoothStatusCodes.SUCCESS
        } else {
          @Suppress("DEPRECATION")
          run {
            characteristic.value = bytes
            gatt.writeCharacteristic(characteristic)
          }
        }
        if (!started) finish(null, "write_failed")
      }

      override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
        if (status != BluetoothGatt.GATT_SUCCESS) return finish(null, "write_failed")
        val response = gatt.getService(SERVICE_UUID)?.getCharacteristic(RESPONSE_UUID)
        if (response == null || !gatt.readCharacteristic(response)) finish(null, "read_failed")
      }

      override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
        finish(if (status == BluetoothGatt.GATT_SUCCESS) String(value, Charsets.UTF_8) else null, if (status == BluetoothGatt.GATT_SUCCESS) null else "not_a_wasteman")
      }

      @Deprecated("Used before Android 13")
      override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
        @Suppress("DEPRECATION")
        val value = characteristic.value
        finish(if (status == BluetoothGatt.GATT_SUCCESS && value != null) String(value, Charsets.UTF_8) else null, if (status == BluetoothGatt.GATT_SUCCESS) null else "not_a_wasteman")
      }
    }
    gattRef = device.connectGatt(app, false, callback, BluetoothDevice.TRANSPORT_LE)
    main.postDelayed({ finish(null, "timeout") }, PROOF_TIMEOUT_MS)
  }

  // ----------------------------------------------------------- user decision and profile read

  /** The user tapped Accept: connect, read the other user's profile once, then disconnect. */
  fun accept(context: Context, token: String) {
    val app = context.applicationContext
    cancelNotification(app, token)
    val device = waiting.remove(token)
    if (device == null) {
      postText(app, token.hashCode() + 1, app.getString(R.string.focus_nearby_gone), null)
      return
    }
    readProfile(app, device, token)
  }

  fun decline(context: Context, token: String) {
    waiting.remove(token)
    cancelNotification(context.applicationContext, token)
  }

  private fun readProfile(context: Context, device: BluetoothDevice, token: String) {
    var finished = false
    var gattRef: BluetoothGatt? = null

    fun finish(profile: ByteArray?) {
      if (finished) return
      finished = true
      runCatching { gattRef?.disconnect(); gattRef?.close() }
      main.post {
        if (profile == null) {
          postText(context, token.hashCode() + 1, context.getString(R.string.focus_nearby_failed), null)
          return@post
        }
        val encounter = parseProfile(profile)
        FocusStore.get(context).addEncounter(encounter)
        postText(context, token.hashCode() + 2, describe(context, encounter), context.getString(R.string.focus_nearby_result_title))
      }
    }

    val callback = object : BluetoothGattCallback() {
      override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
        if (newState == BluetoothProfile.STATE_CONNECTED) gatt.discoverServices() else finish(null)
      }

      override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
        val characteristic = gatt.getService(SERVICE_UUID)?.getCharacteristic(PROFILE_UUID)
        if (status != BluetoothGatt.GATT_SUCCESS || characteristic == null || !gatt.readCharacteristic(characteristic)) finish(null)
      }

      // Android 13+ delivers the value here; older versions use the deprecated overload below.
      override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
        finish(if (status == BluetoothGatt.GATT_SUCCESS) value else null)
      }

      @Deprecated("Used before Android 13")
      override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
        @Suppress("DEPRECATION")
        finish(if (status == BluetoothGatt.GATT_SUCCESS) characteristic.value else null)
      }
    }

    gattRef = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    main.postDelayed({ finish(null) }, READ_TIMEOUT_MS)
  }

  private fun parseProfile(bytes: ByteArray): Encounter {
    val o = try { JSONObject(String(bytes, Charsets.UTF_8)) } catch (_: Exception) { JSONObject() }
    return Encounter(
      at = System.currentTimeMillis(),
      nickname = o.optString("n").take(20),
      rank = o.optString("r", "novice"),
      level = o.optInt("l", 1),
      streak = o.optInt("s", 0),
    )
  }

  // ----------------------------------------------------------------------------- notifications

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, context.getString(R.string.focus_nearby_channel), NotificationManager.IMPORTANCE_DEFAULT),
    )
  }

  private fun builder(context: Context): Notification.Builder {
    ensureChannel(context)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID)
    else @Suppress("DEPRECATION") Notification.Builder(context)
  }

  private fun postFoundNotification(context: Context, token: String) {
    fun action(name: String, code: Int): PendingIntent = PendingIntent.getBroadcast(
      context,
      token.hashCode() + code,
      Intent(context, NearbyActionReceiver::class.java).setAction(name).putExtra(NearbyActionReceiver.EXTRA_TOKEN, token),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val notification = builder(context)
      .setContentTitle(context.getString(R.string.focus_nearby_title))
      .setContentText(context.getString(R.string.focus_nearby_text))
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setAutoCancel(true)
      .addAction(Notification.Action.Builder(null, context.getString(R.string.focus_nearby_accept), action(NearbyActionReceiver.ACTION_ACCEPT, 1)).build())
      .addAction(Notification.Action.Builder(null, context.getString(R.string.focus_nearby_decline), action(NearbyActionReceiver.ACTION_DECLINE, 2)).build())
      .build()
    context.getSystemService(NotificationManager::class.java).notify(token.hashCode(), notification)
  }

  private fun postText(context: Context, id: Int, text: String, title: String?) {
    val notification = builder(context)
      .setContentTitle(title ?: context.getString(R.string.focus_nearby_title))
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setAutoCancel(true)
      .build()
    context.getSystemService(NotificationManager::class.java).notify(id, notification)
  }

  private fun cancelNotification(context: Context, token: String) {
    context.getSystemService(NotificationManager::class.java).cancel(token.hashCode())
  }

  /**
   * Deliberately leaves the nickname out: it comes from another phone and is only shown inside the app,
   * after the JS side has checked it against the nickname rules. A notification must never show text
   * from a stranger that nobody has filtered.
   */
  private fun describe(context: Context, e: Encounter): String {
    val rank = context.getString(rankRes(e.rank))
    return context.getString(R.string.focus_nearby_result, rank, e.level, e.streak)
  }

  private fun rankRes(rank: String): Int = when (rank) {
    "apprentice" -> R.string.focus_rank_apprentice
    "adept" -> R.string.focus_rank_adept
    "warden" -> R.string.focus_rank_warden
    "master" -> R.string.focus_rank_master
    "grandmaster" -> R.string.focus_rank_grandmaster
    else -> R.string.focus_rank_novice
  }

  // ---------------------------------------------------------------------------------- helpers

  private fun adapterOf(context: Context): BluetoothAdapter? =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  /** Local calendar day, `YYYY-MM-DD`: the token and the "once a day" rule both roll over at local midnight. */
  private fun dayKey(): String {
    val c = Calendar.getInstance()
    return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
  }

  private fun dailyToken(context: Context, day: String): ByteArray {
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(FocusStore.get(context).nearbySecret(), "HmacSHA256"))
    return mac.doFinal(day.toByteArray(Charsets.UTF_8)).copyOf(TOKEN_BYTES)
  }

  private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
