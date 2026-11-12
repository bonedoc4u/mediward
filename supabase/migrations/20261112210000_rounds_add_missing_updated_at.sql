-- 20261112210000_rounds_add_missing_updated_at.sql
--
-- FIX (audit 2026-11-12, finding DATA-09, critical).
--
-- In production the table public.rounds has the trigger
--     rounds_updated_at BEFORE UPDATE ... EXECUTE FUNCTION handle_updated_at()
-- which does  NEW.updated_at = now();  but the table has no updated_at
-- column. So EVERY UPDATE of a rounds row fails with
--     42703: record "new" has no field "updated_at"
--
-- Effect on the ward: the first save of a patient's round each day is an
-- INSERT and works. Every later save that day is an upsert that turns into
-- an UPDATE and is rejected. The app queued the rejected save, and the queue
-- replay (before PR #87) deleted it without looking at the server's answer,
-- so the later orders of the day never reached the database and nobody saw
-- an error.
--
-- Fix: add the column the trigger expects. Additive, no data change. Existing
-- rows get created_at as their updated_at (the closest true value).
--
-- Rollback: ALTER TABLE public.rounds DROP COLUMN IF EXISTS updated_at;
--           (the trigger would fail again — also drop trigger rounds_updated_at)

ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS updated_at timestamptz;
UPDATE public.rounds SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE public.rounds ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.rounds ALTER COLUMN updated_at SET NOT NULL;
