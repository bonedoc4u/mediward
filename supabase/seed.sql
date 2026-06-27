-- supabase/seed.sql
-- Anonymized test data for staging. NO real patient PHI.
-- Run automatically by `supabase db reset` and in CI seed step.
-- All names, IP numbers, and IDs are synthetic.

-- ─── Sentinel: abort if accidentally run on production ─────────────────────
DO $$
BEGIN
  IF current_setting('app.environment', true) = 'production' THEN
    RAISE EXCEPTION 'SAFETY: seed.sql must NOT run on production.';
  END IF;
END $$;

-- ─── Test hospital ─────────────────────────────────────────────────────────
INSERT INTO public.hospital_config (id, name, department, city, state, created_at)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Staging Test Hospital', 'Orthopaedics', 'TestCity', 'KL', now())
ON CONFLICT (id) DO NOTHING;

-- ─── Ward config ───────────────────────────────────────────────────────────
INSERT INTO public.ward_config (hospital_id, ward_name, bed_count, created_at)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Ortho Ward A', 20, now()),
  ('11111111-0000-0000-0000-000000000001', 'Ortho ICU',    10, now()),
  ('11111111-0000-0000-0000-000000000001', 'Post-Op Ward', 15, now())
ON CONFLICT DO NOTHING;

-- ─── Lab type config ───────────────────────────────────────────────────────
INSERT INTO public.lab_type_config (hospital_id, lab_name, unit, normal_min, normal_max, created_at)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Haemoglobin',   'g/dL', 11.5, 17.5, now()),
  ('11111111-0000-0000-0000-000000000001', 'WBC',           '×10³/μL', 4.0, 11.0, now()),
  ('11111111-0000-0000-0000-000000000001', 'Platelets',     '×10³/μL', 150.0, 400.0, now()),
  ('11111111-0000-0000-0000-000000000001', 'Sodium',        'mEq/L', 135.0, 145.0, now()),
  ('11111111-0000-0000-0000-000000000001', 'Potassium',     'mEq/L', 3.5, 5.0, now()),
  ('11111111-0000-0000-0000-000000000001', 'Creatinine',    'mg/dL', 0.6, 1.2, now()),
  ('11111111-0000-0000-0000-000000000001', 'Random Blood Sugar', 'mg/dL', 70.0, 140.0, now())
ON CONFLICT DO NOTHING;

-- ─── Test users (Supabase Auth + app_users) ────────────────────────────────
-- Passwords are all: Test@1234  (set via Supabase Auth; hashes not stored)

