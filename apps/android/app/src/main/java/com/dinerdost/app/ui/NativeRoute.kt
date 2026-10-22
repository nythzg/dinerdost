package com.dinerdost.app.ui

import com.dinerdost.app.data.text
import org.json.JSONObject
import com.dinerdost.app.BuildConfig

object NativeRoute {
    private val productRoutes = mapOf(
        "POS" to setOf("overview", "floor", "floor-plan", "orders", "pos", "reservations", "payments", "invoices", "customers"),
        "CAPTAIN" to setOf("tasks", "floor", "floor-plan", "orders", "checklists", "attendance"),
        "KITCHEN" to setOf("kitchen", "menu", "inventory", "vendors", "purchases", "expenses", "checklists", "attendance"),
        "BAR" to setOf("kitchen", "menu", "inventory", "vendors", "purchases", "attendance"),
        "COMMAND" to setOf("audit", "overview", "reports", "invoices", "outlets", "brands", "team", "attendance", "campaigns", "integrations", "expenses"),
    )
    private val names =
        linkedMapOf(
            "overview" to "Overview",
            "floor" to "Tables",
            "floor-plan" to "Floor plan",
            "orders" to "Orders",
            "pos" to "Cashier POS",
            "kitchen" to "Kitchen",
            "tasks" to "Service",
            "payments" to "Payments",
            "invoices" to "Bills & invoices",
            "menu" to "Menu",
            "inventory" to "Inventory",
            "customers" to "Customers",
            "reservations" to "Reservations",
            "vendors" to "Vendors",
            "purchases" to "Purchases",
            "expenses" to "Expenses",
            "checklists" to "Checklists",
            "campaigns" to "Campaign drafts",
            "team" to "Team",
            "attendance" to "Attendance",
            "outlets" to "Outlets",
            "brands" to "Virtual brands",
            "reports" to "Reports",
            "audit" to "Activity log",
            "integrations" to "Connections",
        )

    fun title(route: String) =
        when (route) {
            "order" -> "Order details"
            "table" -> "Table billing"
            "invoice" -> "Invoice"
            "notifications" -> "Notifications"
            else -> names[route] ?: "Diner Dost"
        }

    fun available(data: JSONObject): List<Pair<String, String>> {
        val role = data.optJSONObject("actor")?.text("role") ?: ""
        return names
            .filterKeys {
                if (productRoutes[BuildConfig.APPLICATION]?.contains(it) == false) return@filterKeys false
                when (it) {
                    "overview",
                    "reports" -> data.has("metrics")
                    "floor",
                    "floor-plan",
                    "tasks",
                    "reservations",
                    "checklists" -> data.has("tables") || data.optBoolean("ownChecklists")
                    "orders",
                    "pos" -> role in listOf("OWNER", "MANAGER", "CASHIER", "WAITER")
                    "kitchen" -> data.has("tickets")
                    "payments" -> data.has("payments")
                    "invoices" -> data.has("invoices")
                    "menu" -> data.has("menu")
                    "inventory",
                    "vendors",
                    "purchases" -> data.has("ingredients")
                    "customers",
                    "campaigns" -> data.has("customers")
                    "team" -> role == "OWNER"
                    "attendance" -> data.has("attendance")
                    "expenses" -> role in listOf("OWNER", "ACCOUNTANT") || BuildConfig.APPLICATION == "KITCHEN"
                    "audit" -> data.has("audit")
                    "outlets",
                    "brands",
                    "integrations" -> role == "OWNER"
                    else -> false
                }
            }
            .map { it.toPair() }
    }

    fun allowed(data: JSONObject, screen: String): Boolean {
        if (screen == "notifications") return true
        val parent = when (screen) { "order" -> "orders"; "pos" -> if (BuildConfig.APPLICATION == "CAPTAIN") "orders" else "pos"; "table", "qr" -> "floor"; "invoice" -> "invoices"; "prep" -> "checklists"; else -> screen }
        return available(data).any { it.first == parent }
    }

    fun fromPath(path: String): Pair<String, String>? {
        if (
            !path.startsWith("/app/") ||
                path.contains("..") ||
                path.contains('\\') ||
                path.contains('?') ||
                path.contains('#')
        )
            return null
        val parts = path.removePrefix("/app/").split('/')
        if (parts.size == 2 && parts[0] == "orders" && parts[1].matches(Regex("[a-fA-F0-9-]{36}")))
            return "order" to parts[1]
        return if (parts.size == 1 && (names.containsKey(parts[0]) || parts[0] == "notifications"))
            parts[0] to ""
        else null
    }
}
