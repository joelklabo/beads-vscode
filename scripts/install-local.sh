#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Find the newest VSIX produced by `npm run package`.
VSIX_FILE=${VSIX_FILE:-$(ls -t beady-*.vsix 2>/dev/null | head -n 1 || true)}
if [[ -z "${VSIX_FILE}" ]]; then
  echo "[install-local] No VSIX found. Run 'npm run package' first." >&2
  exit 1
fi

echo "[install-local] Installing VSIX: ${VSIX_FILE}"

# Resolve VS Code CLI binary.
resolve_cli() {
  if [[ -n "${VSCODE_BIN:-}" ]]; then
    echo "${VSCODE_BIN}"
    return 0
  fi
  for candidate in code-insiders code; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

CLI_BIN=$(resolve_cli || true)
if [[ -z "${CLI_BIN}" ]]; then
  echo "[install-local] Warning: VS Code CLI not found (code/code-insiders). Skipping install + reload." >&2
  exit 0
fi

# Install the extension; fail if install fails.
if ! "$CLI_BIN" --install-extension "${VSIX_FILE}" --force; then
  echo "[install-local] Error: failed to install VSIX via ${CLI_BIN}." >&2
  exit 1
fi

# Reload unless opted out.
if [[ "${NO_RELOAD_AFTER_INSTALL_LOCAL:-0}" == "1" ]]; then
  echo "[install-local] Reload skipped because NO_RELOAD_AFTER_INSTALL_LOCAL=1"
  exit 0
fi

echo "[install-local] Reloading active VS Code window via ${CLI_BIN}..."
if ! "$CLI_BIN" --command workbench.action.reloadWindow; then
  echo "[install-local] Warning: reload command failed; extension is installed but window was not reloaded." >&2
fi
