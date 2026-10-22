package com.dinerdost.app.ui

import android.app.AlertDialog
import android.text.InputType
import android.widget.*
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONArray
import org.json.JSONObject

fun MainActivity.reportScreen() {
    val today = LocalDate.now(ZoneId.of("Asia/Kolkata"))
    val dates = (entityId.ifEmpty { "${today.withDayOfMonth(1)}|$today" }).split('|')
    val from = dates.first(); val to = dates.last()
    body.add(button("$from — $to") {
        form("Report period", listOf(Field("from", "From (YYYY-MM-DD)", from), Field("to", "To (YYYY-MM-DD)", to))) { v, d ->
            LocalDate.parse(v.getValue("from")); LocalDate.parse(v.getValue("to"))
            entityId = "${v["from"]}|${v["to"]}"; d.dismiss(); render()
        }
    })
    val expected = entityId
    read({ api.request("/api/reports?outlet=$outlet&from=$from&to=$to") }, { result ->
        if (route != "reports" || entityId != expected) return@read
        listOf("Settled sales" to "receipts", "Net sales" to "netSales", "Cost of goods" to "cogs", "Operating expenses" to "expenses", "Gross margin" to "grossMargin", "Operating result" to "operatingResult").forEach { (title, field) ->
            body.card { add(text(title, 14f, color = Palette.muted)); add(text(money(result.optLong(field)), 28f, true, Palette.green)) }
        }
        val lines = mutableListOf("Diner Dost report", "$from — $to", "Settled orders: ${result.optInt("orders")}")
        listOf("receipts", "netSales", "cogs", "expenses", "grossMargin", "operatingResult").forEach { lines.add("${label(it)}: ${money(result.optLong(it))}") }
        body.add(text("Sales by channel", 22f, true))
        result.rows("channels").forEach { channel ->
            val line = "${label(channel.text("source"))}: ${money(channel.optLong("amount"))}"
            lines.add(line); body.add(text(line, 17f))
        }
        body.add(text("Payment methods", 22f, true))
        result.rows("methods").forEach { method ->
            val line = "${label(method.text("method"))}: ${money(method.optLong("amount"))}"
            lines.add(line); body.add(text(line, 17f))
        }
        body.add(button("Print / Save report PDF", true) { printDocument("Diner Dost report $from", lines) })
    })
}

fun MainActivity.prepScreen() {
    val day = LocalDate.now(ZoneId.of("Asia/Kolkata"))
    read({ api.request("/api/prep?outlet=$outlet&date=$day") }, { result ->
        if (route != "prep") return@read
        val items = result.rows("items")
        if (items.isEmpty()) body.empty("No matching weekday sales history yet")
        items.forEach { item -> body.card {
            add(text(item.text("name"), 21f, true))
            add(text(if (item.isNull("quantityMilli")) "More history needed" else "${item.optDouble("quantityMilli") / 1000} ${item.text("unit")}", 24f, true, Palette.green))
            add(text("${item.optInt("samples")} matching weekdays · review before preparing", 14f, color = Palette.muted))
        } }
    })
}

fun MainActivity.receivePurchaseForm(purchase: JSONObject) {
    val items = workspace.rows("ingredients").filter { it.text("production_stream") == purchase.text("production_stream") }
    if (items.isEmpty()) { showError(IllegalStateException("Add stock ingredients for this purchase first.")); return }
    val content = column()
    val reference = EditText(this).apply { contentDescription = "Delivery reference"; setText(purchase.optJSONObject("data")?.text("reference")); minHeight = dp(52) }
    content.add(text("Delivery reference", 14f)); content.add(reference)
    val lines = mutableListOf<JSONObject>(); val rows = column(0); content.add(rows)
    lateinit var dialog: AlertDialog
    var positive: Button? = null
    fun draw() {
        rows.removeAllViews()
        lines.forEachIndexed { index, line -> rows.card {
            add(text(items.first { it.text("id") == line.text("ingredientId") }.text("name"), 18f, true))
            add(text("${line.optDouble("quantityMilli") / 1000} · ${line.text("batchNumber")}"))
            add(button("Remove batch") { lines.removeAt(index); draw() })
        } }
        positive?.isEnabled = lines.isNotEmpty()
    }
    content.add(button("Add received batch") {
        form("Received batch", listOf(
            Field("ingredient", "Ingredient", options = items.map { it.text("id") to "${it.text("name")} (${it.text("unit")})" }),
            Field("batch", "Batch number"), Field("quantity", "Quantity", "1", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL),
            Field("cost", "Cost per unit ₹", "0", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL),
            Field("expiry", "Expiry (YYYY-MM-DD)", required = false),
        )) { v, d ->
            require(lines.size < 100) { "Maximum 100 batches." }
            val quantity = v.getValue("quantity").toBigDecimal().movePointRight(3).intValueExact()
            val cost = rupees(v.getValue("cost")); require(quantity > 0 && cost >= 0)
            v["expiry"]?.takeIf { it.isNotEmpty() }?.let { LocalDate.parse(it) }
            lines.add(obj("ingredientId" to v["ingredient"], "batchNumber" to v["batch"], "quantityMilli" to quantity, "unitCost" to cost, "expiresOn" to v["expiry"]?.ifEmpty { null }))
            d.dismiss(); draw()
        }
    })
    dialog = AlertDialog.Builder(this).setTitle("Receive delivery").setView(ScrollView(this).apply { addView(content) }).setNegativeButton("Cancel", null).setPositiveButton("Receive", null).create()
    dialog.setOnShowListener {
        positive = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).isAllCaps = false
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = false
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            mutate("receivePurchase", obj("purchaseId" to purchase.text("id"), "version" to purchase.optInt("version"), "reference" to reference.text.toString().trim(), "lines" to JSONArray(lines)), after = { dialog.dismiss(); render() })
        }
    }
    dialog.show()
}
