package com.apnahisab.app.domain.util

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Locale

private val indiaLocale = Locale("en", "IN")

fun formatMoney(minorUnits: Long): String {
    val amount = BigDecimal.valueOf(minorUnits, 2).abs()
    val formatted = NumberFormat.getNumberInstance(indiaLocale).apply {
        minimumFractionDigits = 2
        maximumFractionDigits = 2
    }.format(amount)
    return if (minorUnits < 0) "−₹$formatted" else "₹$formatted"
}

fun formatRupeesInput(minorUnits: Long): String =
    BigDecimal.valueOf(minorUnits, 2).setScale(2, RoundingMode.UNNECESSARY).toPlainString()

/** Parses a rupee amount without ever routing money through floating point. */
fun parseMoneyToMinorUnits(raw: String, allowZero: Boolean = false): Long? {
    val cleaned = raw.trim().replace("₹", "").replace(",", "")
    if (cleaned.isEmpty() || !cleaned.matches(Regex("\\d{1,11}(\\.\\d{0,2})?"))) return null
    return runCatching {
        val minor = BigDecimal(cleaned)
            .movePointRight(2)
            .setScale(0, RoundingMode.UNNECESSARY)
            .longValueExact()
        if (minor > 9_000_000_000_000L || (!allowZero && minor <= 0L)) null else minor
    }.getOrNull()
}

fun shareAmounts(amountMinor: Long, memberIds: List<String>): Map<String, Long> {
    require(amountMinor > 0L && memberIds.isNotEmpty())
    val ordered = memberIds.distinct().sorted()
    require(ordered.size == memberIds.size)
    val base = amountMinor / ordered.size
    val remainder = amountMinor % ordered.size
    return ordered.mapIndexed { index, memberId ->
        memberId to (base + if (index < remainder) 1L else 0L)
    }.toMap()
}
