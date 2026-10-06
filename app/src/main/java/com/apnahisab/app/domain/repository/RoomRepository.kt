package com.apnahisab.app.domain.repository

import com.apnahisab.app.domain.model.NewExpense
import com.apnahisab.app.domain.model.RoomSnapshot
import kotlinx.coroutines.flow.Flow

interface RoomRepository {
    fun observeSnapshot(): Flow<RoomSnapshot?>
    suspend fun ensureLocalRoom()
    suspend fun renameRoom(name: String)
    suspend fun addMember(name: String, startingBalanceMinor: Long)
    suspend fun editMember(memberId: String, name: String, currentBalanceMinor: Long, reason: String)
    suspend fun removeMember(memberId: String)
    suspend fun addExpense(expense: NewExpense)
}
