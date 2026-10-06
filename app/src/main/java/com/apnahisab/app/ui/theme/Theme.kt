package com.apnahisab.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val ApnaDarkColors = darkColorScheme(
    primary = AccentBlue,
    onPrimary = Ink,
    secondary = SoftBlue,
    onSecondary = Ink,
    background = Ink,
    onBackground = TextPrimary,
    surface = SurfaceBlue,
    onSurface = TextPrimary,
    surfaceVariant = CardBlue,
    onSurfaceVariant = TextSecondary,
    outline = DividerBlue,
    error = ErrorRose,
)

@Composable
fun ApnaHisabTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ApnaDarkColors,
        typography = MaterialTheme.typography,
        content = content,
    )
}
