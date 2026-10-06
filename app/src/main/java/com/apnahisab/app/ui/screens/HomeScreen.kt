package com.apnahisab.app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.apnahisab.app.domain.model.Expense
import com.apnahisab.app.domain.model.RoomMember
import com.apnahisab.app.domain.model.RoomSnapshot
import com.apnahisab.app.domain.util.formatMoney
import com.apnahisab.app.ui.components.EmptyState
import com.apnahisab.app.ui.components.MatteCard
import com.apnahisab.app.ui.components.MemberAvatar
import com.apnahisab.app.ui.components.PrimaryActionButton
import com.apnahisab.app.ui.components.SectionHeading
import com.apnahisab.app.ui.theme.AccentBlue
import com.apnahisab.app.ui.theme.CardBlue
import com.apnahisab.app.ui.theme.ErrorRose
import com.apnahisab.app.ui.theme.PositiveGreen
import com.apnahisab.app.ui.theme.TextPrimary
import com.apnahisab.app.ui.theme.TextSecondary
import java.text.DateFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date
import java.util.Locale

@Composable
fun HomeScreen(
    room: RoomSnapshot?,
    busy: Boolean,
    onAddExpense: () -> Unit,
    onAddMember: () -> Unit,
    onEditMember: (RoomMember) -> Unit,
) {
    if (room == null) {
        Column(Modifier.fillMaxSize().padding(22.dp), verticalArrangement = Arrangement.Center) {
            EmptyState("Opening your local hisab", "Room, roommates, balances, and expenses are stored on this phone.")
        }
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 18.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Text("APNA HISAB", color = AccentBlue, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                Text(room.room.name, modifier = Modifier.padding(top = 3.dp), color = TextPrimary, fontSize = 21.sp, fontWeight = FontWeight.SemiBold)
            }
            Text("ON THIS PHONE", color = TextSecondary, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        }

        if (room.members.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                items(room.members, key = RoomMember::id) { member ->
                    var shown by remember(member.id) { mutableStateOf(false) }
                    LaunchedEffect(member.id) { shown = true }
                    AnimatedVisibility(
                        visible = shown,
                        enter = slideInHorizontally(initialOffsetX = { it / 10 }) + fadeIn(),
                    ) {
                        MemberBalanceTile(member = member, onEdit = { onEditMember(member) })
                    }
                }
            }
        } else {
            MatteCard(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    EmptyState("No roommates yet", "Add the people you share expenses with on this device.")
                    PrimaryActionButton("ADD ROOMMATE", onClick = onAddMember, enabled = !busy)
                }
            }
        }

        MatteCard(
            modifier = Modifier.fillMaxWidth().padding(top = 15.dp),
            color = CardBlue,
        ) {
            Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 18.dp)) {
                Text("ROOM BALANCE", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.6.sp)
                Text(
                    formatMoney(room.totalBalanceMinor),
                    modifier = Modifier.padding(top = 7.dp),
                    color = TextPrimary,
                    fontSize = 31.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = (-0.6).sp,
                )
                Text(
                    "Combined current balance of ${room.members.size} active ${if (room.members.size == 1) "roommate" else "roommates"}",
                    modifier = Modifier.padding(top = 4.dp),
                    color = TextSecondary,
                    fontSize = 12.sp,
                )
            }
        }

        PrimaryActionButton(
            text = "+  ADD KHARCHA",
            onClick = onAddExpense,
            modifier = Modifier.padding(top = 14.dp),
            enabled = !busy && room.members.isNotEmpty(),
        )
        if (room.members.size < 4) {
            TextButton(
                onClick = onAddMember,
                modifier = Modifier.align(Alignment.CenterHorizontally),
                enabled = !busy,
            ) {
                Text("+ ADD ROOMMATE", color = AccentBlue, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            SectionHeading("HISAB CHAT", "Newest expenses appear at the bottom")
            Text("${room.expenses.size}", color = TextSecondary, fontSize = 12.sp)
        }

        if (room.expenses.isEmpty()) {
            MatteCard(modifier = Modifier.fillMaxWidth()) {
                EmptyState(
                    title = "No kharcha yet",
                    message = "Expenses you add on this phone will appear here.",
                    modifier = Modifier.padding(vertical = 2.dp),
                )
            }
        } else {
            val listState = rememberLazyListState()
            LaunchedEffect(room.expenses.lastOrNull()?.id) {
                if (room.expenses.isNotEmpty()) listState.animateScrollToItem(room.expenses.lastIndex)
            }
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxWidth().weight(1f),
                verticalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                itemsIndexed(room.expenses, key = { _, item -> item.id }) { _, expense ->
                    var shown by remember(expense.id) { mutableStateOf(false) }
                    LaunchedEffect(expense.id) { shown = true }
                    AnimatedVisibility(
                        visible = shown,
                        enter = slideInHorizontally(initialOffsetX = { it / 14 }) + fadeIn(),
                    ) {
                        ExpenseHistoryCard(
                            expense = expense,
                            payerName = expense.paidByNameAtCreation.ifBlank { room.displayName(expense.paidByMemberId) },
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun MemberBalanceTile(member: RoomMember, onEdit: () -> Unit) {
    MatteCard(modifier = Modifier.width(153.dp)) {
        Column(modifier = Modifier.padding(horizontal = 13.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MemberAvatar(member.name, modifier = Modifier.width(38.dp).height(38.dp), seed = member.id)
                Spacer(Modifier.width(9.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(member.name, color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("ROOMMATE", color = AccentBlue, fontSize = 8.sp, letterSpacing = 0.9.sp)
                }
            }
            Text(
                formatMoney(member.currentBalanceMinor),
                modifier = Modifier.padding(top = 12.dp),
                color = if (member.currentBalanceMinor < 0L) ErrorRose else PositiveGreen,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Current balance", modifier = Modifier.weight(1f), color = TextSecondary, fontSize = 10.sp, maxLines = 1)
                TextButton(onClick = onEdit, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 2.dp, vertical = 0.dp)) {
                    Icon(Icons.Outlined.Edit, contentDescription = null, tint = AccentBlue, modifier = Modifier.width(13.dp).height(13.dp))
                    Spacer(Modifier.width(3.dp))
                    Text("Edit", color = AccentBlue, fontSize = 10.sp)
                }
            }
        }
    }
}

@Composable
private fun ExpenseHistoryCard(expense: Expense, payerName: String) {
    val shares = expense.splitMemberIds.mapNotNull(expense.sharesMinor::get)
    val smallest = shares.minOrNull() ?: 0L
    val largest = shares.maxOrNull() ?: smallest
    val perPerson = if (smallest == largest) formatMoney(smallest) else "${formatMoney(smallest)}–${formatMoney(largest)}"

    MatteCard(modifier = Modifier.fillMaxWidth(), color = CardBlue) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Text(categoryEmoji(expense.category), fontSize = 20.sp)
                Text(expense.title, modifier = Modifier.weight(1f), color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(formatMoney(expense.amountMinor), color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
            Text(
                "${formatMoney(expense.amountMinor)}  •  ${expense.splitMemberIds.size} ${if (expense.splitMemberIds.size == 1) "person" else "people"}  •  $perPerson each",
                modifier = Modifier.padding(top = 8.dp),
                color = TextSecondary,
                fontSize = 11.sp,
            )
            Text("Paid by $payerName", modifier = Modifier.padding(top = 6.dp), color = TextSecondary, fontSize = 11.sp)
            Text(formatExpenseDate(expense.occurredAtMillis), modifier = Modifier.padding(top = 2.dp), color = TextSecondary.copy(alpha = 0.78f), fontSize = 10.sp)
            if (expense.note.isNotBlank()) {
                Text(expense.note, modifier = Modifier.padding(top = 8.dp), color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
            }
        }
    }
}

fun categoryEmoji(category: String): String = when (category) {
    "GROCERIES" -> "🥦"
    "FOOD" -> "🍚"
    "UTILITIES" -> "💡"
    "RENT" -> "🏠"
    "CLEANING" -> "🧹"
    "TRAVEL" -> "🛺"
    else -> "🧾"
}

private fun formatExpenseDate(timeMillis: Long): String {
    if (timeMillis <= 0L) return "Time pending"
    val zone = ZoneId.systemDefault()
    val expenseDate = Instant.ofEpochMilli(timeMillis).atZone(zone).toLocalDate()
    val today = LocalDate.now(zone)
    val time = DateFormat.getTimeInstance(DateFormat.SHORT, Locale("en", "IN")).format(Date(timeMillis))
    return when (expenseDate) {
        today -> "Today, $time"
        today.minusDays(1) -> "Yesterday, $time"
        else -> DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale("en", "IN")).format(Date(timeMillis))
    }
}
