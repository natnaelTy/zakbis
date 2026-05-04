#!/usr/bin/env bash
set -euo pipefail

# Apply the main schema and each migration in lexical order against a
# Postgres database. This script expects a SERVICE-ROLE database URL
# in the SUPABASE_DB_URL environment variable (not the anon key).

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "Error: SUPABASE_DB_URL must be set to a service-role Postgres connection string."
  echo "Example: export SUPABASE_DB_URL='postgres://postgres:password@db-host:5432/postgres'"
  exit 1
fi

echo "Applying supabase/schema.sql..."
psql "$SUPABASE_DB_URL" -f supabase/schema.sql

echo "Applying migrations in supabase/migrations/..."
for f in supabase/migrations/*.sql; do
  echo "\n=== Applying $f ==="
  psql "$SUPABASE_DB_URL" -f "$f"
done

echo "All migrations applied."
