package com.apnahisab.app.domain.model

const val MAX_ACTIVE_MEMBERS = 4
const val MAX_MONEY_MINOR = 9_000_000_000_000L

object BalanceAuditKind {
    const val STARTING_CONTRIBUTION = "STARTING_CONTRIBUTION"
    const val EXPENSE_SHARE = "EXPENSE_SHARE"
    const val MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
    const val MEMBER_REMOVED = "MEMBER_REMOVED"
}

/** Money is stored as integer paise (1 rupee = 100 paise). */
data class Room(
    val id: String,
    val name: String,
    val createdAtMillis: Long,
)

data class RoomMember(
    val id: String,
    val name: String,
    val avatarPlaceholder: String,
    val startingBalanceMinor: Long,
    val currentBalanceMinor: Long,
    val joinedAtMillis: Long,
    val active: Boolean,
    val sortOrder: Int,
)

data class Expense(
    val id: String,
    val title: String,
    val amountMinor: Long,
    val category: String,
    val paidByMemberId: String,
    val paidByNameAtCreation: String,
    val memberNamesAtSplit: Map<String, String>,
    val splitMemberIds: List<String>,
    val sharesMinor: Map<String, Long>,
    val occurredAtMillis: Long,
    val createdAtMillis: Long,
    val note: String,
)

data class BalanceEvent(
    val id: String,
    val memberId: String,
    val memberNameAtEvent: String,
    val updatedByNameAtEvent: String,
    val kind: String,
    val deltaMinor: Long,
    val previousBalanceMinor: Long,
    val newBalanceMinor: Long,
    val reason: String,
    val expenseId: String?,
    val createdAtMillis: Long,
)

data class RoomSnapshot(
    val room: Room,
    /** Active roommates shown in the current balance and split screens. */
    val members: List<RoomMember>,
    /** Includes removed roommates so older audit records can still show their names. */
    val allMembers: List<RoomMember>,
    val expenses: List<Expense>,
    val balanceEvents: List<BalanceEvent>,
) {
    val totalBalanceMinor: Long get() = members.sumOf(RoomMember::currentBalanceMinor)

    fun displayName(memberId: String): String =
        allMembers.firstOrNull { it.id == memberId }?.name ?: "Former roommate"
}

data class NewExpense(
    val title: String,
    val amountMinor: Long,
    val category: String,
    val paidByMemberId: String,
    val splitMemberIds: List<String>,
    val occurredAtMillis: Long,
    val note: String,
)
