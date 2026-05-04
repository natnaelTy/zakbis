# Running Supabase migrations

This repository keeps the canonical schema in `supabase/schema.sql` and ordered
migrations in `supabase/migrations/*.sql`.

Use the provided script `scripts/apply_supabase_migrations.sh` to apply the
schema and migrations against a Postgres database. IMPORTANT: run this only
against a staging or local database first. Always backup production before
applying migrations.

Quick usage (local/staging):

```bash
# export a service-role DB URL (Postgres connection string)
export SUPABASE_DB_URL="postgres://postgres:password@db-host:5432/postgres"

# run the script
bash scripts/apply_supabase_migrations.sh
```

Notes:
- The script uses `psql` and expects it to be installed on your machine.
- For production Supabase projects prefer the Supabase CLI or CI-driven
  migration workflows. You can also mirror these SQL files into a GitHub
  Actions workflow that runs `psql` against your production database using a
  stored service-role secret.
- This repository's migrations assume the code changes in `app/api/**` are
  deployed in tandem with the schema change.

If you'd like, I can also create a GitHub Actions workflow that runs these
migrations in a controlled manner (with manual approval). Contact me if you
want that.
