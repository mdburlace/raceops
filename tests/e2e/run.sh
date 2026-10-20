#!/usr/bin/env bash
# Run the end-to-end suites in order against a fresh test server.
#
#   tests/e2e/run.sh              start a fresh server (server.sh), then run every suite
#   tests/e2e/run.sh --no-reset   run every suite against a server you've already reset
#   tests/e2e/run.sh e2e28 e2e29  run only these suites (the server must already hold the data
#                                 the earlier suites create — usually after a full run)
#
# Suites build on each other's data, so a full run always starts from an empty database.
# Stops at the first failure. Screenshots and logs go to tests/e2e/out/<suite>/ and out/<suite>.log.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/out"; mkdir -p "$OUT"
cd "$HERE"

ALL=$(ls e2e*.py | sed 's/\.py$//' | sort -V)
reset=1; only=()
for a in "$@"; do
  case "$a" in --no-reset) reset=0 ;; *) only+=("${a%.py}"); reset=0 ;; esac
done
[ "$reset" = 1 ] && { "$HERE/server.sh" || exit 1; }
suites=${only[*]:-$ALL}

for t in $suites; do
  python3 "$t.py" "$OUT/$t" > "$OUT/$t.log" 2>&1
  last=$(tail -1 "$OUT/$t.log")
  echo "$t $last"
  case "$last" in
    *OK*) ;;
    *) grep -n 'line [0-9]*, in <module>' "$OUT/$t.log" | tail -1; grep -v '^\s*$' "$OUT/$t.log" | tail -8; exit 1 ;;
  esac
done
echo "All suites passed."
