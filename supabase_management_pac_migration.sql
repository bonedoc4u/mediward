-- ================================================================
-- MediWard — Management Plan + PAC Flowchart Migration
-- Adds two columns to the patients table.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- ================================================================

-- ─── Treatment plan ───────────────────────────────────────────────────────────
-- surgical_fixation (default) = patient appears in the pending/pre-op list
-- conservative                = non-operative management; excluded from pending
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS management TEXT NOT NULL DEFAULT 'surgical_fixation';

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_management,
  ADD  CONSTRAINT chk_management CHECK (
    management IN ('surgical_fixation', 'conservative')
  );

-- ─── PAC Flowchart ────────────────────────────────────────────────────────────
-- Stores the full PAC clearance flowchart (anaesthesia seen, branches, sub-items)
-- as structured JSONB. Schema mirrors the PacFlowData TypeScript interface.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS pac_flow JSONB;

-- ─── Done ─────────────────────────────────────────────────────────────────────
-- After this migration:
--   • All existing patients get management = 'surgical_fixation' (no behaviour change)
--   • pac_flow starts NULL for all existing patients (flowchart initialises on first edit)
