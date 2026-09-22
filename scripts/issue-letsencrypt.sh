#!/usr/bin/env bash
set -euo pipefail

EMAIL="${LETSENCRYPT_EMAIL:-}"
DOMAINS=(
  "lelefachambers.co.ls"
  "www.lelefachambers.co.ls"
  "api.lelefachambers.co.ls"
)

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo LETSENCRYPT_EMAIL=you@example.com ./scripts/issue-letsencrypt.sh" >&2
  exit 1
fi

if [[ -z "${EMAIL}" ]]; then
  echo "Set LETSENCRYPT_EMAIL to the certificate contact email." >&2
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "Certbot is not installed on this host." >&2
  exit 1
fi

install -d -m 0755 /var/www/letsencrypt

ARGS=(certonly --webroot -w /var/www/letsencrypt --non-interactive --agree-tos --email "${EMAIL}" --cert-name lelefachambers.co.ls)
for domain in "${DOMAINS[@]}"; do
  ARGS+=( -d "${domain}" )
done

certbot "${ARGS[@]}"

CERT="/etc/letsencrypt/live/lelefachambers.co.ls/fullchain.pem"
KEY="/etc/letsencrypt/live/lelefachambers.co.ls/privkey.pem"

if [[ ! -s "${CERT}" || ! -s "${KEY}" ]]; then
  echo "Certificate issuance did not produce the expected files." >&2
  exit 1
fi

echo "Certificate issued for ${DOMAINS[*]}."
echo "Next: sudo ./scripts/prepare-nginx-host.sh tls"
