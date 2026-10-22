package com.dinerdost.app.ui

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.text.InputType
import com.dinerdost.app.BuildConfig
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import org.json.JSONArray

private const val NUMBER = InputType.TYPE_CLASS_NUMBER
private const val DECIMAL = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
private val roles =
    listOf(
        "CASHIER" to "Cashier",
        "WAITER" to "Waiter",
        "KITCHEN" to "Chef",
        "BARTENDER" to "Bartender",
        "MANAGER" to "Manager",
        "ACCOUNTANT" to "Accountant",
    )

fun MainActivity.teamScreen() {
    if (role != "OWNER") {
        body.empty("Owner access required")
        return
    }
    body.add(
        button("Invite staff", true) {
            form(
                "Invite staff",
                listOf(
                    Field("name", "Name"),
                    Field(
                        "email",
                        "Email",
                        type =
                            InputType.TYPE_CLASS_TEXT or
                                InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
                    ),
                    Field("role", "Role", options = roles),
                ),
            ) { v, d ->
                pickOutlets(listOf(outlet)) { outlets ->
                    mutate(
                        "staffInvite",
                        obj(
                            "name" to v["name"],
                            "email" to v["email"],
                            "role" to v["role"],
                            "outletIds" to JSONArray(outlets),
                        ),
                        after = { result ->
                            d.dismiss()
                            val link = "${BuildConfig.APP_ORIGIN}/invite/${result.text("token")}"
                            getSystemService(ClipboardManager::class.java)
                                .setPrimaryClip(ClipData.newPlainText("Staff invitation", link))
                            AlertDialog.Builder(this)
                                .setTitle("Invitation copied")
                                .setMessage(
                                    "Share this invitation with your staff member. Expires in 7 days."
                                )
                                .setPositiveButton("OK", null)
                                .show()
                            refresh()
                        },
                    )
                }
            }
        }
    )
    workspace.rows("employees").forEach { employee ->
        body.card {
            add(text(employee.text("name"), 21f, true))
            add(
                text(
                    money(employee.optLong("base_salary")) + " / month",
                    16f,
                    color = Palette.green,
                )
            )
            add(
                button("Edit member") {
                    form(
                        "Edit member",
                        listOf(
                            Field("name", "Full name", employee.text("name")),
                            Field(
                                "salary",
                                "Monthly salary ₹",
                                (employee.optLong("base_salary") / 100.0).toString(),
                                DECIMAL,
                            ),
                        ),
                    ) { values, dialog ->
                        val salary = runCatching { rupees(values.getValue("salary")) }.getOrNull()
                        if (salary == null || salary < 0) {
                            showError(IllegalArgumentException("Enter a valid monthly salary."))
                            return@form
                        }
                        mutate(
                            "employeeProfile",
                            obj(
                                "version" to employee.optInt("version"),
                                "name" to values["name"],
                                "salary" to salary,
                            ),
                            id = employee.text("id"),
                            after = {
                                dialog.dismiss()
                                refresh()
                            },
                        )
                    }
                }
            )
            add(
                text(
                    "${if(employee.text("role")=="KITCHEN")"Chef" else label(employee.text("role"))} · ${if(employee.optBoolean("active"))"Active" else "Disabled"}",
                    15f,
                    color = Palette.muted,
                )
            )
            if (employee.text("role") != "OWNER")
                add(
                    button("Edit access") {
                        form(
                            "Staff access",
                            listOf(
                                Field("role", "Role", employee.text("role"), options = roles),
                                Field(
                                    "active",
                                    "Account",
                                    employee.optBoolean("active").toString(),
                                    options = listOf("true" to "Active", "false" to "Disabled"),
                                ),
                                Field(
                                    "password",
                                    "Owner password",
                                    type =
                                        InputType.TYPE_CLASS_TEXT or
                                            InputType.TYPE_TEXT_VARIATION_PASSWORD,
                                ),
                            ),
                        ) { v, d ->
                            val selected =
                                employee.optJSONArray("outlet_ids")?.let { values ->
                                    (0 until values.length()).map { values.getString(it) }
                                } ?: emptyList()
                            pickOutlets(selected) { outlets ->
                                mutate(
                                    "employeeRole",
                                    obj(
                                        "version" to employee.optInt("version"),
                                        "role" to v["role"],
                                        "active" to (v["active"] == "true"),
                                        "password" to v["password"],
                                        "outletIds" to JSONArray(outlets),
                                    ),
                                    id = employee.text("id"),
                                    after = {
                                        d.dismiss()
                                        refresh()
                                    },
                                )
                            }
                        }
                    }
                )
        }
    }
    workspace.rows("staffInvitations").forEach { invite ->
        body.card {
            add(text(invite.text("name"), 18f, true))
            add(text(invite.text("email"), 14f, color = Palette.muted))
            add(text("Invitation pending", 14f))
            add(button("Revoke invite") { mutate("revokeStaffInvite", id = invite.text("id")) })
        }
    }
}

private fun MainActivity.pickOutlets(selected: List<String>, submit: (List<String>) -> Unit) {
    val outlets = workspace.rows("outlets")
    val checks = BooleanArray(outlets.size) { outlets[it].text("id") in selected }
    val dialog =
        AlertDialog.Builder(this)
            .setTitle("Outlet access")
            .setMultiChoiceItems(outlets.map { it.text("name") }.toTypedArray(), checks) {
                _,
                index,
                value ->
                checks[index] = value
            }
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Apply", null)
            .create()
    dialog.setOnShowListener {
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val ids = outlets.filterIndexed { index, _ -> checks[index] }.map { it.text("id") }
            if (ids.isEmpty()) showError(IllegalArgumentException("Choose at least one outlet."))
            else {
                dialog.dismiss()
                submit(ids)
            }
        }
    }
    dialog.show()
}
