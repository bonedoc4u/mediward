#!/usr/bin/env node
/**
 * check-app-users-rls.mjs — live check of the app_users access rules.
 *
 * Proves, against a real database, that a normal user cannot change roles
 * (audit 2026-11-12, SEC-01) and that an admin still can manage their team.
 *
 * DEV ONLY. It signs in with the two fake logins from .dev-test-login.local
 * and refuses to run against the production project. It leaves the data as
 * it found it (every successful change is reverted).
 *
 *   node scripts/check-app-users-rls.mjs
 */
import fs from 'node:fs';

const PROD_REF = 'mnyjpxkopiktsrqmjilb';

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
  if (!j.access_token) throw new Error(`sign-in failed for ${email}`);
  return { token: j.access_token, id: j.user.id };
}

/** REST call as a signed-in user. Returns { status, rows } (rows = [] when RLS filtered everything). */
async function rest(token, method, path, body, prefer = 'return=representation') {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let rows = [];
  try { const j = JSON.parse(text); rows = Array.isArray(j) ? j : []; } catch { /* empty body */ }
  return { status: r.status, rows };
}

let failed = 0;
const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
};
/** A write is "blocked" when it errors (4xx) or changes zero rows. */
const blocked = (res) => res.status >= 400 || res.rows.length === 0;

const resident = await signIn(env.TEST_RESIDENT_EMAIL);
const admin = await signIn(env.TEST_ADMIN_EMAIL);
const roleOf = async (id) => (await rest(admin.token, 'GET', `app_users?id=eq.${id}&select=role`)).rows[0]?.role;

console.log('— as a resident —');
check('cannot make themselves super-admin',
  blocked(await rest(resident.token, 'PATCH', `app_users?id=eq.${resident.id}`, { role: 'superadmin' })));
check('cannot make themselves admin',
  blocked(await rest(resident.token, 'PATCH', `app_users?id=eq.${resident.id}`, { role: 'admin' })));
check('role is still "resident" afterwards', (await roleOf(resident.id)) === 'resident');
check('cannot edit a colleague',
  blocked(await rest(resident.token, 'PATCH', `app_users?id=eq.${admin.id}`, { name: 'Changed by resident' })));
check('cannot delete a colleague',
  blocked(await rest(resident.token, 'DELETE', `app_users?id=eq.${admin.id}`)));
check('colleague still exists', (await roleOf(admin.id)) === 'admin');
check('cannot add a user row',
  blocked(await rest(resident.token, 'POST', 'app_users', {
    id: '00000000-0000-4000-8000-00000000dead', email: 'intruder@test-hospital.mediward.test',
    name: 'Intruder', role: 'admin', hospital_id: env.TEST_HOSPITAL_ID ?? 'aaaaaaaa-0000-4000-8000-000000000001',
  })));
check('can still read colleagues (Team list, sign-in lookup)',
  (await rest(resident.token, 'GET', 'app_users?select=id')).rows.length >= 2);

console.log('— as an admin —');
const promote = await rest(admin.token, 'PATCH', `app_users?id=eq.${resident.id}`, { role: 'house_surgeon' });
check('can change a team member\'s role', promote.rows[0]?.role === 'house_surgeon');
const revert = await rest(admin.token, 'PATCH', `app_users?id=eq.${resident.id}`, { role: 'resident' });
check('…and change it back', revert.rows[0]?.role === 'resident');
// Team Settings saves with an upsert on email (services/userService.ts upsertAppUser).
const UPSERT = 'return=representation,resolution=merge-duplicates';
const teamEdit = (role, unit) => rest(admin.token, 'POST', 'app_users?on_conflict=email', {
  id: resident.id, email: env.TEST_RESIDENT_EMAIL, name: 'Test Resident', role, ward: null, unit,
  hospital_id: 'aaaaaaaa-0000-4000-8000-000000000001',
}, UPSERT);
check('Team Settings save (upsert) can change a member\'s unit', (await teamEdit('resident', 'OR2')).rows[0]?.unit === 'OR2');
check('…and change it back', (await teamEdit('resident', 'OR1')).rows[0]?.unit === 'OR1');
check('Team Settings save cannot set super-admin', blocked(await teamEdit('superadmin', 'OR1')));
check('cannot make a team member super-admin',
  blocked(await rest(admin.token, 'PATCH', `app_users?id=eq.${resident.id}`, { role: 'superadmin' })));
check('cannot make themselves super-admin',
  blocked(await rest(admin.token, 'PATCH', `app_users?id=eq.${admin.id}`, { role: 'superadmin' })));
check('cannot delete their own account',
  blocked(await rest(admin.token, 'DELETE', `app_users?id=eq.${admin.id}`)));
check('roles unchanged at the end',
  (await roleOf(resident.id)) === 'resident' && (await roleOf(admin.id)) === 'admin');

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
