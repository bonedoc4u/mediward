#!/usr/bin/env node
/**
 * check-clinical-role-rules.mjs — live check of the role rules on the clinical tables.
 *
 * Proves, against a real database, that only a role with the right permission
 * can add, change or delete rounds, labs, imaging, bedside charting and OT
 * lists (audit 2026-11-12, SEC-06 step 3; migration
 * 20261114120000_clinical_tables_role_rules.sql), and that the roles that
 * could write before still can.
 *
 * DEV ONLY. It signs in with the fake logins from .dev-test-login.local and
 * refuses to run against the production project. It works on one throw-away
 * fake patient (ZZ-ROLE-CHECK) and one throw-away OT list (unit ZZ, year
 * 2099), creates every row it needs and deletes them all. Seeded data is only
 * read.
 *
 *   node scripts/check-clinical-role-rules.mjs
 */
import fs from 'node:fs';

const PROD_REF = 'mnyjpxkopiktsrqmjilb';
const TEMP = 'ZZ-ROLE-CHECK';
const TEMP_RENAMED = 'ZZ-ROLE-CHECK-2';
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
  return j.access_token;
}

/** REST call as a signed-in user → { status, rows, message }. */
async function rest(token, method, path, body, prefer = 'return=representation') {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let rows = []; let message = '';
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) rows = j; else if (j && typeof j === 'object') message = j.message ?? '';
  } catch { /* empty body */ }
  return { status: r.status, rows, message };
}

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `   [${detail}]`}`);
  if (!ok) failed += 1;
};
const describe = (res) => `HTTP ${res.status}, ${res.rows.length} row(s)${res.message ? `, "${res.message}"` : ''}`;
const allowed = (label, res) => { check(label, res.status < 300 && res.rows.length === 1, describe(res)); return res.rows[0]; };
/** Refused for the role: an error whose text starts with ROLE_FORBIDDEN — never a silent "0 rows". */
const refused = (label, res) => check(label, res.status >= 400 && res.message.startsWith('ROLE_FORBIDDEN'), describe(res));

const admin = await signIn(env.TEST_ADMIN_EMAIL);
const resident = await signIn(env.TEST_RESIDENT_EMAIL);
const houseSurgeon = await signIn(env.TEST_HOUSE_SURGEON_EMAIL);
const attending = await signIn(env.TEST_ATTENDING_EMAIL);

const template = (await rest(admin, 'GET', 'patients?ip_no=eq.TEST-0001&select=*')).rows[0];
if (!template) { console.error('Seed patient TEST-0001 not found — is this the dev project?'); process.exit(2); }
const H = template.hospital_id;

/** Remove everything this script creates. Deleting the patient cascades to its clinical rows. */
async function cleanUp() {
  for (const ip of [TEMP, TEMP_RENAMED]) await rest(admin, 'DELETE', `patients?ip_no=eq.${ip}`);
  await rest(admin, 'DELETE', `ot_lists?unit=eq.ZZ&list_date=eq.${FAR}`);
}

const TABLES = ['rounds', 'labs', 'imaging', 'patient_vitals', 'nursing_notes', 'medications_prescribed',
  'med_administrations', 'wound_care', 'intake_output', 'blood_transfusion', 'ot_lists', 'ot_list_entries'];
const rowCounts = async () => Object.fromEntries(await Promise.all(
  TABLES.map(async t => [t, (await rest(admin, 'GET', `${t}?select=id`)).rows.length])));

await cleanUp(); // a run that crashed half-way may have left rows behind
const countsBefore = await rowCounts();

const { created_at: _c, updated_at: _u, version: _v, ...copy } = template;
const patient = await rest(resident, 'POST', 'patients', {
  ...copy, ip_no: TEMP, name: 'Role Check (fake)', bed: 'ZZ', patient_status: 'Fit',
  deleted_at: null, dod: null, discharge_summary: null, todos: [],
});
if (patient.rows.length !== 1) { console.error(`Could not create the throw-away patient: ${describe(patient)}`); process.exit(2); }

const ofPatient = { patient_ip_no: TEMP, hospital_id: H };
/**
 * One entry per table: the permission it needs, a valid fake row, and a small
 * change to it. `row` may be a function when it needs the id of an earlier row.
 */
const made = {};
const SPECS = [
  { table: 'rounds', what: 'a round note', attendingMay: true,
    row: { ...ofPatient, date: FAR, note: 'role check (fake)', todos: [] }, change: { note: 'role check, edited' } },
  { table: 'labs', what: 'a lab result',
    row: { ...ofPatient, date: FAR, type: 'Hb', value: 10 }, change: { value: 11 } },
  { table: 'imaging', what: 'an imaging record',
    row: { ...ofPatient, date: FAR, type: 'X-ray', findings: 'role check (fake)' }, change: { findings: 'edited' } },
  { table: 'patient_vitals', what: 'a vitals entry',
    row: { ...ofPatient, timestamp: `${FAR}T08:00:00Z`, heart_rate: 80 }, change: { heart_rate: 90 } },
  { table: 'nursing_notes', what: 'a nursing note',
    row: { ...ofPatient, shift: 'Morning', note: 'role check (fake)' }, change: { note: 'edited' } },
  { table: 'medications_prescribed', what: 'a prescription',
    row: { ...ofPatient, drug_name: 'Role check (fake)', dose: '1', route: 'PO', frequency: 'OD', start_date: FAR },
    change: { dose: '2' } },
  { table: 'med_administrations', what: 'a medication record',
    row: () => ({ ...ofPatient, medication_id: made.medications_prescribed?.id, status: 'given' }), change: { status: 'held' } },
  { table: 'wound_care', what: 'a wound-care entry',
    row: { patient_ip_no: TEMP, wound_site: 'role check (fake)' }, change: { wound_site: 'edited' } },
  { table: 'intake_output', what: 'an intake/output entry',
    row: { patient_ip_no: TEMP, type: 'intake', category: 'Oral', amount_ml: 100 }, change: { amount_ml: 200 } },
  { table: 'blood_transfusion', what: 'a transfusion record',
    row: { patient_ip_no: TEMP, blood_product: 'PRBC (fake)' }, change: { blood_product: 'FFP (fake)' } },
  { table: 'ot_lists', what: 'an OT list',
    row: { hospital_id: H, unit: 'ZZ', ot_type: 'Minor', list_date: FAR }, change: { surgeon: 'Role Check (fake)' } },
  { table: 'ot_list_entries', what: 'an OT list entry',
    row: () => ({ ot_list_id: made.ot_lists?.id, hospital_id: H, sequence: 1, category: 'Elective', patient_ip_no: TEMP,
      name: 'Role Check (fake)', age: '50', gender: 'M', ward: 'ZZ', unit: 'ZZ', diagnosis: 'role check (fake)' }),
    change: { remarks: 'edited' } },
];

for (const spec of SPECS) {
  const { table, what, change } = spec;
  const row = typeof spec.row === 'function' ? spec.row() : spec.row;
  const byId = (id) => `${table}?id=eq.${id}`;
  console.log(`— ${table} —`);

  if (spec.attendingMay) {
    const mine = allowed(`attending can add ${what}`, await rest(attending, 'POST', table, row));
    if (mine) {
      allowed(`attending can change it`, await rest(attending, 'PATCH', byId(mine.id), change));
      allowed('attending can save it again the way the app does (upsert)',
        await rest(attending, 'POST', `${table}?on_conflict=patient_ip_no,date`, { ...row, note: 'role check, upsert' },
          'return=representation,resolution=merge-duplicates'));
      allowed('attending can delete it', await rest(attending, 'DELETE', byId(mine.id)));
    }
  } else {
    refused(`attending cannot add ${what}`, await rest(attending, 'POST', table, row));
  }

  const kept = allowed(`house surgeon can add ${what}`, await rest(houseSurgeon, 'POST', table, row));
  made[table] = kept;
  if (!kept) continue;

  if (!spec.attendingMay) {
    refused('attending cannot change it', await rest(attending, 'PATCH', byId(kept.id), change));
    refused('attending cannot delete it', await rest(attending, 'DELETE', byId(kept.id)));
    const still = (await rest(admin, 'GET', `${byId(kept.id)}&select=*`)).rows[0];
    const field = Object.keys(change)[0];
    check('it is unchanged after that', !!still && String(still[field]) !== String(change[field]));
  }
  allowed(`house surgeon can change it`, await rest(houseSurgeon, 'PATCH', byId(kept.id), change));
  check('everybody can still read it',
    (await rest(attending, 'GET', `${byId(kept.id)}&select=id`)).rows.length === 1);
}

console.log('— changes the database makes itself (cascades) —');
// Correcting an IP number rewrites patient_ip_no in every clinical table.
const rename = await rest(houseSurgeon, 'POST', 'rpc/rename_patient_ip_no', { p_old_ip_no: TEMP, p_new_ip_no: TEMP_RENAMED });
check('house surgeon can correct the IP number of a patient who has clinical records', rename.status < 300, describe(rename));
check('…and the records follow the patient',
  (await rest(admin, 'GET', `labs?patient_ip_no=eq.${TEMP_RENAMED}&select=id`)).rows.length === 1
  && (await rest(admin, 'GET', `wound_care?patient_ip_no=eq.${TEMP_RENAMED}&select=id`)).rows.length === 1);
const renameBack = await rest(houseSurgeon, 'POST', 'rpc/rename_patient_ip_no', { p_old_ip_no: TEMP_RENAMED, p_new_ip_no: TEMP });
check('…and back', renameBack.status < 300, describe(renameBack));

// Stopping a prescription the way the app does, then deleting it (its medication record goes with it).
if (made.medications_prescribed) {
  allowed('house surgeon can stop a prescription',
    await rest(houseSurgeon, 'PATCH', `medications_prescribed?id=eq.${made.medications_prescribed.id}`, { active: false }));
  allowed('house surgeon can delete a prescription that has a medication record',
    await rest(houseSurgeon, 'DELETE', `medications_prescribed?id=eq.${made.medications_prescribed.id}`));
  check('…and its medication record is gone',
    (await rest(admin, 'GET', `med_administrations?patient_ip_no=eq.${TEMP}&select=id`)).rows.length === 0);
}
if (made.ot_lists) {
  allowed('house surgeon can delete an OT list that has entries',
    await rest(houseSurgeon, 'DELETE', `ot_lists?id=eq.${made.ot_lists.id}`));
}
for (const table of ['labs', 'imaging', 'patient_vitals']) {
  if (made[table]) allowed(`house surgeon can delete from ${table}`, await rest(houseSurgeon, 'DELETE', `${table}?id=eq.${made[table].id}`));
}
// The rest (round, nursing note, wound care, intake/output, transfusion) go with the patient.
check('admin can permanently delete a patient who still has clinical records',
  (await rest(admin, 'DELETE', `patients?ip_no=eq.${TEMP}`)).rows.length === 1);

console.log('— afterwards —');
await cleanUp();
const countsAfter = await rowCounts();
check('every clinical table has the same number of rows as before',
  TABLES.every(t => countsBefore[t] === countsAfter[t]),
  TABLES.filter(t => countsBefore[t] !== countsAfter[t]).map(t => `${t}: ${countsBefore[t]} → ${countsAfter[t]}`).join(', '));

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
