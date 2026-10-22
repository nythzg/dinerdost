package com.dinerdost.app.ui

import android.text.InputType
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import java.time.LocalDate
import org.json.JSONObject
import com.dinerdost.app.BuildConfig

private const val NUMBER = InputType.TYPE_CLASS_NUMBER
private const val DECIMAL = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL

fun MainActivity.recordScreen(kind: String) {
    val target = route
    if (kind == "checklists" && workspace.has("ingredients")) body.add(button("Prep plan") { open("prep") })
    if (!(kind == "checklists" && workspace.optBoolean("ownChecklists"))) body.add(
        button(
            if (kind == "vendors") "Add vendor" else "New ${NativeRoute.title(kind).lowercase()}",
            true,
        ) {
            recordForm(kind)
        }
    )
    read(
        { api.request("/api/records/$kind?outlet=$outlet") },
        { reply ->
            if (route != target) return@read
            val records = reply.rows("items")
            if (records.isEmpty()) body.empty("No records")
            records.forEach { record ->
                body.card {
                    add(text(record.text("title"), 21f, true))
                    add(text(label(record.text("state")), 14f, true, Palette.green))
                    if (kind == "purchases" && record.text("state") == "APPROVED" && workspace.has("ingredients")) add(button("Receive delivery", true) { receivePurchaseForm(record) })
                    record.optJSONObject("data")?.let { data ->
                        listOf(
                                "guest",
                                "contact",
                                "phone",
                                "date",
                                "due",
                                "at",
                                "message",
                                "instructions",
                                "category",
                                "description",
                                "reference",
                                "note",
                            )
                            .forEach { key ->
                                if (data.text(key).isNotEmpty())
                                    add(text(data.text(key), 15f, color = Palette.muted))
                            }
                        if (data.has("amount")) add(text(money(data.optLong("amount")), 21f, true))
                    }
                    val ownTask = kind == "checklists" && workspace.optBoolean("ownChecklists")
                    if (!ownTask) add(button("Edit") { recordForm(kind, record) })
                    (if (ownTask) listOf("COMPLETED") else if (kind in listOf("expenses", "purchases") && role !in listOf("OWNER", "ACCOUNTANT")) emptyList() else listOf("APPROVED", "COMPLETED", "CANCELLED")).forEach { state ->
                        if (record.text("state") != state)
                            add(
                                button(label(state)) {
                                    form(
                                        label(state),
                                        listOf(Field("reason", "Reason")),
                                        label(state),
                                    ) { v, d ->
                                        mutate(
                                            "recordDecision",
                                            obj(
                                                "version" to record.optInt("version"),
                                                "state" to state,
                                                "reason" to v["reason"],
                                            ),
                                            id = record.text("id"),
                                            kind = kind,
                                            after = {
                                                d.dismiss()
                                                render()
                                            },
                                        )
                                    }
                                }
                            )
                    }
                }
            }
        },
    )
}

