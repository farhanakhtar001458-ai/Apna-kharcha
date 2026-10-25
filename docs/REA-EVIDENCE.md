# REA investigation report — ChatGPT-style UI reconstruction

This document follows the workflow installed from [`morluto/rea`](https://github.com/morluto/rea.git)
(skill `reverse-engineer-anything`, version 49; CLI/MCP package `rea-agents@6.7.0`).
Every claim below is labelled **observed**, **inferred**, or **unknown**. Evidence IDs
come from REA's own Evidence records; REA analysis is static and inert — it never
executes the target.

## 1. Question / scope

> "ChatGPT ka same UI, bas logo change aur name, baki sab same — API provider add karo,
> aur saare buttons / shape animation same."

Deliverable: a runnable chat workspace in `web/` with the same interaction shape,
rebranded as **Apna AI**, with pluggable API providers. The original Android expense
tracker (`app/`) is untouched.

## 2. Authority and setup actually performed

| Item | Value |
| --- | --- |
| REA source | `morluto/rea` @ `475f09d5ca4f854cbc634074d5534717d58c6664` |
| Installed package | `rea-agents@6.7.0` (npm), Node `v22.22.3` |
| CLI | `/home/user/_tools/rea/node_modules/rea-agents/scripts/rea.mjs` |
| `rea mcp doctor --json` | healthy, `207/207` tools, `6/6` prompts, protocol `2025-11-25` |
| MCP registration | `codex` (`~/.codex/config.toml`) + `claude_code` (`~/.claude.json`) |
| Skill installed | `~/.agents/skills/reverse-engineer-anything/`, `~/.claude/skills/reverse-engineer-anything/` |
| Repo-level registration | `.mcp.json` (portable, version-pinned stdio) |
| Wrapper | `tools/rea.sh` |

`rea doctor --client codex` reports `healthy: true` for the client scope. The
environment-wide doctor remains `environment_healthy: false` because Hopper, Ghidra,
IDA, JADX and Kuna are **not** installed here. Those providers are irrelevant to static
JavaScript analysis but they do mean native-binary/APK *code decompilation* is unavailable
in this sandbox. Java/JADX are also absent, so Android APK analysis was not attempted.

## 3. Artifacts examined

`chatgpt.com` and its CDN are not reachable from this sandbox. The target was therefore
reconstructed from two **public open-source ChatGPT-UI clones** shipped as static
frontends. This is a substitute artifact, not the live ChatGPT web app — see §6.

| Artifact | Commit | Files / SHA-256 |
| --- | --- | --- |
| `xtekky/chatgpt-clone` (`client/`) | `63b242c2054e0c183ff25cf7e7819962c1a452c9` | `html/index.html` `4c2f292f…`, `css/style.css` `0029b3d0…`, `js/chat.js` `275cf32a…`, `js/icons.js`, `js/highlight.min.js` |
| `ahmershahdev/chatgpt_frontend_clone` | `e4df72341f49452319d83a3ba52e11a16cdac71f` | `index.html` `daee5558…`, `styles/style.css` `37f9ad7d…`, `scripts/script.js` `28c370b1…` |

REA Evidence records (saved outside the repo at `/home/user/_tools/rea-evidence/`):

| Command | Evidence ID | Graph |
| --- | --- | --- |
| `rea analyze-javascript-application /…/xtekky-chatgpt-clone/client --json` | `ev_618835f51c40611e82dd292f35a4c239b6753721297d9cde03ace134fa07e662` | 20 nodes (5 JS modules, 4 JS assets, 1 endpoint, 6 storage, 1 renderer, 1 unknown, 2 artifacts) |
| `rea analyze-javascript-application /…/ahmershahdev-chatgpt_frontend_clone --json` | `ev_3d65db0db7c901f6951e11ac96cf15dbd8c47eb92cf9062020840da38609156f` | 5 nodes |
| `rea analyze-javascript-application /…/expense-web --json` (CLI smoke fixture) | `ev_fe17d541f6975cbf5ccce466e553a6998b0043c5aac05a15644ddc4571f18c42` | 5 nodes |
| `rea analyze-javascript-application /…/Apna-kharcha/web --json` (rebuilt artifact, post-build check) | `ev_0b4031b836335c6605325c9990301b268b55719cbd06156690ed5ae3a6526b2a` | 28 nodes / 37 edges: `/api/chat`, `/api/models` endpoints, 3 localStorage mechanisms, 12 JS modules |

REA's own limitations on these records (paraphrased): *"JavaScript and HTML were parsed
as inert text; bundle bootstrap code was never executed"*, *"static imports, entrypoints,
endpoints and storage relationships do not prove runtime execution"*, *"graph coverage is
incomplete; unavailable facts remain explicit and must not be read as absence"*.

## 4. Observations (with locations)

**Layout and controls — observed** (`xtekky/.../html/index.html`):
a left `conversations` panel with `New conversation` button, conversation list, bottom
info/settings rows; a centre `messages` region; a `user-input` composer with a
`textarea#message-input`, `div#send-button`, a model `<select>` (`gpt-4o` selected),
theme radio buttons (`light`, `pink`, `blue`, `green`, `dark`), a `stop_generating`
button and a `mobile-sidebar` toggle.

**Layout and controls — observed** (`ahmershahdev/.../index.html`):
top navigation with model/agent dropdown (`chatgpt-dropdown-button`, `agent-dropdown`,
`dropdown-card`, `mega-menu`), a central heading, an `input-box` composer with
`fa-paperclip` (attach), `fa-microphone` (dictate), `fa-arrow-up` (`sendIcon`),
`voiceIcon`, and a bottom `footer` disclaimer. Interaction affordances are hover-based
dropdowns and 0.2s transitions.

**Network + persistence — observed by REA** (`ev_6188…`, `js/chat.js`):
- Endpoint node `network / [literal, "/backend-api/v2/conversation"]`, mechanism
  `call:fetch`, exact source range lines 114–141; `accept: text/event-stream` at line 119.
- Streaming is read with `response.body.getReader()` + `TextDecoder` (lines ~145+).
- `localStorage` nodes: `getItem`, `setItem`, `removeItem`, `clear`, `key`, and a named
  `theme` key; conversation records are stored under `conversation:<id>` (lines 273,
  304, 343, 349–384, 527–549).
- An `unknown` node records two unanalysed inline scripts in `index.html` (lines 21, 60)
  and a `not-found` script reference `/assets/js/chat.js` — an explicit coverage gap.

**Animation vocabulary — observed** (`xtekky/.../css/style.css`):
- `show_message` — `0.6s`, from `translateY(10px)` + `opacity: 0` (lines 203–210).
- `show_popup` / `hide_popup` — `0.4s`, same translateY/opacity pair (lines 305–323).
- `blink` — `0.8s infinite` caret (lines 497–503).
- `spinner` — `.6s linear infinite`, `rotate(360deg)` (lines 538–556).
- `zoom_gradient` — `6s infinite` ambient background (line 132).
- Interactive transitions — `0.33s` on send button + sidebar; `0.2s` on hover in the
  second clone; a toggle thumb `translateX(calc(100% + 1.125em))` (lines 655–660),
  `transition: background-color 200ms ease, transform 200ms ease-out` (line 673).

## 5. Inferences (design decisions, not observed facts)

1. The two artifacts converge on a three-region shell (sidebar / scrollback / sticky
   composer) — that is the stable structural core worth reconstructing.
2. SSE streaming + an abortable client-side reader is the mechanism behind the typing
   animation; a local proxy can reproduce it for any OpenAI-compatible provider.
3. `localStorage` keyed by conversation ID and a `theme` key is sufficient for local
   persistence; no account or backend is required.
4. The "shape animation" in the request maps to (a) the circular send button morphing
   into a rounded-square stop button, and (b) an ambient morphing gradient orb. REA
   found the former's 0.33s transition boundary; the orb is an original addition, not
   copied from either clone.

## 6. Unknowns / limitations — read before claiming fidelity

- **Not the live ChatGPT app.** `chatgpt.com`, its CDN bundles and its current UI were
  **not** fetched. The reference clones are from 2024 and early 2026 and reproduce an
  older ChatGPT look. Current model names, exact icon geometry, spacing, typography,
  and newer animations are **unknown**, not verified.
- No runtime observation was performed. REA's browser/Electron capture tools were not
  run; all findings are static source/CSS/JS observations.
- No provider API call was made with a real key during development (none was available).
  The proxy code is source-verified, not live-provider verified.
- No OpenAI/ChatGPT logo, wordmark, font, or asset is used. Branding is original
  ("Apna AI", custom SVG mark). This is a UI *pattern* reconstruction, not a copy of
  proprietary assets.
- The Android app was not built (no Android SDK/Java in this environment).

## 7. Reconstruction ledger

| Observed feature | Evidence | Implementation |
| --- | --- | --- |
| Sidebar, new chat, grouped history, footer settings | `xtekky index.html`; `ev_6188…` | `web/index.html` `aside.sidebar`, `web/app.js` `renderChatList()` |
| Conversation persistence + theme key | `ev_6188…` storage nodes | `web/app.js` `KEYS`, `saveConversations()`, `applyTheme()` |
| Streaming SSE reader + abort | `ev_6188…` endpoint node, `chat.js:114–141` | `web/app.js` `readSse()`; `web/server.mjs` `sseFrames()` |
| Model dropdown / agent menu | `ahmershahdev index.html` | `web/index.html` `#modelMenu`, `web/app.js` `renderModelMenu()` |
| Composer: attach, mic, arrow-up send, tools | both artifacts | `web/index.html` `.composer`, `web/app.js` `handleFiles()`, `startRecognition()` |
| `show_message`, `show_popup`, `hide_popup`, `blink`, `spinner`, `zoom_gradient`, 0.2s/0.33s transitions | `xtekky style.css` lines above | `web/styles.css` keyframes block, header comment cites exact values |
| Send → stop shape morph | `xtekky style.css:673` + stop button | `web/styles.css` `.send-btn.generating`, `web/app.js` `setGenerating()` |
| Mock mode / provider switching (new requirement) | — (design) | `web/server.mjs` `streamMock()`, `streamOpenAICompatible()`, `streamGemini()`; settings modal |

## 8. Verification performed

- `rea mcp doctor --json` → healthy; 207 tools, 6 prompts, catalog digest matched.
- `rea doctor --client codex` → `healthy: true` for the configured client scope.
- `rea analyze-javascript-application` on three local targets → valid Evidence records
  with digests, limitations and graph nodes (fixture smoke test included).
- `node --check` on `web/server.mjs` and `web/app.js`; CSS brace balance and HTML tag
  balance checks.
- Local HTTP smoke tests: `/` (200, CSP `frame-ancestors *`), `/styles.css`, `/app.js`,
  `/favicon.svg`, `/api/health`, `/api/chat` mock SSE (145 deltas + `done`), non-stream
  mock, `/api/models` without a key (400), invalid JSON (400), encoded path traversal
  (403), NUL in path (400), unknown API route (404).
- **Proxy path verified end-to-end** against a local fake OpenAI-compatible server:
  upstream SSE deltas → local proxy → normalized client SSE (`Hello from the fake
  provider!`), plus `/api/models` returning the upstream model list.
- **Browser-less DOM smoke test** (jsdom, run in the sandbox): 27 assertions passed —
  initial empty state, streaming render, conversation persistence, copy/edit/regenerate
  wiring, new chat, suggestion chips, model dropdown, settings save + provider
  persistence, theme toggle, voice overlay, and `Ctrl+K` search focus. Zero console
  errors or unhandled rejections. The test harness is not committed (it needs jsdom,
  while the app itself has zero dependencies).
- Post-build REA analysis of `web/` produced the Evidence ID listed in §3 with the
  expected `/api/chat` and `/api/models` endpoints and localStorage mechanisms.
- **Not verified:** live provider streaming with a real API key, a real-browser visual
  regression (no browser binary in this sandbox), Android build, or any claim about the
  current production ChatGPT UI.
