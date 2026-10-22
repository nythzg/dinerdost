package com.dinerdost.app

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.dinerdost.app.data.*
import com.dinerdost.app.notifications.AlertNotifications
import com.dinerdost.app.notifications.PushRegistration
import com.dinerdost.app.settings.AlertSettingsActivity
import com.dinerdost.app.ui.*
import java.util.UUID
import java.util.concurrent.Executors
import org.json.JSONObject

/** Native Android screens backed by authenticated JSON. */
class MainActivity : ComponentActivity() {
    lateinit var api: ApiClient
    var workspace = JSONObject()
    var outlet = ""
    var route = "overview"
    var entityId = ""
    var detail = JSONObject()
    val cart = mutableListOf<JSONObject>()
    var posSession = ""
    var posOrder = ""
    var posOrderVersion = 0
    lateinit var body: LinearLayout
    private lateinit var titleView: TextView
    private lateinit var bell: BellView
    private lateinit var progress: ProgressBar
    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var generation = 0
    private var screenRevision = 0
    private var workspaceRevision = 0
    private var resumed = false
    private var refreshing = false
    private var mutationBusy = false
    private val pendingCommands = mutableMapOf<String, String>()
    private var inbox = JSONObject()
    private var notificationScope = ""
    private var alertCursor: Long? = null
    private var activitySent = 0L
    private val tick =
        object : Runnable {
            override fun run() {
                if (resumed && api.hasSession()) {
                    pollInbox()
                    pollWorkspace()
                    handler.postDelayed(this, 15000)
                }
            }
        }
    val actor: JSONObject
        get() = workspace.optJSONObject("actor") ?: JSONObject()

