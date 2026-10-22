package com.dinerdost.app.ui

import android.app.AlertDialog
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.widget.EditText
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import java.math.BigDecimal
import org.json.JSONArray
import org.json.JSONObject

private const val DECIMAL = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL

fun rupees(value: String): Long = BigDecimal(value).movePointRight(2).longValueExact()

fun MainActivity.startPos(session: String = "", order: String = "", version: Int = 0) {
    if (cart.isNotEmpty() && (posSession != session || posOrder != order)) {
        AlertDialog.Builder(this)
            .setTitle("Replace current cart?")
            .setMessage("The current cart has unsent items.")
            .setNegativeButton("Keep cart", null)
            .setPositiveButton("Replace") { _, _ ->
                cart.clear()
                posSession = session
                posOrder = order
                posOrderVersion = version
                open("pos")
            }
            .show()
    } else {
        posSession = session
        posOrder = order
        posOrderVersion = version
        open("pos")
    }
}

fun MainActivity.posScreen() {
    val sessions = workspace.rows("sessions").filter { it.text("status") == "OPEN" }
    body.add(
        button(
            sessions
                .firstOrNull { it.text("id") == posSession }
                ?.let { "${it.text("table_label")} · ${it.text("label")}" } ?: "Takeaway"
        ) {
            form(
                "Order table",
                listOf(
                    Field(
                        "session",
                        "Table",
                        posSession,
                        options =
                            listOf("" to "Takeaway") +
                                sessions.map {
                                    it.text("id") to
                                        "${it.text("table_label")} · ${it.text("label")}"
                                },
                        required = false,
                    )
                ),
            ) { v, d ->
                posSession = v["session"].orEmpty()
                d.dismiss()
                render()
            }
        }
    )
    val search =
        EditText(this).apply {
            hint = "Search menu"
            contentDescription = "Search menu"
            minHeight = dp(52)
        }
    body.add(search)
    val catalog = column(0)
    body.add(catalog)
    fun showMenu(query: String) {
        catalog.removeAllViews()
        workspace
            .rows("menu")
            .filter { it.optBoolean("active") && it.text("name").contains(query, true) }
            .forEach { item ->
                catalog.add(
                    button("${item.text("name")} · ${money(item.optLong("price"))}") {
                        addDish(item)
                    }
                )
            }
    }
    search.addTextChangedListener(
        object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                showMenu(s.toString())
            }

            override fun afterTextChanged(s: Editable?) {}
        }
    )
    showMenu("")
    body.add(text("Your order", 24f, true))
    cart.forEachIndexed { index, line ->
        body.card {
            add(text("${line.text("name")} × ${line.text("quantity")}", 18f, true))
            if (line.text("variantLabel").isNotEmpty())
                add(text(line.text("variantLabel"), 14f, color = Palette.muted))
            add(
                button("Change quantity") {
                    form(
                        line.text("name"),
                        listOf(
                            Field(
                                "quantity",
                                "Quantity",
                                line.text("quantity"),
                                if (line.text("unit") in listOf("portion", "peg"))
                                    InputType.TYPE_CLASS_NUMBER
                                else DECIMAL,
                            )
                        ),
                    ) { v, d ->
                        val amount = v["quantity"]?.toDoubleOrNull()
                        if (
                            amount == null ||
                                amount <= 0 ||
                                (line.text("unit") in listOf("portion", "peg") && amount % 1 != 0.0)
                        ) {
                            showError(
                                IllegalArgumentException(
                                    "Enter a valid quantity; portions and pegs use whole units."
                                )
                            )
                            return@form
                        }
                        line.put("quantity", v["quantity"])
                        d.dismiss()
                        render()
                    }
                }
            )
            add(
                button("Remove") {
                    cart.removeAt(index)
                    render()
                }
            )
        }
    }
    if (cart.isEmpty()) body.empty("Add items to your order")
    else {
        body.add(
            text(
                "Subtotal · ${money(cart.sumOf { (it.optLong("price")*it.optDouble("quantity")).toLong() })}",
                22f,
                true,
            )
        )
        body.add(button("Create order", true) { checkout(false) })
        body.add(button("Save draft") { checkout(true) })
    }
}

