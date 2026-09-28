#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
SOURCE="$ROOT_DIR/scripts/pull-chambers"
TARGET="/usr/local/bin/pull-chambers"

if [[ ! -f "$SOURCE" ]]; then
  echo "Missing $SOURCE" >&2
  exit 1
fi

chmod +x "$SOURCE"

if [[ -w "$(dirname "$TARGET")" ]]; then
  ln -sfn "$SOURCE" "$TARGET"
else
  sudo ln -sfn "$SOURCE" "$TARGET"
fi

echo "Installed: $TARGET -> $SOURCE"
echo "Usage: pull-chambers latest"
echo "Rollback: pull-chambers <full-40-character-release-sha>"
