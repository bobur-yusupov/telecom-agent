#!/usr/bin/env bash
# Run the Mirzo eval suite against an ephemeral in-memory Postgres instance.
#
# Usage:
#   ./scripts/eval.sh                              # full suite
#   ./scripts/eval.sh tests/scenarios.eval.ts      # one file
#   ./scripts/eval.sh -t "resolveCancellation"     # one test by name
#   EVAL_TURN_DELAY_MS=0 ./scripts/eval.sh         # paid API tier — no pacing
#   KEEP_TEST_DB=1 ./scripts/eval.sh               # leave container running after
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="$ROOT/docker-compose.test.yml"
KEEP_TEST_DB="${KEEP_TEST_DB:-0}"

# ── 1. Start ephemeral test database ─────────────────────────────────────────
source "$ROOT/scripts/start-test-db.sh"
# start-test-db.sh exports: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
#                           TEST_COMPOSE_PROJECT

# ── 2. Tear down on exit (unless opted out) ───────────────────────────────────
cleanup() {
  if [ "$KEEP_TEST_DB" = "1" ]; then
    echo "[eval] KEEP_TEST_DB=1 — leaving test container running"
  else
    echo "[eval] stopping test database..."
    # Scoped to the test project only — never touches the main compose project.
    docker compose -p "$TEST_COMPOSE_PROJECT" -f "$COMPOSE_FILE" down 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── 3. Check Ollama (embeddings — optional) ───────────────────────────────────
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
if ! curl -sf "${OLLAMA_HOST}/api/tags" > /dev/null 2>&1; then
  echo "[eval] WARNING: Ollama not reachable at ${OLLAMA_HOST} — KB retrieval will be skipped"
fi

# ── 4. Run evals ──────────────────────────────────────────────────────────────
echo "[eval] running evals (PGPORT=$PGPORT DB=$PGDATABASE)..."
npx vitest run "$@"
