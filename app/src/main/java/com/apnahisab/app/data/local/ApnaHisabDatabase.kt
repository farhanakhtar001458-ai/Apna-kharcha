package com.apnahisab.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        RoomEntity::class,
        MemberEntity::class,
        ExpenseEntity::class,
        ExpenseSplitEntity::class,
        BalanceAuditEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class ApnaHisabDatabase : RoomDatabase() {
    abstract fun roomDao(): RoomDao
    abstract fun memberDao(): MemberDao
    abstract fun expenseDao(): ExpenseDao
    abstract fun expenseSplitDao(): ExpenseSplitDao
    abstract fun balanceAuditDao(): BalanceAuditDao

    companion object {
        @Volatile
        private var instance: ApnaHisabDatabase? = null

        fun getInstance(context: Context): ApnaHisabDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                ApnaHisabDatabase::class.java,
                "apna_hisab_local.db",
            ).build().also { instance = it }
        }
    }
}
