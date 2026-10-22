package com.dinerdost.app.data

import com.dinerdost.app.BuildConfig
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

class ApiException(val status: Int, val code: String, message: String) : Exception(message)

/** JSON transport only: no HTML, browser cookies, JavaScript bridge or browser navigation. */
class ApiClient(private val sessions: SessionStore) {
    fun hasSession() = sessions.get() != null

    fun clearSession() = sessions.clear()

    fun request(path: String, data: JSONObject? = null, requestKey: String? = null): JSONObject {
        require(path.startsWith("/api/") && !path.contains("..") && !path.contains("\\"))
        val resource = path.removePrefix("/api/").substringBefore('/').substringBefore('?')
        val versioned = BuildConfig.APPLICATION != "MASTER" && resource in listOf("workspace", "commands", "auth", "invites", "orders", "invoices", "records", "tables", "notifications", "reports", "prep", "push")
        val apiPath = if (versioned) "/v2/" + path.removePrefix("/api/") else path
        val connection =
            URI(BuildConfig.APP_ORIGIN + apiPath).toURL().openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15000
            connection.readTimeout = 25000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-store")
            sessions.get()?.let { connection.setRequestProperty("Cookie", it) }
            if (data != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Origin", BuildConfig.APP_ORIGIN)
                connection.setRequestProperty("Content-Type", "application/json")
                requestKey?.let { connection.setRequestProperty("Idempotency-Key", it) }
                connection.outputStream.use {
                    it.write(data.toString().toByteArray(Charsets.UTF_8))
                }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bytes =
                stream?.use { source ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (output.size() <= 4_000_000) {
                        val count = source.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                } ?: byteArrayOf()
            if (bytes.size > 4_000_000)
                throw ApiException(
                    502,
                    "RESPONSE_TOO_LARGE",
                    "The response is too large. Try a smaller view.",
                )
            val response = runCatching {
                val value = String(bytes, Charsets.UTF_8)
                if (value.trimStart().startsWith("[")) JSONObject().put("items", JSONArray(value))
                else JSONObject(value)
            }
                .getOrElse {
                    throw ApiException(
                        status,
                        "UNAVAILABLE",
                        "Could not reach Diner Dost. Check your connection and try again.",
                    )
                }
            if (status !in 200..299) {
                if (status == 401) sessions.clear()
                val issue = response.optJSONObject("error") ?: response
                throw ApiException(
                    status,
                    issue.optString("code"),
                    issue.optString("message", "Request failed."),
                )
            }
            connection.headerFields.entries
                .filter { it.key.equals("Set-Cookie", true) }
                .flatMap { it.value }
                .forEach { header ->
                    val cookie = header.substringBefore(';')
                    if (cookie.startsWith("dd_session=")) {
                        if (cookie == "dd_session=") sessions.clear() else sessions.set(cookie)
                    }
                }
            return response
        } finally {
            connection.disconnect()
        }
    }

    fun command(
        action: String,
        input: JSONObject = JSONObject(),
        id: String? = null,
        orderId: String? = null,
        roundId: String? = null,
        kind: String? = null,
        key: String = UUID.randomUUID().toString(),
    ): JSONObject {
        val body = obj("action" to action, "input" to input)
        id?.let { body.put("id", it) }
        orderId?.let { body.put("orderId", it) }
        roundId?.let { body.put("roundId", it) }
        kind?.let { body.put("kind", it) }
        return request("/api/commands", body, key)
    }
}

fun obj(vararg pairs: Pair<String, Any?>) =
    JSONObject().apply { pairs.forEach { (key, value) -> if (value != null) put(key, value) } }

fun JSONObject.rows(key: String): List<JSONObject> = optJSONArray(key)?.objects() ?: emptyList()

fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }

fun JSONObject.text(key: String): String = if (isNull(key)) "" else optString(key)
