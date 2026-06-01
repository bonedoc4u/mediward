-- ================================================================
-- MediWard — Combined Migration (run once in Supabase SQL Editor)
-- Covers all schema changes made during the current dev session:
--   1. DB-level constraint hardening
--   2. hospital_config feature-flag columns (show_news2 etc.)
--   3. patients.management + patients.pac_flow
--
-- SAFE TO RUN MULTIPLE TIMES:
--   • ADD COLUMN IF NOT EXISTS — skips if column already exists
--   • DROP CONSTRAINT IF EXISTS before re-adding — idempotent
-- ================================================================

-- ════════════════════════════════════════════════════════════════
-- PART 1 — hospital_config feature flags
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.hospital_config
  ADD COLUMN IF NOT EXISTS pre_op_module_name         TEXT    NOT NULL DEFAULT 'Pre-op Clearance',
  ADD COLUMN IF NOT EXISTS procedure_list_name        TEXT    NOT NULL DEFAULT 'Procedure List',
  ADD COLUMN IF NOT EXISTS pre_op_checklist_template  JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS show_nursing_notes         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_medication_chart      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_intake_output         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_blood_transfusion     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_wound_care            BOOLEAN NOT NULL DEFAULT FALSE,
  -- NEWS2 defaults TRUE so existing hospitals keep seeing it unchanged
  ADD COLUMN IF NOT EXISTS show_news2                 BOOLEAN NOT NULL DEFAULT TRUE;

-- ════════════════════════════════════════════════════════════════
-- PART 2 — patients: management plan + PAC flowchart
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS management TEXT    NOT NULL DEFAULT 'surgical_fixation',
  ADD COLUMN IF NOT EXISTS pac_flow   JSONB;

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_management,
  ADD  CONSTRAINT chk_management CHECK (
    management IN ('surgical_fixation', 'conservative')
  );

-- ════════════════════════════════════════════════════════════════
-- PART 3 — DB-level constraint hardening
-- ════════════════════════════════════════════════════════════════

-- ─── patients ────────────────────────────────────────────────────

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_patient_status,
  ADD  CONSTRAINT chk_patient_status CHECK (
    patient_status IN ('Fit','Review','Critical','Discharge Ready','Discharged')
  );

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_pac_status,
  ADD  CONSTRAINT chk_pac_status CHECK (
    pac_status IN ('PAC Fit','PAC Pending','PAC Unfit')
  );

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_gender,
  ADD  CONSTRAINT chk_gender CHECK (gender IN ('Male','Female','Other'));

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_age,
  ADD  CONSTRAINT chk_age CHECK (age >= 0 AND age <= 150);

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_pod,
  ADD  CONSTRAINT chk_pod CHECK (pod IS NULL OR pod >= 0);

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_name_len,
  ADD  CONSTRAINT chk_name_len CHECK (char_length(name) <= 250);

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_diagnosis_len,
  ADD  CONSTRAINT chk_diagnosis_len CHECK (char_length(diagnosis) <= 500);

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_procedure_len,
  ADD  CONSTRAINT chk_procedure_len CHECK (procedure IS NULL OR char_length(procedure) <= 500);

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_mobile_len,
  ADD  CONSTRAINT chk_mobile_len CHECK (char_length(mobile) <= 15);

-- ─── labs ──────────────────────────────────────────────────────

ALTER TABLE public.labs
  DROP CONSTRAINT IF EXISTS chk_lab_value,
  ADD  CONSTRAINT chk_lab_value CHECK (value >= -99999 AND value <= 99999);

ALTER TABLE public.labs
  DROP CONSTRAINT IF EXISTS chk_lab_type_len,
  ADD  CONSTRAINT chk_lab_type_len CHECK (char_length(type) <= 100);

-- ─── patient_vitals ────────────────────────────────────────────

