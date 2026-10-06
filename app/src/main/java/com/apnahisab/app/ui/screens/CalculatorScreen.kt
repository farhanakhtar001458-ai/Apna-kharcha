package com.apnahisab.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.apnahisab.app.domain.model.RoomMember
import com.apnahisab.app.domain.model.RoomSnapshot
import com.apnahisab.app.domain.util.formatMoney
import com.apnahisab.app.domain.util.parseMoneyToMinorUnits
import com.apnahisab.app.domain.util.shareAmounts
import com.apnahisab.app.ui.components.ApnaTextField
import com.apnahisab.app.ui.components.EmptyState
import com.apnahisab.app.ui.components.LabelValueRow
import com.apnahisab.app.ui.components.MatteCard
import com.apnahisab.app.ui.components.PrimaryActionButton
import com.apnahisab.app.ui.components.SectionHeading
import com.apnahisab.app.ui.theme.AccentBlue
import com.apnahisab.app.ui.theme.ErrorRose
import com.apnahisab.app.ui.theme.PositiveGreen
import com.apnahisab.app.ui.theme.TextPrimary
import com.apnahisab.app.ui.theme.TextSecondary

@Composable
fun CalculatorScreen(
    room: RoomSnapshot?,
    onAddMember: () -> Unit,
) {
    if (room == null) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
            EmptyState("Local room is opening", "Your calculator works without an account or network.")
        }
        return
    }
    if (room.members.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
            EmptyState("Add roommates to split", "The calculator can split among up to four people stored on this phone.")
            PrimaryActionButton("ADD A ROOMMATE", onAddMember)
        }
        return
    }

    val memberKey = room.members.joinToString("|") { it.id }
    var amount by remember(room.room.id) { mutableStateOf("") }
    var selectedIds by remember(room.room.id, memberKey) { mutableStateOf(room.members.map(RoomMember::id).toSet()) }
    var paidById by remember(room.room.id, memberKey) {
        mutableStateOf(room.members.firstOrNull()?.id.orEmpty())
    }
    val amountMinor = parseMoneyToMinorUnits(amount)
    val shares = if (amountMinor != null && selectedIds.isNotEmpty()) {
        runCatching { shareAmounts(amountMinor, selectedIds.toList()) }.getOrNull().orEmpty()
    } else emptyMap()
    val totalSpentMinor = room.expenses.sumOf { it.amountMinor }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        SectionHeading("CALCULATOR", "Check the split before adding a kharcha")
        MatteCard {
            Column(modifier = Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                LabelValueRow("Total room expenses", formatMoney(totalSpentMinor))
                LabelValueRow("Active members", "${room.members.size}")
                LabelValueRow("Current room balance", formatMoney(room.totalBalanceMinor))
            }
        }
        ApnaTextField(
            value = amount,
            onValueChange = { amount = it.filter { char -> char.isDigit() || char == '.' }.take(14) },
            label = "Expense amount",
            placeholder = "400.00",
            keyboardType = KeyboardType.Decimal,
            leadingText = "₹",
        )
        SectionHeading("SPLIT BETWEEN", "Choose the people sharing the amount")
        MatteCard {
            Column {
                room.members.forEachIndexed { index, member ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 11.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = member.id in selectedIds,
                            onCheckedChange = { checked ->
                                selectedIds = if (checked) selectedIds + member.id else selectedIds - member.id
                            },
                        )
                        Text(member.name, modifier = Modifier.weight(1f), color = TextPrimary, fontSize = 14.sp)
                        Text(formatMoney(member.currentBalanceMinor), color = TextSecondary, fontSize = 11.sp)
                    }
                    if (index != room.members.lastIndex) androidx.compose.material3.HorizontalDivider(color = com.apnahisab.app.ui.theme.DividerBlue.copy(alpha = 0.7f))
                }
            }
        }
        PaidByDropdown(members = room.members, selectedId = paidById, onSelect = { paidById = it })
        if (amountMinor != null && selectedIds.isNotEmpty()) {
            val smallest = shares.values.minOrNull() ?: 0L
            val largest = shares.values.maxOrNull() ?: smallest
            MatteCard(color = com.apnahisab.app.ui.theme.RaisedBlue) {
                Column(modifier = Modifier.padding(19.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("SPLIT PREVIEW", color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
                    Text(formatMoney(amountMinor), color = TextPrimary, fontSize = 29.sp, fontWeight = FontWeight.SemiBold)
                    Text("÷ ${selectedIds.size} people", color = TextSecondary, fontSize = 14.sp)
                    Text(
                        if (smallest == largest) "= ${formatMoney(smallest)} / person" else "= ${formatMoney(smallest)}–${formatMoney(largest)} / person",
                        color = AccentBlue,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            SectionHeading("WHO OWES WHAT", "A split charge is applied to every selected member")
            MatteCard {
                Column(modifier = Modifier.padding(horizontal = 15.dp, vertical = 7.dp)) {
                    room.members.filter { it.id in selectedIds }.forEach { member ->
                        val share = shares[member.id] ?: 0L
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column {
                                Text(member.name, color = TextPrimary, fontWeight = FontWeight.Medium, fontSize = 13.sp)
                                Text("Current ${formatMoney(member.currentBalanceMinor)}", color = TextSecondary, fontSize = 10.sp)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("−${formatMoney(share)}", color = ErrorRose, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                Text("new ${formatMoney(member.currentBalanceMinor - share)}", color = PositiveGreen, fontSize = 10.sp)
                            }
                        }
                        if (member.id != selectedIds.lastOrNull()) androidx.compose.material3.HorizontalDivider(color = com.apnahisab.app.ui.theme.DividerBlue.copy(alpha = 0.7f))
                    }
                    val payer = room.members.firstOrNull { it.id == paidById }
                    if (payer != null) {
                        Text("Paid by ${payer.name}. The payer is only charged if included in the split.", modifier = Modifier.padding(top = 7.dp, bottom = 7.dp), color = TextSecondary, fontSize = 11.sp, lineHeight = 16.sp)
                    }
                }
            }
        } else {
            Text("Enter an amount and select at least one person to see the split.", color = TextSecondary, fontSize = 12.sp)
        }
        Spacer(Modifier.height(4.dp))
    }
}

@Composable
private fun PaidByDropdown(members: List<RoomMember>, selectedId: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val paidBy = members.firstOrNull { it.id == selectedId }
    Column {
        Text("PAID BY", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        androidx.compose.foundation.layout.Box(modifier = Modifier.fillMaxWidth().padding(top = 7.dp)) {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                Text(paidBy?.name ?: "Choose member", modifier = Modifier.weight(1f), color = TextPrimary)
                Text("⌄", color = AccentBlue)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                members.forEach { member ->
                    DropdownMenuItem(text = { Text(member.name) }, onClick = { onSelect(member.id); expanded = false })
                }
            }
        }
    }
}
