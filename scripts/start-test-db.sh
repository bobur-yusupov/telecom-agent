#!/usr/bin/env bash
# Start an ephemeral in-memory Postgres container for the test suite.
# Exports PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE so callers inherit them.
# Safe to call repeatedly — skips startup if the container is already healthy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

CONTAINER="mirzo-postgres-test"
COMPOSE_FILE="$ROOT/docker-compose.test.yml"
# Dedicated project name so this never touches the main compose project's
# containers (Ollama, agent, etc.). Exported so teardown uses the same project.
export TEST_COMPOSE_PROJECT="mirzo-test"

export PGHOST=localhost
export PGPORT=5433
export PGUSER=mirzo_test
export PGPASSWORD=mirzo_test
export PGDATABASE=mirzo_test

# ── Already healthy? Nothing to do. ──────────────────────────────────────────
if docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null | grep -q healthy; then
  echo "[test-db] container already healthy on port $PGPORT"
  exit 0
fi

# ── Start the container ───────────────────────────────────────────────────────
echo "[test-db] starting ephemeral Postgres on port $PGPORT (tmpfs — data lives in RAM only)..."
docker compose -p "$TEST_COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d

# ── Wait for healthy ──────────────────────────────────────────────────────────
echo "[test-db] waiting for Postgres to be ready..."
ATTEMPTS=0
MAX=30
until docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null | grep -q healthy; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX" ]; then
    echo "[test-db] ERROR: Postgres did not become healthy after ${MAX} attempts" >&2
    docker logs "$CONTAINER" --tail 20 >&2
    exit 1
  fi
  sleep 1
done

echo "[test-db] ready (host=$PGHOST port=$PGPORT db=$PGDATABASE)"
