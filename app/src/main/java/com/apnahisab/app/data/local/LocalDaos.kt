package com.apnahisab.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface RoomDao {
    @Query("SELECT * FROM local_rooms WHERE id = :id LIMIT 1")
    fun observeRoom(id: String): Flow<RoomEntity?>

    @Query("SELECT * FROM local_rooms WHERE id = :id LIMIT 1")
    suspend fun getRoom(id: String): RoomEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(room: RoomEntity)

    @Query("UPDATE local_rooms SET name = :name, updatedAtMillis = :updatedAtMillis WHERE id = :id")
    suspend fun updateName(id: String, name: String, updatedAtMillis: Long): Int
}

@Dao
interface MemberDao {
    @Query("SELECT * FROM room_members ORDER BY sortOrder ASC, joinedAtMillis ASC")
    fun observeAll(): Flow<List<MemberEntity>>

    @Query("SELECT * FROM room_members WHERE active = 1 ORDER BY sortOrder ASC, joinedAtMillis ASC")
    suspend fun getActiveMembers(): List<MemberEntity>

    @Query("SELECT * FROM room_members WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): MemberEntity?

    @Query("SELECT COUNT(*) FROM room_members WHERE active = 1")
    suspend fun countActive(): Int

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(member: MemberEntity)

    @Update
    suspend fun update(member: MemberEntity)
}

@Dao
interface ExpenseDao {
    @Query("SELECT * FROM expenses ORDER BY occurredAtMillis ASC, createdAtMillis ASC, id ASC")
    fun observeAll(): Flow<List<ExpenseEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(expense: ExpenseEntity)
}

@Dao
interface ExpenseSplitDao {
    @Query("SELECT * FROM expense_splits ORDER BY expenseId ASC, memberId ASC")
    fun observeAll(): Flow<List<ExpenseSplitEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertAll(splits: List<ExpenseSplitEntity>)
}

@Dao
interface BalanceAuditDao {
    @Query("SELECT * FROM balance_audits ORDER BY createdAtMillis DESC, id DESC")
    fun observeAll(): Flow<List<BalanceAuditEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(audit: BalanceAuditEntity)
}
