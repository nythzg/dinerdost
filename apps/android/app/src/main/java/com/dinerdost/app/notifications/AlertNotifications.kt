package com.dinerdost.app.notifications

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import com.dinerdost.app.MainActivity
import com.dinerdost.app.R

object AlertNotifications {
    private val channels =
        mapOf("orders_v1" to "Orders", "kitchen_v1" to "Kitchen", "service_v1" to "Table service")

    fun channelFor(kind: String) =
        when (kind) {
            "KITCHEN_TICKET",
            "ORDER_READY" -> "kitchen_v1"
            "SERVICE_REQUEST" -> "service_v1"
            else -> "orders_v1"
        }

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        channels.forEach { (id, title) ->
            val channel = NotificationChannel(id, title, NotificationManager.IMPORTANCE_HIGH)
            channel.description = "Diner Dost $title alerts"
            channel.enableVibration(true)
            channel.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            channel.setSound(
                Uri.parse("android.resource://${context.packageName}/${R.raw.order_alert}"),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build(),
            )
            manager.createNotificationChannel(channel)
        }
    }

    fun permitted(context: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED) &&
            context.getSystemService(NotificationManager::class.java).areNotificationsEnabled()

    @Synchronized
    fun show(
        context: Context,
        eventId: String,
        kind: String,
        title: String,
        body: String,
        path: String,
    ): Boolean {
        if (!permitted(context)) return false
        val saved = context.getSharedPreferences("alert_deduplication", Context.MODE_PRIVATE)
        val seen = saved.getString("event_ids", "").orEmpty().split(',').filter { it.isNotEmpty() }
        if (eventId in seen) return true
        createChannels(context)
        val id = eventId.hashCode()
        val intent =
            Intent(context, MainActivity::class.java)
                .putExtra("path", path)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pending =
            PendingIntent.getActivity(
                context,
                id,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        val notification =
            Notification.Builder(context, channelFor(kind))
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xff285b45.toInt())
                .setContentTitle(title.take(100))
                .setContentText(body.take(240))
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setCategory(Notification.CATEGORY_EVENT)
                .build()
        context.getSystemService(NotificationManager::class.java).notify(id, notification)
        saved.edit().putString("event_ids", (seen.takeLast(499) + eventId).joinToString(",")).apply()
        return true
    }

    fun clear(context: Context) =
        context.getSystemService(NotificationManager::class.java).cancelAll()
}