private fun MainActivity.addDish(item: JSONObject) {
    val variants = item.rows("variants")
    val fields =
        mutableListOf(
            Field(
                "quantity",
                "Quantity",
                "1",
                if (item.text("unit") in listOf("portion", "peg")) InputType.TYPE_CLASS_NUMBER
                else DECIMAL,
            ),
            Field("note", "Note", required = false),
        )
    if (variants.isNotEmpty())
        fields.add(
            0,
            Field(
                "variant",
                "Variant",
                options =
                    listOf("" to "Standard") +
                        variants.map {
                            it.text("id") to "${it.text("name")} · +${money(it.optLong("price"))}"
                        },
                required = false,
            ),
        )
    form(item.text("name"), fields, "Add") { v, d ->
        val amount = v["quantity"]?.toDoubleOrNull()
        if (
            amount == null ||
                amount <= 0 ||
                (item.text("unit") in listOf("portion", "peg") && amount % 1 != 0.0)
        ) {
            showError(
                IllegalArgumentException(
                    "Enter a positive quantity. Portions and pegs use whole units."
                )
            )
            return@form
        }
        val variant = variants.firstOrNull { it.text("id") == v["variant"] }
        val modifiers = item.rows("modifiers")
        val selected = BooleanArray(modifiers.size)
        fun addLine() {
            val chosen = modifiers.filterIndexed { index, _ -> selected[index] }
            cart.add(
                obj(
                    "itemId" to item.text("id"),
                    "name" to item.text("name"),
                    "unit" to item.text("unit"),
                    "price" to
                        item.optLong("price") +
                            (variant?.optLong("price") ?: 0) +
                            chosen.sumOf { it.optLong("price") },
                    "quantity" to v["quantity"],
                    "variant" to variant?.text("id"),
                    "variantLabel" to
                        listOfNotNull(
                                variant?.text("name"),
                                chosen.joinToString { it.text("name") }.ifEmpty { null },
                            )
                            .joinToString(" · "),
                    "modifiers" to JSONArray(chosen.map { it.text("id") }),
                    "note" to v["note"],
                )
            )
            render()
        }
        d.dismiss()
        if (modifiers.isEmpty()) addLine()
        else
            AlertDialog.Builder(this)
                .setTitle("Add extras")
                .setMultiChoiceItems(
                    modifiers
                        .map { "${it.text("name")} · +${money(it.optLong("price"))}" }
                        .toTypedArray(),
                    selected,
                ) { _, which, checked ->
                    selected[which] = checked
                }
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Add") { _, _ -> addLine() }
                .show()
    }
}

private fun MainActivity.checkout(draft: Boolean) {
    form(
        if (draft) "Save draft" else "Create order",
        listOf(
            Field(
                "name",
                "Customer name",
                detail.optJSONObject("customer_snapshot")?.text("name").orEmpty(),
                required = false,
            ),
            Field("phone", "Customer phone", type = InputType.TYPE_CLASS_PHONE, required = false),
            Field(
                "course",
                "Course",
                "IMMEDIATE",
                options =
                    listOf("IMMEDIATE", "STARTER", "MAIN", "DESSERT", "BEVERAGE").map {
                        it to label(it)
                    },
            ),
        ),
        if (draft) "Save draft" else "Create order",
    ) { v, d ->
        if (v["name"].isNullOrEmpty() != v["phone"].isNullOrEmpty()) {
            showError(
                IllegalArgumentException("Enter both customer name and phone, or leave both blank.")
            )
            return@form
        }
        val input =
            obj(
                "outletId" to outlet,
                "course" to v["course"],
                "draft" to draft,
                "type" to if (posSession.isEmpty()) "TAKEAWAY" else "DINE_IN",
                "sessionId" to posSession.ifEmpty { null },
                "orderId" to posOrder.ifEmpty { null },
                "version" to if (posOrder.isNotEmpty()) posOrderVersion else null,
                "items" to
                    JSONArray(
                        cart.map { line ->
                            obj(
                                "itemId" to line.text("itemId"),
                                "quantity" to line.text("quantity"),
                                "variant" to line.text("variant").ifEmpty { null },
                                "modifiers" to line.optJSONArray("modifiers"),
                                "note" to line.text("note"),
                            )
                        }
                    ),
            )
        if (!v["name"].isNullOrEmpty())
            input.put("customer", obj("name" to v["name"], "phone" to v["phone"]))
        mutate(
            "createRound",
            input,
            after = { result ->
                d.dismiss()
                cart.clear()
                read(
                    { api.request("/api/workspace?outlet=$outlet") },
                    {
                        workspace = it
                        open("order", result.text("id"))
                    },
                )
            },
        )
    }
}

