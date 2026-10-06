package com.apnahisab.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.apnahisab.app.AppContainer
import com.apnahisab.app.domain.model.NewExpense
import com.apnahisab.app.domain.model.RoomMember
import com.apnahisab.app.domain.model.RoomSnapshot
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface AppEvent {
    data object ExpenseSaved : AppEvent
    data object MemberAdded : AppEvent
    data object MemberUpdated : AppEvent
    data object MemberRemoved : AppEvent
    data object RoomRenamed : AppEvent
}

data class AppUiState(
    val initializing: Boolean = true,
    val room: RoomSnapshot? = null,
    val busy: Boolean = false,
    val errorMessage: String? = null,
)

class MainViewModel(private val container: AppContainer) : ViewModel() {
    private val repository = container.roomRepository
    private val _state = MutableStateFlow(AppUiState())
    val state = _state.asStateFlow()

    private val _events = MutableSharedFlow<AppEvent>(extraBufferCapacity = 8)
    val events = _events.asSharedFlow()

    init {
        viewModelScope.launch {
            try {
                repository.ensureLocalRoom()
                repository.observeSnapshot().collect { room ->
                    _state.update { it.copy(initializing = false, room = room) }
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                _state.update {
                    it.copy(
                        initializing = false,
                        errorMessage = error.message ?: "Could not open the local database.",
                    )
                }
            }
        }
    }

    fun addMember(name: String, startingBalanceMinor: Long) {
        perform(AppEvent.MemberAdded) { repository.addMember(name, startingBalanceMinor) }
    }

    fun editMember(member: RoomMember, name: String, currentBalanceMinor: Long, reason: String) {
        perform(AppEvent.MemberUpdated) {
            repository.editMember(member.id, name, currentBalanceMinor, reason)
        }
    }

    fun removeMember(member: RoomMember) {
        perform(AppEvent.MemberRemoved) { repository.removeMember(member.id) }
    }

    fun renameRoom(name: String) {
        perform(AppEvent.RoomRenamed) { repository.renameRoom(name) }
    }

    fun addExpense(expense: NewExpense) {
        perform(AppEvent.ExpenseSaved) { repository.addExpense(expense) }
    }

    fun dismissError() {
        _state.update { it.copy(errorMessage = null) }
    }

    private fun perform(successEvent: AppEvent, action: suspend () -> Unit) {
        if (_state.value.busy) return
        viewModelScope.launch {
            _state.update { it.copy(busy = true, errorMessage = null) }
            try {
                action()
                _state.update { it.copy(busy = false) }
                _events.emit(successEvent)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                _state.update {
                    it.copy(
                        busy = false,
                        errorMessage = error.message ?: "Unable to save your changes. Please try again.",
                    )
                }
            }
        }
    }
}
