package com.offgrid.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PublicKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.KeyFactory
import java.security.spec.X509EncodedKeySpec

class KeystoreModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "KeystoreModule"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "offgrid_device_identity"
        private const val EC_CURVE = "secp256r1"
        private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"
    }

    override fun getName(): String = NAME

    private fun getOrCreateKeyStore(): KeyStore {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE)
        keyStore.load(null)
        return keyStore
    }

    @ReactMethod
    fun createOrLoadIdentity(promise: Promise) {
        try {
            val keyStore = getOrCreateKeyStore()
            if (!keyStore.containsAlias(KEY_ALIAS)) {
                val kpg = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC,
                    ANDROID_KEYSTORE
                )
                val parameterSpec = KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
                )
                    .setAlgorithmParameterSpec(ECGenParameterSpec(EC_CURVE))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build()

                kpg.initialize(parameterSpec)
                kpg.generateKeyPair()
            }

            val entry = keyStore.getEntry(KEY_ALIAS, null) as KeyStore.PrivateKeyEntry
            val publicKeyBytes = entry.certificate.publicKey.encoded
            val publicKeyBase64 = Base64.encodeToString(
                publicKeyBytes,
                Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
            )

            val digest = MessageDigest.getInstance("SHA-256")
            val keyIdBytes = digest.digest(publicKeyBytes)
            val keyIdHex = keyIdBytes.joinToString("") { "%02x".format(it) }

            val result = Arguments.createMap().apply {
                putString("publicKey", publicKeyBase64)
                putString("keyAlgorithm", "ECDSA_P256")
                putString("keyId", keyIdHex)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("KEYSTORE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun sign(canonicalBase64: String, promise: Promise) {
        try {
            val keyStore = getOrCreateKeyStore()
            val entry = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
                ?: throw IllegalStateException("Device identity keypair not found")

            val canonicalBytes = Base64.decode(canonicalBase64, Base64.DEFAULT)
            val signatureInstance = Signature.getInstance(SIGNATURE_ALGORITHM)
            signatureInstance.initSign(entry.privateKey)
            signatureInstance.update(canonicalBytes)
            val signatureBytes = signatureInstance.sign()

            val signatureBase64 = Base64.encodeToString(
                signatureBytes,
                Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP
            )
            promise.resolve(signatureBase64)
        } catch (e: Exception) {
            promise.reject("SIGNING_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun verify(
        publicKeyBase64: String,
        canonicalBase64: String,
        signatureBase64: String,
        algorithm: String,
        promise: Promise
    ) {
        try {
            val pubBytes = Base64.decode(publicKeyBase64, Base64.URL_SAFE or Base64.DEFAULT)
            val canonicalBytes = Base64.decode(canonicalBase64, Base64.DEFAULT)
            val sigBytes = Base64.decode(signatureBase64, Base64.URL_SAFE or Base64.DEFAULT)

            val kf = KeyFactory.getInstance("EC")
            val pubKey: PublicKey = kf.generatePublic(X509EncodedKeySpec(pubBytes))

            val signatureInstance = Signature.getInstance(SIGNATURE_ALGORITHM)
            signatureInstance.initVerify(pubKey)
            signatureInstance.update(canonicalBytes)
            val isValid = signatureInstance.verify(sigBytes)

            promise.resolve(isValid)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}
