#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$RELEASE_DIR"

# v19.6.2: systemd-safe PATH bootstrap
export PATH="${RUNNER_PATH:-/root/.aztec/current/bin:/root/.aztec/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}:$PATH"


load_runner_env() {
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

  export API="${API:-https://app.dscope.app}"
  export NODE_URL="${NODE_URL:-${AZTEC_NODE_URL:-}}"
  export AZTEC_NODE_URL="${AZTEC_NODE_URL:-$NODE_URL}"

  export AZTEC_FROM_ALIAS="${AZTEC_FROM_ALIAS:-${FROM:-accounts:test0}}"
  export FROM="${FROM:-$AZTEC_FROM_ALIAS}"

  export INTERNAL_RUNNER_TOKEN="${INTERNAL_RUNNER_TOKEN:-${TOKEN:-}}"
  export TOKEN="${TOKEN:-$INTERNAL_RUNNER_TOKEN}"

  export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"
}

LOOP_SLEEP="${RUNNER_LOOP_SLEEP_SECONDS:-60}"
PREFLIGHT_FAIL_SLEEP="${RUNNER_PREFLIGHT_FAIL_SLEEP_SECONDS:-120}"
JOB_FAIL_SLEEP="${RUNNER_JOB_FAIL_SLEEP_SECONDS:-90}"
MAX_CONSECUTIVE_FAILURES="${RUNNER_MAX_CONSECUTIVE_FAILURES:-5}"

failures=0

echo "[runner-loop] started at $(date -Is)"
echo "[runner-loop] loop_sleep=${LOOP_SLEEP}s preflight_fail_sleep=${PREFLIGHT_FAIL_SLEEP}s job_fail_sleep=${JOB_FAIL_SLEEP}s"

while true; do
  load_runner_env

  echo "[runner-loop] tick $(date -Is)"
  echo "[runner-loop] env API=${API} NODE_URL=${NODE_URL} FROM=${FROM} TOKEN_SET=$([[ -n "${TOKEN:-}" ]] && echo yes || echo no)"

  if ! bash scripts/testnet-runner-preflight.sh; then
    echo "[runner-loop] preflight failed, sleeping ${PREFLIGHT_FAIL_SLEEP}s"
    sleep "$PREFLIGHT_FAIL_SLEEP"
    continue
  fi

  node scripts/testnet-cli-runner-once.mjs
  code=$?

  if [[ "$code" -eq 0 ]]; then
    failures=0
    echo "[runner-loop] runner once ok, sleeping ${LOOP_SLEEP}s"
    sleep "$LOOP_SLEEP"
    continue
  fi

  failures=$((failures + 1))
  echo "[runner-loop] runner once failed with code=$code consecutive_failures=$failures"

  if [[ "$failures" -ge "$MAX_CONSECUTIVE_FAILURES" ]]; then
    echo "[runner-loop] too many failures, cooling down 300s"
    sleep 300
    failures=0
  else
    sleep "$JOB_FAIL_SLEEP"
  fi
done
