package com.dinerdost.app.ui

import android.app.AlertDialog
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*

fun MainActivity.managementScreen() {
    when (route) {
        "customers" ->
            workspace.rows("customers").let { customers ->
                if (customers.isEmpty()) body.empty("No customers")
                customers.forEach { c ->
                    body.card {
                        add(text(c.text("name"), 21f, true))
                        add(text(c.text("phone"), 15f, color = Palette.muted))
                        add(text("${c.optInt("visits")} visits · ${c.optLong("points")} points"))
                        add(text(money(c.optLong("spend")), 20f, true, Palette.green))
                    }
                }
            }
        "inventory" -> inventoryScreen()
        "attendance" -> attendanceScreen()
        "outlets" -> outletsScreen()
        "audit" -> {
            workspace.rows("audit").forEach { e ->
                body.card {
                    add(text(label(e.text("action")), 17f, true))
                    add(
                        text(
                            "${e.text("actor_name")} · ${e.text("occurred_at").take(16)}",
                            14f,
                            color = Palette.muted,
                        )
                    )
                    if (e.text("reason").isNotEmpty()) add(text(e.text("reason"), 14f))
                }
            }
            if (role == "OWNER")
                body.add(
                    button("Verify audit chain") {
                        mutate(
                            "verifyAudit",
                            after = {
                                AlertDialog.Builder(this)
                                    .setTitle(
                                        if (it.optBoolean("valid")) "Audit verified"
                                        else "Audit check failed"
                                    )
                                    .setMessage("${it.optInt("checked")} events checked")
                                    .setPositiveButton("OK", null)
                                    .show()
                            },
                        )
                    }
                )
        }
        "integrations" ->
            listOf(
                    "WhatsApp / SMS" to "Provider credentials and approved templates required.",
                    "Order token messages" to
                        "WhatsApp provider and approved order-token template required.",
                    "Fingerprint attendance" to "Fingerprint device model and vendor SDK required.",
                    "Swiggy / Zomato" to "Official partner order-feed API access required.",
                )
                .forEach { (name, required) ->
                    body.card {
                        add(text(name, 21f, true))
                        add(
                            button("Setup required") {
                                AlertDialog.Builder(this@managementScreen)
                                    .setTitle(name)
                                    .setMessage(required)
                                    .setPositiveButton("OK", null)
                                    .show()
                            }
                        )
                    }
                }
        else -> recordScreen(route)
    }
}
