/**
 * e2e/smoke.spec.ts
 * 3 critical smoke tests run against the staging Vercel preview after each deploy.
 * Set env vars: PLAYWRIGHT_BASE_URL, TEST_USER_EMAIL, TEST_USER_PASSWORD
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const EMAIL    = process.env.TEST_USER_EMAIL    ?? 'dr.or1@staging.mediward.test';
if (!process.env.TEST_USER_PASSWORD) {
  throw new Error('TEST_USER_PASSWORD env var is required — do not hardcode credentials');
}
const PASSWORD = process.env.TEST_USER_PASSWORD;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.waitForSelector('[data-testid="login-email"], input[type="email"]', { timeout: 15_000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for dashboard to appear — confirms login succeeded
  await page.waitForSelector('[data-testid="ward-dashboard"], [data-testid="dashboard"]', { timeout: 20_000 });
}

// ── SMOKE TEST 1: Login flow ─────────────────────────────────────────────────

test('1 · login → see ward dashboard', async ({ page }) => {
  await page.goto(BASE_URL);

  // Login form must be visible on first load
  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible({ timeout: 15_000 });

  // Fill in test credentials
  await emailInput.fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Ward dashboard (patient list) must appear within 20s
  await expect(page.locator('h1, h2').filter({ hasText: /ward|dashboard|patients/i }).first())
    .toBeVisible({ timeout: 20_000 });

  // Must NOT show any auth error
  await expect(page.locator('[role="alert"], .text-red-500').filter({ hasText: /error|invalid|failed/i }))
    .toHaveCount(0);
});

// ── SMOKE TEST 2: Admit a patient ────────────────────────────────────────────

test('2 · admit new patient → appears in dashboard', async ({ page }) => {
  await login(page);

  // Open the admit / add patient modal
  const addBtn = page.locator('button').filter({ hasText: /admit|add patient/i }).first();
  await expect(addBtn).toBeVisible({ timeout: 10_000 });
  await addBtn.click();

  // A modal should open
  const modal = page.locator('[role="dialog"], [data-testid="add-patient-modal"]');
  await expect(modal).toBeVisible({ timeout: 5_000 });

  // Fill minimum required fields
  const ipNo = `E2E-${Date.now()}`;
  await page.locator('input[name="ipNo"], input[placeholder*="IP"]').fill(ipNo);
  await page.locator('input[name="name"], input[placeholder*="name" i]').fill('E2E Test Patient');

  // Age
  const ageInput = page.locator('input[name="age"], input[type="number"]').first();
  if (await ageInput.isVisible()) await ageInput.fill('40');

  // Ward / bed (pick first option if select)
  const wardSelect = page.locator('select[name="ward"]');
  if (await wardSelect.isVisible()) await wardSelect.selectOption({ index: 1 });

  // Submit
  const submitBtn = modal.locator('button[type="submit"], button').filter({ hasText: /admit|save|add/i }).first();
  await submitBtn.click();

  // Modal should close
  await expect(modal).toBeHidden({ timeout: 15_000 });

  // New patient should appear in the list
  await expect(page.locator('body').filter({ hasText: ipNo }))
    .toBeVisible({ timeout: 10_000 });
});

// ── SMOKE TEST 3: Add a round note ───────────────────────────────────────────

test('3 · open round mode → save a round note', async ({ page }) => {
  await login(page);

  // Navigate to Round Mode
  const roundBtn = page.locator('button, a').filter({ hasText: /round/i }).first();
  await expect(roundBtn).toBeVisible({ timeout: 10_000 });
  await roundBtn.click();

  // Round mode or ward-selection screen should appear
  await expect(page.locator('body').filter({ hasText: /ward round|select.*ward|start.*round/i }).first())
    .toBeVisible({ timeout: 10_000 });

  // Select a ward if picker is shown
  const wardCard = page.locator('[data-testid="ward-card"], button').filter({ hasText: /Ortho Ward A|all ward/i }).first();
  if (await wardCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await wardCard.click();
  }

  // A patient card should appear
  const patientCard = page.locator('[data-testid="patient-card"], .patient-name, h3').first();
  await expect(patientCard).toBeVisible({ timeout: 10_000 });

  // Find the note textarea and type a note
  const noteArea = page.locator('textarea[placeholder*="note" i], textarea[name="note"], textarea').first();
  await expect(noteArea).toBeVisible({ timeout: 5_000 });
  await noteArea.fill('E2E smoke test round note — ' + new Date().toISOString());

  // Save the note
  const saveBtn = page.locator('button').filter({ hasText: /save|next/i }).first();
  await expect(saveBtn).toBeVisible({ timeout: 5_000 });
  await saveBtn.click();

  // A success indicator (toast, checkmark, "Saved") should appear
  await expect(
    page.locator('[role="status"], [data-testid="toast"], .toast, .text-green-')
        .filter({ hasText: /saved|success|synced|done/i })
        .first()
  ).toBeVisible({ timeout: 10_000 });
});
