#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$RELEASE_DIR"

export PATH="/root/.aztec/bin:/root/.aztec/versions/4.3.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

source "${RUNNER_ENV_FILE:-/opt/dscope/backend/.env.testnet-runner}"

export AZTEC_WALLET_ATTEMPTS="${AZTEC_WALLET_ATTEMPTS:-3}"
export RUNNER_POLL_INTERVAL_SECONDS="${RUNNER_POLL_INTERVAL_SECONDS:-45}"

echo "[dscope-runner] started at $(date -Is)"
echo "[dscope-runner] API=$API"
echo "[dscope-runner] NODE_URL=$NODE_URL"
echo "[dscope-runner] FROM=$FROM"

while true; do
  echo "[dscope-runner] tick $(date -Is)"
  node scripts/testnet-cli-runner-once.mjs || echo "[dscope-runner] run failed at $(date -Is)"
  sleep "$RUNNER_POLL_INTERVAL_SECONDS"
done