fun MainActivity.orderScreen() {
    val order = detail
    val orderId = order.text("id")
    val closed = order.text("status") in listOf("SETTLED", "VOIDED", "REJECTED")
    body.add(text("Order #${order.optInt("number")}", 28f, true))
    body.add(
        text(
            "${label(order.text("status"))} · ${label(order.text("source"))}",
            16f,
            true,
            Palette.green,
        )
    )
    order.optJSONObject("customer_snapshot")?.let {
        body.card {
            add(text(it.text("name"), 20f, true))
            add(text(it.text("phone"), 15f, color = Palette.muted))
        }
    }
    if (!closed) {
        body.add(
            button("Add more") {
                startPos(order.text("session_id"), orderId, order.optInt("version"))
            }
        )
        if (role == "OWNER")
            body.add(
                button("Tax") {
                    form(
                        "Bill tax",
                        listOf(
                            Field(
                                "tax",
                                "Tax %",
                                if (order.isNull("tax_bps_override")) ""
                                else (order.optInt("tax_bps_override") / 100.0).toString(),
                                DECIMAL,
                                required = false,
                            ),
                            Field("reason", "Reason"),
                        ),
                    ) { v, d ->
                        val input =
                            obj("version" to order.optInt("version"), "reason" to v["reason"])
                                .put(
                                    "taxBps",
                                    if (v["tax"].isNullOrEmpty()) JSONObject.NULL
                                    else
                                        BigDecimal(v.getValue("tax"))
                                            .movePointRight(2)
                                            .intValueExact(),
                                )
                        mutate(
                            "orderTax",
                            input,
                            orderId = orderId,
                            after = {
                                d.dismiss()
                                open("order", orderId)
                            },
                        )
                    }
                }
            )
    }
    order.rows("rounds").forEach { round ->
        body.card {
            val rid = round.text("id")
            val status = round.text("status")
            val version = round.optInt("version")
            add(text("Round ${round.optInt("round_number")} · ${label(status)}", 22f, true))
            round.rows("items").forEach { item ->
                add(
                    text(
                        "${item.optDouble("quantity_milli")/1000} × ${item.text("name")}",
                        17f,
                        true,
                    )
                )
                if (item.text("note").isNotEmpty())
                    add(text(item.text("note"), 14f, color = Palette.muted))
            }
            add(
                text(
                    "${money(round.optLong("payable"))} · ${label(round.text("payment_status"))}",
                    20f,
                    true,
                    Palette.green,
                )
            )
            add(text("Kitchen · ${label(round.text("kot_status"))}", 14f, color = Palette.muted))
            if (!closed && status !in listOf("REJECTED", "VOIDED")) {
                if (round.text("kot_status") == "HELD" && round.optLong("paid") == 0L) {
                    add(button("Edit items") { editRoundItems(order, round) })
                    if (role == "OWNER") add(button("Other charges") { editCharges(order, round) })
                }
                if (status == "PENDING" || status == "DRAFT") {
                    add(
                        button("Accept round", true) {
                            mutate(
                                "decideRound",
                                obj("version" to version, "decision" to "ACCEPT"),
                                orderId = orderId,
                                roundId = rid,
                            )
                        }
                    )
                    add(
                        button("Reject") {
                            form("Reject round", listOf(Field("reason", "Reason")), "Reject") { v, d
                                ->
                                mutate(
                                    "decideRound",
                                    obj(
                                        "version" to version,
                                        "decision" to "REJECT",
                                        "reason" to v["reason"],
                                    ),
                                    orderId = orderId,
                                    roundId = rid,
                                    after = {
                                        d.dismiss()
                                        open("order", orderId)
                                    },
                                )
                            }
                        }
                    )
                }
                if (status == "ACCEPTED") {
                    if (order.isNull("customer_snapshot"))
                        add(
                            button("Add customer", true) {
                                form(
                                    "Customer",
                                    listOf(
                                        Field("name", "Name"),
                                        Field("phone", "Phone", type = InputType.TYPE_CLASS_PHONE),
                                    ),
                                ) { v, d ->
                                    mutate(
                                        "identity",
                                        obj(
                                            "version" to order.optInt("version"),
                                            "name" to v["name"],
                                            "phone" to v["phone"],
                                        ),
                                        orderId = orderId,
                                        roundId = rid,
                                        after = {
                                            d.dismiss()
                                            open("order", orderId)
                                        },
                                    )
                                }
                            }
                        )
                    else if (
                        round.isNull("quote_version") || round.optInt("quote_version") != version
                    )
                        add(
                            button("Review rewards", true) {
                                mutate("reviewRewards", orderId = orderId, roundId = rid)
                            }
                        )
                    else if (
                        round.optLong("paid") < round.optLong("payable") &&
                            workspace.has("payments")
                    )
                        add(button("Record payment", true) { recordRoundPayment(order, round) })
                    if (round.optLong("payable") == 0L && round.text("kot_status") == "HELD")
                        add(
                            button("Release zero-total order") {
                                form("Zero-total order", listOf(Field("reason", "Reason"))) { v, d
                                    ->
                                    mutate(
                                        "zeroTotal",
                                        obj("version" to version),
                                        orderId = orderId,
                                        roundId = rid,
                                        after = {
                                            d.dismiss()
                                            open("order", orderId)
                                        },
                                    )
                                }
                            }
                        )
                    if (round.text("kot_status") == "READY")
                        add(
                            button("Mark served", true) {
                                mutate("serve", orderId = orderId, roundId = rid)
                            }
                        )
                }
                if (role in listOf("OWNER", "MANAGER"))
                    add(
                        button("Void round") {
                            form("Void round", listOf(Field("reason", "Reason")), "Void") { v, d ->
                                mutate(
                                    "void",
                                    obj("version" to version, "reason" to v["reason"]),
                                    orderId = orderId,
                                    roundId = rid,
                                    after = {
                                        d.dismiss()
                                        open("order", orderId)
                                    },
                                )
                            }
                        }
                    )
            }
        }
    }
    order.optJSONObject("totals")?.let { totals ->
        body.card {
            listOf("subtotal", "discount", "tax", "charges", "payable", "paid", "outstanding")
                .forEach {
                    add(
                        text(
                            "${label(it)} · ${money(totals.optLong(it))}",
                            if (it == "outstanding") 22f else 16f,
                            it == "outstanding",
                        )
                    )
                }
        }
    }
    if (!closed) {
        body.add(
            button("Provisional bill") {
                mutate(
                    "bill",
                    obj("final" to false),
                    orderId = orderId,
                    after = { open("invoice", it.text("id")) },
                )
            }
        )
        body.add(
            button("Settle & invoice", true) {
                mutate(
                    "bill",
                    obj("final" to true),
                    orderId = orderId,
                    after = { open("invoice", it.text("id")) },
                )
            }
        )
    }
    val device = order.optJSONObject("deviceAccess")
    if (device != null)
        body.add(
            button(
                if (device.optBoolean("blocked")) "Lift device ban" else "Temporary device ban"
            ) {
                form(
                    "Device access",
                    listOf(
                        Field(
                            "minutes",
                            "Duration",
                            "15",
                            options =
                                listOf(
                                    "15" to "15 minutes",
                                    "60" to "1 hour",
                                    "240" to "4 hours",
                                    "1440" to "24 hours",
                                ),
                        ),
                        Field("reason", "Reason"),
                    ),
                ) { v, d ->
                    mutate(
                        "deviceBan",
                        obj(
                            "mode" to if (device.optBoolean("blocked")) "LIFT" else "BAN",
                            "minutes" to v.getValue("minutes").toInt(),
                            "reason" to v["reason"],
                            "version" to device.optInt("version"),
                        ),
                        orderId = orderId,
                        after = {
                            d.dismiss()
                            open("order", orderId)
                        },
                    )
                }
            }
        )
    body.add(button("Refresh") { open("order", orderId) })
}

