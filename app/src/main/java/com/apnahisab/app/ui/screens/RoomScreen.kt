package com.apnahisab.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PersonRemove
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.apnahisab.app.domain.model.BalanceAuditKind
import com.apnahisab.app.domain.model.BalanceEvent
import com.apnahisab.app.domain.model.MAX_ACTIVE_MEMBERS
import com.apnahisab.app.domain.model.RoomMember
import com.apnahisab.app.domain.model.RoomSnapshot
import com.apnahisab.app.domain.util.formatMoney
import com.apnahisab.app.ui.components.EmptyState
import com.apnahisab.app.ui.components.LabelValueRow
import com.apnahisab.app.ui.components.MatteCard
import com.apnahisab.app.ui.components.MemberAvatar
import com.apnahisab.app.ui.components.PrimaryActionButton
import com.apnahisab.app.ui.components.SectionHeading
import com.apnahisab.app.ui.theme.AccentBlue
import com.apnahisab.app.ui.theme.ErrorRose
import com.apnahisab.app.ui.theme.PositiveGreen
import com.apnahisab.app.ui.theme.TextPrimary
import com.apnahisab.app.ui.theme.TextSecondary
import java.text.DateFormat
import java.util.Date
import java.util.Locale

@Composable
fun RoomScreen(
    room: RoomSnapshot?,
    busy: Boolean,
    onAddMember: () -> Unit,
    onEditMember: (RoomMember) -> Unit,
    onRemoveMember: (RoomMember) -> Unit,
    onRenameRoom: () -> Unit,
) {
    if (room == null) {
        Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.Center) {
            EmptyState("Opening your local room", "Your room information is stored in SQLite on this phone.")
        }
        return
    }

    val recentAudits = remember(room.balanceEvents) { room.balanceEvents.take(16) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        SectionHeading("ROOM", "One private room, stored only on this device")
        MatteCard {
            Column(modifier = Modifier.padding(18.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(room.room.name, color = TextPrimary, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                        Text("${room.members.size} of $MAX_ACTIVE_MEMBERS active roommates", modifier = Modifier.padding(top = 5.dp), color = TextSecondary, fontSize = 12.sp)
                    }
                    TextButton(onClick = onRenameRoom, enabled = !busy) {
                        Icon(Icons.Outlined.Edit, contentDescription = null, tint = AccentBlue, modifier = Modifier.width(16.dp).height(16.dp))
                        Text(" Edit", color = AccentBlue)
                    }
                }
                Text(
                    "Nothing is uploaded or shared with other phones.",
                    modifier = Modifier.padding(top = 12.dp),
                    color = TextSecondary,
                    fontSize = 11.sp,
                )
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            SectionHeading("ROOMMATES", "Starting and current balances")
            Spacer(Modifier.weight(1f))
            Text("${room.members.size}/$MAX_ACTIVE_MEMBERS", color = TextSecondary, fontSize = 12.sp)
        }
        if (room.members.isEmpty()) {
            MatteCard {
                Column(modifier = Modifier.padding(15.dp)) {
                    EmptyState("No roommates yet", "Add up to four people to start tracking balances.")
                    PrimaryActionButton("ADD A ROOMMATE", onClick = onAddMember, enabled = !busy)
                }
            }
        } else {
            room.members.forEach { member ->
                MemberDetailsCard(
                    member = member,
                    busy = busy,
                    onEdit = { onEditMember(member) },
                    onRemove = { onRemoveMember(member) },
                )
            }
        }

        if (room.members.size < MAX_ACTIVE_MEMBERS) {
            PrimaryActionButton("+  ADD ROOMMATE", onClick = onAddMember, enabled = !busy)
        } else {
            Text("Roommate limit reached. Remove someone before adding another person.", color = TextSecondary, fontSize = 11.sp)
        }

        MatteCard {
            Column(modifier = Modifier.padding(17.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
                SectionHeading("ROOM TOTAL", "Combined balance of active roommates")
                Text(formatMoney(room.totalBalanceMinor), color = TextPrimary, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                LabelValueRow("Recorded expenses", formatMoney(room.expenses.sumOf { it.amountMinor }))
            }
        }

        if (recentAudits.isNotEmpty()) {
            SectionHeading("BALANCE AUDIT", "Contributions, splits, edits, and removals")
            MatteCard {
                Column(modifier = Modifier.padding(horizontal = 15.dp, vertical = 3.dp)) {
                    recentAudits.forEachIndexed { index, event ->
                        BalanceAuditRow(event)
                        if (index != recentAudits.lastIndex) {
                            androidx.compose.material3.HorizontalDivider(color = com.apnahisab.app.ui.theme.DividerBlue.copy(alpha = 0.7f))
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun MemberDetailsCard(
    member: RoomMember,
    busy: Boolean,
    onEdit: () -> Unit,
    onRemove: () -> Unit,
) {
    MatteCard {
        Column(modifier = Modifier.padding(15.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MemberAvatar(member.name, modifier = Modifier.width(46.dp).height(46.dp), seed = member.id)
                Column(modifier = Modifier.weight(1f).padding(start = 11.dp)) {
                    Text(member.name, color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("Added ${formatJoinedDate(member.joinedAtMillis)}", modifier = Modifier.padding(top = 3.dp), color = TextSecondary, fontSize = 10.sp)
                }
            }
            androidx.compose.material3.HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = com.apnahisab.app.ui.theme.DividerBlue)
            LabelValueRow("Current balance", formatMoney(member.currentBalanceMinor))
            LabelValueRow("Starting balance", formatMoney(member.startingBalanceMinor), modifier = Modifier.padding(top = 7.dp))
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 7.dp),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onEdit, enabled = !busy) {
                    Icon(Icons.Outlined.Edit, contentDescription = null, tint = AccentBlue, modifier = Modifier.width(15.dp).height(15.dp))
                    Text(" Edit", color = AccentBlue, fontSize = 12.sp)
                }
                TextButton(onClick = onRemove, enabled = !busy) {
                    Icon(Icons.Outlined.PersonRemove, contentDescription = null, tint = ErrorRose, modifier = Modifier.width(16.dp).height(16.dp))
                    Text(" Remove", color = ErrorRose, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun BalanceAuditRow(event: BalanceEvent) {
    val (label, color) = when (event.kind) {
        BalanceAuditKind.STARTING_CONTRIBUTION -> "Starting contribution" to PositiveGreen
        BalanceAuditKind.EXPENSE_SHARE -> "Expense share" to ErrorRose
        BalanceAuditKind.MANUAL_ADJUSTMENT -> "Manual balance edit" to AccentBlue
        BalanceAuditKind.MEMBER_REMOVED -> "Roommate removed" to TextSecondary
        else -> "Balance activity" to TextSecondary
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 11.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(event.memberNameAtEvent, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(label, modifier = Modifier.padding(top = 3.dp), color = color, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            Text(event.reason, modifier = Modifier.padding(top = 2.dp), color = TextSecondary, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text("${event.updatedByNameAtEvent} · ${formatAuditTime(event.createdAtMillis)}", modifier = Modifier.padding(top = 3.dp), color = TextSecondary.copy(alpha = 0.8f), fontSize = 10.sp)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(formatMoney(event.previousBalanceMinor), color = TextSecondary, fontSize = 10.sp)
            Text("→ ${formatMoney(event.newBalanceMinor)}", modifier = Modifier.padding(top = 3.dp), color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

private fun formatJoinedDate(timeMillis: Long): String =
    DateFormat.getDateInstance(DateFormat.MEDIUM, Locale("en", "IN")).format(Date(timeMillis))

private fun formatAuditTime(timeMillis: Long): String =
    DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, Locale("en", "IN")).format(Date(timeMillis))
