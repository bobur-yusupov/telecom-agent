#!/usr/bin/env bash
# Generate eval-data/dataset.json by running curated conversations through Mirzo.
# Uses the same ephemeral in-RAM Postgres as the eval suite (port 5433), torn
# down on exit. Needs GOOGLE_API_KEY set and Ollama running for KB retrieval.
#
# Usage:
#   ./scripts/gen-dataset.sh
#   EVAL_TURN_DELAY_MS=0 ./scripts/gen-dataset.sh   # paid API tier — no pacing
#   KEEP_TEST_DB=1       ./scripts/gen-dataset.sh   # leave DB up after
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="$ROOT/docker-compose.test.yml"
KEEP_TEST_DB="${KEEP_TEST_DB:-0}"

# 1. Ephemeral test DB (exports PG* + TEST_COMPOSE_PROJECT).
source "$ROOT/scripts/start-test-db.sh"

# 2. Tear down on exit unless opted out.
cleanup() {
  if [ "$KEEP_TEST_DB" = "1" ]; then
    echo "[gen-dataset] KEEP_TEST_DB=1 — leaving test container running"
  else
    echo "[gen-dataset] stopping test database..."
    docker compose -p "$TEST_COMPOSE_PROJECT" -f "$COMPOSE_FILE" down 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 3. Ollama check (KB is best-effort but better with it).
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
if ! curl -sf "${OLLAMA_HOST}/api/tags" > /dev/null 2>&1; then
  echo "[gen-dataset] WARNING: Ollama not reachable at ${OLLAMA_HOST} — KB context will be empty"
fi

# 4. Generate.
echo "[gen-dataset] generating dataset (PGPORT=$PGPORT)..."
npx tsx scripts/gen-dataset.ts
