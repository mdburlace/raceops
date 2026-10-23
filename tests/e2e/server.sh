#!/usr/bin/env bash
# Start a fresh RaceOps test server for the end-to-end suites.
#
# Drops and recreates the test database, starts the server with mock AI and weather, file email and
# private-address calendar fetching allowed, then creates the first user (owner@test.com / password1,
# team "Burlace Racing") that every suite signs in with.
#
# Settings (environment variables, with defaults):
#   PGADMIN_URL   postgresql://postgres@localhost:5432/postgres   superuser connection, used to drop/create the DB
#   TEST_DB       raceops_test                                    database name (owned by user raceops)
#   DB_PASSWORD   raceops                                         password of the raceops database user
#   PGHOSTPORT    localhost:5432                                  host:port the server connects to
#   RACEOPS_URL   http://localhost:8080                           where the server listens (port taken from it)
#   MAIL_OUTBOX   /var/tmp/outbox                                 where test emails are written
#   TEST_DATA     /var/tmp/raceops-test                           uploads and backups (emptied on every start)
#
# Needs: Node 22, psql, curl, and a built web app (cd web && npm ci && npm run build).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGADMIN_URL="${PGADMIN_URL:-postgresql://postgres@localhost:5432/postgres}"
TEST_DB="${TEST_DB:-raceops_test}"
DB_PASSWORD="${DB_PASSWORD:-raceops}"
PGHOSTPORT="${PGHOSTPORT:-localhost:5432}"
RACEOPS_URL="${RACEOPS_URL:-http://localhost:8080}"
MAIL_OUTBOX="${MAIL_OUTBOX:-/var/tmp/outbox}"
TEST_DATA="${TEST_DATA:-/var/tmp/raceops-test}"
PORT="$(echo "$RACEOPS_URL" | sed -E 's#^.*:([0-9]+)/?$#\1#')"
OUT="$HERE/out"; mkdir -p "$OUT"

[ -d "$ROOT/web/dist" ] || { echo "Build the web app first: cd web && npm ci && npm run build"; exit 1; }

# stop a server this script started before
if [ -f "$OUT/server.pid" ]; then kill "$(cat "$OUT/server.pid")" 2>/dev/null || true; rm -f "$OUT/server.pid"; sleep 1; fi

psql "$PGADMIN_URL" -q -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'raceops') THEN CREATE ROLE raceops LOGIN PASSWORD '$DB_PASSWORD'; END IF;
END \$\$;
DROP DATABASE IF EXISTS $TEST_DB WITH (FORCE);
CREATE DATABASE $TEST_DB OWNER raceops;
SQL
rm -rf "$MAIL_OUTBOX" "$TEST_DATA"
mkdir -p "$TEST_DATA/uploads" "$TEST_DATA/backups"

cd "$ROOT/server"
DATABASE_URL="postgres://raceops:$DB_PASSWORD@$PGHOSTPORT/$TEST_DB" PORT="$PORT" \
AI_PROVIDER=mock WEATHER_PROVIDER=mock CALENDAR_FETCH_PRIVATE=1 CALENDAR_FEED_HOURS=0 GITHUB_PROVIDER=mock GITHUB_REPO=example/raceops \
MAIL_TRANSPORT=file MAIL_OUTBOX="$MAIL_OUTBOX" APP_URL="$RACEOPS_URL" \
UPLOAD_DIR="$TEST_DATA/uploads" BACKUP_DIR="$TEST_DATA/backups" BACKUP_KEY=test-backup-passphrase BACKUP_CLOUD_MOCK=1 \
  nohup node src/index.js > "$OUT/server.log" 2>&1 &
echo $! > "$OUT/server.pid"

for _ in $(seq 1 60); do curl -sf "$RACEOPS_URL/api/health" >/dev/null && break; sleep 1; done
curl -sf "$RACEOPS_URL/api/health" >/dev/null || { echo "Server didn't start — see $OUT/server.log"; exit 1; }

curl -sf -XPOST "$RACEOPS_URL/api/setup" -H 'content-type: application/json' \
  -d '{"email":"owner@test.com","name":"Mark","password":"password1","team_name":"Burlace Racing"}' >/dev/null
echo "Test server ready at $RACEOPS_URL (log: $OUT/server.log)"
