package com.apnahisab.app.data.local

import androidx.room.withTransaction
import com.apnahisab.app.domain.model.ApnaHisabException
import com.apnahisab.app.domain.model.BalanceAuditKind
import com.apnahisab.app.domain.model.BalanceEvent
import com.apnahisab.app.domain.model.Expense
import com.apnahisab.app.domain.model.MAX_ACTIVE_MEMBERS
import com.apnahisab.app.domain.model.MAX_MONEY_MINOR
import com.apnahisab.app.domain.model.NewExpense
import com.apnahisab.app.domain.model.Room
import com.apnahisab.app.domain.model.RoomMember
import com.apnahisab.app.domain.model.RoomSnapshot
import com.apnahisab.app.domain.repository.RoomRepository
import com.apnahisab.app.domain.util.shareAmounts
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import java.util.UUID

class LocalRoomRepository(
    private val database: ApnaHisabDatabase,
) : RoomRepository {
    private val roomDao = database.roomDao()
    private val memberDao = database.memberDao()
    private val expenseDao = database.expenseDao()
    private val splitDao = database.expenseSplitDao()
    private val auditDao = database.balanceAuditDao()

    override fun observeSnapshot(): Flow<RoomSnapshot?> = combine(
        roomDao.observeRoom(LocalRoomIds.MAIN),
        memberDao.observeAll(),
        expenseDao.observeAll(),
        splitDao.observeAll(),
        auditDao.observeAll(),
    ) { roomEntity, memberEntities, expenseEntities, splitEntities, auditEntities ->
        roomEntity?.let { entity ->
            val allMembers = memberEntities.map { it.toDomain() }
            val splitsByExpense = splitEntities.groupBy(ExpenseSplitEntity::expenseId)
            RoomSnapshot(
                room = Room(
                    id = entity.id,
                    name = entity.name,
                    createdAtMillis = entity.createdAtMillis,
                ),
                members = allMembers.filter(RoomMember::active),
                allMembers = allMembers,
                expenses = expenseEntities.map { expense ->
                    val splits = splitsByExpense[expense.id].orEmpty()
                    Expense(
                        id = expense.id,
                        title = expense.title,
                        amountMinor = expense.amountMinor,
                        category = expense.category,
                        paidByMemberId = expense.paidByMemberId,
                        paidByNameAtCreation = expense.paidByNameAtCreation,
                        memberNamesAtSplit = splits.associate { it.memberId to it.memberNameAtSplit },
                        splitMemberIds = splits.map(ExpenseSplitEntity::memberId),
                        sharesMinor = splits.associate { it.memberId to it.amountMinor },
                        occurredAtMillis = expense.occurredAtMillis,
                        createdAtMillis = expense.createdAtMillis,
                        note = expense.note,
                    )
                },
                balanceEvents = auditEntities.map { it.toDomain() },
            )
        }
    }

    override suspend fun ensureLocalRoom() {
        database.withTransaction {
            if (roomDao.getRoom(LocalRoomIds.MAIN) == null) {
                val now = System.currentTimeMillis()
                roomDao.insert(
                    RoomEntity(
                        id = LocalRoomIds.MAIN,
                        name = "My Room",
                        createdAtMillis = now,
                        updatedAtMillis = now,
                    ),
                )
            }
        }
    }

    override suspend fun renameRoom(name: String) {
        val cleaned = name.trim()
        if (cleaned.isEmpty()) throw ApnaHisabException("Enter a room name.")
        if (cleaned.length > 40) throw ApnaHisabException("Room names can be up to 40 characters.")
        val updated = roomDao.updateName(LocalRoomIds.MAIN, cleaned, System.currentTimeMillis())
        if (updated == 0) throw ApnaHisabException("The local room is not ready yet. Please try again.")
    }

    override suspend fun addMember(name: String, startingBalanceMinor: Long) {
        val cleanedName = validateName(name)
        validateBalance(startingBalanceMinor)
        database.withTransaction {
            val activeMembers = memberDao.getActiveMembers()
            if (activeMembers.size >= MAX_ACTIVE_MEMBERS) {
                throw ApnaHisabException("A local room can have up to 4 active roommates.")
            }
            val now = System.currentTimeMillis()
            val memberId = UUID.randomUUID().toString()
            memberDao.insert(
                MemberEntity(
                    id = memberId,
                    roomId = LocalRoomIds.MAIN,
                    name = cleanedName,
                    avatarPlaceholder = "initials",
                    startingBalanceMinor = startingBalanceMinor,
                    currentBalanceMinor = startingBalanceMinor,
                    joinedAtMillis = now,
                    updatedAtMillis = now,
                    active = true,
                    sortOrder = activeMembers.size,
                ),
            )
            auditDao.insert(
                BalanceAuditEntity(
                    id = UUID.randomUUID().toString(),
                    roomId = LocalRoomIds.MAIN,
                    memberId = memberId,
                    memberNameAtEvent = cleanedName,
                    updatedByNameAtEvent = LOCAL_ACTOR,
                    kind = BalanceAuditKind.STARTING_CONTRIBUTION,
                    deltaMinor = startingBalanceMinor,
                    previousBalanceMinor = 0L,
                    newBalanceMinor = startingBalanceMinor,
                    reason = "Starting contribution",
                    expenseId = null,
                    createdAtMillis = now,
                ),
            )
        }
    }

    override suspend fun editMember(memberId: String, name: String, currentBalanceMinor: Long, reason: String) {
        val cleanedName = validateName(name)
        validateBalance(currentBalanceMinor)
        database.withTransaction {
            val member = memberDao.getById(memberId)
                ?.takeIf(MemberEntity::active)
                ?: throw ApnaHisabException("That roommate is no longer active.")
            val now = System.currentTimeMillis()
            memberDao.update(
                member.copy(
                    name = cleanedName,
                    currentBalanceMinor = currentBalanceMinor,
                    updatedAtMillis = now,
                ),
            )
            if (member.currentBalanceMinor != currentBalanceMinor) {
                auditDao.insert(
                    BalanceAuditEntity(
                        id = UUID.randomUUID().toString(),
                        roomId = member.roomId,
                        memberId = member.id,
                        memberNameAtEvent = cleanedName,
                        updatedByNameAtEvent = LOCAL_ACTOR,
                        kind = BalanceAuditKind.MANUAL_ADJUSTMENT,
                        deltaMinor = currentBalanceMinor - member.currentBalanceMinor,
                        previousBalanceMinor = member.currentBalanceMinor,
                        newBalanceMinor = currentBalanceMinor,
                        reason = reason.trim().ifBlank { "Manual balance update" }.take(120),
                        expenseId = null,
                        createdAtMillis = now,
                    ),
                )
            }
        }
    }

    override suspend fun removeMember(memberId: String) {
        database.withTransaction {
            val member = memberDao.getById(memberId)
                ?.takeIf(MemberEntity::active)
                ?: throw ApnaHisabException("That roommate is no longer active.")
            val now = System.currentTimeMillis()
            memberDao.update(member.copy(active = false, updatedAtMillis = now))
            auditDao.insert(
                BalanceAuditEntity(
                    id = UUID.randomUUID().toString(),
                    roomId = member.roomId,
                    memberId = member.id,
                    memberNameAtEvent = member.name,
                    updatedByNameAtEvent = LOCAL_ACTOR,
                    kind = BalanceAuditKind.MEMBER_REMOVED,
                    deltaMinor = 0L,
                    previousBalanceMinor = member.currentBalanceMinor,
                    newBalanceMinor = member.currentBalanceMinor,
                    reason = "Removed from active roommates; past expenses kept",
                    expenseId = null,
                    createdAtMillis = now,
                ),
            )
        }
    }

    override suspend fun addExpense(expense: NewExpense) {
        val title = expense.title.trim()
        if (title.isEmpty()) throw ApnaHisabException("Enter an expense name.")
        if (title.length > 80) throw ApnaHisabException("Expense names can be up to 80 characters.")
        if (expense.amountMinor <= 0L || expense.amountMinor > MAX_MONEY_MINOR) {
            throw ApnaHisabException("Enter an expense amount greater than ₹0.00.")
        }
        if (expense.category !in EXPENSE_CATEGORIES) throw ApnaHisabException("Choose a valid expense category.")
        if (expense.note.length > 500) throw ApnaHisabException("Notes can be up to 500 characters.")

        database.withTransaction {
            val activeMembers = memberDao.getActiveMembers()
            val activeById = activeMembers.associateBy(MemberEntity::id)
            if (activeMembers.isEmpty()) throw ApnaHisabException("Add a roommate before recording an expense.")
            if (expense.paidByMemberId !in activeById) throw ApnaHisabException("Choose an active payer.")
            if (expense.splitMemberIds.isEmpty() ||
                expense.splitMemberIds.size > MAX_ACTIVE_MEMBERS ||
                expense.splitMemberIds.distinct().size != expense.splitMemberIds.size
            ) {
                throw ApnaHisabException("Select at least one active roommate to split this expense.")
            }
            if (expense.splitMemberIds.any { it !in activeById }) {
                throw ApnaHisabException("All split members must be active roommates.")
            }

            val shares = shareAmounts(expense.amountMinor, expense.splitMemberIds)
            val now = System.currentTimeMillis()
            val expenseId = UUID.randomUUID().toString()
            val payer = activeById.getValue(expense.paidByMemberId)
            expenseDao.insert(
                ExpenseEntity(
                    id = expenseId,
                    roomId = LocalRoomIds.MAIN,
                    title = title,
                    amountMinor = expense.amountMinor,
                    category = expense.category,
                    paidByMemberId = payer.id,
                    paidByNameAtCreation = payer.name,
                    occurredAtMillis = expense.occurredAtMillis,
                    createdAtMillis = now,
                    note = expense.note.trim(),
                ),
            )
            splitDao.insertAll(
                expense.splitMemberIds.map { memberId ->
                    ExpenseSplitEntity(
                        expenseId = expenseId,
                        memberId = memberId,
                        memberNameAtSplit = activeById.getValue(memberId).name,
                        amountMinor = shares.getValue(memberId),
                    )
                },
            )
            expense.splitMemberIds.forEach { memberId ->
                val member = activeById.getValue(memberId)
                val share = shares.getValue(memberId)
                val newBalance = member.currentBalanceMinor - share
                if (newBalance < -MAX_MONEY_MINOR || newBalance > MAX_MONEY_MINOR) {
                    throw ApnaHisabException("This expense would exceed the supported balance range.")
                }
                memberDao.update(member.copy(currentBalanceMinor = newBalance, updatedAtMillis = now))
                auditDao.insert(
                    BalanceAuditEntity(
                        id = UUID.randomUUID().toString(),
                        roomId = member.roomId,
                        memberId = member.id,
                        memberNameAtEvent = member.name,
                        updatedByNameAtEvent = LOCAL_ACTOR,
                        kind = BalanceAuditKind.EXPENSE_SHARE,
                        deltaMinor = -share,
                        previousBalanceMinor = member.currentBalanceMinor,
                        newBalanceMinor = newBalance,
                        reason = title,
                        expenseId = expenseId,
                        createdAtMillis = now,
                    ),
                )
            }
        }
    }

    private fun validateName(name: String): String {
        val cleaned = name.trim()
        if (cleaned.isEmpty()) throw ApnaHisabException("Enter a roommate name.")
        if (cleaned.length > 40) throw ApnaHisabException("Names can be up to 40 characters.")
        return cleaned
    }

    private fun validateBalance(balanceMinor: Long) {
        if (balanceMinor < 0L || balanceMinor > MAX_MONEY_MINOR) {
            throw ApnaHisabException("Balance must be between ₹0.00 and the supported limit.")
        }
    }

    private fun MemberEntity.toDomain() = RoomMember(
        id = id,
        name = name,
        avatarPlaceholder = avatarPlaceholder,
        startingBalanceMinor = startingBalanceMinor,
        currentBalanceMinor = currentBalanceMinor,
        joinedAtMillis = joinedAtMillis,
        active = active,
        sortOrder = sortOrder,
    )

    private fun BalanceAuditEntity.toDomain() = BalanceEvent(
        id = id,
        memberId = memberId,
        memberNameAtEvent = memberNameAtEvent,
        updatedByNameAtEvent = updatedByNameAtEvent,
        kind = kind,
        deltaMinor = deltaMinor,
        previousBalanceMinor = previousBalanceMinor,
        newBalanceMinor = newBalanceMinor,
        reason = reason,
        expenseId = expenseId,
        createdAtMillis = createdAtMillis,
    )

    private companion object {
        const val LOCAL_ACTOR = "This device"
        val EXPENSE_CATEGORIES = setOf("GROCERIES", "FOOD", "UTILITIES", "RENT", "CLEANING", "TRAVEL", "OTHER")
    }
}
