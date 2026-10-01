#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$RELEASE_DIR"

# v19.6.2: systemd-safe PATH bootstrap
export PATH="${RUNNER_PATH:-/root/.aztec/current/bin:/root/.aztec/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}:$PATH"


if [[ -f ".env.testnet-runner" ]]; then
  set -a
  source ".env.testnet-runner"
  set +a

  if [[ -n "${RUNNER_PATH:-}" ]]; then
    export PATH="${RUNNER_PATH}:$PATH"
  else
    export PATH="/root/.aztec/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
  fi
fi

API="${API:-https://app.dscope.app}"
NODE_URL="${NODE_URL:-${AZTEC_NODE_URL:-}}"
AZTEC_NODE_URL="${AZTEC_NODE_URL:-$NODE_URL}"
FROM="${FROM:-${AZTEC_FROM_ALIAS:-}}"
NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"

export API NODE_URL AZTEC_NODE_URL FROM NODE_OPTIONS

fail() {
  echo "[preflight:fail] $*" >&2
  exit 1
}

ok() {
  echo "[preflight:ok] $*"
}

command -v node >/dev/null || fail "node not found"
command -v aztec >/dev/null || fail "aztec not found"
command -v aztec-wallet >/dev/null || fail "aztec-wallet not found"
command -v curl >/dev/null || fail "curl not found"

[[ -n "$API" ]] || fail "API is empty"
[[ -n "$NODE_URL" ]] || fail "NODE_URL/AZTEC_NODE_URL is empty"
[[ -n "$FROM" ]] || fail "FROM/AZTEC_FROM_ALIAS is empty"
[[ "$FROM" != "accounts:dscope-runner" ]] || fail "stale FROM alias: accounts:dscope-runner"
[[ "$FROM" == "accounts:test0" ]] || fail "unexpected FROM=$FROM, expected accounts:test0 for current testnet runner"

TOKEN="${TOKEN:-${INTERNAL_RUNNER_TOKEN:-}}"
INTERNAL_RUNNER_TOKEN="${INTERNAL_RUNNER_TOKEN:-$TOKEN}"
export TOKEN INTERNAL_RUNNER_TOKEN

[[ -n "${INTERNAL_RUNNER_TOKEN:-}" ]] || fail "INTERNAL_RUNNER_TOKEN is empty"
[[ -n "${TOKEN:-}" ]] || fail "TOKEN is empty"
[[ "${SPONSORED_FPC_ADDRESS:-}" =~ ^0x[0-9a-fA-F]{64}$ ]] || fail "SPONSORED_FPC_ADDRESS invalid or empty"
[[ "${PAY:-}" == *"fpc-sponsored"* ]] || fail "PAY does not use fpc-sponsored"
[[ "${PAY:-}" == *"${SPONSORED_FPC_ADDRESS}"* ]] || fail "PAY does not include SPONSORED_FPC_ADDRESS"

AZTEC_VERSION="$(aztec --version 2>/dev/null | tail -n1 | tr -d '\r')"
WALLET_VERSION="$(aztec-wallet --version 2>/dev/null | tail -n1 | tr -d '\r')"

EXPECTED_AZTEC_VERSION="${EXPECTED_AZTEC_VERSION:-5.2.0}"
[[ "$AZTEC_VERSION" == *"$EXPECTED_AZTEC_VERSION"* ]] || fail "unexpected aztec version: $AZTEC_VERSION (expected $EXPECTED_AZTEC_VERSION)"
[[ "$WALLET_VERSION" == *"$EXPECTED_AZTEC_VERSION"* ]] || fail "unexpected aztec-wallet version: $WALLET_VERSION (expected $EXPECTED_AZTEC_VERSION)"

curl -4 -sS -m 15 -I "$NODE_URL" >/dev/null || fail "Aztec RPC not reachable over IPv4"
curl -4 -fsS -m 15 "$API/mvp/surveys?status=all&limit=1" >/dev/null || fail "D-Scope API not reachable"

CORE_ARTIFACT="${CORE_ARTIFACT:-/opt/dscope/contracts/dscope_core/target/dscope_core-DScopeCore.json}"
[[ -s "$CORE_ARTIFACT" ]] || fail "DScopeCore artifact missing: $CORE_ARTIFACT"
GATE_ARTIFACT="${GATE_ARTIFACT:-/opt/dscope/contracts/participation_gate_v2/target/participation_gate_v2-ParticipationGateV2.json}"
[[ -s "$GATE_ARTIFACT" ]] || fail "ParticipationGateV2 artifact missing: $GATE_ARTIFACT"
FACTORY_ARTIFACT="${FACTORY_ARTIFACT:-/opt/dscope/contracts/survey_factory/target/survey_factory-SurveyFactory.json}"
[[ -s "$FACTORY_ARTIFACT" ]] || fail "SurveyFactory artifact missing: $FACTORY_ARTIFACT"

node --check scripts/testnet-cli-runner-once.mjs >/dev/null || fail "runner once syntax check failed"

ok "API=$API"
ok "NODE_URL=$NODE_URL"
ok "FROM=$FROM"
ok "aztec=$AZTEC_VERSION"
ok "wallet=$WALLET_VERSION"
ok "runner preflight passed"
