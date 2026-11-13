#!/usr/bin/env node
/**
 * check-rounds-save-twice.mjs — live check that a round can be saved more
 * than once per patient per day (audit 2026-11-12, DATA-09).
 *
 * Production's rounds table had an "updated_at" trigger but no updated_at
 * column, so every UPDATE was rejected: only the first save of the day worked.
 *
 * DEV ONLY. Signs in with the fake resident from .dev-test-login.local and
 * refuses to run against production. Uses a date far in the past and removes
 * the row afterwards.
 *
 *   node scripts/check-rounds-save-twice.mjs
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

const signIn = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.TEST_RESIDENT_EMAIL, password: env.TEST_PASSWORD }),
})).json();
if (!signIn.access_token) { console.error('sign-in failed'); process.exit(2); }
const headers = {
  apikey: ANON, Authorization: `Bearer ${signIn.access_token}`, 'Content-Type': 'application/json',
};

const PATIENT = 'TEST-0002';
const DATE = '2001-01-01';
const HOSPITAL = 'aaaaaaaa-0000-4000-8000-000000000001';

// Exactly what services/roundsService.ts upsertRound() sends.
const save = async (todos) => {
  const r = await fetch(`${URL_}/rest/v1/rounds?on_conflict=patient_ip_no,date`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ patient_ip_no: PATIENT, hospital_id: HOSPITAL, date: DATE, note: '# test', todos }),
  });
  const body = await r.json().catch(() => null);
  return { status: r.status, row: Array.isArray(body) ? body[0] : null, error: Array.isArray(body) ? null : body };
};

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `  → ${detail}`}`);
  if (!ok) failed += 1;
};

const first = await save([{ id: 't1', task: 'Repeat Hb', isDone: false }]);
check('first save of the day is accepted', first.status < 300, JSON.stringify(first.error));

const second = await save([{ id: 't1', task: 'Repeat Hb', isDone: true }]);
check('second save the same day is accepted', second.status < 300, JSON.stringify(second.error));
check('the second save is what the database now holds', second.row?.todos?.[0]?.isDone === true);
check('the row version went up', (second.row?.version ?? 0) > (first.row?.version ?? 0));

await fetch(`${URL_}/rest/v1/rounds?patient_ip_no=eq.${PATIENT}&date=eq.${DATE}`, { method: 'DELETE', headers });

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