private fun MainActivity.recordRoundPayment(order: JSONObject, round: JSONObject) {
    val methods =
        workspace
            .rows("outlets")
            .firstOrNull { it.text("id") == outlet }
            ?.optJSONArray("payment_methods") ?: JSONArray().put("CASH")
    form(
        "Record payment",
        listOf(
            Field(
                "method",
                "Method",
                options =
                    (0 until methods.length()).map {
                        methods.getString(it) to label(methods.getString(it))
                    },
            ),
            Field(
                "amount",
                "Amount ₹",
                BigDecimal(round.optLong("payable") - round.optLong("paid"))
                    .movePointLeft(2)
                    .toPlainString(),
                DECIMAL,
            ),
            Field("reference", "Reference", required = false),
        ),
        "Record & confirm",
    ) { v, d ->
        val amount = runCatching { rupees(v.getValue("amount")) }.getOrNull()
        if (amount == null || amount <= 0) {
            showError(IllegalArgumentException("Enter a valid amount with at most two decimals."))
            return@form
        }
        mutate(
            "recordPayment",
            obj(
                "version" to round.optInt("version"),
                "method" to v["method"],
                "amount" to amount,
                "reference" to v["reference"],
            ),
            orderId = order.text("id"),
            roundId = round.text("id"),
            after = {
                d.dismiss()
                open("order", order.text("id"))
            },
        )
    }
}