ALTER TABLE public.patient_vitals
  DROP CONSTRAINT IF EXISTS chk_bp_systolic,
  ADD  CONSTRAINT chk_bp_systolic    CHECK (bp_systolic    IS NULL OR (bp_systolic    >= 40  AND bp_systolic    <= 300));

ALTER TABLE public.patient_vitals
  DROP CONSTRAINT IF EXISTS chk_bp_diastolic,
  ADD  CONSTRAINT chk_bp_diastolic   CHECK (bp_diastolic   IS NULL OR (bp_diastolic   >= 20  AND bp_diastolic   <= 200));

ALTER TABLE public.patient_vitals
  DROP CONSTRAINT IF EXISTS chk_heart_rate,
  ADD  CONSTRAINT chk_heart_rate     CHECK (heart_rate     IS NULL OR (heart_rate     >= 20  AND heart_rate     <= 300));

ALTER TABLE public.patient_vitals
  DROP CONSTRAINT IF EXISTS chk_spo2,
  ADD  CONSTRAINT chk_spo2           CHECK (spo2           IS NULL OR (spo2           >= 0   AND spo2           <= 100));

ALTER TABLE public.patient_vitals
  DROP CONSTRAINT IF EXISTS chk_respiratory_rate,
  ADD  CONSTRAINT chk_respiratory_rate CHECK (respiratory_rate IS NULL OR (respiratory_rate >= 0 AND respiratory_rate <= 100));

ALTER TABLE public.patient_vitals
  DROP CONSTRAINT IF EXISTS chk_pain_score,
  ADD  CONSTRAINT chk_pain_score     CHECK (pain_score     IS NULL OR (pain_score     >= 0   AND pain_score     <= 10));

ALTER TABLE public.patient_vitals
  DROP CONSTRAINT IF EXISTS chk_news2_score,
  ADD  CONSTRAINT chk_news2_score    CHECK (news2_score    IS NULL OR (news2_score    >= 0   AND news2_score    <= 20));

ALTER TABLE public.patient_vitals
  DROP CONSTRAINT IF EXISTS chk_temperature,
  ADD  CONSTRAINT chk_temperature    CHECK (
    temperature IS NULL OR (temperature::NUMERIC >= 30 AND temperature::NUMERIC <= 45)
  );

-- ─── app_users ────────────────────────────────────────────────

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS chk_user_role,
  ADD  CONSTRAINT chk_user_role CHECK (
    role IN ('attending','resident','house_surgeon','admin','superadmin')
  );

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS chk_user_email_len,
  ADD  CONSTRAINT chk_user_email_len CHECK (char_length(email) <= 254);

-- ─── audit_log ────────────────────────────────────────────────

ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS chk_audit_action,
  ADD  CONSTRAINT chk_audit_action CHECK (
    action IN ('CREATE','UPDATE','DELETE','LOGIN','LOGOUT','VIEW','EXPORT')
  );

-- ─── hospitals ────────────────────────────────────────────────

ALTER TABLE public.hospitals
  DROP CONSTRAINT IF EXISTS chk_hospital_plan,
  ADD  CONSTRAINT chk_hospital_plan CHECK (plan IN ('trial','basic','pro'));

ALTER TABLE public.hospitals
  DROP CONSTRAINT IF EXISTS chk_hospital_status,
  ADD  CONSTRAINT chk_hospital_status CHECK (
    status IN ('active','suspended','pending','rejected')
  );

-- ═══════════════════════════════════════════════════════════════
-- DONE
-- ═══════════════════════════════════════════════════════════════
-- New columns:
--   hospital_config : show_nursing_notes, show_medication_chart,
--                     show_intake_output, show_blood_transfusion,
--                     show_wound_care, show_news2,
--                     pre_op_module_name, procedure_list_name,
--                     pre_op_checklist_template
--   patients        : management (TEXT default 'surgical_fixation')
--                     pac_flow   (JSONB nullable)
-- New constraints mirror every TypeScript enum/range in types.ts.
