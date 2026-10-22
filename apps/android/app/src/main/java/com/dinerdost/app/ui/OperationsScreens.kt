package com.dinerdost.app.ui

import android.graphics.Color
import android.text.InputType
import android.widget.*
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import org.json.JSONObject

fun MainActivity.overviewScreen() {
    val metrics = workspace.optJSONObject("metrics") ?: JSONObject()
    listOf(
            "Settled sales" to money(metrics.optLong("settled")),
            "Orders today" to metrics.optString("orders", "0"),
            "Active tables" to metrics.optString("active", "0"),
            "Open orders" to metrics.optString("pending", "0"),
        )
        .forEach { (name, value) ->
            body.card {
                add(text(name, 14f, color = Palette.muted))
                add(text(value, 32f, true, Palette.green))
            }
        }
    if (workspace.has("orders")) body.add(button("View orders", true) { open("orders") })
    body.add(button("Refresh") { refresh() })
}

fun MainActivity.tablesScreen() {
    val tables = workspace.rows("tables")
    if (tables.isEmpty()) body.empty("No tables assigned")
    tables.forEach { table ->
        val occupied = table.optBoolean("is_occupied")
        val request =
            workspace.rows("tasks").firstOrNull {
                it.text("table_id") == table.text("id") &&
                    it.text("kind") == "ACTIVATE_TABLE" &&
                    it.text("state") in listOf("OPEN", "ACCEPTED", "ESCALATED")
            }
        body.card {
            if (occupied) background = surface(Palette.dark, Palette.dark)
            add(text(table.text("label"), 28f, true, if (occupied) Color.WHITE else Palette.ink))
            add(
                text(
                    "${table.optInt("seats")} seats · ${table.text("floor")}",
                    14f,
                    color = if (occupied) Palette.soft else Palette.muted,
                )
            )
            add(
                text(
                    if (occupied) "Occupied"
                    else if (request != null) "Activation requested" else "Available",
                    14f,
                    true,
                    if (occupied) Color.WHITE else Palette.green,
                )
            )
            if (occupied) {
                add(button("Open table", true) { open("table", table.text("id")) })
                add(
                    button("Move / swap") {
                        form(
                            "Move ${table.text("label")}",
                            listOf(
                                Field(
                                    "target",
                                    "To table",
                                    options =
                                        tables
                                            .filter { it.text("id") != table.text("id") }
                                            .map { it.text("id") to it.text("label") },
                                ),
                                Field("reason", "Reason"),
                            ),
                        ) { v, d ->
                            mutate(
                                "exchangeTables",
                                obj(
                                    "sourceTableId" to table.text("id"),
                                    "targetTableId" to v["target"],
                                    "reason" to v["reason"],
                                ),
                                after = {
                                    d.dismiss()
                                    refresh()
                                },
                            )
                        }
                    }
                )
            } else
                add(
                    button(if (request != null) "Activate table" else "Seat guests", true) {
                        activateTable(table, request)
                    }
                )
            add(button("Table QR") { showTableQr(table) })
        }
    }
}

fun MainActivity.activateTable(table: JSONObject, request: JSONObject? = null) {
    val booking =
        workspace.rows("reservations").firstOrNull {
            it.text("table_id") == table.text("id") &&
                it.text("state") == "HELD" &&
                runCatching {
                        java.time.Instant.parse(it.text("starts_at")).toEpochMilli() <=
                            System.currentTimeMillis() + 900000
                    }
                    .getOrDefault(false)
        }
    form(
        "Activate ${table.text("label")}",
        listOf(
            Field(
                "guests",
                "Guests",
                if (booking != null) booking.optInt("guests").toString() else "2",
                InputType.TYPE_CLASS_NUMBER,
            )
        ),
        "Activate table",
    ) { v, d ->
        val count = v["guests"]?.toIntOrNull()
        if (count == null || count !in 1..100) {
            showError(IllegalArgumentException("Enter 1 to 100 guests."))
            return@form
        }
        val input =
            obj(
                "tableId" to table.text("id"),
                "guests" to count,
                "activationRequestId" to request?.text("id"),
                "reservationId" to booking?.text("id"),
            )
        mutate(
            "openSession",
            input,
            after = {
                d.dismiss()
                refresh()
            },
        )
    }
}

fun MainActivity.tableScreen() {
    val table =
        detail.optJSONObject("table")
            ?: workspace.rows("tables").firstOrNull { it.text("id") == entityId }
            ?: JSONObject()
    body.add(text(table.text("label"), 30f, true))
    val sessions =
        detail.rows("sessions").ifEmpty {
            workspace.rows("sessions").filter { it.text("table_id") == entityId }
        }
    sessions.forEach { session ->
        body.card {
            add(text("${session.text("label")} · ${session.optInt("guests")} guests", 20f, true))
            val orders =
                detail.rows("orders").filter { it.text("session_id") == session.text("id") }
            orders.forEach { order ->
                add(
                    button("Order #${order.optInt("number")} · ${label(order.text("status"))}") {
                        open("order", order.text("id"))
                    }
                )
            }
            if (
                workspace.rows("sessions").any {
                    it.text("id") == session.text("id") && it.text("status") == "OPEN"
                }
            )
                add(button("New order", true) { startPos(session.text("id")) })
        }
    }
    body.add(
        button("Separate bill") {
            form(
                "Separate bill",
                listOf(
                    Field("label", "Bill label", "BILL2"),
                    Field("guests", "Guests", "1", InputType.TYPE_CLASS_NUMBER),
                ),
            ) { v, d ->
                mutate(
                    "openSession",
                    obj(
                        "tableId" to entityId,
                        "label" to v["label"],
                        "guests" to (v["guests"]?.toIntOrNull() ?: 1),
                    ),
                    after = {
                        d.dismiss()
                        refresh { open("table", entityId) }
                    },
                )
            }
        }
    )
    body.add(
        button("Close table") {
            form("Close table", listOf(Field("reason", "Reason")), "Close table") { v, d ->
                mutate(
                    "closeTable",
                    obj("tableId" to entityId, "reason" to v["reason"]),
                    after = {
                        d.dismiss()
                        refresh { open("floor") }
                    },
                )
            }
        }
    )
    body.add(button("Refresh") { refresh { open("table", entityId) } })
}