-- Admin
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, role)
VALUES (
  '22222222-0000-0000-0000-000000000001',
  'admin@staging.mediward.test',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  'authenticated'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.app_users (id, email, name, role, ward, unit, hospital_id, created_at)
VALUES
  ('22222222-0000-0000-0000-000000000001', 'admin@staging.mediward.test',   'Test Admin',       'admin',  NULL,            NULL,  '11111111-0000-0000-0000-000000000001', now()),
  ('22222222-0000-0000-0000-000000000002', 'dr.or1@staging.mediward.test',  'Dr. OR1 Doctor',   'doctor', 'Ortho Ward A',  'OR1', '11111111-0000-0000-0000-000000000001', now()),
  ('22222222-0000-0000-0000-000000000003', 'dr.or2@staging.mediward.test',  'Dr. OR2 Doctor',   'doctor', 'Ortho Ward A',  'OR2', '11111111-0000-0000-0000-000000000001', now()),
  ('22222222-0000-0000-0000-000000000004', 'nurse1@staging.mediward.test',  'Nurse Priya T',    'nurse',  'Ortho Ward A',  'OR1', '11111111-0000-0000-0000-000000000001', now()),
  ('22222222-0000-0000-0000-000000000005', 'dr.icu@staging.mediward.test',  'Dr. ICU Consultant', 'doctor', 'Ortho ICU',  NULL,  '11111111-0000-0000-0000-000000000001', now())
ON CONFLICT (id) DO NOTHING;

-- ─── Test patients (NO real names, obviously synthetic IP numbers) ──────────
INSERT INTO public.patients (
  ip_no, name, age, sex, ward, bed, unit, hospital_id,
  diagnosis, date_of_admission, patient_status, pac_status,
  created_at, updated_at
) VALUES
  -- OR1 patients
  ('TEST-001', 'Anon Patient One',   45, 'M', 'Ortho Ward A', 'A1',  'OR1', '11111111-0000-0000-0000-000000000001',
   'Right tibial shaft fracture (closed)', current_date - 3, 'active', 'pac_done', now(), now()),

  ('TEST-002', 'Anon Patient Two',   62, 'F', 'Ortho Ward A', 'A2',  'OR1', '11111111-0000-0000-0000-000000000001',
   'Osteoarthritis knee — awaiting TKR',  current_date - 1, 'active', 'pac_pending', now(), now()),

  ('TEST-003', 'Anon Patient Three', 38, 'M', 'Ortho Ward A', 'A3',  'OR1', '11111111-0000-0000-0000-000000000001',
   'Intertrochanteric fracture — post PFNA D1', current_date, 'active', 'pac_done', now(), now()),

  -- OR2 patients
  ('TEST-004', 'Anon Patient Four',  55, 'F', 'Ortho Ward A', 'B1',  'OR2', '11111111-0000-0000-0000-000000000001',
   'Distal radius fracture — post ORIF D3', current_date - 3, 'active', 'pac_done', now(), now()),

  ('TEST-005', 'Anon Patient Five',  71, 'M', 'Ortho Ward A', 'B2',  'OR2', '11111111-0000-0000-0000-000000000001',
   'Lumbar canal stenosis — post L4-L5 decompression', current_date - 2, 'active', 'pac_done', now(), now()),

  -- ICU patient
  ('TEST-006', 'Anon Patient Six',   58, 'F', 'Ortho ICU',   'ICU1', NULL,  '11111111-0000-0000-0000-000000000001',
   'Polytrauma — bilateral femur fractures, awaiting stabilisation', current_date, 'active', 'pac_pending', now(), now()),

  -- Patient to be discharged (for discharge flow testing)
  ('TEST-007', 'Anon Patient Seven', 49, 'M', 'Ortho Ward A', 'A4',  'OR1', '11111111-0000-0000-0000-000000000001',
   'Ankle fracture — post ORIF D7, for discharge today', current_date - 7, 'active', 'pac_done', now(), now())
ON CONFLICT (ip_no) DO NOTHING;

-- ─── Lab results for TEST-001 ───────────────────────────────────────────────
INSERT INTO public.labs (id, patient_ip_no, hospital_id, date, type, value, created_at)
VALUES
  (gen_random_uuid(), 'TEST-001', '11111111-0000-0000-0000-000000000001', current_date - 2, 'Haemoglobin',   '11.2', now()),
  (gen_random_uuid(), 'TEST-001', '11111111-0000-0000-0000-000000000001', current_date - 2, 'WBC',           '8.4',  now()),
  (gen_random_uuid(), 'TEST-001', '11111111-0000-0000-0000-000000000001', current_date - 2, 'Platelets',     '210',  now()),
  (gen_random_uuid(), 'TEST-001', '11111111-0000-0000-0000-000000000001', current_date,     'Haemoglobin',   '10.8', now()),
  (gen_random_uuid(), 'TEST-001', '11111111-0000-0000-0000-000000000001', current_date,     'Creatinine',    '0.9',  now())
ON CONFLICT DO NOTHING;

-- ─── Round notes ───────────────────────────────────────────────────────────
INSERT INTO public.rounds (patient_ip_no, hospital_id, date, note, todos, version, created_at, updated_at)
VALUES
  ('TEST-001', '11111111-0000-0000-0000-000000000001', current_date - 2,
   'POD2: Comfortable. Pain 3/10 on VAS. Wound clean, no signs of infection. Started physiotherapy.',
   '[{"id":"t1","task":"Physio consult","isDone":true},{"id":"t2","task":"Repeat CBC tomorrow","isDone":false}]',
   1, now(), now()),

  ('TEST-001', '11111111-0000-0000-0000-000000000001', current_date - 1,
   'POD3: Walking with walker. Haemoglobin stable. Continue iron supplementation.',
   '[{"id":"t3","task":"Iron tab BD","isDone":false}]',
   1, now(), now()),

  ('TEST-003', '11111111-0000-0000-0000-000000000001', current_date,
   'POD1 post PFNA: Vitals stable. Pain controlled. Wound dry. DVT prophylaxis started.',
   '[{"id":"t4","task":"Enoxaparin 40mg SC OD","isDone":false},{"id":"t5","task":"Ankle pumps","isDone":false}]',
   1, now(), now())
ON CONFLICT (patient_ip_no, date) DO NOTHING;

-- ─── Imaging ───────────────────────────────────────────────────────────────
INSERT INTO public.imaging (id, patient_ip_no, hospital_id, date, type, findings, image_url, created_at)
VALUES
  (gen_random_uuid(), 'TEST-001', '11111111-0000-0000-0000-000000000001', current_date - 3,
   'X-ray Leg AP/Lat', 'Midshaft tibial fracture, well aligned. No neurovascular compromise.', NULL, now()),
  (gen_random_uuid(), 'TEST-003', '11111111-0000-0000-0000-000000000001', current_date - 1,
   'X-ray Hip AP', 'PFNA in situ, good position. Fracture fragments aligned.', NULL, now())
ON CONFLICT DO NOTHING;

-- ─── Audit log marker (so we can verify audit trail in tests) ───────────────
INSERT INTO public.audit_log (hospital_id, user_id, action, table_name, record_id, created_at)
VALUES
  ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001',
   'SEED', 'system', 'seed-run', now())
ON CONFLICT DO NOTHING;
