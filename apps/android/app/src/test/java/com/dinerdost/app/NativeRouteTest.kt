package com.dinerdost.app

import com.dinerdost.app.ui.NativeRoute
import org.junit.Assert.*
import org.junit.Test

class NativeRouteTest {
    @Test
    fun notificationTargetsStayInsideNativeRoutes() {
        assertEquals("tasks" to "", NativeRoute.fromPath("/app/tasks"))
        assertEquals("kitchen" to "", NativeRoute.fromPath("/app/kitchen"))
        assertEquals(
            "order" to "ac3c8576-987b-4580-b237-bff46e350ee2",
            NativeRoute.fromPath("/app/orders/ac3c8576-987b-4580-b237-bff46e350ee2"),
        )
        listOf(
                "https://example.com",
                "/app/../signin",
                "//example.com",
                "/app/kitchen?url=evil",
                "/app/unknown",
                "/app/orders/not-an-id",
            )
            .forEach { assertNull(NativeRoute.fromPath(it)) }
    }
}
