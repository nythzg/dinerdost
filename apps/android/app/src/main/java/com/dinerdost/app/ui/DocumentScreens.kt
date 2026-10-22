package com.dinerdost.app.ui

import android.app.AlertDialog
import android.content.Context
import android.graphics.*
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.*
import android.print.pdf.PrintedPdfDocument
import android.widget.ImageView
import com.dinerdost.app.BuildConfig
import com.dinerdost.app.MainActivity
import com.dinerdost.app.data.*
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.io.FileOutputStream
import org.json.JSONObject

fun MainActivity.showTableQr(table: JSONObject) {
    val code =
        QRCodeWriter()
            .encode(
                "${BuildConfig.APP_ORIGIN}/q/${table.text("public_key")}",
                BarcodeFormat.QR_CODE,
                720,
                720,
            )
    val bitmap = Bitmap.createBitmap(720, 720, Bitmap.Config.ARGB_8888)
    for (y in 0 until 720) for (x in 0 until 720) bitmap.setPixel(
        x,
        y,
        if (code[x, y]) Color.BLACK else Color.WHITE,
    )
    val content = column()
    content.add(text(table.text("label"), 30f, true))
    content.add(
        ImageView(this).apply {
            setImageBitmap(bitmap)
            contentDescription = "Table QR for ${table.text("label")}"
            adjustViewBounds = true
        }
    )
    content.add(
        button("Print table QR", true) {
            printDocument(
                "Table ${table.text("label")}",
                listOf(
                    workspace.optJSONObject("restaurant")?.text("name").orEmpty(),
                    "Table ${table.text("label")}",
                    "Scan to request table activation",
                ),
                bitmap,
            )
        }
    )
    AlertDialog.Builder(this).setView(content).setNegativeButton("Close", null).show()
}

fun MainActivity.invoiceScreen() {
    val invoice = detail
    val snapshot = invoice.optJSONObject("snapshot") ?: JSONObject()
    val lines = mutableListOf<String>()
    lines.add(snapshot.optJSONObject("restaurant")?.text("name").orEmpty())
    lines.add(invoice.text("number"))
    lines.add(label(invoice.text("document_type")))
    snapshot.optJSONObject("outlet")?.let {
        lines.add(it.text("name"))
        if (it.text("address").isNotEmpty()) lines.add(it.text("address"))
        if (it.text("gstin").isNotEmpty()) lines.add("GSTIN · ${it.text("gstin")}")
    }
    snapshot.optJSONObject("customer")?.let {
        lines.add(it.text("name"))
        lines.add(it.text("phone"))
    }
    snapshot.rows("items").forEach { item ->
        lines.add(
            "${item.optDouble("quantity_milli")/1000} × ${item.text("name")}  ${money(item.optLong("unit_price"))}"
        )
    }
    snapshot.rows("charges").forEach {
        lines.add("${it.text("name")} · ${money(it.optLong("amount"))}")
    }
    snapshot.optJSONObject("totals")?.let { totals ->
        listOf("subtotal", "discount", "tax", "charges", "payable", "paid", "outstanding").forEach {
            lines.add("${label(it)} · ${money(totals.optLong(it))}")
        }
    }
    body.card {
        lines
            .filter { it.isNotEmpty() }
            .forEachIndexed { index, line ->
                add(text(line, if (index == 0) 24f else 16f, index < 2))
            }
    }
    body.add(
        button("Print / Save PDF", true) {
            mutate(
                "recordPrint",
                orderId = invoice.text("order_id"),
                after = { printDocument(invoice.text("number"), lines) },
            )
        }
    )
    if (snapshot.has("orderNumber") && NativeRoute.allowed(workspace, "order"))
        body.add(button("Back to order") { open("order", invoice.text("order_id")) })
}

fun MainActivity.printDocument(name: String, lines: List<String>, image: Bitmap? = null) {
    getSystemService(PrintManager::class.java)
        .print(
            name,
            NativeDocument(this, name, lines, image),
            PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                .build(),
        )
}

private class NativeDocument(
    private val context: Context,
    private val name: String,
    private val lines: List<String>,
    private val image: Bitmap?,
) : PrintDocumentAdapter() {
    private var attributes: PrintAttributes? = null

    override fun onLayout(
        oldAttributes: PrintAttributes?,
        newAttributes: PrintAttributes,
        cancellationSignal: CancellationSignal,
        callback: LayoutResultCallback,
        extras: Bundle?,
    ) {
        attributes = newAttributes
        if (cancellationSignal.isCanceled) {
            callback.onLayoutCancelled()
            return
        }
        callback.onLayoutFinished(
            PrintDocumentInfo.Builder("$name.pdf")
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                .build(),
            oldAttributes != newAttributes,
        )
    }

    override fun onWrite(
        pages: Array<out PageRange>,
        destination: ParcelFileDescriptor,
        cancellationSignal: CancellationSignal,
        callback: WriteResultCallback,
    ) {
        val document = PrintedPdfDocument(context, attributes!!)
        try {
            val chunks =
                lines
                    .flatMap { it.chunked(72) }
                    .chunked(if (image != null) 14 else 35)
                    .ifEmpty { listOf(emptyList()) }
            val printed = mutableListOf<PageRange>()
            chunks.forEachIndexed { index, chunk ->
                if (cancellationSignal.isCanceled) {
                    callback.onWriteCancelled()
                    return
                }
                if (pages.none { index in it.start..it.end }) return@forEachIndexed
                val page = document.startPage(index)
                val canvas = page.canvas
                val paint =
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Palette.ink
                        textSize = 13f
                    }
                chunk.forEachIndexed { line, text ->
                    canvas.drawText(text, 40f, 55f + line * 21f, paint)
                }
                if (index == 0 && image != null)
                    canvas.drawBitmap(image, null, Rect(65, 360, 465, 760), paint)
                document.finishPage(page)
                printed.add(PageRange(index, index))
            }
            FileOutputStream(destination.fileDescriptor).use { document.writeTo(it) }
            callback.onWriteFinished(printed.toTypedArray())
        } catch (error: Exception) {
            callback.onWriteFailed(error.message)
        } finally {
            document.close()
        }
    }
}
