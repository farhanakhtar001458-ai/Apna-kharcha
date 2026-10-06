package com.apnahisab.app.domain.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MoneyTest {
    @Test
    fun parsesRupeesAsIntegerPaise() {
        assertEquals(40_000L, parseMoneyToMinorUnits("400"))
        assertEquals(12_345L, parseMoneyToMinorUnits("123.45"))
        assertEquals(0L, parseMoneyToMinorUnits("0", allowZero = true))
    }

    @Test
    fun rejectsInvalidOrOverPrecisionAmounts() {
        assertNull(parseMoneyToMinorUnits(""))
        assertNull(parseMoneyToMinorUnits("10.001"))
        assertNull(parseMoneyToMinorUnits("-10"))
        assertNull(parseMoneyToMinorUnits("0"))
    }

    @Test
    fun dividesIntegerPaiseWithoutLosingRemainders() {
        assertEquals(
            mapOf("a" to 10_000L, "b" to 10_000L, "c" to 10_000L, "d" to 10_000L),
            shareAmounts(40_000L, listOf("d", "b", "c", "a")),
        )
        assertEquals(
            mapOf("a" to 34L, "b" to 33L, "c" to 33L),
            shareAmounts(100L, listOf("c", "b", "a")),
        )
    }
}
