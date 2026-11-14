#!/usr/bin/env node
/**
 * check-settings-role-rules.mjs — live check of the role rules on the settings tables.
 *
 * Proves, against a real database, that only an admin can change hospital
 * settings, wards and unit chiefs, with one exception: a role that may add
 * patients may change the shared comorbidity preset list and nothing else
 * (audit 2026-11-12, SEC-06 step 4; migration
 * 20261114150000_settings_tables_role_rules.sql).
 *
 * DEV ONLY. It signs in with the fake logins from .dev-test-login.local and
 * refuses to run against the production project. It puts every setting back
 * the way it found it and deletes the throw-away ward and unit chief (ZZ…).
 *
 *   node scripts/check-settings-role-rules.mjs
 */
import fs from 'node:fs';

const PROD_REF = 'mnyjpxkopiktsrqmjilb';
const WARD = 'ZZ Role Check (fake)';

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
const refused = (label, res) => check(label, res.status >= 400 && res.message.startsWith('ROLE_FORBIDDEN'), describe(res));

const admin = await signIn(env.TEST_ADMIN_EMAIL);
const resident = await signIn(env.TEST_RESIDENT_EMAIL);
const houseSurgeon = await signIn(env.TEST_HOUSE_SURGEON_EMAIL);
const attending = await signIn(env.TEST_ATTENDING_EMAIL);

const settingsRow = async () => (await rest(admin, 'GET', 'hospital_config?select=*')).rows[0];
const original = await settingsRow();
if (!original) { console.error('No hospital_config row on dev — nothing to check against.'); process.exit(2); }
const H = original.hospital_id;
const cfg = `hospital_config?id=eq.${original.id}`;
const sameSettings = (a, b) => {
  const strip = ({ updated_at: _u, ...rest }) => JSON.stringify(rest);
  return !!a && !!b && strip(a) === strip(b);
};

/**
 * Put the settings back exactly as they were found, whatever happened. Where
 * the rules are not applied yet, the "cannot" checks really do change or even
 * delete the row — it must never stay that way.
 */
async function putBack() {
  const { id: _i, hospital_id: _h, ...settings } = original;
  await rest(admin, 'DELETE', `hospital_config?hospital_name=eq.${encodeURIComponent('Second row by resident')}`);
  if (await settingsRow()) await rest(admin, 'PATCH', cfg, settings);
  else await rest(admin, 'POST', 'hospital_config', original);
}

// Leftovers from a run that crashed half-way.
await rest(admin, 'DELETE', `ward_config?name=eq.${encodeURIComponent(WARD)}`);
await rest(admin, 'DELETE', 'unit_chiefs?unit=eq.ZZ');
const count = async (t) => (await rest(admin, 'GET', `${t}?select=id`)).rows.length;
const before = { wards: await count('ward_config'), chiefs: await count('unit_chiefs') };

const presets = [...(original.comorbidity_map ?? []), { short: 'ZZ', full: 'Role check (fake)' }];

