#!/usr/bin/env bash
# Run the REA (Reverse Engineer Anything) CLI from this workspace.
#
#   tools/rea.sh doctor --json
#   tools/rea.sh analyze-javascript-application /absolute/path/to/app --json
#   tools/rea.sh mcp doctor --json
#
# The CLI is pinned to the version used for the evidence in docs/REA-EVIDENCE.md.
# If the sandbox-local install is missing (node_modules is not committed), npx
# downloads the pinned package from the npm registry on first use.
set -euo pipefail

REA_VERSION="${REA_VERSION:-6.7.0}"
REA_LOCAL="${REA_LOCAL:-$HOME/_tools/rea/node_modules/rea-agents/scripts/rea.mjs}"

if [[ -f "$REA_LOCAL" ]]; then
  exec node "$REA_LOCAL" "$@"
fi

exec npx -y "rea-agents@${REA_VERSION}" "$@"
