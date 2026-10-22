package com.dinerdost.app.notifications

import android.content.Context
import androidx.work.*
import com.dinerdost.app.BuildConfig
import com.dinerdost.app.data.*
import java.security.MessageDigest

object PushRegistration {
    fun fingerprint(cookie: String): String = MessageDigest.getInstance("SHA-256")
        .digest(cookie.toByteArray()).joinToString("") { "%02x".format(it) }

    fun schedule(context: Context, outlet: String) {
        val settings = context.getSharedPreferences("push", Context.MODE_PRIVATE)
        settings.edit().putString("outlet_id", outlet).apply()
        if (!BuildConfig.FIREBASE_CONFIGURED || !settings.getBoolean("enabled", false) || outlet.isEmpty()) return
        val cookie = SessionStore(context).get() ?: return
        if (settings.getString("installation_id", null) == null) return
        val scope = fingerprint(cookie)
        val unchanged = settings.getString("bound_session", "") == scope && settings.getString("bound_outlet", "") == outlet
        if (unchanged && System.currentTimeMillis() - settings.getLong("last_registration", 0) < 300000) return
        settings.edit().putLong("last_registration", System.currentTimeMillis()).apply()
        WorkManager.getInstance(context).enqueueUniqueWork("push-register", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequest.Builder(PushRegistrationWorker::class.java)
                .setInputData(workDataOf("session" to scope, "outlet" to outlet))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build())
    }
}

class PushRegistrationWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
    override fun doWork(): Result {
        val settings = applicationContext.getSharedPreferences("push", Context.MODE_PRIVATE)
        val cookie = SessionStore(applicationContext).get() ?: return Result.success()
        val scope = inputData.getString("session") ?: return Result.success()
        if (PushRegistration.fingerprint(cookie) != scope || !settings.getBoolean("enabled", false)) return Result.success()
        val fid = settings.getString("installation_id", null) ?: return Result.success()
        val outlet = inputData.getString("outlet") ?: return Result.success()
        return try {
            val reply = ApiClient(SessionStore(applicationContext)).request("/api/push", obj("action" to "register", "fid" to fid, "outletId" to outlet))
            // An account switch during this request must not restore the old binding.
            if (SessionStore(applicationContext).get()?.let { PushRegistration.fingerprint(it) } == scope && settings.getString("outlet_id", "") == outlet)
                settings.edit().putString("binding_id", reply.text("bindingId")).putString("bound_session", scope).putString("bound_outlet", outlet).apply()
            Result.success()
        } catch (error: Exception) {
            if (error is ApiException && error.status in listOf(400, 401, 403, 422)) Result.failure()
            else if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }
}

class PushEventWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
    override fun doWork(): Result {
        val settings = applicationContext.getSharedPreferences("push", Context.MODE_PRIVATE)
        val binding = inputData.getString("binding") ?: return Result.success()
        val eventId = inputData.getString("event") ?: return Result.success()
        val cookie = SessionStore(applicationContext).get() ?: return Result.success()
        val scope = PushRegistration.fingerprint(cookie)
        if (settings.getString("binding_id", "") != binding || settings.getString("bound_session", "") != scope) return Result.success()
        return try {
            val reply = ApiClient(SessionStore(applicationContext)).request("/api/push", obj("action" to "event", "bindingId" to binding, "eventId" to eventId))
            val event = reply.optJSONObject("event") ?: return Result.success()
            if (SessionStore(applicationContext).get() == cookie && settings.getString("binding_id", "") == binding)
                AlertNotifications.show(applicationContext, event.text("id"), event.text("kind"), event.text("title"), "Diner Dost", event.text("path"))
            Result.success()
        } catch (error: Exception) {
            if (error is ApiException && error.status in listOf(400, 401, 403, 404, 422)) Result.success()
            else if (runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }
}