private fun MainActivity.editRoundItems(order: JSONObject, round: JSONObject) {
    val lines = round.rows("items").toMutableList()
    fun edit() {
        val fields = lines.mapIndexed { index, item ->
            Field(
                index.toString(),
                item.text("name"),
                (item.optDouble("quantity_milli") / 1000).toString(),
                if (
                    workspace
                        .rows("menu")
                        .firstOrNull { it.text("id") == item.text("item_id") }
                        ?.text("unit") in listOf("portion", "peg")
                )
                    InputType.TYPE_CLASS_NUMBER
                else DECIMAL,
            )
        }
        form("Edit round · 0 removes item", fields, "Save & submit") { values, d ->
            val items = JSONArray()
            lines.forEachIndexed { i, item ->
                val quantity = values[i.toString()]?.toDoubleOrNull() ?: -1.0
                if (quantity > 0) {
                    val menu =
                        workspace.rows("menu").firstOrNull { it.text("id") == item.text("item_id") }
                    if (menu?.text("unit") in listOf("portion", "peg") && quantity % 1 != 0.0) {
                        showError(
                            IllegalArgumentException("Portions and pegs require whole numbers.")
                        )
                        return@form
                    }
                    val variant =
                        menu
                            ?.rows("variants")
                            ?.firstOrNull { it.text("name") == item.text("variant") }
                            ?.text("id")
                    items.put(
                        obj(
                            "itemId" to item.text("item_id"),
                            "quantity" to values[i.toString()],
                            "variant" to variant,
                            "modifiers" to JSONArray(item.rows("modifiers").map { it.text("id") }),
                            "note" to item.text("note"),
                        )
                    )
                } else if (quantity < 0) {
                    showError(IllegalArgumentException("Enter a valid quantity."))
                    return@form
                }
            }
            if (items.length() == 0) {
                showError(IllegalArgumentException("Keep one item or reject / void this round."))
                return@form
            }
            mutate(
                "editRound",
                obj("version" to round.optInt("version"), "submit" to true, "items" to items),
                orderId = order.text("id"),
                roundId = round.text("id"),
                after = {
                    d.dismiss()
                    open("order", order.text("id"))
                },
            )
        }
    }
    edit()
}

private fun MainActivity.editCharges(order: JSONObject, round: JSONObject) {
    val current = round.rows("charges")
    form(
        "Other charges",
        listOf(
            Field("name", "Charge name", "Packaging fee"),
            Field("amount", "Amount ₹", "0", DECIMAL, required = false),
        ),
        "Add charge",
    ) { v, d ->
        val amount = runCatching { rupees(v.getValue("amount")) }.getOrNull()
        if (amount == null || amount <= 0) {
            showError(IllegalArgumentException("Enter a positive charge amount."))
            return@form
        }
        val charges =
            JSONArray(
                    current.map { obj("name" to it.text("name"), "amount" to it.optLong("amount")) }
                )
                .put(obj("name" to v["name"], "amount" to amount))
        mutate(
            "orderCharges",
            obj("version" to round.optInt("version"), "charges" to charges),
            orderId = order.text("id"),
            roundId = round.text("id"),
            after = {
                d.dismiss()
                open("order", order.text("id"))
            },
        )
    }
}
