#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
CHAMBERS_SOURCE="$ROOT_DIR/scripts/pull-chambers"
CHAMBERS_TARGET="/usr/local/bin/pull-chambers"
GLOBAL_PULL="/usr/local/bin/pull"
BASE_DIR="/usr/local/libexec"
BASE_PULL="$BASE_DIR/pull-before-chambers"
MARKER="LELEFA_CHAMBERS_DISPATCH_WRAPPER=1"

run_root() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

if [[ ! -f "$CHAMBERS_SOURCE" ]]; then
  echo "Missing $CHAMBERS_SOURCE" >&2
  exit 1
fi

chmod +x "$CHAMBERS_SOURCE"
run_root ln -sfn "$CHAMBERS_SOURCE" "$CHAMBERS_TARGET"

existing_pull="$(type -P pull || true)"
if [[ -n "$existing_pull" ]] && [[ -f "$existing_pull" ]]; then
  if ! grep -q "$MARKER" "$existing_pull" 2>/dev/null; then
    run_root mkdir -p "$BASE_DIR"
    run_root cp "$existing_pull" "$BASE_PULL"
    run_root chmod +x "$BASE_PULL"
    echo "Preserved existing global pull command: $existing_pull -> $BASE_PULL"
  fi
fi

if [[ ! -x "$BASE_PULL" ]]; then
  echo "Could not preserve the existing global pull dispatcher." >&2
  echo "Expected an executable pull command (currently used for LoanHub/Ithute)." >&2
  exit 1
fi

tmp="$(mktemp)"
cat >"$tmp" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
LELEFA_CHAMBERS_DISPATCH_WRAPPER=1
BASE_PULL="/usr/local/libexec/pull-before-chambers"
CHAMBERS_PULL="/usr/local/bin/pull-chambers"

system="${1:-}"
release="${2:-latest}"

case "$system" in
  chambers|lelefachambers|lelefa-chambers)
    shift || true
    exec "$CHAMBERS_PULL" "$release" "${@:2}"
    ;;
  *)
    exec "$BASE_PULL" "$@"
    ;;
esac
WRAPPER

run_root install -m 0755 "$tmp" "$GLOBAL_PULL"
rm -f "$tmp"

echo "Installed Chambers release helper: $CHAMBERS_TARGET -> $CHAMBERS_SOURCE"
echo "Extended existing global pull dispatcher without replacing LoanHub/Ithute behavior."
echo "Usage:"
echo "  pull chambers latest"
echo "  pull chambers <full-40-character-release-sha>"
echo "Existing commands remain available, e.g.:"
echo "  pull loanhub latest"
echo "  pull ithute latest"
