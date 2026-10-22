package com.dinerdost.app

import android.app.Application
import com.dinerdost.app.notifications.AlertNotifications

class DinerDostApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AlertNotifications.createChannels(this)
    }
}
