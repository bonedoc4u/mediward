-- rollback_templates.sql
-- Copy-paste templates for the 3 most common rollback scenarios.
-- NEVER run this file directly. Copy the relevant section into a new migration
-- named YYYYMMDDHHMMSS_rollback_<description>.sql and apply with supabase db push.

-- ══════════════════════════════════════════════════════════════════════════════
-- TEMPLATE 1: Rollback an ADD COLUMN
-- Use when: a new column caused issues and you need to remove it.
-- Risk: DATA LOSS if any rows have values in this column. Verify first.
-- ══════════════════════════════════════════════════════════════════════════════

/*
-- Step 1: Verify no critical data will be lost
SELECT COUNT(*) FROM public.<table_name> WHERE <column_name> IS NOT NULL;

-- Step 2: Drop the column (CASCADE drops any dependent indexes/constraints)
ALTER TABLE public.<table_name> DROP COLUMN IF EXISTS <column_name> CASCADE;

-- Step 3: Drop the index if it was created separately
DROP INDEX IF EXISTS <index_name>;
*/


-- ══════════════════════════════════════════════════════════════════════════════
-- TEMPLATE 2: Rollback an ADD INDEX
-- Use when: an index caused table bloat, lock contention, or incorrect behavior.
-- Risk: Low — indexes are non-destructive. Safe to drop at any time.
-- ══════════════════════════════════════════════════════════════════════════════

/*
-- Drop the index. CONCURRENTLY avoids locking the table in production.
-- Note: CONCURRENTLY cannot run inside a transaction block.
DROP INDEX CONCURRENTLY IF EXISTS public.<index_name>;
*/


-- ══════════════════════════════════════════════════════════════════════════════
-- TEMPLATE 3: Rollback an ADD RLS POLICY
-- Use when: a new RLS policy is too restrictive or misconfigured.
-- Risk: Medium — dropping a policy opens up access until replaced.
--       Always replace with a corrected policy in the SAME transaction.
-- ══════════════════════════════════════════════════════════════════════════════

/*
BEGIN;

-- Drop the bad policy
DROP POLICY IF EXISTS <policy_name> ON public.<table_name>;

-- Immediately replace with the previous correct policy to avoid open window
CREATE POLICY <policy_name> ON public.<table_name>
  FOR ALL
  USING (<previous_correct_predicate>);

COMMIT;
*/


-- ══════════════════════════════════════════════════════════════════════════════
-- TEMPLATE 4: Rollback a DROP COLUMN (if column was dropped incorrectly)
-- Use when: a column was dropped that is still needed.
-- Risk: HIGH — data is permanently gone. Restore from backup.
-- ══════════════════════════════════════════════════════════════════════════════

/*
-- Step 1: Re-add the column with the same type and default
ALTER TABLE public.<table_name>
  ADD COLUMN IF NOT EXISTS <column_name> <data_type> DEFAULT <default_value>;

-- Step 2: Restore data from backup if available
-- pg_restore -t <table_name> --data-only -f backup.sql backup.dump
-- Then: psql $DATABASE_URL -c "UPDATE ..."

-- Step 3: If data is unrecoverable, alert the on-call engineer immediately.
-- See RUNBOOK.md § Database rollback failure.
*/
