package com.dinerdost.app.notifications

import androidx.work.*
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** FCM carries a wake-up hint. Business content comes from the authenticated API. */
class DinerMessagingService : FirebaseMessagingService() {
    override fun onRegistered(installationId: String) {
        val settings = getSharedPreferences("push", MODE_PRIVATE)
        if (settings.getString("installation_id", "") != installationId)
            settings.edit().putString("installation_id", installationId).remove("binding_id").remove("bound_session").apply()
        PushRegistration.schedule(this, settings.getString("outlet_id", "").orEmpty())
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["kind"] != "INBOX_SYNC") return
        val binding = data["binding_id"] ?: return
        val event = data["event_id"] ?: return
        if (!binding.matches(Regex("[a-fA-F0-9-]{36}")) || !event.matches(Regex("[a-fA-F0-9-]{36}"))) return
        if (getSharedPreferences("push", MODE_PRIVATE).getString("binding_id", "") != binding) return
        WorkManager.getInstance(this).enqueueUniqueWork("push-event-$event", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequest.Builder(PushEventWorker::class.java)
                .setInputData(workDataOf("binding" to binding, "event" to event))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .apply { if (android.os.Build.VERSION.SDK_INT >= 31) setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST) }.build())
    }
}
