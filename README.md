# Apna Hisab

Apna Hisab is a single-device, completely offline roommate expense tracker built with Kotlin, Jetpack Compose, and Android Room (SQLite). All room, roommate, expense, split, and balance-audit data stays in the app's local database. There are no accounts, network calls, synchronization, or cloud services.

> **New in this branch:** `web/` contains **Apna AI**, a separate rebranded ChatGPT-style
> chat workspace with pluggable API providers, streaming replies and animations. It was
> reconstructed from shipped static frontends using the
> [REA (Reverse Engineer Anything)](https://github.com/morluto/rea.git) workflow — see
> [`docs/REA-EVIDENCE.md`](docs/REA-EVIDENCE.md) and [`docs/REA-WORKFLOW.md`](docs/REA-WORKFLOW.md).
> The Android app below is unchanged; the web app is an independent module. Quick start:
> `cd web && npm start` (Node 18+, zero dependencies).
>
> **Also new:** [`carrom/`](carrom/README.md) contains **Apna Carrom**, an original
> offline local 2-player carrom game with an impulse-based rigid-disc physics
> engine (spin, friction, cushions, pockets, anti-tunnelling) and a full match
> rules state machine. **No AI opponent.** Quick start: `cd carrom && npm start`
> then open `http://localhost:3100`. Zero dependencies, Node 18+.

## Requirements

- Android Studio with a JDK 17-compatible Gradle runtime
- Android SDK Platform 35 (the app's `compileSdk`)
- Android 8.0 / API 26 or newer to install the app

No backend, account, configuration JSON, API key, or network permission is needed. A first-time Gradle sync may need a connection to download Android build dependencies; the installed app itself does not need an internet connection and works offline.

## Build and run

1. Open this repository's root directory in Android Studio.
2. Install Android SDK Platform 35 from **Tools → SDK Manager** if it is not already installed.
3. Let Android Studio sync Gradle.
4. Select the `app` run configuration and run it on a device/emulator, or build a debug APK with:

   ```sh
   ./gradlew :app:assembleDebug
   ```

   On Windows, run `gradlew.bat :app:assembleDebug`.

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Install on an Android phone

Enable **Developer options → USB debugging**, connect and authorize the phone, then run:

```sh
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The APK can also be copied to the phone and opened there; Android may ask you to allow installation from that file source.

## Local data and business rules

- Room stores the local room, members, expenses, per-member expense splits, and balance audit entries in `apna_hisab_local.db`.
- The app creates an empty local room on first launch. It does not seed sample roommates or demo expenses.
- Up to four active roommates can be managed on this device. Removed roommates are marked inactive, so historic expenses and audit records remain intact.
- Room total is the sum of active roommates' current balances.
- Expense splits are calculated and stored as integer paise (`Long`). Only selected roommates' balances are reduced; the payer is charged only if selected in the split.
- Manual balance changes are recorded in the local audit history and do not alter old expense records.
- Room database transactions keep the expense, split rows, member balances, and balance audit entries consistent.
- Android's app-private database persists across process/app restarts and phone restarts. Uninstalling the app or clearing its storage deletes the local database; it is not backed up or synchronized elsewhere.

## Project structure

- `data/local/`: Room entities, DAOs, database, and local repository implementation
- `domain/model/` and `domain/repository/`: app models, money rules, and repository contract
- `ui/`: Compose screens, components, ViewModel, and dark matte-blue theme
- `web/`: Apna AI — independent browser chat workspace (static frontend + Node mock/proxy API)
- `carrom/`: Apna Carrom — independent browser 2-player carrom game; see [`carrom/docs/PHYSICS.md`](carrom/docs/PHYSICS.md)
- `docs/` and `tools/`: REA workflow notes and helper script used for the web module
