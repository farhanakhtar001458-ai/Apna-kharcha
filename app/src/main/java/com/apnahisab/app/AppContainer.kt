package com.apnahisab.app

import android.content.Context
import com.apnahisab.app.data.local.ApnaHisabDatabase
import com.apnahisab.app.data.local.LocalRoomRepository
import com.apnahisab.app.domain.repository.RoomRepository

class AppContainer(context: Context) {
    private val database = ApnaHisabDatabase.getInstance(context.applicationContext)
    val roomRepository: RoomRepository = LocalRoomRepository(database)
}
