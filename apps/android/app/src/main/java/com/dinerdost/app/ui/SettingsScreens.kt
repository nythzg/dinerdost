package com.dinerdost.app.ui

import android.text.InputType
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import java.time.LocalDate

private const val NUMBER = InputType.TYPE_CLASS_NUMBER
private const val DECIMAL = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL

fun MainActivity.attendanceScreen() {
    val own = workspace.optBoolean("ownAttendance")
    if (!own) body.add(
        button("Add shift") {
            form(
                "Shift",
                listOf(
                    Field("name", "Name"),
                    Field("start", "Start (HH:mm)", "09:00"),
                    Field("end", "End (HH:mm)", "18:00"),
                ),
            ) { v, d ->
                mutate(
                    "shift",
                    obj(
                        "outletId" to outlet,
                        "name" to v["name"],
                        "start" to v["start"],
                        "end" to v["end"],
                    ),
                    after = {
                        d.dismiss()
                        refresh()
                    },
                )
            }
        }
    )
    workspace.rows("shifts").forEach { shift ->
        body.card {
            add(text(shift.text("name"), 20f, true))
            add(text("${shift.text("starts_local")} – ${shift.text("ends_local")}", 15f))
            add(
                button("Mark attendance") {
                    form(
                        "Attendance",
                        listOf(
                            Field(
                                "employeeId",
                                "Employee",
                                options =
                                    workspace
                                        .rows("assignmentEmployees")
                                        .ifEmpty { workspace.rows("employees") }
                                        .map { it.text("id") to it.text("name") },
                            ),
                            Field(
                                "state",
                                "Action",
                                options =
                                    (if (own) listOf("CHECK_IN" to "Check in", "CHECK_OUT" to "Check out") else listOf(
                                        "CHECK_IN" to "Check in",
                                        "CHECK_OUT" to "Check out",
                                        "ABSENT" to "Absent",
                                        "LEAVE" to "Leave",
                                    )),
                            ),
                            Field("note", "Note", required = false),
                        ),
                    ) { v, d ->
                        mutate(
                            "attendance",
                            obj(
                                "outletId" to outlet,
                                "shiftId" to shift.text("id"),
                                "employeeId" to v["employeeId"],
                                "mode" to v["state"],
                                "date" to
                                    LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).toString(),
                                "version" to
                                    workspace
                                        .rows("attendance")
                                        .firstOrNull {
                                            it.text("employee_id") == v["employeeId"] &&
                                                it.text("shift_id") == shift.text("id") &&
                                                it.text("business_date")
                                                    .startsWith(
                                                        LocalDate.now(
                                                                java.time.ZoneId.of("Asia/Kolkata")
                                                            )
                                                            .toString()
                                                    )
                                        }
                                        ?.optInt("version"),
                                "note" to v["note"],
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
    workspace.rows("attendance").forEach { entry ->
        body.card {
            add(text(entry.text("employee_name"), 19f, true))
            add(
                text(
                    "${entry.text("business_date")} · ${label(entry.text("state"))}",
                    15f,
                    color = Palette.muted,
                )
            )
        }
    }
}

fun MainActivity.outletsScreen() {
    workspace.rows("outlets").forEach { entry ->
        body.card {
            add(text(entry.text("name"), 22f, true))
            add(
                text("${entry.text("code")} · ${entry.text("address")}", 14f, color = Palette.muted)
            )
            add(
                button("Edit outlet") {
                    form(
                        "Outlet",
                        listOf(
                            Field("name", "Name", entry.text("name")),
                            Field("code", "Code", entry.text("code")),
                            Field("address", "Address", entry.text("address"), required = false),
                            Field("gstin", "GSTIN", entry.text("gstin"), required = false),
                            Field(
                                "tax",
                                "Tax %",
                                (entry.optInt("tax_bps") / 100.0).toString(),
                                DECIMAL,
                            ),
                            Field(
                                "qr",
                                "Customer QR",
                                entry.optBoolean("qr_enabled").toString(),
                                options = listOf("true" to "Enabled", "false" to "Disabled"),
                            ),
                        ),
                    ) { v, d ->
                        mutate(
                            "outlet",
                            obj(
                                "id" to entry.text("id"),
                                "version" to entry.optInt("version"),
                                "name" to v["name"],
                                "code" to v["code"],
                                "address" to v["address"],
                                "gstin" to v["gstin"],
                                "taxBps" to
                                    runCatching { rupees(v.getValue("tax")) }.getOrDefault(-1),
                                "qrEnabled" to (v["qr"] == "true"),
                                "paymentPolicy" to entry.text("payment_policy"),
                                "earnBps" to entry.optInt("earn_bps"),
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
