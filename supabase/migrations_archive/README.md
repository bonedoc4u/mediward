# Archived migrations (read-only history)

These are the migration files from before the production baseline
(`supabase/migrations/20261115000000_baseline_production.sql`, 14 Nov 2026).

- The Supabase CLI does **not** read this folder. Nothing here is ever applied.
- They are kept so the history of each change (and its comments) stays
  readable, and so the tests that check what each change did still run.
- Production's real history also includes changes made from the dashboard
  that never had a file here; the baseline is the only complete record.

Do not add files here, and do not move them back. New changes go in a new
migration in `supabase/migrations/`, dated after the baseline.
