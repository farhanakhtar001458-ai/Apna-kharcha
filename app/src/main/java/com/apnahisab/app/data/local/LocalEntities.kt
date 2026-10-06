package com.apnahisab.app.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

object LocalRoomIds {
    const val MAIN = "main-room"
}

@Entity(tableName = "local_rooms")
data class RoomEntity(
    @PrimaryKey val id: String,
    val name: String,
    val createdAtMillis: Long,
    val updatedAtMillis: Long,
)

@Entity(
    tableName = "room_members",
    foreignKeys = [
        ForeignKey(
            entity = RoomEntity::class,
            parentColumns = ["id"],
            childColumns = ["roomId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index(value = ["roomId"]), Index(value = ["active", "sortOrder"])],
)
data class MemberEntity(
    @PrimaryKey val id: String,
    val roomId: String,
    val name: String,
    val avatarPlaceholder: String,
    val startingBalanceMinor: Long,
    val currentBalanceMinor: Long,
    val joinedAtMillis: Long,
    val updatedAtMillis: Long,
    val active: Boolean,
    val sortOrder: Int,
)

@Entity(
    tableName = "expenses",
    foreignKeys = [
        ForeignKey(
            entity = RoomEntity::class,
            parentColumns = ["id"],
            childColumns = ["roomId"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = MemberEntity::class,
            parentColumns = ["id"],
            childColumns = ["paidByMemberId"],
            onDelete = ForeignKey.NO_ACTION,
        ),
    ],
    indices = [Index(value = ["roomId"]), Index(value = ["paidByMemberId"]), Index(value = ["occurredAtMillis"])],
)
data class ExpenseEntity(
    @PrimaryKey val id: String,
    val roomId: String,
    val title: String,
    val amountMinor: Long,
    val category: String,
    val paidByMemberId: String,
    val paidByNameAtCreation: String,
    val occurredAtMillis: Long,
    val createdAtMillis: Long,
    val note: String,
)

@Entity(
    tableName = "expense_splits",
    primaryKeys = ["expenseId", "memberId"],
    foreignKeys = [
        ForeignKey(
            entity = ExpenseEntity::class,
            parentColumns = ["id"],
            childColumns = ["expenseId"],
            onDelete = ForeignKey.NO_ACTION,
        ),
        ForeignKey(
            entity = MemberEntity::class,
            parentColumns = ["id"],
            childColumns = ["memberId"],
            onDelete = ForeignKey.NO_ACTION,
        ),
    ],
    indices = [Index(value = ["expenseId"]), Index(value = ["memberId"])],
)
data class ExpenseSplitEntity(
    val expenseId: String,
    val memberId: String,
    val memberNameAtSplit: String,
    val amountMinor: Long,
)

@Entity(
    tableName = "balance_audits",
    foreignKeys = [
        ForeignKey(
            entity = RoomEntity::class,
            parentColumns = ["id"],
            childColumns = ["roomId"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = MemberEntity::class,
            parentColumns = ["id"],
            childColumns = ["memberId"],
            onDelete = ForeignKey.NO_ACTION,
        ),
        ForeignKey(
            entity = ExpenseEntity::class,
            parentColumns = ["id"],
            childColumns = ["expenseId"],
            onDelete = ForeignKey.NO_ACTION,
        ),
    ],
    indices = [Index(value = ["roomId"]), Index(value = ["memberId"]), Index(value = ["expenseId"]), Index(value = ["createdAtMillis"])],
)
data class BalanceAuditEntity(
    @PrimaryKey val id: String,
    val roomId: String,
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
