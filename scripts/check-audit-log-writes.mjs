#!/usr/bin/env node
/**
 * check-audit-log-writes.mjs — live check that the audit log cannot be faked.
 *
 * Proves, against a real database (audit 2026-11-12, SEC-05; migration
 * 20261114200000_audit_log_no_direct_insert.sql):
 *   - a signed-in user cannot insert an audit row directly,
 *   - the app's way of logging (insert_audit_event) still works and records
 *     the user's real name, not one the caller chose,
 *   - audit rows still cannot be changed or deleted.
 *
 * DEV ONLY. Signs in with the fake logins from .dev-test-login.local and
 * refuses to run against production. Audit rows cannot be deleted, so each
 * run leaves a few rows with entity "zz_audit_check" in the dev log.
 *
 *   node scripts/check-audit-log-writes.mjs
 */
import fs from 'node:fs';

const PROD_REF = 'mnyjpxkopiktsrqmjilb';
const ENTITY = 'zz_audit_check';

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
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* empty */ }
  return { status: r.status, json, message: json && !Array.isArray(json) ? json.message ?? '' : '' };
}

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `   [${detail}]`}`);
  if (!ok) failed += 1;
};
const describe = (res) => `HTTP ${res.status}${res.message ? `, "${res.message}"` : ''}`;

const resident = await signIn(env.TEST_RESIDENT_EMAIL);
const admin = await signIn(env.TEST_ADMIN_EMAIL);
const hospitalId = (await rest(resident.token, 'GET', `app_users?id=eq.${resident.id}&select=hospital_id,name`)).json?.[0];
if (!hospitalId) { console.error('Could not read the resident\'s own user row.'); process.exit(2); }
const stamp = `check ${new Date().toISOString()}`;

console.log('— direct writes —');
const forged = await rest(resident.token, 'POST', 'audit_log', {
  hospital_id: hospitalId.hospital_id, user_id: admin.id, user_name: 'Someone Else (forged)',
  action: 'DELETE', entity: ENTITY, entity_id: 'forged', details: `forged ${stamp}`,
});
check('a resident cannot add a made-up audit row', forged.status >= 400, describe(forged));
const forgedRows = await rest(admin.token, 'GET', `audit_log?entity=eq.${ENTITY}&details=eq.${encodeURIComponent(`forged ${stamp}`)}&select=id`);
check('…and no such row exists', Array.isArray(forgedRows.json) && forgedRows.json.length === 0, describe(forgedRows));

console.log('— the app\'s way —');
const real = await rest(resident.token, 'POST', 'rpc/insert_audit_event', {
  p_action: 'VIEW', p_entity: ENTITY, p_entity_id: 'real', p_details: `real ${stamp}`,
});
check('insert_audit_event still works', real.status < 300, describe(real));
const realRow = (await rest(admin.token, 'GET',
  `audit_log?entity=eq.${ENTITY}&details=eq.${encodeURIComponent(`real ${stamp}`)}&select=id,user_id,user_name`)).json?.[0];
check('…and records the real user, not one the caller chose',
  realRow?.user_id === resident.id && realRow?.user_name === hospitalId.name, JSON.stringify(realRow));

console.log('— rows stay as written —');
if (realRow) {
  await rest(admin.token, 'PATCH', `audit_log?id=eq.${realRow.id}`, { details: 'changed' });
  await rest(admin.token, 'DELETE', `audit_log?id=eq.${realRow.id}`);
  const after = (await rest(admin.token, 'GET', `audit_log?id=eq.${realRow.id}&select=details`)).json?.[0];
  check('an admin cannot change or delete an audit row', after?.details === `real ${stamp}`, JSON.stringify(after));
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