fun MainActivity.ordersScreen() {
    body.add(button("New order", true) { startPos() })
    val orders = workspace.rows("orders")
    if (orders.isEmpty()) body.empty("No orders")
    orders.forEach { order ->
        body.card {
            add(
                text(
                    "#${order.optInt("number")} · ${order.text("table_label").ifEmpty { label(order.text("type")) }}",
                    22f,
                    true,
                )
            )
            add(
                text(
                    "${label(order.text("status"))} · ${money(order.optLong("payable"))}",
                    16f,
                    color = Palette.muted,
                )
            )
            order.optJSONObject("customer_snapshot")?.let { add(text(it.text("name"))) }
            add(button("Open order") { open("order", order.text("id")) })
        }
    }
    body.add(button("Refresh") { refresh() })
}

fun MainActivity.serviceScreen() {
    val tasks = workspace.rows("tasks")
    if (tasks.isEmpty()) body.empty("No table requests")
    tasks.forEach { task ->
        body.card {
            add(text(task.text("table_label"), 22f, true))
            add(
                text(
                    if (task.text("kind") == "ACTIVATE_TABLE") "Table activation"
                    else label(task.text("kind")),
                    18f,
                    true,
                )
            )
            add(text(label(task.text("state")), 14f, color = Palette.muted))
            if (task.text("state") in listOf("OPEN", "ACCEPTED", "ESCALATED")) {
                if (task.text("kind") == "ACTIVATE_TABLE")
                    add(
                        button("Activate table", true) {
                            val table =
                                workspace.rows("tables").firstOrNull {
                                    it.text("id") == task.text("table_id")
                                }
                            if (table != null) activateTable(table, task)
                        }
                    )
                else
                    add(
                        button(if (task.text("state") == "OPEN") "Accept" else "Complete", true) {
                            mutate(
                                "service",
                                obj(
                                    "id" to task.text("id"),
                                    "sessionId" to task.text("session_id").ifEmpty { null },
                                    "kind" to task.text("kind"),
                                    "state" to
                                        if (task.text("state") == "OPEN") "ACCEPTED"
                                        else "COMPLETED",
                                ),
                            )
                        }
                    )
                add(
                    button("Reject") {
                        form("Reject request", listOf(Field("reason", "Reason")), "Reject") { v, d
                            ->
                            mutate(
                                "service",
                                obj(
                                    "id" to task.text("id"),
                                    "kind" to task.text("kind"),
                                    "sessionId" to task.text("session_id").ifEmpty { null },
                                    "state" to "REJECTED",
                                    "reason" to v["reason"],
                                ),
                                after = {
                                    d.dismiss()
                                    refresh()
                                },
                            )
                        }
                    }
                )
            }
        }
    }
    body.add(button("Refresh") { refresh() })
}

fun MainActivity.kitchenScreen() {
    val tickets = workspace.rows("tickets")
    if (tickets.isEmpty()) body.empty("Kitchen is clear")
    tickets.forEach { ticket ->
        body.card {
            add(text("#${ticket.optInt("number")} · ${ticket.text("table_label")}", 24f, true))
            add(
                text(
                    "${ticket.text("station")} · ${label(ticket.text("status"))}",
                    16f,
                    true,
                    Palette.green,
                )
            )
            ticket.rows("items").forEach { item ->
                add(
                    text(
                        "${item.optLong("quantity_milli")/1000.0} × ${item.text("name")}",
                        19f,
                        true,
                    )
                )
                if (item.text("note").isNotEmpty())
                    add(text(item.text("note"), 15f, color = Palette.muted))
            }
            when (ticket.text("status")) {
                "RELEASED" ->
                    add(
                        button("Start preparing", true) {
                            mutate("kitchen", obj("state" to "PREPARING"), id = ticket.text("id"))
                        }
                    )
                "PREPARING" ->
                    add(
                        button("Mark ready", true) {
                            mutate("kitchen", obj("state" to "READY"), id = ticket.text("id"))
                        }
                    )
            }
        }
    }
    body.add(button("Refresh") { refresh() })
}

fun MainActivity.paymentsScreen() {
    val payments = workspace.rows("payments")
    if (payments.isEmpty()) body.empty("No payments")
    payments.forEach { payment ->
        body.card {
            add(text("Order #${payment.optInt("number")}", 20f, true))
            add(text(money(payment.optLong("amount")), 26f, true, Palette.green))
            add(
                text(
                    "${label(payment.text("method"))} · ${if(payment.text("state")=="VERIFIED")"Received" else label(payment.text("state"))}",
                    16f,
                )
            )
            add(button("Open order") { open("order", payment.text("order_id")) })
        }
    }
}

fun MainActivity.invoicesScreen() {
    val invoices = workspace.rows("invoices")
    if (invoices.isEmpty()) body.empty("No invoices")
    invoices.forEach { invoice ->
        body.card {
            add(text(invoice.text("number"), 20f, true))
            add(text(label(invoice.text("document_type")), 14f, color = Palette.muted))
            add(button("View invoice") { open("invoice", invoice.text("id")) })
        }
    }
}