private fun MainActivity.recordForm(kind: String, record: JSONObject? = null) {
    val data = record?.optJSONObject("data") ?: JSONObject()
    fun field(
        key: String,
        title: String,
        value: String = "",
        type: Int = InputType.TYPE_CLASS_TEXT,
        required: Boolean = true,
    ) = Field(key, title, data.text(key).ifEmpty { value }, type, required = required)
    val fields = mutableListOf(Field("title", "Title", record?.text("title").orEmpty()))
    when (kind) {
        "reservations" ->
            fields.addAll(
                listOf(
                    field("guest", "Guest"),
                    field("phone", "Phone", type = InputType.TYPE_CLASS_PHONE),
                    field("guests", "Guests", "2", NUMBER),
                    Field(
                        "tableId",
                        "Table",
                        data.text("tableId"),
                        options =
                            workspace.rows("tables").map { it.text("id") to it.text("label") },
                    ),
                    field(
                        "at",
                        "Date & time (YYYY-MM-DDTHH:mm)",
                        java.time.LocalDateTime.now()
                            .plusHours(1)
                            .withSecond(0)
                            .withNano(0)
                            .toString(),
                    ),
                    field("durationMinutes", "Duration (minutes)", "90", NUMBER),
                    field("note", "Note", required = false),
                )
            )
        "vendors" ->
            fields.addAll(
                listOf(
                    field("contact", "Contact"),
                    field("phone", "Phone", required = false),
                    field("email", "Email", required = false),
                    field("address", "Address", required = false),
                    field("gstin", "GSTIN", required = false),
                    field("category", "Category", required = false),
                    field("description", "Description", required = false),
                    field("permitReference", "Excise permit reference", required = false),
                )
            )
        "purchases" -> {
            read(
                { api.request("/api/records/vendors?outlet=$outlet") },
                { vendors -> purchaseForm(record, vendors.rows("items")) },
            )
            return
        }
        "expenses" ->
            fields.addAll(
                listOf(
                    Field(
                        "category",
                        "Category",
                        data.text("category"),
                        options =
                            listOf("Rent", "Utilities", "Maintenance", "Supplies", "Other").map {
                                it to it
                            },
                    ),
                    field(
                        "amount",
                        "Amount ₹",
                        ((data.optLong("amount")) / 100.0).toString(),
                        DECIMAL,
                    ),
                    field("date", "Date", LocalDate.now().toString()),
                    field("reference", "Reference"),
                    field("note", "Note", required = false),
                )
            )
        "checklists" ->
            fields.addAll(
                listOf(
                    field("due", "Due date", LocalDate.now().toString()),
                    Field(
                        "employeeId",
                        "Employee",
                        data.text("employeeId"),
                        options =
                            workspace.rows("assignmentEmployees").map {
                                it.text("id") to it.text("name")
                            },
                    ),
                    field("instructions", "Instructions"),
                )
            )
        "campaigns" ->
            fields.addAll(
                listOf(
                    Field(
                        "audience",
                        "Audience",
                        data.text("audience"),
                        options =
                            listOf("All opted-in", "New", "Returning", "At risk").map { it to it },
                    ),
                    field("message", "Message"),
                )
            )
        "brands" ->
            fields.addAll(
                listOf(
                    field("description", "Description", required = false),
                    Field(
                        "active",
                        "Status",
                        data.optBoolean("active", true).toString(),
                        options = listOf("true" to "Active", "false" to "Inactive"),
                    ),
                )
            )
    }
    form(if (record == null) "New ${NativeRoute.title(kind)}" else "Edit record", fields) { v, d ->
        val values = JSONObject()
        v.filterKeys { it != "title" }
            .forEach { (key, value) ->
                values.put(
                    key,
                    when (key) {
                        "guests",
                        "durationMinutes" -> value.toIntOrNull() ?: 0
                        "amount" -> runCatching { rupees(value) }.getOrDefault(-1)
                        "active" -> value == "true"
                        "at" ->
                            runCatching {
                                    java.time.LocalDateTime.parse(value)
                                        .atZone(java.time.ZoneId.of("Asia/Kolkata"))
                                        .toInstant()
                                        .toString()
                                }
                                .getOrDefault(value)
                        else -> value
                    },
                )
            }
        mutate(
            "record",
            obj(
                "outletId" to outlet,
                "id" to record?.text("id"),
                "version" to record?.optInt("version"),
                "title" to v["title"],
                "stream" to (record?.text("production_stream")?.ifEmpty { null } ?: if (BuildConfig.APPLICATION == "BAR") "BAR" else "FOOD"),
                "data" to values,
            ),
            kind = kind,
            after = {
                d.dismiss()
                render()
            },
        )
    }
}

private fun MainActivity.purchaseForm(record: JSONObject?, vendors: List<JSONObject>) {
    if (vendors.isEmpty()) {
        showError(IllegalStateException("Add a vendor first."))
        return
    }
    val data = record?.optJSONObject("data") ?: JSONObject()
    form(
        "Purchase",
        listOf(
            Field("title", "Title", record?.text("title").orEmpty()),
            Field(
                "vendorId",
                "Vendor",
                data.text("vendorId"),
                options = vendors.map { it.text("id") to it.text("title") },
            ),
            Field("reference", "Reference", data.text("reference")),
            Field("amount", "Amount ₹", (data.optLong("amount") / 100.0).toString(), DECIMAL),
            Field("note", "Note", data.text("note"), required = false),
        ),
    ) { v, d ->
        val amount = runCatching { rupees(v.getValue("amount")) }.getOrNull()
        if (amount == null) {
            showError(IllegalArgumentException("Enter a valid amount."))
            return@form
        }
        mutate(
            "record",
            obj(
                "outletId" to outlet,
                "id" to record?.text("id"),
                "version" to record?.optInt("version"),
                "title" to v["title"],
                "data" to
                    obj(
                        "vendorId" to v["vendorId"],
                        "reference" to v["reference"],
                        "amount" to amount,
                        "note" to v["note"],
                    ),
            ),
            kind = "purchases",
            after = {
                d.dismiss()
                render()
            },
        )
    }
}