try {
console.log('— hospital settings —');
check('everybody can read them', (await rest(attending, 'GET', `${cfg}&select=id`)).rows.length === 1);
refused('attending cannot change the preset list', await rest(attending, 'PATCH', cfg, { comorbidity_map: presets }));
refused('attending cannot rename the hospital', await rest(attending, 'PATCH', cfg, { hospital_name: 'Changed by attending' }));
allowed('resident can change the comorbidity preset list', await rest(resident, 'PATCH', cfg, { comorbidity_map: presets }));
allowed('house surgeon can change the comorbidity preset list',
  await rest(houseSurgeon, 'PATCH', cfg, { comorbidity_map: original.comorbidity_map ?? [] }));
{
  // What the app before this change sends: the whole row, with only the preset list edited.
  const { id: _i, hospital_id: _h, ...whole } = original;
  allowed('resident can save the whole row when only the preset list differs (older app)',
    await rest(resident, 'PATCH', cfg, { ...whole, comorbidity_map: presets, updated_at: new Date().toISOString() }));
}
refused('resident cannot rename the hospital', await rest(resident, 'PATCH', cfg, { hospital_name: 'Changed by resident' }));
refused('resident cannot change the alert thresholds',
  await rest(resident, 'PATCH', cfg, { vital_thresholds: { spO2Min: 50 } }));
refused('resident cannot switch a module off', await rest(resident, 'PATCH', cfg, { show_news2: !original.show_news2 }));
refused('resident cannot slip another setting in beside the preset list',
  await rest(resident, 'PATCH', cfg, { comorbidity_map: presets, hospital_name: 'Changed by resident' }));
refused('resident cannot change the weekend duty roster', await rest(resident, 'PATCH', cfg, { weekend_duty: { ZZ: 'x' } }));
refused('resident cannot delete the settings', await rest(resident, 'DELETE', cfg));
refused('resident cannot add a settings row',
  await rest(resident, 'POST', 'hospital_config', { hospital_id: H, hospital_name: 'Second row by resident' }));
allowed('admin can rename the hospital', await rest(admin, 'PATCH', cfg, { hospital_name: `${original.hospital_name} (role check)` }));
allowed('…and put everything back',
  await rest(admin, 'PATCH', cfg, { hospital_name: original.hospital_name, comorbidity_map: original.comorbidity_map }));
check('settings are exactly as they were', sameSettings(await settingsRow(), original));

console.log('— wards —');
const ward = { name: WARD, hospital_id: H, sort_order: 99, is_icu: false, active: true };
refused('resident cannot add a ward', await rest(resident, 'POST', 'ward_config', ward));
refused('attending cannot add a ward', await rest(attending, 'POST', 'ward_config', ward));
const madeWard = allowed('admin can add a ward', await rest(admin, 'POST', 'ward_config', ward));
if (madeWard) {
  const w = `ward_config?id=eq.${madeWard.id}`;
  refused('resident cannot rename it', await rest(resident, 'PATCH', w, { name: 'Renamed by resident' }));
  refused('house surgeon cannot delete it', await rest(houseSurgeon, 'DELETE', w));
  check('everybody can still read it', (await rest(attending, 'GET', `${w}&select=id`)).rows.length === 1);
  allowed('admin can change it', await rest(admin, 'PATCH', w, { sort_order: 98 }));
  allowed('admin can delete it', await rest(admin, 'DELETE', w));
}

console.log('— unit chiefs —');
const UPSERT = 'return=representation,resolution=merge-duplicates';
const chief = (name) => ({ hospital_id: H, unit: 'ZZ', chief_name: name });
refused('resident cannot set a unit chief',
  await rest(resident, 'POST', 'unit_chiefs?on_conflict=hospital_id,unit', chief('Set by resident'), UPSERT));
const madeChief = allowed('admin can set a unit chief (the way the app saves it)',
  await rest(admin, 'POST', 'unit_chiefs?on_conflict=hospital_id,unit', chief('Dr Role Check (fake)'), UPSERT));
if (madeChief) {
  const c = `unit_chiefs?id=eq.${madeChief.id}`;
  refused('resident cannot change it', await rest(resident, 'PATCH', c, { chief_name: 'Changed by resident' }));
  refused('attending cannot delete it', await rest(attending, 'DELETE', c));
  check('everybody can still read it', (await rest(attending, 'GET', `${c}&select=id`)).rows.length === 1);
  allowed('admin can change it (same save again)',
    await rest(admin, 'POST', 'unit_chiefs?on_conflict=hospital_id,unit', chief('Dr Role Check 2 (fake)'), UPSERT));
  allowed('admin can delete it', await rest(admin, 'DELETE', c));
}

} finally {
  await putBack();
}

console.log('— afterwards —');
await rest(admin, 'DELETE', `ward_config?name=in.(${encodeURIComponent(`"${WARD}"`)},"Renamed by resident")`);
await rest(admin, 'DELETE', 'unit_chiefs?unit=eq.ZZ');
check('settings are exactly as they were', sameSettings(await settingsRow(), original));
check('same number of wards and unit chiefs as before',
  (await count('ward_config')) === before.wards && (await count('unit_chiefs')) === before.chiefs);

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