    val role: String
        get() = actor.text("role")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        api = ApiClient(SessionStore(this))
        route = savedInstanceState?.getString("route") ?: "overview"
        entityId = savedInstanceState?.getString("entity") ?: ""
        outlet = savedInstanceState?.getString("outlet") ?: ""
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (route != homeRoute() && api.hasSession()) open(homeRoute()) else finish()
                }
            },
        )
        if (api.hasSession()) {
            shell()
            refresh {
                if (entityId.isNotEmpty()) open(route, entityId)
                handlePath(intent?.getStringExtra("path"))
            }
        } else signIn()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (api.hasSession()) handlePath(intent.getStringExtra("path"))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("route", route)
        outState.putString("entity", entityId)
        outState.putString("outlet", outlet)
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        handler.post(tick)
    }

    override fun onPause() {
        resumed = false
        handler.removeCallbacks(tick)
        super.onPause()
    }

    override fun onDestroy() {
        generation++
        handler.removeCallbacksAndMessages(null)
        executor.shutdownNow()
        super.onDestroy()
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        val tableId =
            if (route == "table") entityId
            else if (route == "order")
                workspace
                    .rows("sessions")
                    .firstOrNull { it.text("id") == detail.text("session_id") }
                    ?.text("table_id")
                    .orEmpty()
            else if (route == "pos")
                workspace
                    .rows("sessions")
                    .firstOrNull { it.text("id") == posSession }
                    ?.text("table_id")
                    .orEmpty()
            else ""
        if (
            tableId.isNotEmpty() &&
                System.currentTimeMillis() - activitySent > 60000 &&
                api.hasSession()
        ) {
            activitySent = System.currentTimeMillis()
            executor.execute {
                runCatching { api.command("tableActivity", obj("tableId" to tableId)) }
            }
        }
    }

    fun homeRoute(): String =
        when (BuildConfig.APPLICATION) {
            "CAPTAIN" -> "tasks"
            "KITCHEN", "BAR" -> "kitchen"
            "POS" -> "overview"
            "COMMAND" -> if (role == "ACCOUNTANT") "reports" else "overview"
            else -> when (role) {
            "KITCHEN" -> "kitchen"
            "BARTENDER" -> "kitchen"
            "WAITER",
            "CASHIER" -> "floor"
            else -> "overview"
            }
        }

    fun shell() {
        val content =
            column(0).apply {
                setBackgroundColor(Palette.background)
                fitsSystemWindows = true
            }
        val toolbar =
            row().apply {
                setPadding(dp(8), dp(8), dp(8), dp(8))
                setBackgroundColor(android.graphics.Color.WHITE)
            }
        toolbar.add(
            button("Menu") { navigation() }
                .apply { layoutParams = LinearLayout.LayoutParams(dp(76), dp(52)) }
        )
        titleView = text("Diner Dost", 21f, true).apply { setPadding(dp(12), 0, 0, 0) }
        toolbar.add(titleView, 1f)
        bell =
            BellView(this) { open("notifications") }
                .apply { layoutParams = LinearLayout.LayoutParams(dp(52), dp(52)) }
        toolbar.add(bell)
        content.add(toolbar)
        progress =
            ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
                isIndeterminate = true
                visibility = View.GONE
                layoutParams = LinearLayout.LayoutParams(-1, dp(3))
            }
        content.add(progress)
        body = column()
        content.add(
            ScrollView(this).apply {
                addView(body)
                isFillViewport = true
            }
        )
        setContentView(content)
    }

    fun signIn() {
        generation++
        workspace = JSONObject()
        outlet = ""
        inbox = JSONObject()
        alertCursor = null
        notificationScope = ""
        pendingCommands.clear()
        cart.clear()
        detail = JSONObject()
        posOrder = ""
        posSession = ""
        mutationBusy = false
        refreshing = false
        AlertNotifications.clear(this)
        val form =
            column(24).apply {
                setPadding(dp(24), dp(64), dp(24), dp(24))
                setBackgroundColor(Palette.background)
                fitsSystemWindows = true
            }
        form.add(text(BuildConfig.PRODUCT_TITLE, 34f, true, Palette.green))
        form.add(text("Sign in", 24f, true))
        val email =
            EditText(this).apply {
                hint = "Email"
                contentDescription = "Email"
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                minHeight = dp(56)
            }
        val password =
            EditText(this).apply {
                hint = "Password"
                contentDescription = "Password"
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                minHeight = dp(56)
            }
        val error = text("", 14f, color = 0xffa12e27.toInt())
        form.add(email)
        form.add(password)
        form.add(error)
        lateinit var submit: Button
        submit =
            button("Sign in", true) {
                if (email.text.isBlank() || password.text.isBlank()) {
                    error.text = "Enter your email and password."
                    return@button
                }
                submit.isEnabled = false
                error.text = ""
                val credentials =
                    obj(
                        "email" to email.text.toString().trim(),
                        "password" to password.text.toString(),
                        "application" to BuildConfig.APPLICATION,
                    )
                val expected = generation
                executor.execute {
                    val result = runCatching { api.request("/api/auth/login", credentials) }
                    handler.post {
                        if (expected != generation) return@post
                        submit.isEnabled = true
                        result
                            .onSuccess {
                                password.text.clear()
                                shell()
                                route = "overview"
                                handler.removeCallbacks(tick)
                                handler.post(tick)
                                refresh { open(homeRoute()) }
                            }
                            .onFailure { error.text = it.message ?: "Sign in failed." }
                    }
                }
            }
        form.add(submit)
        form.add(button("Accept staff invite") { acceptInvite() })
        setContentView(ScrollView(this).apply { addView(form) })
    }

    private fun acceptInvite() {
        form("Staff invitation", listOf(Field("token", "Invitation link or token"))) {
            values,
            dialog ->
            val token = values.getValue("token").substringAfterLast('/').substringBefore('?')
            if (!token.matches(Regex("[a-zA-Z0-9_-]{43}"))) {
                Toast.makeText(
                        this,
                        "Enter the invitation link from your owner.",
                        Toast.LENGTH_LONG,
                    )
                    .show()
                return@form
            }
            executor.execute {
                val result = runCatching { api.request("/api/invites/$token") }
                handler.post {
                    result
                        .onSuccess { info ->
                            dialog.dismiss()
                            form(
                                "Join Diner Dost",
                                listOf(
                                    Field("name", "Name", info.optString("name")),
                                    Field(
                                        "password",
                                        "Password",
                                        type =
                                            InputType.TYPE_CLASS_TEXT or
                                                InputType.TYPE_TEXT_VARIATION_PASSWORD,
                                    ),
                                ),
                                "Join",
                            ) { input, join ->
                                executor.execute {
                                    val joined = runCatching {
                                        api.request(
                                            "/api/invites/$token",
                                            obj(
                                                "name" to input["name"],
                                                "password" to input["password"],
                                                "application" to BuildConfig.APPLICATION,
                                            ),
                                        )
                                    }
                                    handler.post {
                                        joined
                                            .onSuccess {
                                                join.dismiss()
                                                shell()
                                                refresh { open(homeRoute()) }
                                            }
                                            .onFailure { showError(it) }
                                    }
                                }
                            }
                        }
                        .onFailure { showError(it) }
                }
            }
        }
    }

    fun refresh(after: (() -> Unit)? = null) {
        if (refreshing) return
        refreshing = true
        val revision = ++workspaceRevision
        read(
            { api.request("/api/workspace" + if (outlet.isNotEmpty()) "?outlet=$outlet" else "") },
            { data ->
                if (revision != workspaceRevision) return@read
                refreshing = false
                workspace = data
                outlet = data.text("outletId")
                if (route == "overview" && role in listOf("WAITER", "CASHIER", "KITCHEN"))
                    route = homeRoute()
                render()
                pollInbox()
                after?.invoke()
            },
            {
                refreshing = false
                showError(it)
            },
        )
    }

    private fun pollWorkspace() {
        if (outlet.isEmpty() || refreshing || mutationBusy) return
        val revision = ++workspaceRevision
        val expectedOutlet = outlet
        read(
            { api.request("/api/workspace?outlet=$expectedOutlet") },
            { data ->
                if (revision != workspaceRevision || expectedOutlet != outlet) return@read
                val changed =
                    actor.text("employeeId") != data.optJSONObject("actor")?.text("employeeId") ||
                        role != data.optJSONObject("actor")?.text("role")
                workspace = data
                if (changed) {
                    cart.clear()
                    detail = JSONObject()
                    alertCursor = null
                    AlertNotifications.clear(this)
                    open(homeRoute())
                } else if (
                    hasWindowFocus() &&
                        route in
                            listOf(
                                "overview",
                                "floor",
                                "orders",
                                "kitchen",
                                "tasks",
                                "payments",
                                "invoices",
                            )
                )
                    render()
            },
            { error ->
                if (error is ApiException && error.code == "OUTLET_FORBIDDEN") {
                    generation++
                    outlet = ""
                    refreshing = false
                    refresh { open(homeRoute()) }
                }
            },
        )
    }

    fun read(
        block: () -> JSONObject,
        success: (JSONObject) -> Unit,
        failure: ((Throwable) -> Unit)? = null,
    ) {
        val expected = generation
        if (::progress.isInitialized) progress.visibility = View.VISIBLE
        executor.execute {
            val result = runCatching(block)
            handler.post {
                if (expected != generation || isDestroyed) return@post
                if (::progress.isInitialized) progress.visibility = View.GONE
                result.onSuccess(success).onFailure {
                    if (it is ApiException && it.status == 401) signIn()
                    else (failure ?: ::showError)(it)
                }
            }
        }
    }

    fun mutate(
        action: String,
        input: JSONObject = JSONObject(),
        id: String? = null,
        orderId: String? = null,
        roundId: String? = null,
        kind: String? = null,
        after: ((JSONObject) -> Unit)? = null,
    ) {
        if (mutationBusy) {
            Toast.makeText(this, "Saving…", Toast.LENGTH_SHORT).show()
            return
        }
        mutationBusy = true
        enableBodyButtons(false)
        val fingerprint =
            listOf(action, id, orderId, roundId, kind, input.toString()).joinToString("|")
        val key = pendingCommands.getOrPut(fingerprint) { UUID.randomUUID().toString() }
        read(
            { api.command(action, input, id, orderId, roundId, kind, key) },
            { result ->
                mutationBusy = false
                enableBodyButtons(true)
                pendingCommands.remove(fingerprint)
                if (after != null) after(result) else reload()
            },
            { error ->
                mutationBusy = false
                enableBodyButtons(true)
                if (error is ApiException && error.status in 400..499)
                    pendingCommands.remove(fingerprint)
                showError(error)
            },
        )
    }

    private fun enableBodyButtons(enabled: Boolean) {
        fun visit(view: View) {
            if (view is Button) view.isEnabled = enabled
            if (view is ViewGroup)
                for (index in 0 until view.childCount) visit(view.getChildAt(index))
        }
        if (::body.isInitialized) visit(body)
    }

    fun reload() {
        if (route in listOf("order", "table", "invoice")) open(route, entityId) else refresh()
    }

    fun open(screen: String, id: String = "") {
        if (!NativeRoute.allowed(workspace, screen)) { showError(IllegalStateException("This screen is not available in this application.")); return }
        val revision = ++screenRevision
        route = screen
        entityId = id
        when (screen) {
            "order" ->
                read(
                    { api.request("/api/orders/$id") },
                    {
                        if (revision != screenRevision) return@read
                        detail = it
                        render()
                    },
                )
            "table" ->
                read(
                    { api.request("/api/tables/$id/billing") },
                    {
                        if (revision != screenRevision) return@read
                        detail = it
                        render()
                    },
                )
            "invoice" ->
                read(
                    { api.request("/api/invoices/$id") },
                    {
                        if (revision != screenRevision) return@read
                        detail = it
                        render()
                    },
                )
            "notifications" -> {
                render()
                pollInbox()
            }
            else -> render()
        }
    }

    private fun handlePath(path: String?) {
        if (path != null) NativeRoute.fromPath(path)?.let { open(it.first, it.second) }
    }

    private fun navigation() {
        val menu = column()
        menu.add(
            text(workspace.optJSONObject("restaurant")?.text("name") ?: "Diner Dost", 22f, true)
        )
        menu.add(
            text(
                "${actor.text("name")} · ${if(role=="KITCHEN")"Chef" else label(role)}",
                14f,
                color = Palette.muted,
            )
        )
        val outlets = workspace.rows("outlets")
        if (outlets.size > 1) {
            val picker =
                Spinner(this).apply {
                    adapter =
                        ArrayAdapter(
                            this@MainActivity,
                            android.R.layout.simple_spinner_dropdown_item,
                            outlets.map { it.text("name") },
                        )
                    setSelection(outlets.indexOfFirst { it.text("id") == outlet }.coerceAtLeast(0))
                    minimumHeight = dp(52)
                    contentDescription = "Outlet"
                }
            menu.add(picker)
            picker.onItemSelectedListener =
                object : AdapterView.OnItemSelectedListener {
                    override fun onNothingSelected(parent: AdapterView<*>?) {}

                    override fun onItemSelected(
                        parent: AdapterView<*>?,
                        view: View?,
                        position: Int,
                        id: Long,
                    ) {
                        val selected = outlets[position].text("id")
                        if (selected != outlet) {
                            generation++
                            outlet = selected
                            route = homeRoute()
                            detail = JSONObject()
                            inbox = JSONObject()
                            alertCursor = null
                            refreshing = false
                            refresh()
                        }
                    }
                }
        }
        lateinit var drawer: AlertDialog
        NativeRoute.available(workspace).forEach { (id, name) ->
            menu.add(
                button(name, id == route) {
                    drawer.dismiss()
                    open(id)
                }
            )
        }
        menu.add(
            button("Notification settings") {
                drawer.dismiss()
                startActivity(Intent(this, AlertSettingsActivity::class.java))
            }
        )
        menu.add(
            button("Refresh") {
                drawer.dismiss()
                reload()
            }
        )
        menu.add(
            button("Sign out") {
                drawer.dismiss()
                read(
                    { api.request("/api/auth/logout", JSONObject()) },
                    {
                        api.clearSession()
                        signIn()
                    },
                )
            }
        )
        drawer =
            AlertDialog.Builder(this).setView(ScrollView(this).apply { addView(menu) }).create()
        drawer.show()
    }

    fun render() {
        if (!::body.isInitialized) return
        body.removeAllViews()
        titleView.text = NativeRoute.title(route)
        when (route) {
            "overview" -> overviewScreen()
            "reports" -> reportScreen()
            "prep" -> prepScreen()
            "floor" -> tablesScreen()
            "table" -> tableScreen()
            "orders" -> ordersScreen()
            "order" -> orderScreen()
            "pos" -> posScreen()
            "kitchen" -> kitchenScreen()
            "tasks" -> serviceScreen()
            "payments" -> paymentsScreen()
            "invoices" -> invoicesScreen()
            "invoice" -> invoiceScreen()
            "notifications" -> inboxScreen(inbox)
            "team" -> teamScreen()
            "menu" -> menuScreen()
            "floor-plan" -> floorPlanScreen()
            else -> managementScreen()
        }
    }

    fun pollInbox() {
        if (outlet.isEmpty() || !api.hasSession()) return
        PushRegistration.schedule(this, outlet)
        val expectedOutlet = outlet
        read(
            { api.request("/api/notifications?outlet=$expectedOutlet") },
            { data ->
                if (expectedOutlet != outlet) return@read
                val scope = "${actor.text("employeeId")}:$role:$outlet"
                if (scope != notificationScope) {
                    notificationScope = scope
                    alertCursor = null
                    AlertNotifications.clear(this)
                }
                val old = alertCursor
                if (old != null)
                    data
                        .rows("items")
                        .filter { it.optLong("sequence") > old && !it.optBoolean("read") }
                        .reversed()
                        .forEach { event ->
                            AlertNotifications.show(
                                this,
                                event.text("id"),
                                event.text("kind"),
                                event.text("title"),
                                "Diner Dost",
                                event.text("path"),
                            )
                        }
                alertCursor = data.optLong("latest")
                bell.unread = data.optInt("unread")
                inbox = data
                if (route == "notifications") {
                    body.removeAllViews()
                    inboxScreen(inbox)
                }
            },
            {},
        )
    }

    fun inboxScreen(data: JSONObject) {
        body.add(
            button("Notification settings") {
                startActivity(Intent(this, AlertSettingsActivity::class.java))
            }
        )
        if (data.optInt("unread") > 0)
            body.add(
                button("Mark all as read") {
                    read(
                        {
                            api.request(
                                "/api/notifications",
                                obj("outletId" to outlet, "through" to data.optLong("latest")),
                            )
                        },
                        { pollInbox() },
                    )
                }
            )
        val items = data.rows("items")
        if (items.isEmpty()) body.empty("No notifications")
        items.forEach { event ->
            body.card {
                add(text(event.text("title"), 17f, !event.optBoolean("read")))
                add(
                    text(
                        nativeDate(event.text("createdAt")),
                        13f,
                        color = Palette.muted,
                    )
                )
                add(
                    button(if (event.optBoolean("read")) "Open" else "Open · unread") {
                        read(
                            {
                                api.request(
                                    "/api/notifications",
                                    obj(
                                        "outletId" to outlet,
                                        "ids" to org.json.JSONArray().put(event.text("id")),
                                    ),
                                )
                            },
                            {
                                handlePath(event.text("path"))
                                pollInbox()
                            },
                        )
                    }
                )
            }
        }
        if (!data.isNull("next") && data.has("next"))
            body.add(
                button("Load earlier notifications") {
                    read(
                        {
                            api.request(
                                "/api/notifications?outlet=$outlet&before=${data.optLong("next")}"
                            )
                        },
                        { earlier ->
                            val combined = org.json.JSONArray()
                            items.forEach { combined.put(it) }
                            earlier.rows("items").forEach { combined.put(it) }
                            earlier.put("items", combined)
                            inbox = earlier
                            body.removeAllViews()
                            inboxScreen(inbox)
                        },
                    )
                }
            )
    }

    fun showError(error: Throwable) {
        if (error is ApiException && error.status == 401) {
            api.clearSession()
            signIn()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Could not complete")
            .setMessage(
                error.message ?: "Check your connection, refresh the record, and try again."
            )
            .setPositiveButton("OK", null)
            .show()
    }
}
