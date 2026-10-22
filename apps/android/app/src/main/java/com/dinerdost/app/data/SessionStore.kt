package com.dinerdost.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The account password is never persisted. Session tokens are encrypted with a device-held key. */
class SessionStore(private val context: Context) {
    private val preferences = context.getSharedPreferences("native_session", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("dinerdost_session_v1", null) as? SecretKey)?.let {
            return it
        }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            .apply {
                init(
                    KeyGenParameterSpec.Builder(
                            "dinerdost_session_v1",
                            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                        )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .build()
                )
            }
            .generateKey()
    }

    @Synchronized
    fun get(): String? = runCatching {
        val saved = preferences.getString("cookie", null) ?: return null
        val parts = saved.split(":")
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            key(),
            GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)),
        )
        String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
    }
        .getOrElse {
            clear()
            null
        }

    @Synchronized
    fun set(cookie: String) {
        if (get() != cookie) clearAlertBinding()
        val cipher =
            Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val value =
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP) +
                ":" +
                Base64.encodeToString(cipher.doFinal(cookie.toByteArray()), Base64.NO_WRAP)
        preferences.edit().putString("cookie", value).apply()
    }

    @Synchronized
    fun clear() {
        preferences.edit().clear().apply()
        clearAlertBinding()
    }

    private fun clearAlertBinding() {
        context.getSharedPreferences("push", Context.MODE_PRIVATE).edit()
            .remove("binding_id").remove("bound_session").remove("last_registration").apply()
        context.getSharedPreferences("alert_deduplication", Context.MODE_PRIVATE).edit().clear().apply()
        com.dinerdost.app.notifications.AlertNotifications.clear(context)
    }
}
