package com.dinerdost.app.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import java.text.NumberFormat
import java.util.Locale

object Palette {
    val green = Color.rgb(40, 91, 69)
    val dark = Color.rgb(25, 63, 48)
    val background = Color.rgb(247, 248, 244)
    val border = Color.rgb(202, 214, 199)
    val muted = Color.rgb(102, 120, 110)
    val ink = Color.rgb(35, 52, 43)
    val soft = Color.rgb(234, 241, 230)
}

fun Context.dp(value: Int) = (value * resources.displayMetrics.density).toInt()

fun Context.surface(color: Int = Color.WHITE, stroke: Int = Palette.border, radius: Int = 16) =
    GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
        setStroke(dp(1), stroke)
    }

fun Context.column(padding: Int = 16) =
    LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(padding), dp(padding), dp(padding), dp(padding))
    }

fun Context.row() =
    LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }

fun Context.text(
    value: String,
    size: Float = 16f,
    bold: Boolean = false,
    color: Int = Palette.ink,
) =
    TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        if (bold) typeface = Typeface.create("sans-serif", Typeface.BOLD)
        setPadding(0, dp(5), 0, dp(5))
    }

fun Context.button(label: String, primary: Boolean = false, onClick: () -> Unit) =
    Button(this).apply {
        text = label
        textSize = 16f
        isAllCaps = false
        minHeight = dp(52)
        setTextColor(if (primary) Color.WHITE else Palette.green)
        background = surface(if (primary) Palette.green else Color.WHITE)
        setPadding(dp(16), dp(8), dp(16), dp(8))
        setOnClickListener { onClick() }
        contentDescription = label
        layoutParams =
            LinearLayout.LayoutParams(-1, -2).apply {
                topMargin = dp(8)
                bottomMargin = dp(4)
            }
    }

fun LinearLayout.add(view: View, weight: Float = 0f) {
    addView(
        view,
        if (weight > 0) LinearLayout.LayoutParams(0, -2, weight)
        else view.layoutParams ?: LinearLayout.LayoutParams(-1, -2),
    )
}

fun LinearLayout.card(block: LinearLayout.() -> Unit): LinearLayout {
    val card =
        context.column().apply {
            background = context.surface()
            elevation = context.dp(1).toFloat()
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = context.dp(14) }
        }
    card.block()
    addView(card)
    return card
}

fun LinearLayout.empty(message: String = "Nothing here yet") {
    add(context.text(message, 17f, color = Palette.muted))
}

fun money(paise: Long) =
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).format(paise / 100.0)

fun label(value: String) =
    value.lowercase(Locale.ROOT).replace('_', ' ').replaceFirstChar { it.titlecase(Locale.ROOT) }

fun nativeDate(value: String): String = runCatching {
    java.time.format.DateTimeFormatter.ofPattern("d MMM, h:mm a", Locale.forLanguageTag("en-IN"))
        .withZone(java.time.ZoneId.of("Asia/Kolkata"))
        .format(java.time.Instant.parse(value))
}
    .getOrDefault(value.take(16))

data class Field(
    val key: String,
    val label: String,
    val value: String = "",
    val type: Int = InputType.TYPE_CLASS_TEXT,
    val options: List<Pair<String, String>> = emptyList(),
    val required: Boolean = true,
)

fun Activity.form(
    title: String,
    fields: List<Field>,
    submit: String = "Save",
    onSubmit: (Map<String, String>, AlertDialog) -> Unit,
) {
    val body = column(20)
    val inputs = linkedMapOf<String, View>()
    fields.forEach { field ->
        body.add(text(field.label, 14f, true, Palette.muted))
        val input: View =
            if (field.options.isNotEmpty())
                Spinner(this).apply {
                    adapter =
                        ArrayAdapter(
                            this@form,
                            android.R.layout.simple_spinner_dropdown_item,
                            field.options.map { it.second },
                        )
                    setSelection(
                        field.options.indexOfFirst { it.first == field.value }.coerceAtLeast(0)
                    )
                    minimumHeight = dp(52)
                    contentDescription = field.label
                }
            else
                EditText(this).apply {
                    setText(field.value)
                    textSize = 17f
                    inputType = field.type
                    minHeight = dp(52)
                    background = surface()
                    setPadding(dp(12), dp(8), dp(12), dp(8))
                    contentDescription = field.label
                }
        body.add(input)
        inputs[field.key] = input
    }
    val scroll = ScrollView(this).apply { addView(body) }
    val dialog =
        AlertDialog.Builder(this)
            .setTitle(title)
            .setView(scroll)
            .setNegativeButton("Cancel", null)
            .setPositiveButton(submit, null)
            .create()
    dialog.setOnShowListener {
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).isAllCaps = false
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).isAllCaps = false
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val values = fields.associate { field ->
                val view = inputs.getValue(field.key)
                field.key to
                    if (view is Spinner) field.options[view.selectedItemPosition].first
                    else (view as EditText).text.toString().trim()
            }
            val missing = fields.firstOrNull { it.required && values[it.key].isNullOrBlank() }
            if (missing != null) {
                (inputs[missing.key] as? EditText)?.error = "Required"
                return@setOnClickListener
            }
            try {
                onSubmit(values, dialog)
            } catch (error: IllegalArgumentException) {
                Toast.makeText(
                        this,
                        error.message ?: "Check the entered values.",
                        Toast.LENGTH_LONG,
                    )
                    .show()
            } catch (_: ArithmeticException) {
                Toast.makeText(this, "Enter a value with the correct precision.", Toast.LENGTH_LONG)
                    .show()
            }
        }
    }
    dialog.show()
    dialog.window?.setLayout(
        (resources.displayMetrics.widthPixels * .94).toInt(),
        ViewGroup.LayoutParams.WRAP_CONTENT,
    )
}
