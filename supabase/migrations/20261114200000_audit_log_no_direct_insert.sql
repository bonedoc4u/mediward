-- 20261114200000_audit_log_no_direct_insert.sql
--
-- SECURITY (audit 2026-11-12, finding SEC-05): nobody can write a made-up
-- audit-log entry.
--
-- Problem: the access rule "audit_log_insert" let any signed-in user add a
-- row to audit_log directly, with any user name, user id, action and text,
-- as long as the hospital was their own. A login could make the log say a
-- colleague viewed, changed or deleted a record. The log is meant as
-- evidence, so it must only contain what really happened.
--
-- The app never uses that rule. It writes through insert_audit_event(), a
-- SECURITY DEFINER function that fills in the user id, the user's real name
-- and hospital itself (services/auditLog.ts). Other writers are not affected:
--   - insert_audit_event(), erase_patient_data()  run with owner rights
--   - the clinical-insights function               uses the service role
-- Neither goes through row-level security.
--
-- Fix: remove every rule that allows a signed-in user to insert into
-- audit_log directly. Reading is unchanged. Rows still cannot be changed or
-- deleted (prevent_audit_modification trigger, unchanged).
--
-- Safe to apply before or after any app deploy: no app version uses the rule.
--
-- Rollback (re-opens the hole):
--   CREATE POLICY "audit_log_insert" ON public.audit_log FOR INSERT TO authenticated
--     WITH CHECK (hospital_id = public.get_my_hospital_id());

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_log' AND cmd IN ('INSERT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.audit_log', p.policyname);
  END LOOP;
END;
$$;

-- Row-level security stays on: with no insert rule, a direct insert is refused.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
