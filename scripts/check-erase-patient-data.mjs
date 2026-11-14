#!/usr/bin/env node
/**
 * check-erase-patient-data.mjs — live check of erase_patient_data().
 *
 * Proves, against a real database, that "Erase patient data" (audit
 * 2026-11-12, DATA-07; migration 20261114180000_erase_patient_data.sql):
 *   - is refused for a non-admin, an unknown IP number and a current inpatient,
 *   - removes every linked row and empties the patient row in one go,
 *   - leaves another patient alone.
 *
 * DEV ONLY. It signs in with the fake logins from .dev-test-login.local and
 * refuses to run against the production project. It works on two throw-away
 * fake patients (ZZ-ERASE-…) and deletes them afterwards. The audit log
 * cannot be edited, so each run leaves audit entries for ZZ-ERASE-CHECK.
 *
 *   node scripts/check-erase-patient-data.mjs
 */
import fs from 'node:fs';

const PROD_REF = 'mnyjpxkopiktsrqmjilb';
const TARGET = 'ZZ-ERASE-CHECK';
const OTHER = 'ZZ-ERASE-KEEP';
const FAR = '2099-01-01';

const readEnv = (file) => Object.fromEntries(
  fs.readFileSync(file, 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const env = { ...readEnv('.env.local'), ...readEnv('.dev-test-login.local') };
const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;

if (!URL_ || URL_.includes(PROD_REF)) {
  console.error('Refusing to run: .env.local does not point at the dev project.');
  process.exit(2);
}

async function signIn(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: env.TEST_PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('sign-in failed for one of the test logins');
  return { token: j.access_token, id: j.user.id };
}

async function rest(token, method, path, body) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let rows = []; let message = ''; let json = null;
  try {
    json = JSON.parse(text);
    if (Array.isArray(json)) rows = json; else if (json && typeof json === 'object') message = json.message ?? '';
  } catch { /* empty body */ }
  return { status: r.status, rows, message, json };
}

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `   [${detail}]`}`);
  if (!ok) failed += 1;
};
const describe = (res) => `HTTP ${res.status}${res.message ? `, "${res.message}"` : ''}`;
const refusedWith = (label, res, prefix) =>
  check(label, res.status >= 400 && res.message.startsWith(prefix), describe(res));

const { token: admin, id: adminId } = await signIn(env.TEST_ADMIN_EMAIL);
const { token: resident } = await signIn(env.TEST_RESIDENT_EMAIL);

const erase = (token, ipNo) => rest(token, 'POST', 'rpc/erase_patient_data', { p_ip_no: ipNo });
const dryRun = (token, ipNo) => rest(token, 'POST', 'rpc/erase_patient_data', { p_ip_no: ipNo, p_dry_run: true });
const FAKE_IMAGE = 'zz-erase-check/fake-xray.jpg'; // a path only; no file is uploaded
const patientRow = async (ipNo) => (await rest(admin, 'GET', `patients?ip_no=eq.${ipNo}&select=*`)).rows[0];

async function cleanUp() {
  await rest(admin, 'DELETE', `ot_list_entries?patient_ip_no=in.(${TARGET},${OTHER})`);
  await rest(admin, 'DELETE', `ot_lists?unit=eq.ZZ&list_date=eq.${FAR}`);
  await rest(admin, 'DELETE', `patients?ip_no=in.(${TARGET},${OTHER})`);
}
await cleanUp(); // a run that crashed half-way may have left rows behind

// ── Two fake patients, built from an existing dev patient's shape ───────────
const template = (await rest(admin, 'GET', 'patients?select=*&deleted_at=is.null&limit=1')).rows[0];
if (!template) { console.error('No patient on dev to copy the shape from.'); process.exit(2); }
const H = template.hospital_id;
const { created_at: _c, updated_at: _u, version: _v, ...copy } = template;
const fakePatient = (ipNo) => ({
  ...copy, ip_no: ipNo, name: 'Erase Check (fake)', mobile: '9000000000', age: 61, bed: 'ZZ',
  diagnosis: 'Fake fracture for the erase check', procedure: 'Fake nailing',
  comorbidities: ['HTN'], drug_allergies: ['Fake allergy'], abha_id: null,
  patient_status: 'Fit', deleted_at: null, dod: null, discharge_summary: null,
  todos: [{ id: 'zz', task: 'fake order', isDone: false }],
  daily_rounds: [{ date: FAR, note: 'fake round' }],
  lab_results: [{ id: 'zz', date: FAR, type: 'Hb', value: 10 }],
  investigations: [{ id: 'zz', date: FAR, type: 'X-ray', findings: 'fake' }],
});
for (const ipNo of [TARGET, OTHER]) {
  const made = await rest(admin, 'POST', 'patients', fakePatient(ipNo));
  if (made.rows.length !== 1) { console.error(`Could not create ${ipNo}: ${describe(made)}`); process.exit(2); }
}

// ── One row in every table that refers to a patient ─────────────────────────
const of = (ipNo) => ({ patient_ip_no: ipNo, hospital_id: H });
const made = {};
const LINKED = [
  ['rounds', () => ({ ...of(TARGET), date: FAR, note: 'erase check (fake)', todos: [] })],
  ['labs', () => ({ ...of(TARGET), date: FAR, type: 'Hb', value: 10 })],
  ['imaging', () => ({ ...of(TARGET), date: FAR, type: 'X-ray', findings: 'erase check (fake)', image_url: FAKE_IMAGE })],
  ['patient_vitals', () => ({ ...of(TARGET), timestamp: `${FAR}T08:00:00Z`, heart_rate: 80 })],
  ['nursing_notes', () => ({ ...of(TARGET), shift: 'Morning', note: 'erase check (fake)' })],
  ['medications_prescribed', () => ({ ...of(TARGET), drug_name: 'Erase check (fake)', dose: '1', route: 'PO', frequency: 'OD', start_date: FAR })],
  ['med_administrations', () => ({ ...of(TARGET), medication_id: made.medications_prescribed?.id, status: 'given' })],
  ['wound_care', () => ({ patient_ip_no: TARGET, wound_site: 'erase check (fake)' })],
  ['intake_output', () => ({ patient_ip_no: TARGET, type: 'intake', category: 'Oral', amount_ml: 100 })],
  ['blood_transfusion', () => ({ patient_ip_no: TARGET, blood_product: 'PRBC (fake)' })],
  ['consult_requests', () => ({ ...of(TARGET), patient_name: 'Erase Check (fake)', requesting_dept: 'Ortho', target_dept: 'Medicine',
    clinical_question: 'erase check (fake)', requested_by: adminId, requested_by_name: 'Test Admin' })],
  ['handovers', () => ({ ...of(TARGET), shift: 'morning', handing_over_by: adminId, handing_over_by_name: 'Test Admin' })],
  ['ot_lists', () => ({ hospital_id: H, unit: 'ZZ', ot_type: 'Minor', list_date: FAR })],
  ['ot_list_entries', () => ({ ot_list_id: made.ot_lists?.id, hospital_id: H, sequence: 1, category: 'Elective', patient_ip_no: TARGET,
    name: 'Erase Check (fake)', age: '61', gender: 'M', ward: 'ZZ', unit: 'ZZ', diagnosis: 'erase check (fake)' })],
];
const PATIENT_TABLES = LINKED.map(([t]) => t).filter(t => t !== 'ot_lists');

console.log('— setting up —');
for (const [table, row] of LINKED) {
  const res = await rest(admin, 'POST', table, row());
  made[table] = res.rows[0];
  check(`fake row added to ${table}`, res.rows.length === 1, describe(res));
}
const keepLab = await rest(admin, 'POST', 'labs', { ...of(OTHER), date: FAR, type: 'Hb', value: 12 });
check('the other patient has a lab result too', keepLab.rows.length === 1, describe(keepLab));

const linkedCount = async (ipNo) => {
  let n = 0;
  for (const t of PATIENT_TABLES) n += (await rest(admin, 'GET', `${t}?patient_ip_no=eq.${ipNo}&select=patient_ip_no`)).rows.length;
  return n;
};
const linkedBefore = await linkedCount(TARGET);

try {
  console.log('— who may erase, and when —');
  refusedWith('resident cannot erase', await erase(resident, TARGET), 'ROLE_FORBIDDEN');
  {
    const unknown = await erase(admin, 'ZZ-NO-SUCH-PATIENT');
    refusedWith('an unknown IP number is an error, not a success', unknown, 'PATIENT_NOT_FOUND');
    check('…answered as a refusal (400), not a server error', unknown.status === 400, describe(unknown));
  }
  refusedWith('a current inpatient cannot be erased', await erase(admin, TARGET), 'PATIENT_STILL_ADMITTED');
  refusedWith('the dry run refuses a resident too', await dryRun(resident, TARGET), 'ROLE_FORBIDDEN');
  refusedWith('the dry run refuses a current inpatient too', await dryRun(admin, TARGET), 'PATIENT_STILL_ADMITTED');
  check('nothing was removed by the refused attempts',
    (await linkedCount(TARGET)) === linkedBefore && (await patientRow(TARGET))?.name === 'Erase Check (fake)');

  const discharged = await rest(admin, 'PATCH', `patients?ip_no=eq.${TARGET}`, { patient_status: 'Discharged', dod: FAR });
  check('patient discharged for the test', discharged.rows.length === 1, describe(discharged));

  console.log('— the dry run (what the app shows before erasing) —');
  const preview = await dryRun(admin, TARGET);
  check('it says who the patient is', preview.status === 200 && preview.json?.name === 'Erase Check (fake)'
    && preview.json?.age === 61 && preview.json?.patient_status === 'Discharged', describe(preview));
  check('it counts the rows that would go', preview.json?.rows_to_remove === linkedBefore,
    `counted ${preview.json?.rows_to_remove}, expected ${linkedBefore}`);
  check('it lists the image files', JSON.stringify(preview.json?.image_urls) === JSON.stringify([FAKE_IMAGE]),
    JSON.stringify(preview.json?.image_urls));
  check('it changes nothing',
    (await linkedCount(TARGET)) === linkedBefore && (await patientRow(TARGET))?.name === 'Erase Check (fake)');

  console.log('— the erase —');
  const done = await erase(admin, TARGET);
  check('admin can erase a discharged patient', done.status === 200 && done.json?.ip_no === TARGET, describe(done));
  check('it reports how many rows it removed', done.json?.rows_removed === linkedBefore,
    `reported ${done.json?.rows_removed}, expected ${linkedBefore}`);
  for (const t of PATIENT_TABLES) {
    const left = (await rest(admin, 'GET', `${t}?patient_ip_no=eq.${TARGET}&select=patient_ip_no`)).rows.length;
    check(`${t}: nothing left`, left === 0, `${left} row(s) left`);
  }

  const after = (await patientRow(TARGET)) ?? {};
  const empty = (v) => v === null || v === '' || (Array.isArray(v) && v.length === 0)
    || (typeof v === 'object' && v !== null && Object.keys(v).length === 0);
  check('name is redacted, age is 0', after.name === '[REDACTED]' && after.age === 0, `${after.name}, ${after.age}`);
  check('diagnosis says the data was erased', after.diagnosis === 'Personal data erased on request', after.diagnosis);
  const mustBeEmpty = ['mobile', 'bed', 'abha_id', 'procedure', 'comorbidities', 'drug_allergies', 'todos', 'daily_rounds',
    'lab_results', 'investigations', 'vitals', 'pac_checklist', 'pre_op_checklist', 'discharge_summary', 'dama_summary',
    'death_summary', 'pac_flow', 'specialty_data', 'prior_surgeries', 'fractures', 'mode_of_injury', 'admission_source',
    'dos', 'planned_dos', 'pod', 'consent_given_at'];
  const notEmpty = mustBeEmpty.filter(c => c in after && !empty(after[c]));
  check('every clinical and personal column is empty', notEmpty.length === 0, `still filled: ${notEmpty.join(', ')}`);
  const kept = ['ip_no', 'hospital_id', 'ward', 'unit', 'doa', 'gender'];
  check('the shell is kept (IP number, ward, unit, admission date, gender)',
    kept.every(c => after[c] === (c === 'ip_no' ? TARGET : copy[c])) && after.patient_status === 'Discharged' && after.dod === FAR);
  // Anything not on either list must be a column this script knows is harmless.
  const known = new Set([...mustBeEmpty, ...kept, 'name', 'age', 'diagnosis', 'patient_status', 'dod', 'pac_status', 'specialty',
    'management', 'consent_version', 'created_at', 'updated_at', 'version', 'deleted_at', 'archived_at']);
  const unknown = Object.keys(after).filter(c => !known.has(c));
  check('no patient column is unaccounted for', unknown.length === 0, `new column(s): ${unknown.join(', ')}`);

  console.log('— nothing else was touched —');
  const other = await patientRow(OTHER);
  check('the other patient is unchanged', other?.name === 'Erase Check (fake)' && other?.todos?.length === 1);
  check('the other patient still has the lab result',
    (await rest(admin, 'GET', `labs?patient_ip_no=eq.${OTHER}&select=id`)).rows.length === 1);
  check('the OT list itself is still there (only the entry went)',
    (await rest(admin, 'GET', `ot_lists?id=eq.${made.ot_lists?.id}&select=id`)).rows.length === 1);
  const audit = await rest(admin, 'GET', `audit_log?entity_id=eq.${TARGET}&action=eq.DELETE&select=details&order=created_at.desc&limit=1`);
  check('an audit entry records the erase, without patient details',
    audit.rows.length === 1 && audit.rows[0].details.includes('erased') && !audit.rows[0].details.includes('Erase Check'),
    describe(audit));
  const again = await erase(admin, TARGET);
  check('erasing again is harmless', again.status === 200 && again.json?.rows_removed === 0, describe(again));
} finally {
  await cleanUp();
}

console.log('— afterwards —');
check('the throw-away patients are gone',
  (await rest(admin, 'GET', `patients?ip_no=in.(${TARGET},${OTHER})&select=ip_no`)).rows.length === 0);

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
