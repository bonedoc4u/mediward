-- Migration: 20241001000000_rounds_optimistic_lock.sql
-- Add version column + trigger for optimistic concurrency control on round notes.
-- UPDATE WHERE version = $current bumps to 0 rows on conflict → app shows diff modal.

ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_round_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.version = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rounds_version_bump ON public.rounds;
CREATE TRIGGER rounds_version_bump
  BEFORE UPDATE ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.bump_round_version();
