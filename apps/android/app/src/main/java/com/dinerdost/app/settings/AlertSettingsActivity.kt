package com.dinerdost.app.settings

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.*
import com.dinerdost.app.BuildConfig
import com.dinerdost.app.R
import com.dinerdost.app.notifications.AlertNotifications
import com.dinerdost.app.notifications.PushRegistration
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

class AlertSettingsActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var pushStatus: TextView

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val content =
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(24), dp(48), dp(24), dp(24))
                setBackgroundColor(Color.rgb(247, 248, 244))
            }
        val scroll =
            ScrollView(this).apply {
                addView(content)
                fitsSystemWindows = true
            }
        setContentView(scroll)
        content.addView(
            Button(this).apply {
                setText(R.string.back)
                isAllCaps = false
                setOnClickListener { finish() }
            }
        )
        content.addView(
            TextView(this).apply {
                setText(R.string.alerts_title)
                textSize = 28f
                setTextColor(Color.rgb(25, 63, 48))
                setPadding(0, dp(24), 0, dp(20))
            }
        )
        status = label("")
        content.addView(status)
        content.addView(button(getString(R.string.enable_notifications)) { enableNotifications() })
        content.addView(
            button(getString(R.string.test_alert)) {
                if (
                    !AlertNotifications.show(
                        this,
                        "test-${System.currentTimeMillis()}",
                        "NEW_ORDER",
                        getString(R.string.app_name),
                        getString(R.string.test_alert_body),
                        "/app/overview",
                    )
                )
                    enableNotifications()
            }
        )
        content.addView(
            button(getString(R.string.sound_settings)) {
                startActivity(
                    Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        .putExtra(Settings.EXTRA_CHANNEL_ID, "orders_v1")
                )
            }
        )
        content.addView(label(getString(R.string.foreground_alert_note)))
        pushStatus = label("")
        content.addView(pushStatus)
        content.addView(
            button(getString(R.string.connect_firebase)) { connectFirebase() }
                .apply { isEnabled = BuildConfig.FIREBASE_CONFIGURED }
        )
        if (BuildConfig.DEBUG)
            content.addView(
                button(getString(R.string.copy_test_token)) {
                    val token =
                        getSharedPreferences("push", MODE_PRIVATE)
                            .getString("installation_id", null)
                    if (token == null)
                        Toast.makeText(this, R.string.connect_first, Toast.LENGTH_SHORT).show()
                    else {
                        getSystemService(ClipboardManager::class.java)
                            .setPrimaryClip(ClipData.newPlainText("Firebase installation ID", token))
                        Toast.makeText(this, R.string.token_copied, Toast.LENGTH_SHORT).show()
                    }
                }
            )
    }

    override fun onResume() {
        super.onResume()
        renderStatus()
    }

    private fun renderStatus() {
        status.setText(
            if (AlertNotifications.permitted(this)) R.string.notifications_on
            else R.string.notifications_off
        )
        pushStatus.setText(
            if (getSharedPreferences("push", MODE_PRIVATE).getString("binding_id", "").orEmpty().isNotEmpty()) R.string.firebase_registered
            else if (BuildConfig.FIREBASE_CONFIGURED) R.string.firebase_configured
            else R.string.firebase_required
        )
    }

    private fun enableNotifications() {
        if (
            Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                    PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 20)
        } else
            startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
            )
    }

    private fun connectFirebase() {
        if (!AlertNotifications.permitted(this)) {
            enableNotifications()
            return
        }
        if (!BuildConfig.FIREBASE_CONFIGURED || FirebaseApp.initializeApp(this) == null) return
        getSharedPreferences("push", MODE_PRIVATE).edit().putBoolean("enabled", true).apply()
        FirebaseMessaging.getInstance().isAutoInitEnabled = true
        FirebaseMessaging.getInstance().register().addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val settings = getSharedPreferences("push", MODE_PRIVATE)
                PushRegistration.schedule(this, settings.getString("outlet_id", "").orEmpty())
                pushStatus.setText(R.string.firebase_configured)
            } else pushStatus.setText(R.string.firebase_unavailable)
        }
    }

    private fun label(value: String) =
        TextView(this).apply {
            text = value
            textSize = 16f
            setTextColor(Color.rgb(25, 63, 48))
            setPadding(0, dp(16), 0, dp(16))
        }

    private fun button(value: String, action: () -> Unit) =
        Button(this).apply {
            text = value
            isAllCaps = false
            minHeight = dp(56)
            setTextColor(Color.rgb(40, 91, 69))
            setOnClickListener { action() }
        }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}
