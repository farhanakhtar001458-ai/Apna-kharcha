package com.apnahisab.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.apnahisab.app.ui.screens.ApnaHisabRoot
import com.apnahisab.app.ui.theme.ApnaHisabTheme
import com.apnahisab.app.ui.viewmodel.MainViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as ApnaHisabApplication).container
        setContent {
            ApnaHisabTheme {
                val factory = androidx.compose.runtime.remember(container) {
                    MainViewModelFactory(container)
                }
                val viewModel: MainViewModel = viewModel(factory = factory)
                val state = viewModel.state.collectAsStateWithLifecycle().value
                ApnaHisabRoot(state = state, viewModel = viewModel)
            }
        }
    }
}

private class MainViewModelFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (!modelClass.isAssignableFrom(MainViewModel::class.java)) {
            throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
        return MainViewModel(container) as T
    }
}
