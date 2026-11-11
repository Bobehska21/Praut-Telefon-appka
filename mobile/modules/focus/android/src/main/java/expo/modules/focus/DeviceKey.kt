package expo.modules.focus

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * This device's signing key, an ECDSA P-256 pair kept in the Android Keystore (the private key never
 * leaves secure hardware where the phone has it). The public half is registered with the server; the
 * private half signs the proximity proof when another player wants to kill this one.
 */
object DeviceKey {
  private const val ALIAS = "focus_device_key"
  private const val PROVIDER = "AndroidKeyStore"

  private fun entry(): KeyStore.PrivateKeyEntry {
    val store = KeyStore.getInstance(PROVIDER).apply { load(null) }
    if (!store.containsAlias(ALIAS)) {
      val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .build()
      KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, PROVIDER).apply { initialize(spec) }.generateKeyPair()
    }
    return store.getEntry(ALIAS, null) as KeyStore.PrivateKeyEntry
  }

  /** Public key as base64 X.509 SubjectPublicKeyInfo (what the server stores and verifies against). */
  fun publicKeyBase64(): String =
    Base64.encodeToString(entry().certificate.publicKey.encoded, Base64.NO_WRAP)

  /** SHA-256 with ECDSA over `data`, DER encoded, base64. */
  fun sign(data: ByteArray): String {
    val signature = Signature.getInstance("SHA256withECDSA")
    signature.initSign(entry().privateKey)
    signature.update(data)
    return Base64.encodeToString(signature.sign(), Base64.NO_WRAP)
  }
}
