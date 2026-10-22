package com.dinerdost.app.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View

class BellView(context: Context, private val open: () -> Unit) : View(context) {
    var unread: Int = 0
        set(value) {
            field = value
            contentDescription = "Notifications, $value unread"
            invalidate()
        }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bellPath =
        Path().apply {
            moveTo(14f, 31f)
            lineTo(17f, 27f)
            lineTo(17f, 20f)
            cubicTo(17f, 10f, 31f, 10f, 31f, 20f)
            lineTo(31f, 27f)
            lineTo(34f, 31f)
            close()
        }

    init {
        isClickable = true
        isFocusable = true
        contentDescription = "Notifications"
        setOnClickListener { open() }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val unit = width / 48f
        canvas.save()
        canvas.scale(unit, unit)
        paint.color = Palette.green
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 2.2f
        canvas.drawPath(bellPath, paint)
        canvas.drawArc(21f, 30f, 27f, 37f, 0f, 180f, false, paint)
        if (unread > 0) {
            paint.style = Paint.Style.FILL
            paint.color = 0xffbb473d.toInt()
            canvas.drawCircle(35f, 12f, 10f, paint)
            paint.color = android.graphics.Color.WHITE
            paint.textSize = 10f
            paint.textAlign = Paint.Align.CENTER
            canvas.drawText(if (unread > 99) "99+" else unread.toString(), 35f, 15f, paint)
        }
        canvas.restore()
    }
}
