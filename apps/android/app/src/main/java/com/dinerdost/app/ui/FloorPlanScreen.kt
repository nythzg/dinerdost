package com.dinerdost.app.ui

import android.graphics.*
import android.text.InputType
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.widget.*
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

private val fixtureNames = linkedMapOf(
    "RECEPTION" to "Reception", "WASHROOM" to "Washroom", "ENTRY" to "Entry",
    "EXIT" to "Exit", "STAIRS" to "Staircase", "SMOKING_ROOM" to "Smoking room",
    "LIQUOR_ROOM" to "Liquor room", "WALL" to "Wall", "KITCHEN" to "Kitchen",
)

fun MainActivity.floorPlanScreen() {
    val floors = workspace.rows("tables").map { it.text("floor") }.distinct()
    if (floors.isEmpty()) { body.empty("No tables"); return }
    val floor = entityId.takeIf { it in floors } ?: floors.first()
    body.add(button(floor) {
        form("Floor", listOf(Field("floor", "Floor", floor, options = floors.map { it to it }))) { v, d ->
            entityId = v.getValue("floor"); d.dismiss(); render()
        }
    })
    val tables = workspace.rows("tables").filter { it.text("floor") == floor }
    val saved = workspace.rows("floorPlans").firstOrNull { it.text("floor") == floor }
    val areaWidth = saved?.optInt("width", 1200) ?: 1200
    val areaHeight = saved?.optInt("height", 800) ?: 800
    val objects = (saved?.rows("objects") ?: emptyList()).map { JSONObject(it.toString()) }.toMutableList()
    tables.filter { table -> objects.none { it.text("tableId") == table.text("id") } }.forEachIndexed { index, table ->
        objects.add(obj("id" to table.text("id"), "kind" to "TABLE", "label" to table.text("label"),
            "tableId" to table.text("id"), "x" to 40 + (index % 6) * 190,
            "y" to 40 + (index / 6) * 140, "width" to 150, "height" to 100))
    }
    val selected = text("Select an object", 16f, true)
    val plan = FloorCanvas(this, objects, tables, areaWidth, areaHeight, { open("table", it) }) {
        selected.text = it?.text("label") ?: "Select an object"
    }
    objects.forEach { plan.fit(it) }
    val scroll = HorizontalScrollView(this).apply {
        addView(plan, android.view.ViewGroup.LayoutParams(dp(900), dp(900 * areaHeight / areaWidth)))
    }
    body.add(scroll)
    if (role !in listOf("OWNER", "MANAGER")) return
    body.add(Switch(this).apply {
        text = "Arrange floor"; minHeight = dp(52)
        setOnCheckedChangeListener { _, checked -> plan.editing = checked; plan.invalidate() }
    })
    body.add(selected)
    body.add(button("Resize area") {
        form("Floor area", listOf(
            Field("width", "Area width", plan.areaWidth.toString(), InputType.TYPE_CLASS_NUMBER),
            Field("height", "Area height", plan.areaHeight.toString(), InputType.TYPE_CLASS_NUMBER),
        )) { v, d ->
            val w = v.getValue("width").toInt(); val h = v.getValue("height").toInt()
            require(w in 400..5000 && h in 300..5000) { "Width 400–5000; height 300–5000." }
            plan.areaWidth = w; plan.areaHeight = h; objects.forEach { plan.fit(it) }
            plan.layoutParams.height = dp(900 * h / w); plan.requestLayout(); plan.invalidate(); d.dismiss()
        }
    })
    body.add(button("Add fixture") {
        requireObjectLimit(this, objects) {
            form("Floor fixture", listOf(
                Field("kind", "Fixture", options = fixtureNames.map { it.toPair() }),
                Field("label", "Label", required = false),
            )) { v, d ->
                val kind = v.getValue("kind"); val room = kind in listOf("SMOKING_ROOM", "LIQUOR_ROOM", "KITCHEN")
                val item = obj("id" to UUID.randomUUID().toString(), "kind" to kind,
                    "label" to (v["label"].takeUnless { it.isNullOrBlank() } ?: fixtureNames[kind]),
                    "x" to 40, "y" to 40, "width" to if (room || kind == "WALL") 300 else 180,
                    "height" to if (room) 180 else if (kind == "WALL") 20 else 80)
                plan.fit(item); objects.add(item); plan.select(item); d.dismiss()
            }
        }
    })
    body.add(button("Edit selected") {
        val item = plan.selected
        if (item == null) { Toast.makeText(this, "Select an object first.", Toast.LENGTH_SHORT).show(); return@button }
        val fields = mutableListOf<Field>()
        if (item.text("kind") != "TABLE") fields.add(Field("label", "Label", item.text("label")))
        listOf("x", "y", "width", "height").forEach {
            fields.add(Field(it, label(it), item.optInt(it).toString(), InputType.TYPE_CLASS_NUMBER))
        }
        form("Edit ${item.text("label")}", fields) { v, d ->
            if (v.containsKey("label")) { require(v.getValue("label").length <= 60); item.put("label", v["label"]) }
            listOf("x", "y", "width", "height").forEach { item.put(it, v.getValue(it).toInt()) }
            plan.fit(item); plan.select(item); d.dismiss()
        }
    })
    body.add(button("Copy selected") { plan.copy() })
    body.add(button("Paste") { plan.paste() })
    body.add(button("Remove selected") {
        val item = plan.selected ?: return@button
        if (item.text("kind") == "TABLE" && !item.has("copyOfTableId")) {
            Toast.makeText(this, "Existing tables are retained.", Toast.LENGTH_SHORT).show(); return@button
        }
        objects.remove(item); plan.select(null)
    })
    body.add(button("Save floor plan", true) {
        mutate("floorPlan", obj("outletId" to outlet, "floor" to floor,
            "version" to (saved?.optInt("version") ?: 0), "objects" to JSONArray(objects),
            "width" to plan.areaWidth, "height" to plan.areaHeight))
    })
    body.add(button("Cancel changes") { render() })
}

