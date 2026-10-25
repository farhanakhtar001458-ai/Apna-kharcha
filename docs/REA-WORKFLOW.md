# Working with REA in this repository

[REA (Reverse Engineer Anything)](https://github.com/morluto/rea.git) is the workflow
skill used to produce `web/`. Its rules are simple and worth keeping:

1. **Route the target first.** A shipped JS/HTML/CSS tree →
   `analyze-javascript-application`. An APK's code → `inspect_android_package`
   (needs caller-supplied JADX + Java). A native binary → `open_binary`
   (needs Hopper/Ghidra/IDA). For an ordinary source repository, **skip REA** and use
   normal repository tools.
2. **Work summary-first.** Start with the default result, then inspect retained
   Evidence views only for a specific unanswered question.
3. **Separate observations, inferences and unknowns.** Cite Evidence IDs, preserve
   limitations, never describe static analysis as runtime observation.
4. **Finish the task.** When the user asks to build something, switch to normal coding
   tools and clearly separate observed behaviour from design choices.

## What is installed here

| Path | Purpose |
| --- | --- |
| `tools/rea.sh` | Version-pinned CLI wrapper (`tools/rea.sh <command> …`) |
| `.mcp.json` | Portable, version-pinned MCP stdio registration for agents that read repo-level MCP config |
| `docs/REA-EVIDENCE.md` | The investigation report that produced `web/` |
| `~/.agents/skills/reverse-engineer-anything/` | Installed skill (also mirrored to `~/.claude/skills/`) |
| `~/.codex/config.toml`, `~/.claude.json` | Local MCP registrations created by `rea setup --client codex --client claude_code --yes` |

The npm package itself lives in `/home/user/_tools/rea/node_modules` and is **not**
committed. If it is missing, `tools/rea.sh` falls back to
`npx -y rea-agents@6.7.0`. Reinstall with:

```sh
mkdir -p "$HOME/_tools/rea" && cd "$HOME/_tools/rea"
printf '{"name":"rea-local-install","private":true}\n' > package.json
npm install --no-audit --no-fund rea-agents@6.7.0
```

## Useful commands

```sh
tools/rea.sh doctor --json                         # registration + provider health
tools/rea.sh mcp doctor --json                    # verify the MCP server starts
tools/rea.sh capabilities --json                  # which providers work on this host
tools/rea.sh analyze-javascript-application /absolute/path --json > evidence.json
tools/rea.sh setup --client codex --dry-run --json   # read-only plan first
tools/rea.sh setup --client codex --yes              # apply after review
```

## Environment limits in this sandbox

- Node `v22.22.3` works with the published `rea-agents@6.7.0` (`engines:
  ^22.19.0 || ^24.11.0 || >=26.0.0`). Repository `main` is newer and asks for
  `^22.23.4`; pin the npm version instead of building from source here.
- Available without extra engines: static JavaScript/Electron/HTML analysis,
  artifact/archive inventory, managed PE/CLI metadata, pure parsers.
- Missing: Java, JADX, apktool, Hopper, Ghidra, IDA, Kuna, Android SDK. Therefore
  APK **code** decompilation and native-binary analysis are unavailable. `rea doctor`
  will keep reporting `environment_healthy: false`; that is expected.
- Never run `rea setup` with `--install-hopper` or install unrelated toolchains as a
  "fix" — REA's own rules forbid it.

## Reproducing the chat-UI investigation

```sh
git clone --depth 1 https://github.com/xtekky/chatgpt-clone.git /tmp/xtekky
git clone --depth 1 https://github.com/ahmershahdev/chatgpt_frontend_clone.git /tmp/ahmershah
tools/rea.sh analyze-javascript-application /tmp/xtekky/client --json > /tmp/xtekky.json
tools/rea.sh analyze-javascript-application /tmp/ahmershah --json > /tmp/ahmershah.json
```

Then compare the returned `evidence_id`, `normalized_result.graph.nodes`, `limitations`
and `locations` with `docs/REA-EVIDENCE.md`.
