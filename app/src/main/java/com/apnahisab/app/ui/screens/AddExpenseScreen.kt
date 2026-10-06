package com.apnahisab.app.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.apnahisab.app.domain.model.MAX_ACTIVE_MEMBERS
import com.apnahisab.app.domain.model.NewExpense
import com.apnahisab.app.domain.model.RoomMember
import com.apnahisab.app.domain.model.RoomSnapshot
import com.apnahisab.app.domain.util.formatMoney
import com.apnahisab.app.domain.util.parseMoneyToMinorUnits
import com.apnahisab.app.domain.util.shareAmounts
import com.apnahisab.app.ui.components.ApnaTextField
import com.apnahisab.app.ui.components.EmptyState
import com.apnahisab.app.ui.components.MatteCard
import com.apnahisab.app.ui.components.PrimaryActionButton
import com.apnahisab.app.ui.components.SectionHeading
import com.apnahisab.app.ui.theme.AccentBlue
import com.apnahisab.app.ui.theme.ErrorRose
import com.apnahisab.app.ui.theme.TextPrimary
import com.apnahisab.app.ui.theme.TextSecondary
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private data class ExpenseCategory(val key: String, val label: String, val icon: String)
private val categories = listOf(
    ExpenseCategory("GROCERIES", "Groceries", "🥦"),
    ExpenseCategory("FOOD", "Food", "🍚"),
    ExpenseCategory("UTILITIES", "Utilities", "💡"),
    ExpenseCategory("RENT", "Rent", "🏠"),
    ExpenseCategory("CLEANING", "Cleaning", "🧹"),
    ExpenseCategory("TRAVEL", "Travel", "🛺"),
    ExpenseCategory("OTHER", "Other", "🧾"),
)

