package com.dinerdost.app.ui

import android.text.InputType
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import com.dinerdost.app.BuildConfig

private const val NUMBER = InputType.TYPE_CLASS_NUMBER
private const val DECIMAL = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL

fun MainActivity.inventoryScreen() {
    if (role in listOf("OWNER", "MANAGER", "KITCHEN", "BARTENDER"))
        body.add(
            button("Add ingredient", true) {
                form(
                    "Ingredient",
                    listOf(
                        Field("name", "Name"),
                        Field(
                            "unit",
                            "Unit",
                            "kg",
                            options = (if (BuildConfig.APPLICATION == "BAR") listOf("L") else listOf("kg", "L", "unit")).map { it to it },
                        ),
                        Field(
                            "category",
                            "Category",
                            "GENERAL",
                            options = when(BuildConfig.APPLICATION) { "BAR" -> listOf("LIQUOR" to "Liquor"); "KITCHEN" -> listOf("GENERAL" to "Food"); else -> listOf("GENERAL" to "General", "LIQUOR" to "Liquor") },
                        ),
                        Field("reorder", "Reorder quantity", "0", DECIMAL),
                    ),
                ) { v, d ->
                    mutate(
                        "ingredient",
                        obj(
                            "outletId" to outlet,
                            "name" to v["name"],
                            "unit" to v["unit"],
                            "category" to v["category"],
                            "reorderMilli" to
                                ((v["reorder"]?.toDoubleOrNull() ?: 0.0) * 1000).toInt(),
                        ),
                        after = {
                            d.dismiss()
                            refresh()
                        },
                    )
                }
            }
        )
    workspace.rows("ingredients").forEach { ingredient ->
        body.card {
            add(text(ingredient.text("name"), 21f, true))
            add(
                text(
                    "${ingredient.optDouble("on_hand")/1000} ${ingredient.text("unit")} · ${ingredient.optDouble("reserved")/1000} reserved",
                    15f,
                    color = Palette.muted,
                )
            )
            add(
                button("Receive stock") {
                    form(
                        "Receive stock",
                        listOf(
                            Field("batch", "Batch"),
                            Field("quantity", "Quantity", "1", DECIMAL),
                            Field("cost", "Cost per unit ₹", "0", DECIMAL),
                            Field("reference", "Receipt reference"),
                            Field("expires", "Expiry date", required = false),
                        ),
                    ) { v, d ->
                        mutate(
                            "receipt",
                            obj(
                                "ingredientId" to ingredient.text("id"),
                                "batchNumber" to v["batch"],
                                "quantityMilli" to
                                    ((v["quantity"]?.toDoubleOrNull() ?: 0.0) * 1000).toInt(),
                                "unitCost" to
                                    runCatching { rupees(v.getValue("cost")) }.getOrDefault(-1),
                                "reference" to v["reference"],
                                "expiresOn" to v["expires"]?.ifEmpty { null },
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
