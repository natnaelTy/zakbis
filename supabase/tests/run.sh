#!/bin/sh
# Runs every *_test.sql against a throwaway Postgres 16 with Supabase stand-ins. Usage: sh supabase/tests/run.sh
set -u
here=$(cd "$(dirname "$0")" && pwd); root="$here/../.."
bin=/usr/lib/postgresql/16/bin; data="$here/.pg"; port=54329
psql() { command psql -h 127.0.0.1 -p $port -U postgres -q -v ON_ERROR_STOP=1 "$@"; }
rm -rf "$data"; "$bin/initdb" -D "$data" -U postgres -A trust >/dev/null
# TCP only: the Unix socket path inside this repo can exceed the 107-byte limit.
"$bin/pg_ctl" -D "$data" -o "-p $port -k '' -c listen_addresses=127.0.0.1" -l "$data/log" -w start >/dev/null
trap '"$bin/pg_ctl" -D "$data" -m fast stop >/dev/null; rm -rf "$data"' EXIT
psql -f "$here/stubs.sql" && psql -f "$root/supabase/migrations/0001_buy_me.sql" || { echo "FAIL migration"; exit 1; }
failed=0
for t in "$here"/*_test.sql; do
  if out=$(psql -f "$t" 2>&1); then echo "PASS $(basename "$t")"; else echo "FAIL $(basename "$t")"; echo "$out" | tail -5; failed=1; fi
done
exit $failed