@Composable
fun AddExpenseScreen(
    room: RoomSnapshot?,
    busy: Boolean,
    onSave: (NewExpense) -> Unit,
    onAddMember: () -> Unit,
) {
    if (room == null) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
            EmptyState("Local room is opening", "Your room and expense data stay in this phone's Room database.")
        }
        return
    }
    if (room.members.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
            EmptyState("Add a roommate first", "Expenses can be split among up to four local roommates.")
            PrimaryActionButton("ADD A ROOMMATE", onAddMember)
        }
        return
    }

    val memberIdsKey = room.members.joinToString("|") { it.id }
    var title by remember(room.room.id) { mutableStateOf("") }
    var amount by remember(room.room.id) { mutableStateOf("") }
    var category by remember(room.room.id) { mutableStateOf(categories.first().key) }
    var paidByMemberId by remember(room.room.id, memberIdsKey) {
        mutableStateOf(room.members.firstOrNull()?.id.orEmpty())
    }
    var selectedMemberIds by remember(room.room.id, memberIdsKey) {
        mutableStateOf(room.members.map(RoomMember::id).toSet())
    }
    var note by remember(room.room.id) { mutableStateOf("") }
    var occurredAt by remember(room.room.id) { mutableStateOf(LocalDateTime.now()) }
    var validationError by remember(room.room.id) { mutableStateOf<String?>(null) }

    val amountMinor = parseMoneyToMinorUnits(amount)
    val categoryInfo = categories.first { it.key == category }
    val shares = if (amountMinor != null && selectedMemberIds.isNotEmpty()) {
        runCatching { shareAmounts(amountMinor, selectedMemberIds.toList()) }.getOrNull().orEmpty()
    } else emptyMap()
    val lowShare = shares.values.minOrNull()
    val highShare = shares.values.maxOrNull()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 16.dp),
    ) {
        SectionHeading("ADD KHARCHA", "A shared expense updates every selected balance")
        Spacer(Modifier.height(17.dp))
        ApnaTextField(
            value = title,
            onValueChange = { title = it.take(80) },
            label = "Expense name",
            placeholder = "e.g. Sabji, Rice, Wi-Fi",
        )
        Spacer(Modifier.height(12.dp))
        ApnaTextField(
            value = amount,
            onValueChange = { amount = it.filter { char -> char.isDigit() || char == '.' }.take(14) },
            label = "Amount",
            placeholder = "0.00",
            keyboardType = KeyboardType.Decimal,
            leadingText = "₹",
        )
        Spacer(Modifier.height(14.dp))
        CategoryPicker(selected = categoryInfo, onSelect = { category = it })
        Spacer(Modifier.height(13.dp))
        PaidByPicker(members = room.members, selectedId = paidByMemberId, onSelect = { paidByMemberId = it })
        Spacer(Modifier.height(17.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionHeading("SPLIT BETWEEN", "Choose who shares this expense")
            Spacer(Modifier.weight(1f))
            Text("${selectedMemberIds.size}/$MAX_ACTIVE_MEMBERS", color = TextSecondary, fontSize = 11.sp)
        }
        Spacer(Modifier.height(8.dp))
        MatteCard {
            Column {
                room.members.forEachIndexed { index, member ->
                    MemberSplitRow(
                        member = member,
                        selected = member.id in selectedMemberIds,
                        onCheckedChange = { checked ->
                            selectedMemberIds = if (checked) selectedMemberIds + member.id else selectedMemberIds - member.id
                        },
                    )
                    if (index != room.members.lastIndex) androidx.compose.material3.HorizontalDivider(color = com.apnahisab.app.ui.theme.DividerBlue.copy(alpha = 0.7f))
                }
            }
        }
        if (amountMinor != null && selectedMemberIds.isNotEmpty() && lowShare != null && highShare != null) {
            MatteCard(modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Row(
                    modifier = Modifier.padding(horizontal = 15.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text("PER PERSON", color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                        Text(
                            if (lowShare == highShare) formatMoney(lowShare) else "${formatMoney(lowShare)}–${formatMoney(highShare)}",
                            modifier = Modifier.padding(top = 3.dp),
                            color = TextPrimary,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Text("${selectedMemberIds.size} ${if (selectedMemberIds.size == 1) "person" else "people"}", color = TextSecondary, fontSize = 12.sp)
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Text("DATE & TIME", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        DateTimePicker(value = occurredAt, onChange = { occurredAt = it })
        Spacer(Modifier.height(12.dp))
        ApnaTextField(
            value = note,
            onValueChange = { note = it.take(500) },
            label = "Note (optional)",
            placeholder = "Add a little detail",
            singleLine = false,
            maxLines = 3,
        )
        validationError?.let { Text(it, modifier = Modifier.padding(top = 10.dp), color = ErrorRose, fontSize = 12.sp) }
        Spacer(Modifier.height(17.dp))
        PrimaryActionButton(
            text = "SAVE KHARCHA",
            onClick = {
                when {
                    title.isBlank() -> validationError = "Enter an expense name."
                    amountMinor == null -> validationError = "Enter a valid amount (up to 2 decimal places)."
                    selectedMemberIds.isEmpty() -> validationError = "Select at least one member to share this expense."
                    paidByMemberId.isBlank() -> validationError = "Choose who paid for this expense."
                    else -> {
                        validationError = null
                        onSave(
                            NewExpense(
                                title = title.trim(),
                                amountMinor = amountMinor,
                                category = category,
                                paidByMemberId = paidByMemberId,
                                splitMemberIds = selectedMemberIds.toList(),
                                occurredAtMillis = occurredAt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(),
                                note = note.trim(),
                            ),
                        )
                    }
                }
            },
            enabled = !busy,
            loading = busy,
        )
        Spacer(Modifier.height(14.dp))
    }
}

@Composable
private fun CategoryPicker(selected: ExpenseCategory, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text("CATEGORY", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Box(modifier = Modifier.fillMaxWidth().padding(top = 7.dp)) {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                Text("${selected.icon}   ${selected.label}", modifier = Modifier.weight(1f), color = TextPrimary)
                Text("⌄", color = AccentBlue, fontSize = 18.sp)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                categories.forEach { category ->
                    DropdownMenuItem(
                        text = { Text("${category.icon}   ${category.label}") },
                        onClick = { onSelect(category.key); expanded = false },
                    )
                }
            }
        }
    }
}

@Composable
private fun PaidByPicker(members: List<RoomMember>, selectedId: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val selected = members.firstOrNull { it.id == selectedId }
    Column {
        Text("PAID BY", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Box(modifier = Modifier.fillMaxWidth().padding(top = 7.dp)) {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth(), enabled = members.isNotEmpty()) {
                Text(selected?.name ?: "Choose a member", modifier = Modifier.weight(1f), color = TextPrimary)
                Text("⌄", color = AccentBlue, fontSize = 18.sp)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                members.forEach { member ->
                    DropdownMenuItem(
                        text = { Text(member.name) },
                        onClick = { onSelect(member.id); expanded = false },
                    )
                }
            }
        }
    }
}

@Composable
private fun MemberSplitRow(member: RoomMember, selected: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 11.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = selected, onCheckedChange = onCheckedChange)
        Text(member.name, modifier = Modifier.weight(1f), color = TextPrimary, fontSize = 14.sp)
        Text(formatMoney(member.currentBalanceMinor), color = TextSecondary, fontSize = 11.sp)
    }
}

@Composable
private fun DateTimePicker(value: LocalDateTime, onChange: (LocalDateTime) -> Unit) {
    val context = LocalContext.current
    val dateFormatter = remember { DateTimeFormatter.ofPattern("EEE, d MMM yyyy", Locale("en", "IN")) }
    val timeFormatter = remember { DateTimeFormatter.ofPattern("h:mm a", Locale("en", "IN")) }
    Row(horizontalArrangement = Arrangement.spacedBy(9.dp), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
        OutlinedButton(
            onClick = {
                DatePickerDialog(
                    context,
                    { _, year, month, day -> onChange(java.time.LocalDate.of(year, month + 1, day).atTime(value.toLocalTime())) },
                    value.year,
                    value.monthValue - 1,
                    value.dayOfMonth,
                ).show()
            },
            modifier = Modifier.weight(1.2f),
        ) {
            androidx.compose.material3.Icon(Icons.Outlined.CalendarMonth, contentDescription = null, tint = AccentBlue)
            Text(value.format(dateFormatter), modifier = Modifier.padding(start = 7.dp), color = TextPrimary, fontSize = 12.sp)
        }
        OutlinedButton(
            onClick = {
                TimePickerDialog(
                    context,
                    { _, hour, minute -> onChange(value.withHour(hour).withMinute(minute)) },
                    value.hour,
                    value.minute,
                    false,
                ).show()
            },
            modifier = Modifier.weight(0.8f),
        ) {
            androidx.compose.material3.Icon(Icons.Outlined.Schedule, contentDescription = null, tint = AccentBlue)
            Text(value.format(timeFormatter), modifier = Modifier.padding(start = 6.dp), color = TextPrimary, fontSize = 12.sp)
        }
    }
}
