# Apna AI — web chat workspace

A rebranded, ChatGPT-style chat UI with pluggable API providers. Built as a separate,
independent module: **the Android expense tracker in `app/` is untouched.**

It was reconstructed from static JavaScript/HTML/CSS artifacts using REA — see
[`docs/REA-EVIDENCE.md`](../docs/REA-EVIDENCE.md) for observations, inferences and
limitations. Branding (name, logo, colours) is original; no OpenAI/ChatGPT assets are
used.

## Run it

```sh
cd web
npm start                 # http://localhost:3000
# or: PORT=4173 node server.mjs
```

Zero dependencies — only Node.js 18+ is required. The server binds `0.0.0.0` so it
also works behind the preview proxy.

## Providers

Open **Settings → Provider** (or the avatar / "Configure API provider" link):

| Provider | Endpoint | Notes |
| --- | --- | --- |
| OpenAI-compatible | `<base URL>/chat/completions` | OpenAI, Groq, Together, Fireworks, OpenRouter, Ollama (`http://localhost:11434/v1`), LM Studio, vLLM, LiteLLM… |
| Google Gemini | `:streamGenerateContent?alt=sse` | Uses `models/<model>` from the Gemini API |
| Mock (offline) | none | Local streaming demo replies, no key needed |

You can also set `OPENAI_API_KEY` or `GEMINI_API_KEY` in the **server** environment.
A key entered in the browser is stored in that browser's `localStorage` and sent only
to this local server over a same-origin request; the server never logs it and never
writes it to disk. **Do not expose this server publicly with a shared key** — it is a
local development tool.

If no key is present, the app automatically uses mock mode so the full UI (streaming,
animations, persistence) still works offline.

## Features

- Sidebar with new chat, search, date-grouped history, rename/delete, collapse
- Top model dropdown, share-as-Markdown, avatar/settings entry
- Empty state with an animated morphing-gradient orb and suggestion chips
- Streaming assistant replies (SSE), stop/regenerate, typing caret and dots
- Markdown rendering with fenced code blocks and copy buttons (HTML-escaped)
- Message actions: copy, edit, thumbs up/down, read aloud
- Composer: auto-growing textarea, attach text files, tools, dictation (Web Speech API),
  voice-mode overlay, send button that morphs into a rounded-square stop button
- Dark / light / system themes, persisted locally; reduced-motion support
- Responsive mobile sidebar with scrim
- Keyboard: `Enter` send, `Shift+Enter` newline, `Esc` close, `⌘/Ctrl+K` search,
  `⌘/Ctrl+Shift+O` new chat

## API (local, same-origin)

| Route | Method | Body / response |
| --- | --- | --- |
| `/api/health` | GET | `{ ok, service, version }` |
| `/api/chat` | POST | `{ messages, provider, baseUrl, apiKey, model, temperature, maxTokens, systemPrompt, stream }` → SSE `data: {"type":"delta","text":"…"}` / `{"type":"error","message":"…"}` / `{"type":"done"}` |
| `/api/models` | POST | `{ provider, baseUrl, apiKey }` → `{ models: [...] }` |

Static files are served from this directory with path-traversal protection, `nosniff`,
a same-origin CSP (`frame-ancestors *` for the preview iframe) and no external
scripts/fonts/analytics.

## Checks

```sh
cd web && npm run check     # syntax-only: node --check on server.mjs and app.js
curl -s localhost:3000/api/health
curl -sN -X POST localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Hello"}],"provider":"mock"}'
```

## Known limitations

- Live provider streaming was not verified with a real API key during development.
- Web Speech API dictation needs a browser that supports it (Chrome/Edge) and
  microphone permission.
- This is a UI *pattern* reconstruction from open-source clones, not the live
  `chatgpt.com` bundle; see the evidence report for the exact coverage boundary.
