#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-bootstrap}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_AVAILABLE="/etc/nginx/sites-available/lelefachambers.conf"
SITE_ENABLED="/etc/nginx/sites-enabled/lelefachambers.conf"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo ./scripts/prepare-nginx-host.sh [bootstrap|tls]" >&2
  exit 1
fi

case "${MODE}" in
  bootstrap)
    SOURCE="${REPO_ROOT}/deploy/nginx/lelefachambers-bootstrap.conf"
    ;;
  tls)
    SOURCE="${REPO_ROOT}/deploy/nginx/lelefachambers-production.conf"
    CERT="/etc/letsencrypt/live/lelefachambers.co.ls/fullchain.pem"
    KEY="/etc/letsencrypt/live/lelefachambers.co.ls/privkey.pem"
    if [[ ! -s "${CERT}" || ! -s "${KEY}" ]]; then
      echo "TLS certificate is missing. Run scripts/issue-letsencrypt.sh first." >&2
      exit 1
    fi
    ;;
  *)
    echo "Usage: sudo ./scripts/prepare-nginx-host.sh [bootstrap|tls]" >&2
    exit 2
    ;;
esac

if ! command -v nginx >/dev/null 2>&1; then
  echo "Nginx is not installed on this host." >&2
  exit 1
fi

install -d -m 0755 /var/www/letsencrypt
install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled
install -m 0644 "${SOURCE}" "${SITE_AVAILABLE}"
ln -sfn "${SITE_AVAILABLE}" "${SITE_ENABLED}"

nginx -t
systemctl reload nginx

echo "Lelefa Chambers Nginx ${MODE} configuration enabled successfully."
