package com.apnahisab.app.ui.screens.forms

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.apnahisab.app.domain.model.RoomMember
import com.apnahisab.app.domain.util.formatMoney
import com.apnahisab.app.domain.util.formatRupeesInput
import com.apnahisab.app.domain.util.parseMoneyToMinorUnits
import com.apnahisab.app.ui.components.ApnaTextField
import com.apnahisab.app.ui.components.PrimaryActionButton
import com.apnahisab.app.ui.theme.AccentBlue
import com.apnahisab.app.ui.theme.CardBlue
import com.apnahisab.app.ui.theme.ErrorRose
import com.apnahisab.app.ui.theme.TextPrimary
import com.apnahisab.app.ui.theme.TextSecondary

@Composable
fun MemberEditorDialog(
    member: RoomMember?,
    activeMemberCount: Int,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSave: (name: String, balanceMinor: Long, reason: String) -> Unit,
) {
    val isEditing = member != null
    var name by remember(member?.id) { mutableStateOf(member?.name.orEmpty()) }
    var balance by remember(member?.id, member?.currentBalanceMinor) {
        mutableStateOf(member?.let { formatRupeesInput(it.currentBalanceMinor.coerceAtLeast(0L)) }.orEmpty())
    }
    var reason by remember(member?.id) { mutableStateOf("") }
    var validationError by remember(member?.id) { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(24.dp),
        containerColor = CardBlue,
        title = {
            Text(
                if (isEditing) "Edit roommate" else "Add a roommate",
                color = TextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    if (isEditing) "Update the name or current balance. The original contribution and expense history stay unchanged."
                    else "Add up to four active people on this phone. Their avatar initials are created automatically.",
                    color = TextSecondary,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                )
                ApnaTextField(
                    value = name,
                    onValueChange = { name = it.take(40) },
                    label = "Name",
                    placeholder = "Roommate name",
                )
                if (member != null) {
                    Text("Current balance  ·  ${formatMoney(member.currentBalanceMinor)}", color = TextSecondary, fontSize = 11.sp)
                }
                ApnaTextField(
                    value = balance,
                    onValueChange = { balance = it.filter { char -> char.isDigit() || char == '.' }.take(14) },
                    label = if (isEditing) "Current balance" else "Starting/current balance",
                    placeholder = "0.00",
                    keyboardType = KeyboardType.Decimal,
                    leadingText = "₹",
                )
                if (member != null) {
                    Text(
                        "Starting contribution  ·  ${formatMoney(member.startingBalanceMinor)}",
                        color = TextSecondary,
                        fontSize = 11.sp,
                    )
                    ApnaTextField(
                        value = reason,
                        onValueChange = { reason = it.take(120) },
                        label = "Balance edit reason (optional)",
                        placeholder = "e.g. Added cash",
                    )
                } else {
                    Text("${activeMemberCount}/4 active roommates", color = TextSecondary, fontSize = 11.sp)
                }
                validationError?.let { Text(it, color = ErrorRose, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            PrimaryActionButton(
                text = if (isEditing) "SAVE ROOMMATE" else "ADD ROOMMATE",
                onClick = {
                    val amountMinor = parseMoneyToMinorUnits(balance, allowZero = true)
                    when {
                        name.isBlank() -> validationError = "Enter a name."
                        amountMinor == null -> validationError = "Enter a valid amount (up to 2 decimal places)."
                        !isEditing && activeMemberCount >= 4 -> validationError = "This device already has 4 active roommates."
                        else -> {
                            validationError = null
                            onSave(name.trim(), amountMinor, reason.trim())
                        }
                    }
                },
                modifier = Modifier.padding(start = 16.dp, bottom = 8.dp),
                enabled = !busy && (isEditing || activeMemberCount < 4),
                loading = busy,
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel", color = TextSecondary) }
        },
    )
}

@Composable
fun RoomNameDialog(
    currentName: String,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var name by remember(currentName) { mutableStateOf(currentName) }
    var validationError by remember(currentName) { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(24.dp),
        containerColor = CardBlue,
        title = { Text("Room name", color = TextPrimary, fontWeight = FontWeight.SemiBold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("This name is stored only in this phone's local database.", color = TextSecondary, fontSize = 12.sp)
                ApnaTextField(
                    value = name,
                    onValueChange = { name = it.take(40) },
                    label = "Name",
                    placeholder = "My Room",
                )
                validationError?.let { Text(it, color = ErrorRose, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            PrimaryActionButton(
                text = "SAVE ROOM NAME",
                onClick = {
                    if (name.isBlank()) validationError = "Enter a room name."
                    else {
                        validationError = null
                        onSave(name.trim())
                    }
                },
                modifier = Modifier.padding(start = 16.dp, bottom = 8.dp),
                enabled = !busy,
                loading = busy,
            )
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel", color = TextSecondary) }
        },
    )
}
