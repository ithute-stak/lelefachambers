#!/usr/bin/env bash
set -euo pipefail

EXPECTED_IP="${EXPECTED_VPS_IP:-}"
DOMAINS=(
  "lelefachambers.co.ls"
  "www.lelefachambers.co.ls"
  "api.lelefachambers.co.ls"
)

if [[ -z "${EXPECTED_IP}" ]]; then
  echo "Set EXPECTED_VPS_IP before running this check." >&2
  echo "Example: EXPECTED_VPS_IP=203.0.113.10 bash scripts/check-production-dns.sh" >&2
  exit 1
fi

failed=0
for domain in "${DOMAINS[@]}"; do
  addresses="$(getent ahostsv4 "${domain}" 2>/dev/null | awk '{print $1}' | sort -u || true)"
  if [[ -z "${addresses}" ]]; then
    echo "FAIL ${domain}: no IPv4 address resolved"
    failed=1
    continue
  fi
  if grep -Fxq "${EXPECTED_IP}" <<<"${addresses}"; then
    echo "OK   ${domain} -> ${EXPECTED_IP}"
  else
    echo "FAIL ${domain}: resolved to [$(tr '\n' ' ' <<<"${addresses}")] expected ${EXPECTED_IP}"
    failed=1
  fi
done

if [[ "${failed}" -ne 0 ]]; then
  echo "DNS preflight failed. Do not request the certificate yet." >&2
  exit 1
fi

echo "DNS preflight passed for all Lelefa Chambers production hostnames."