private fun requireObjectLimit(host: MainActivity, objects: List<JSONObject>, block: () -> Unit) {
    if (objects.size >= 250) Toast.makeText(host, "Maximum 250 floor objects.", Toast.LENGTH_SHORT).show() else block()
}

private class FloorCanvas(
    private val host: MainActivity, private val objects: MutableList<JSONObject>,
    private val tables: List<JSONObject>, var areaWidth: Int, var areaHeight: Int,
    private val open: (String) -> Unit, private val selectionChanged: (JSONObject?) -> Unit,
) : View(host) {
    var editing = false
    var selected: JSONObject? = null
        private set
    private var clipboard: JSONObject? = null
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var picked: JSONObject? = null
    private var startX = 0f; private var startY = 0f; private var offsetX = 0f; private var offsetY = 0f
    init {
        contentDescription = "Restaurant floor plan"; isClickable = true; isFocusableInTouchMode = true
        setOnKeyListener { _, key, event ->
            if (!editing || !event.isCtrlPressed || event.action != KeyEvent.ACTION_DOWN) false
            else when (key) { KeyEvent.KEYCODE_C -> { copy(); true }; KeyEvent.KEYCODE_V -> { paste(); true }; else -> false }
        }
    }
    fun select(item: JSONObject?) { selected = item; selectionChanged(item); invalidate() }
    fun fit(item: JSONObject) {
        val wall = item.text("kind") == "WALL"
        val w = item.optInt("width").coerceIn(if (wall) 10 else 60, minOf(2000, areaWidth))
        val h = item.optInt("height").coerceIn(if (wall) 10 else 50, minOf(2000, areaHeight))
        item.put("width", w); item.put("height", h)
        item.put("x", item.optInt("x").coerceIn(0, areaWidth - w))
        item.put("y", item.optInt("y").coerceIn(0, areaHeight - h))
    }
    fun copy() {
        selected?.let { clipboard = JSONObject(it.toString()); Toast.makeText(host, "Copied.", Toast.LENGTH_SHORT).show() }
    }
    fun paste() {
        val source = clipboard ?: return
        requireObjectLimit(host, objects) {
            val item = JSONObject(source.toString()).put("id", UUID.randomUUID().toString())
            if (item.text("kind") == "TABLE") {
                if (host.role != "OWNER") { Toast.makeText(host, "Only the owner can create copied tables.", Toast.LENGTH_SHORT).show(); return@requireObjectLimit }
                val sourceId = item.text("copyOfTableId").ifEmpty { item.text("tableId") }
                if (tables.none { it.text("id") == sourceId }) return@requireObjectLimit
                item.remove("tableId"); item.put("copyOfTableId", sourceId)
                val used = host.workspace.rows("tables").map { it.text("label") } + objects.map { it.text("label") }
                var index = 1; var name: String
                do { val suffix = " copy" + if (index == 1) "" else " $index"; name = source.text("label").take(30 - suffix.length) + suffix; index++ } while (name in used)
                item.put("label", name)
            }
            item.put("x", item.optInt("x") + 30); item.put("y", item.optInt("y") + 30); fit(item)
            objects.add(item); select(item); clipboard = JSONObject(item.toString())
        }
    }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas); canvas.drawColor(Palette.soft); canvas.save()
        canvas.scale(width / areaWidth.toFloat(), height / areaHeight.toFloat())
        objects.sortedBy { if (it.text("kind") == "TABLE") 1 else 0 }.forEach { item ->
            val x = item.optInt("x").toFloat(); val y = item.optInt("y").toFloat()
            val w = item.optInt("width").toFloat(); val h = item.optInt("height").toFloat()
            val wall = item.text("kind") == "WALL"
            val occupied = tables.firstOrNull { it.text("id") == item.text("tableId") }?.optBoolean("is_occupied") == true
            paint.style = Paint.Style.FILL; paint.color = if (wall || occupied) Palette.dark else Color.WHITE
            canvas.drawRoundRect(x, y, x + w, y + h, if (wall) 2f else 12f, if (wall) 2f else 12f, paint)
            paint.style = Paint.Style.STROKE; paint.strokeWidth = if (selected == item) 5f else 2f
            paint.color = if (selected == item) Palette.green else Palette.border
            canvas.drawRoundRect(x, y, x + w, y + h, 8f, 8f, paint)
            if (!wall) {
                paint.style = Paint.Style.FILL; paint.color = if (occupied) Color.WHITE else Palette.ink
                paint.textSize = 22f; paint.typeface = Typeface.DEFAULT_BOLD
                canvas.save(); canvas.clipRect(x + 6, y, x + w - 6, y + h)
                canvas.drawText(item.text("label").take(30), x + 12, y + h / 2 + 7, paint); canvas.restore()
            }
        }
        canvas.restore()
    }
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val x = event.x * areaWidth / width; val y = event.y * areaHeight / height
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                picked = objects.sortedBy { if (it.text("kind") == "TABLE") 1 else 0 }.lastOrNull { x >= it.optInt("x") && x <= it.optInt("x") + it.optInt("width") && y >= it.optInt("y") && y <= it.optInt("y") + it.optInt("height") }
                if (picked == null) return false
                requestFocus(); if (editing) select(picked)
                startX = x; startY = y; offsetX = x - picked!!.optInt("x"); offsetY = y - picked!!.optInt("y")
                if (editing) parent.requestDisallowInterceptTouchEvent(true)
                return true
            }
            MotionEvent.ACTION_MOVE -> if (editing) {
                picked?.let { it.put("x", ((x - offsetX) / 10).toInt() * 10); it.put("y", ((y - offsetY) / 10).toInt() * 10); fit(it); invalidate() }; return true
            }
            MotionEvent.ACTION_UP -> {
                if (!editing && kotlin.math.abs(startX - x) < 12 && kotlin.math.abs(startY - y) < 12) {
                    performClick(); picked?.text("tableId")?.takeIf { it.isNotEmpty() }?.let(open)
                }
                picked = null; parent.requestDisallowInterceptTouchEvent(false); return true
            }
            MotionEvent.ACTION_CANCEL -> { picked = null; parent.requestDisallowInterceptTouchEvent(false); return true }
        }
        return true
    }
    override fun performClick(): Boolean { super.performClick(); return true }
}
