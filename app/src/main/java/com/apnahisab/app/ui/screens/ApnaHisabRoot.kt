package com.apnahisab.app.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.apnahisab.app.domain.model.RoomMember
import com.apnahisab.app.ui.screens.forms.MemberEditorDialog
import com.apnahisab.app.ui.screens.forms.RoomNameDialog
import com.apnahisab.app.ui.theme.AccentBlue
import com.apnahisab.app.ui.theme.CardBlue
import com.apnahisab.app.ui.theme.Ink
import com.apnahisab.app.ui.theme.TextPrimary
import com.apnahisab.app.ui.theme.TextSecondary
import com.apnahisab.app.ui.viewmodel.AppEvent
import com.apnahisab.app.ui.viewmodel.AppUiState
import com.apnahisab.app.ui.viewmodel.MainViewModel
import kotlinx.coroutines.flow.collect

private enum class MainTab(val label: String) {
    HOME("Home"), ADD("Add"), CALCULATOR("Calculator"), ROOM("Room"),
}

@Composable
fun ApnaHisabRoot(state: AppUiState, viewModel: MainViewModel) {
    val snackbarHostState = remember { SnackbarHostState() }
    var selectedTab by remember { mutableStateOf(MainTab.HOME) }
    var showMemberDialog by remember { mutableStateOf(false) }
    var editingMember by remember { mutableStateOf<RoomMember?>(null) }
    var removingMember by remember { mutableStateOf<RoomMember?>(null) }
    var showRoomNameDialog by remember { mutableStateOf(false) }

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                AppEvent.ExpenseSaved -> {
                    selectedTab = MainTab.HOME
                    snackbarHostState.showSnackbar("Expense saved on this phone.")
                }
                AppEvent.MemberAdded -> {
                    showMemberDialog = false
                    editingMember = null
                    snackbarHostState.showSnackbar("Roommate added to this phone.")
                }
                AppEvent.MemberUpdated -> {
                    showMemberDialog = false
                    editingMember = null
                    snackbarHostState.showSnackbar("Roommate details saved locally.")
                }
                AppEvent.MemberRemoved -> {
                    removingMember = null
                    snackbarHostState.showSnackbar("Roommate removed. Past expense history was kept.")
                }
                AppEvent.RoomRenamed -> {
                    showRoomNameDialog = false
                    snackbarHostState.showSnackbar("Room name saved locally.")
                }
            }
        }
    }
    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissError()
        }
    }

    Scaffold(
        containerColor = Ink,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar(containerColor = CardBlue, tonalElevation = 0.dp) {
                MainTab.entries.forEach { tab ->
                    val image = when (tab) {
                        MainTab.HOME -> Icons.Filled.Home
                        MainTab.ADD -> Icons.Filled.Add
                        MainTab.CALCULATOR -> Icons.Filled.Calculate
                        MainTab.ROOM -> Icons.Filled.Groups
                    }
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(image, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        if (state.initializing) {
            LoadingScreen(modifier = Modifier.fillMaxSize().padding(padding))
        } else {
            AnimatedContent(
                targetState = selectedTab,
                modifier = Modifier.fillMaxSize().padding(padding),
                transitionSpec = {
                    val forward = targetState.ordinal >= initialState.ordinal
                    val enter = slideInHorizontally(tween(190)) { width -> if (forward) width / 10 else -width / 10 } +
                        fadeIn(tween(170))
                    val exit = slideOutHorizontally(tween(190)) { width -> if (forward) -width / 10 else width / 10 } +
                        fadeOut(tween(140))
                    enter togetherWith exit
                },
                label = "tab-slide",
            ) { tab ->
                val room = state.room
                when (tab) {
                    MainTab.HOME -> HomeScreen(
                        room = room,
                        busy = state.busy,
                        onAddExpense = { selectedTab = MainTab.ADD },
                        onAddMember = {
                            editingMember = null
                            showMemberDialog = true
                        },
                        onEditMember = {
                            editingMember = it
                            showMemberDialog = true
                        },
                    )
                    MainTab.ADD -> AddExpenseScreen(
                        room = room,
                        busy = state.busy,
                        onSave = viewModel::addExpense,
                        onAddMember = {
                            selectedTab = MainTab.ROOM
                            editingMember = null
                            showMemberDialog = true
                        },
                    )
                    MainTab.CALCULATOR -> CalculatorScreen(
                        room = room,
                        onAddMember = {
                            selectedTab = MainTab.ROOM
                            editingMember = null
                            showMemberDialog = true
                        },
                    )
                    MainTab.ROOM -> RoomScreen(
                        room = room,
                        busy = state.busy,
                        onAddMember = {
                            editingMember = null
                            showMemberDialog = true
                        },
                        onEditMember = {
                            editingMember = it
                            showMemberDialog = true
                        },
                        onRemoveMember = { removingMember = it },
                        onRenameRoom = { showRoomNameDialog = true },
                    )
                }
            }
        }
    }

    if (showMemberDialog) {
        MemberEditorDialog(
            member = editingMember,
            activeMemberCount = state.room?.members?.size ?: 0,
            busy = state.busy,
            onDismiss = { if (!state.busy) showMemberDialog = false },
            onSave = { name, balanceMinor, reason ->
                val member = editingMember
                if (member == null) viewModel.addMember(name, balanceMinor)
                else viewModel.editMember(member, name, balanceMinor, reason)
            },
        )
    }

    if (showRoomNameDialog) {
        RoomNameDialog(
            currentName = state.room?.room?.name.orEmpty(),
            busy = state.busy,
            onDismiss = { if (!state.busy) showRoomNameDialog = false },
            onSave = viewModel::renameRoom,
        )
    }

    removingMember?.let { member ->
        AlertDialog(
            onDismissRequest = { if (!state.busy) removingMember = null },
            shape = RoundedCornerShape(24.dp),
            containerColor = CardBlue,
            title = { Text("Remove ${member.name}?", color = TextPrimary, fontWeight = FontWeight.SemiBold) },
            text = {
                Text(
                    "They will no longer count toward the active room balance or new expense splits. Existing expense history and audits will stay on this phone.",
                    color = TextSecondary,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.removeMember(member) }, enabled = !state.busy) {
                    Text(if (state.busy) "Removing…" else "Remove", color = AccentBlue)
                }
            },
            dismissButton = {
                TextButton(onClick = { removingMember = null }, enabled = !state.busy) {
                    Text("Cancel", color = TextSecondary)
                }
            },
        )
    }
}

@Composable
private fun LoadingScreen(modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
        androidx.compose.material3.CircularProgressIndicator(
            modifier = Modifier.padding(24.dp),
            color = AccentBlue,
        )
        Text("Opening your local hisab…", modifier = Modifier.padding(horizontal = 24.dp), color = TextSecondary, fontSize = 14.sp)
    }
}
