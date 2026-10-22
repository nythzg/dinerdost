package com.dinerdost.app

import android.content.Intent
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import com.dinerdost.app.data.*
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Runs against an isolated local QA database. No production accounts or payments. */
class NativeWorkflowTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val device = UiDevice.getInstance(instrumentation)
    private val timeout = 45000L
    private val origin = BuildConfig.APP_ORIGIN
    private val server = ApiClient(SessionStore(instrumentation.context))
    private val screenshots =
        File(context.getExternalFilesDir(null), "native-verification").apply { mkdirs() }

    private fun click(text: String) {
        val item = device.wait(Until.findObject(By.text(text).clickable(true)), timeout)
        if (item == null) {
            device.takeScreenshot(File(screenshots, "failed.png"))
            device.dumpWindowHierarchy(File(screenshots, "failed.xml"))
        }
        assertNotNull("Missing clickable $text", item)
        item.click()
    }

    private fun exists(text: String) = device.wait(Until.hasObject(By.text(text)), timeout)

    private fun field(description: String, value: String) {
        val view = device.wait(Until.findObject(By.desc(description)), timeout)
        assertNotNull("Missing $description", view)
        view.text = value
    }

    private fun scrollTo(text: String) {
        val deadline=android.os.SystemClock.uptimeMillis()+timeout
        while(android.os.SystemClock.uptimeMillis()<deadline) {
            if(device.hasObject(By.text(text)))return
            val scroller=UiScrollable(UiSelector().scrollable(true))
            if(runCatching { scroller.scrollTextIntoView(text) }.getOrDefault(false))return
            device.waitForIdle(500)
        }
        device.takeScreenshot(File(screenshots,"failed.png"));device.dumpWindowHierarchy(File(screenshots,"failed.xml"))
        fail("Cannot scroll to $text")
    }

    private fun menu(text: String) {
        click("Menu")
        scrollTo(text)
        click(text)
    }

    private fun screenshot(name: String) {
        device.waitForIdle()
        assertTrue(device.takeScreenshot(File(screenshots, "$name.png")))
    }

    private val guestCookies = linkedMapOf<String, String>()

    private fun guest(
        key: String,
        action: String? = null,
        input: JSONObject = JSONObject(),
    ): JSONObject {
        val connection = URI("$origin/api/guest/$key").toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15000
            connection.readTimeout = 30000
            connection.setRequestProperty("Origin", origin)
            connection.setRequestProperty(
                "Cookie",
                guestCookies.entries.joinToString("; ") { "${it.key}=${it.value}" },
            )
            if (action != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Idempotency-Key", UUID.randomUUID().toString())
                connection.outputStream.use {
                    it.write(obj("action" to action, "input" to input).toString().toByteArray())
                }
            }
            val status = connection.responseCode
            val value =
                JSONObject(
                    (if (status in 200..299) connection.inputStream else connection.errorStream)
                        .bufferedReader()
                        .readText()
                )
            assertEquals(value.toString(), 200, status)
            connection.headerFields.entries
                .filter { it.key.equals("Set-Cookie", true) }
                .flatMap { it.value }
                .forEach { header ->
                    val cookie = header.substringBefore(';')
                    guestCookies[cookie.substringBefore('=')] = cookie.substringAfter('=')
                }
            return value
        } finally {
            connection.disconnect()
        }
    }

    @Test
    fun nativeLoginActivationInboxAndOrderLifecycle() {
        assertTrue(
            "This test only runs against the local QA server",
            origin.startsWith("http://10.0.2.2:"),
        )
        server.clearSession()
        SessionStore(context).clear()
        val email = "native-${UUID.randomUUID()}@example.test"
        val password = "Native-test-${UUID.randomUUID()}"
        server.request(
            "/api/auth/signup",
            obj(
                "name" to "Native Owner",
                "email" to email,
                "password" to password,
                "restaurant" to "Native Android QA",
                "outlet" to "Main",
                "qrEnabled" to true,
                "demo" to true,
            ),
        )
        val workspace = server.request("/api/workspace")
        val outlet = workspace.text("outletId")
        val table = workspace.rows("tables").first()
        val publicKey = table.text("public_key")
        guest(publicKey, "connect")
        guest(publicKey, "service", obj("kind" to "ACTIVATE_TABLE"))
        assertTrue(guest(publicKey).optBoolean("activationRequired"))
        context.startActivity(
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        field("Email", email)
        field("Password", password)
        click("Sign in")
        assertTrue(exists("Settled sales"))
        assertTrue(device.wait(Until.hasObject(By.descStartsWith("Notifications,")), timeout))
        screenshot("overview")
        device.findObject(By.descStartsWith("Notifications,")).click()
        assertTrue(exists("Table activation requested · ${table.text("label")}"))
        screenshot("notifications")
        click("Mark all as read")
        assertTrue(device.wait(Until.hasObject(By.desc("Notifications, 0 unread")), timeout))
        click("Open")
        assertTrue(exists("Activate table"))
        click("Activate table")
        field("Guests", "2")
        click("Activate table")
        assertTrue(exists("Completed"))
        assertFalse(guest(publicKey).optBoolean("activationRequired"))
        menu("Tables")
        assertTrue(exists("Occupied"))
        screenshot("tables")
        menu("Cashier POS")
        click("Butter naan · ₹60.00")
        field("Quantity", "2")
        click("Add")
        scrollTo("Create order")
        click("Create order")
        field("Customer name", "Native Guest")
        field("Customer phone", "9123456789")
        click("Create order")
        assertTrue(exists("Accept round"))
        screenshot("order-pending")
        click("Accept round")
        assertTrue(exists("Round 1 · Accepted"))
        scrollTo("Review rewards")
        click("Review rewards")
        assertTrue(exists("Record payment"))
        click("Record payment")
        click("Record & confirm")
        assertTrue(exists("Kitchen · Released"))
        screenshot("order-paid")
        menu("Kitchen")
        click("Start preparing")
        click("Mark ready")
        screenshot("kitchen-ready")
        val updated = server.request("/api/workspace?outlet=$outlet")
        val order = updated.rows("orders").first()
        context.startActivity(
            Intent(context, MainActivity::class.java)
                .putExtra("path", "/app/orders/${order.text("id")}")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        )
        scrollTo("Mark served")
        click("Mark served")
        scrollTo("Settle & invoice")
        click("Settle & invoice")
        assertTrue(exists("Final tax invoice"))
        screenshot("invoice")
        val saved = server.request("/api/orders/${order.text("id")}")
        assertEquals("SETTLED", saved.text("status"))
        assertEquals(12000, saved.optJSONObject("totals")!!.optInt("paid"))
        assertFalse(device.hasObject(By.clazz("android.webkit.WebView")))
        assertFalse(device.hasObject(By.text("Open in browser")))
    }
}
