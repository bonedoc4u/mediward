#!/usr/bin/env node
/**
 * check-patient-role-rules.mjs — live check of the role rules on the patients table.
 *
 * Proves, against a real database, that each role can do what the role table
 * allows on a patient record and nothing more (audit 2026-11-12, SEC-06 step 2;
 * migration 20261114090000_patients_role_rules.sql).
 *
 * DEV ONLY. It signs in with the four fake logins from .dev-test-login.local
 * and refuses to run against the production project. It works on one
 * throw-away fake patient (ZZ-ROLE-CHECK) which it creates and deletes; the
 * seeded patients are only read.
 *
 *   node scripts/check-patient-role-rules.mjs
 */
import fs from 'node:fs';

const PROD_REF = 'mnyjpxkopiktsrqmjilb';
const TEMP = 'ZZ-ROLE-CHECK';
const TEMP_RENAMED = 'ZZ-ROLE-CHECK-2';

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
  let rows = []; let message = ''; let value;
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) rows = j; else if (j && typeof j === 'object') message = j.message ?? ''; else value = j;
  } catch { /* empty body */ }
  return { status: r.status, rows, message, value };
}

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `   [${detail}]`}`);
  if (!ok) failed += 1;
};
const describe = (res) => `HTTP ${res.status}, ${res.rows.length} row(s)${res.message ? `, "${res.message}"` : ''}`;

/** Allowed: the write went through and returned the changed row. */
const allowed = (label, res) => check(label, res.status < 300 && res.rows.length === 1, describe(res));
/** Refused for the role: an error whose text starts with ROLE_FORBIDDEN (the app keys on it). */
const refused = (label, res) => check(label, res.status >= 400 && res.message.startsWith('ROLE_FORBIDDEN'), describe(res));
/** Blocked silently: no error, nothing changed (how a refused DELETE looks). */
const nothingDone = (label, res) => check(label, res.rows.length === 0, describe(res));

const patch = (token, ipNo, body) => rest(token, 'PATCH', `patients?ip_no=eq.${ipNo}`, body);
const del = (token, ipNo) => rest(token, 'DELETE', `patients?ip_no=eq.${ipNo}`);

const admin = await signIn(env.TEST_ADMIN_EMAIL);
const resident = await signIn(env.TEST_RESIDENT_EMAIL);
const houseSurgeon = await signIn(env.TEST_HOUSE_SURGEON_EMAIL);
const attending = await signIn(env.TEST_ATTENDING_EMAIL);

const stored = async () => (await rest(admin, 'GET', `patients?ip_no=in.(${TEMP},${TEMP_RENAMED})&select=*`)).rows[0];
const seededCount = async () => (await rest(admin, 'GET', 'patients?ip_no=like.TEST-*&select=ip_no')).rows.length;
const seededBefore = await seededCount();

// Start clean (a run that crashed half-way may have left the throw-away patient behind).
await patch(admin, TEMP_RENAMED, { deleted_at: null });
await del(admin, TEMP); await del(admin, TEMP_RENAMED);

// A new fake patient, copied from a seeded one so every required column is filled.
const template = (await rest(admin, 'GET', 'patients?ip_no=eq.TEST-0001&select=*')).rows[0];
if (!template) { console.error('Seed patient TEST-0001 not found — is this the dev project?'); process.exit(2); }
const { created_at: _c, updated_at: _u, version: _v, ...copy } = template;
const newPatient = {
  ...copy, ip_no: TEMP, name: 'Role Check (fake)', bed: 'ZZ', patient_status: 'Fit',
  deleted_at: null, dod: null, discharge_summary: null, todos: [],
};

console.log('— adding a patient —');
refused('attending cannot add a patient', await rest(attending, 'POST', 'patients', newPatient));
refused('house surgeon cannot add a patient who is already discharged',
  await rest(houseSurgeon, 'POST', 'patients', { ...newPatient, patient_status: 'Discharged' }));
allowed('house surgeon can add a patient', await rest(houseSurgeon, 'POST', 'patients', newPatient));

console.log('— as the attending (round notes and orders only) —');
const order = [{ id: 'role-check-1', task: 'Role check order (fake)', isDone: false }];
allowed('can change the orders', await patch(attending, TEMP, { todos: order }));
allowed('can send unchanged columns beside the orders (a full-row save with only the orders edited)',
  await patch(attending, TEMP, { todos: [], diagnosis: template.diagnosis, bed: 'ZZ' }));
refused('cannot change the diagnosis', await patch(attending, TEMP, { diagnosis: 'Changed by attending' }));
refused('cannot slip another column in beside the orders',
  await patch(attending, TEMP, { todos: order, drug_allergies: ['changed by attending'] }));
refused('cannot discharge', await patch(attending, TEMP, { patient_status: 'Discharged' }));
refused('cannot remove the record', await patch(attending, TEMP, { deleted_at: new Date().toISOString() }));
nothingDone('cannot hard-delete the record', await del(attending, TEMP));
const renameByAttending = await rest(attending, 'POST', 'rpc/rename_patient_ip_no', { p_old_ip_no: TEMP, p_new_ip_no: TEMP_RENAMED });
refused('cannot correct the IP number', renameByAttending);
{
  const p = await stored();
  check('record is unchanged after all of that',
    p?.ip_no === TEMP && p.diagnosis === template.diagnosis && p.patient_status === 'Fit' && p.deleted_at === null,
    JSON.stringify({ ip_no: p?.ip_no, status: p?.patient_status, deleted_at: p?.deleted_at }));
}

console.log('— as the house surgeon (add and edit, no discharge) —');
allowed('can edit the diagnosis', await patch(houseSurgeon, TEMP, { diagnosis: '# role check (fake)' }));
allowed('can mark the patient ready for discharge', await patch(houseSurgeon, TEMP, { patient_status: 'Discharge Ready' }));
refused('cannot discharge', await patch(houseSurgeon, TEMP, { patient_status: 'Discharged' }));
refused('cannot remove the record', await patch(houseSurgeon, TEMP, { deleted_at: new Date().toISOString() }));
nothingDone('cannot hard-delete the record', await del(houseSurgeon, TEMP));
const renameByHs = await rest(houseSurgeon, 'POST', 'rpc/rename_patient_ip_no', { p_old_ip_no: TEMP, p_new_ip_no: TEMP_RENAMED });
check('can correct the IP number', renameByHs.status < 300, describe(renameByHs));
const renameBack = await rest(houseSurgeon, 'POST', 'rpc/rename_patient_ip_no', { p_old_ip_no: TEMP_RENAMED, p_new_ip_no: TEMP });
check('…and correct it back', renameBack.status < 300, describe(renameBack));

console.log('— as the resident (may discharge, may not remove) —');
allowed('can discharge', await patch(resident, TEMP, { patient_status: 'Discharged', dod: '2026-11-14' }));
refused('house surgeon cannot undo the discharge', await patch(houseSurgeon, TEMP, { patient_status: 'Fit' }));
allowed('house surgeon can still correct the discharged record', await patch(houseSurgeon, TEMP, { discharge_summary: null, bed: 'ZY' }));
allowed('resident can undo the discharge', await patch(resident, TEMP, { patient_status: 'Fit', dod: null }));
refused('cannot remove the record', await patch(resident, TEMP, { deleted_at: new Date().toISOString() }));
nothingDone('cannot hard-delete the record', await del(resident, TEMP));

console.log('— as the admin —');
allowed('can remove the record', await patch(admin, TEMP, { deleted_at: new Date().toISOString() }));
refused('resident cannot restore a removed record', await patch(resident, TEMP, { deleted_at: null }));
allowed('can restore it', await patch(admin, TEMP, { deleted_at: null }));
allowed('can discharge', await patch(admin, TEMP, { patient_status: 'Discharged' }));
check('can hard-delete (this also cleans up the throw-away patient)', (await del(admin, TEMP)).rows.length === 1);

console.log('— afterwards —');
check('the throw-away patient is gone', (await stored()) === undefined);
check(`the ${seededBefore} seeded patients are all still there`, (await seededCount()) === seededBefore);

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
