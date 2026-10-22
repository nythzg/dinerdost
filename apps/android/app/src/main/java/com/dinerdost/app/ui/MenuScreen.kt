package com.dinerdost.app.ui

import android.text.InputType
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import org.json.JSONArray
import org.json.JSONObject
import com.dinerdost.app.BuildConfig
import android.app.AlertDialog

private const val NUMBER = InputType.TYPE_CLASS_NUMBER
private const val DECIMAL = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL

fun MainActivity.menuScreen() {
    val editable = (role == "OWNER" && BuildConfig.APPLICATION == "MASTER") || (BuildConfig.APPLICATION == "BAR" && role in listOf("OWNER", "MANAGER", "BARTENDER"))
    if (editable) body.add(button("Add menu item", true) { menuForm(null) })
    workspace.rows("menu").forEach { item ->
        body.card {
            add(text(item.text("name"), 20f, true))
            add(
                text(
                    "${item.text("category")} · ${money(item.optLong("price"))}",
                    16f,
                    true,
                    Palette.green,
                )
            )
            add(
                text(
                    "${item.text("station")} · ${if(item.optBoolean("active"))"Available" else "Unavailable"}",
                    14f,
                    color = Palette.muted,
                )
            )
            if (editable) {
                add(button("Edit item") { menuForm(item) })
                add(button("Recipe") { recipeForm(item) })
            } else {
                add(button("View recipe") {
                    val recipe = workspace.rows("recipes").filter { it.text("item_id") == item.text("id") }
                    AlertDialog.Builder(this@menuScreen).setTitle(item.text("name"))
                        .setMessage(if (recipe.isEmpty()) "No recipe configured." else recipe.joinToString("\n") { "${it.text("ingredient_name")} · ${it.optDouble("quantity_milli") / 1000}" })
                        .setPositiveButton("OK", null).show()
                })
            }
        }
    }
}

private fun MainActivity.menuForm(item: JSONObject?) {
    val bar = BuildConfig.APPLICATION == "BAR"
    val outletTax = workspace.rows("outlets").firstOrNull { it.text("id") == outlet }?.optInt("tax_bps") ?: 0
    val fields = mutableListOf(
            Field("name", "Name", item?.text("name").orEmpty()),
            Field("category", "Category", item?.text("category").orEmpty()),
            Field("price", "Price ₹", ((item?.optLong("price") ?: 0) / 100.0).toString(), DECIMAL),
    )
    if (role == "OWNER") fields.add(Field("tax", "Tax %", ((item?.optInt("tax_bps") ?: outletTax) / 100.0).toString(), DECIMAL))
    fields.addAll(listOf(
        Field("unit", "Unit", item?.text("unit") ?: if (bar) "peg" else "portion", options = (if (bar) listOf("portion", "peg") else listOf("portion", "kg", "L", "peg")).map { it to it }),
        Field("station", "Station", item?.text("station") ?: if (bar) "Bar" else "Kitchen"),
        Field("description", "Description", item?.text("description").orEmpty(), required = false),
        Field("active", "Availability", (item?.optBoolean("active") ?: true).toString(), options = listOf("true" to "Available", "false" to "Unavailable")),
    ))
    if (bar || item?.text("unit") == "peg") fields.addAll(listOf(
        Field("pegMl", "Peg / bottle size (ml)", (item?.optInt("peg_ml") ?: 30).toString(), NUMBER),
        Field("liquorIngredientId", "Liquor stock", item?.text("liquor_ingredient_id").orEmpty(), options = listOf("" to "None — cocktail") + workspace.rows("ingredients").filter { it.text("category") == "LIQUOR" }.map { it.text("id") to it.text("name") }, required = false),
    ))
    form(
        if (item == null) "Add menu item" else "Edit menu item",
        fields,
    ) { v, d ->
        val price = runCatching { rupees(v.getValue("price")) }.getOrNull()
        val tax = if (role == "OWNER") runCatching { rupees(v.getValue("tax")) }.getOrNull() else (item?.optInt("tax_bps") ?: outletTax).toLong()
        if (price == null || tax == null) {
            showError(IllegalArgumentException("Enter a valid price and tax."))
            return@form
        }
        val input =
            obj(
                "id" to item?.text("id"),
                "version" to item?.optInt("version"),
                "outletId" to outlet,
                "name" to v["name"],
                "category" to v["category"],
                "price" to price,
                "taxBps" to tax,
                "unit" to v["unit"],
                "station" to v["station"],
                "description" to v["description"],
                "active" to (v["active"] == "true"),
                "stream" to if (bar) "BAR" else item?.text("production_stream")?.ifEmpty { null },
                "variants" to (item?.optJSONArray("variants") ?: JSONArray()),
                "modifiers" to (item?.optJSONArray("modifiers") ?: JSONArray()),
                "pegMl" to if (v["unit"] == "peg") (v["pegMl"]?.toIntOrNull() ?: item?.optInt("peg_ml")) else null,
                "liquorIngredientId" to if (v["unit"] == "peg") (v["liquorIngredientId"] ?: item?.text("liquor_ingredient_id"))?.ifEmpty { null } else null,
            )
        mutate(
            "menu",
            input,
            after = {
                d.dismiss()
                refresh()
            },
        )
    }
}

private fun MainActivity.recipeForm(item: JSONObject) {
    val ingredients = workspace.rows("ingredients")
    if (ingredients.isEmpty()) {
        showError(IllegalStateException("Add an ingredient in Inventory first."))
        return
    }
    val existing = workspace.rows("recipes").filter { it.text("item_id") == item.text("id") }
    val fields = ingredients.map { ingredient ->
        Field(
            ingredient.text("id"),
            "${ingredient.text("name")} (${ingredient.text("unit")})",
            ((existing
                    .firstOrNull { it.text("ingredient_id") == ingredient.text("id") }
                    ?.optLong("quantity_milli") ?: 0) / 1000.0)
                .toString(),
            DECIMAL,
        )
    }
    form("${item.text("name")} recipe", fields) { v, d ->
        val rows = JSONArray()
        v.forEach { (id, quantity) ->
            val amount =
                (quantity.toBigDecimalOrNull()?.multiply(java.math.BigDecimal(1000)))?.toInt() ?: 0
            if (amount > 0) rows.put(obj("id" to id, "quantityMilli" to amount))
        }
        mutate(
            "recipe",
            obj("itemId" to item.text("id"), "ingredients" to rows),
            after = {
                d.dismiss()
                refresh()
            },
        )
    }
}
