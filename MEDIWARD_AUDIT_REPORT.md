# MediWard Audit Report
**Date:** 2026-06-28 (Phase 1); revised 2026-06-28 (Phase 2 — deeper service/migration/edge-function reads)
**Auditor:** Claude Code (automated codebase analysis)
**Codebase commit:** `743ae7a fix: regenerate pnpm-lock.yaml to match package.json`

---

## TL;DR — Executive Summary

**Overall score: 6.2 / 10** *(Phase 2 revised — see dimension table)*

MediWard is a genuinely capable ward management application with a well-designed multi-tenant architecture, comprehensive RLS, impressive feature depth (NEWS2, PAC flow, SBAR, RoundMode, AI assistant, offline PWA, concurrent-edit detection), and clean TypeScript with zero `@ts-ignore` annotations. The soft-delete chain is correctly implemented in the service layer (`removePatient`, `restorePatient`, `anonymizePatient`) but the `deleted_at` column was never captured in a migration file — a fresh deployment crashes silently. There are no push notifications so a doctor cannot be alerted to a sepsis-range CRP from outside the app, and a root-level RLS migration file using `OR is_admin()` (no hospital scope) is a cross-tenant PII exposure risk if applied to production. The UX is good on desktop but 30+ native `<select>` elements degrade every mobile interaction, and a dead "Add investigation" button on the LabTrends screen erodes trust.

### Top 3 strengths
1. **Security foundation is solid.** Supabase Auth (bcrypt), zero hardcoded secrets, SECURITY DEFINER helper functions, `hospital_id`-scoped RLS on every table, JWT role verification on login, and a `lookup_user_for_login` RPC that prevents raw anonymous table reads are all correct choices that most ward-management apps get wrong.
2. **Clinical depth beats most tools in the Indian market.** NEWS2 early warning scoring, PAC clearance flowchart, SBAR handover types, specialty templates, concurrent-edit conflict resolution, and an offline write-ahead queue with Workbox BackgroundSync are not found in any off-the-shelf Indian EMR.
3. **Developer experience is production-grade.** `strict: true` TypeScript, zero `@ts-ignore`, husky pre-commit hooks, vitest unit + playwright e2e scaffold, env-check Vite plugin that fails CI on missing vars, and pnpm with lockfile are all correct. The codebase is maintainable.

### Top 3 critical gaps
1. **No push notifications** — `@capacitor/push-notifications` is not installed. A critical lab result entered at 2 AM by the night nurse is invisible to the treating doctor until they manually open the app.
2. **Schema drift: `deleted_at` column is missing from all migrations** — `patientService.ts` already implements soft-delete (`removePatient`, `restorePatient`, `anonymizePatient`) but the `deleted_at` column it reads/writes was never added to any `.sql` migration file. A fresh deployment or `supabase db reset` silently creates a schema without this column, making every delete call a crash.
3. **30+ native `<select>` elements** — AddPatientModal, OTListManagement, ScoringTools, MedicationChart, BloodTransfusion, and five other components use browser-native dropdowns that render as system dialogs on Android, ignoring all Tailwind styling and providing tiny, inconsistent touch targets.

---

## Dimension Scores

| # | Dimension | Score | Trend |
|---|---|---|---|
| 1 | Security | 7/10 | → |
| 2 | UI / UX | 6/10 | → |
| 3 | Clinical workflow | 6/10 | → |
| 4 | Performance | 7/10 | → |
| 5 | Code quality | 7/10 | → |
| 6 | Mobile / native | 5/10 | ↑ (haptics + keyboard resize configured) |
| 7 | Data architecture | 6.5/10 | ↓ (deleted_at schema drift, hardcoded LabTrends params) |
| 8 | Accessibility | 4/10 | ↓ |
| 9 | Feature completeness | 7/10 | ↑ |

**Weighted average: 6.2 / 10** *(revised Phase 2: data architecture dropped 0.5 due to schema drift)*
(Security × 2, UX × 1.5, Clinical workflow × 1.5, all others × 1)

Calculation: (7×2 + 6×1.5 + 6×1.5 + 7 + 7 + 5 + 6.5 + 4 + 7) / 11 = 68.5/11 = **6.2**

---

## P0 Issues — Fix Before Any Hospital Goes Live

### P0-1: No push notifications for critical lab values
- **File:** `package.json` — `@capacitor/push-notifications` is absent from all dependencies
- **What's wrong:** There is no mechanism to alert a doctor's device when a critical lab result (CRP 180, K⁺ 6.8, Hb 5.2) is added. The in-app `NotificationCenter` component only works when the app is open and visible.
- **User / patient impact:** A post-op patient develops sepsis overnight. The result is entered by the night nurse at 3 AM. The morning resident won't know until they manually open the app at 7:30 AM — a 4+ hour gap in a potentially life-threatening situation.
- **Fix:**
  ```bash
  pnpm add @capacitor/push-notifications
  npx cap sync android && npx cap sync ios
  ```
  Then: (1) Register device FCM/APNs token on login and store in `app_users.push_token` column (new migration required); (2) Create a Supabase Database Webhook on `labs` INSERT that calls a new Edge Function; (3) the Edge Function compares `value` against `lab_type_config.alert_high` and sends push via FCM/APNs to the treating doctor's token. The `AppNotification` type, `NotificationPriority`, and `NotificationCenter` component are already wired — push delivery is the only missing layer.
- **Estimated effort:** 12–16 hours

---

### P0-2: `deleted_at` column used throughout service layer but never created in any migration
- **Files:** `services/patientService.ts` lines 326, 352, 382, 406, 462, 475 reference `deleted_at`; `contexts/PatientContext.tsx:672` calls `removePatient()`; `components/PatientDetail.tsx:157` calls `deletePatient()` — the end-to-end soft-delete chain is fully wired. BUT: grepping all `.sql` files in the project (both `supabase/migrations/` and all root-level files) returns zero matches for `deleted_at`. The column was never added via a migration.
- **What's wrong:** The service layer is correct and well-designed — `removePatient()` sets `deleted_at = now()`, `restorePatient()` clears it, `anonymizePatient()` handles DPDP §13 Right to Erasure, and a `purge_old_soft_deletes()` auto-purge is referenced. But the `deleted_at` column on the `patients` table almost certainly was added directly via the Supabase dashboard, never captured in a migration. A fresh `supabase db reset` (or any new deployment from source) creates a schema without `deleted_at`, causing every call to `removePatient()` to throw a Supabase 400 error. The 30-day purge function is also never defined in any migration.
- **User / patient impact:** On any new environment (staging, new hospital onboarding, disaster recovery): delete fails silently or throws; restore is impossible; the DPDP compliance claim is invalidated by the missing column. On production (if the column was added manually): this is a ticking time-bomb every time the DB is rebuilt.
- **Fix:** Add a new migration `20241101000000_add_deleted_at_column.sql`:
  ```sql
  -- patients soft-delete column (service layer already written to use this)
  ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  CREATE INDEX IF NOT EXISTS patients_deleted_at_idx ON public.patients(deleted_at) WHERE deleted_at IS NOT NULL;

  -- Update hospital-scope policy to exclude soft-deleted rows
  DROP POLICY IF EXISTS patients_hospital_scope ON public.patients;
  CREATE POLICY patients_hospital_scope ON public.patients
    FOR SELECT USING (hospital_id = public.get_my_hospital_id() AND deleted_at IS NULL);
  -- Separate UPDATE policy needed for soft-delete to work (UPDATE requires its own policy)
  DROP POLICY IF EXISTS patients_update ON public.patients;
  CREATE POLICY patients_update ON public.patients
    FOR UPDATE USING (hospital_id = public.get_my_hospital_id())
    WITH CHECK (hospital_id = public.get_my_hospital_id());

  -- Auto-purge function (hard-purge after 30-day recovery window)
  CREATE OR REPLACE FUNCTION public.purge_old_soft_deletes()
  RETURNS void LANGUAGE SQL SECURITY DEFINER AS $$
    DELETE FROM public.patients
    WHERE deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days';
  $$;
  -- Schedule via pg_cron or Supabase Dashboard > Database > Cron Jobs: daily at 02:00
  ```
  No changes needed to `patientService.ts` — the service code is already correct.
- **Estimated effort:** 3 hours (migration + RLS update + verify on staging)

---

### P0-3: Root SQL migration files create ambiguous and potentially dangerous database state
- **File:** Project root — `supabase_rls_complete_migration.sql` and 10 other `.sql` files co-exist alongside the formal `supabase/migrations/` directory.
- **What's wrong:** `supabase_rls_complete_migration.sql` defines `app_users_select` with `USING (hospital_id = public.get_my_hospital_id() OR public.is_admin())`. Because `public.is_admin()` is true for ANY admin of ANY hospital (it only checks `role IN ('admin','superadmin')` with no hospital scoping), if this policy is deployed, Hospital A's admin can `SELECT *` from `app_users` and retrieve names, emails, roles, and mobile numbers of staff at every other hospital. The formal migrations in `supabase/migrations/` use the correct `FOR ALL USING (hospital_id = public.get_my_hospital_id())` policy — but it is impossible to determine from the files alone whether the root SQL file was subsequently applied, overriding the safe policy.
- **User / patient impact:** If deployed: full cross-tenant PII exposure of all clinical staff across all hospitals. If not deployed: a ticking time-bomb — any developer running `psql` on the root SQL files "to test something" would silently compromise the multi-tenant isolation.
- **Fix:** (1) Run `supabase db dump --schema public | grep -A5 'app_users_select'` on the live database to confirm the active policy. (2) If the dangerous policy exists: new migration to drop and recreate it: `DROP POLICY IF EXISTS "app_users_select" ON public.app_users;` followed by the correct hospital-scoped version. (3) Move all 11 root `.sql` files into `supabase/migrations/` with proper timestamps, or delete the superseded ones. Enforce: never apply root SQL files manually — all schema changes via `supabase db push`.
- **Estimated effort:** 4 hours to audit + fix; 2 hours to clean up root SQL files

---

## P1 Issues — This Sprint

### P1-1: No image compression before Supabase Storage upload
- **File:** `components/RadiologyComparator.tsx` — no `compress`, `canvas`, `resize`, `maxSize`, or `quality` keyword anywhere in the component. Raw `File` object is passed directly to Supabase Storage `upload`.
- **What's wrong:** A doctor photographing an X-ray with a modern smartphone produces a 4–12 MB JPEG. The upload is blocking — a 10 MB file on a 4G connection takes 8–20 seconds. At 3 investigations per patient × 200 active patients, that is ~600 MB in Storage per month per ward with no compression.
- **User / patient impact:** Doctors abandon radiology upload at the bedside because the spinner runs too long. Clinical decisions are made without the uploaded image.
- **Fix:** Add client-side canvas compression before the Supabase Storage upload call:
  ```ts
  async function compressImage(file: File, maxSizeMB = 1): Promise<Blob> {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, Math.sqrt((maxSizeMB * 1024 * 1024) / file.size));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(img.width  * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.82));
  }
  ```
  Skip compression for PDFs and Report documents (`invType === 'Report'`).
- **Estimated effort:** 3 hours

---

### P1-2: GlobalSearch is desktop-only — mobile users have no patient lookup
- **File:** `App.tsx:699` — `<GlobalSearch />` is inside `<header className="hidden md:block ...">`. It is not rendered on mobile at all.
- **What's wrong:** The mobile bottom nav has four tabs (Ward, Rounds, OT List, PAC) and a "More" hamburger. There is no search entry point. A resident looking up a specific patient on mobile must scroll the entire virtualised ward list.
- **User / patient impact:** On a 50-patient ward, finding a specific patient who is not near the top requires 5–10 seconds of manual scrolling. At 2× daily interactions, that is ~2 minutes of pure friction per day per user.
- **Fix:** Replace the fifth mobile tab slot (currently "More") with a search icon that opens `GlobalSearch` as a full-screen overlay modal, and move "More" into the slide-out sidebar menu. Alternatively: add a floating search FAB above the bottom nav on the Dashboard view only.
- **Estimated effort:** 4 hours

---

### P1-3: 30+ native `<select>` elements — severe mobile UX failure
- **Files and line numbers:**
  - `components/AddPatientModal.tsx`: lines 574, 600, 651, 745, 751
  - `components/ScoringTools.tsx`: lines 312, 494, 557, 627, 659, 702, 746, 784
  - `components/OTListManagement.tsx`: lines 829, 880, 918
  - `components/BloodTransfusion.tsx`: lines 117, 127, 168
  - `components/DischargeSummary.tsx`: lines 415, 422
  - `components/MedicationChart.tsx`: lines 151, 161
  - `components/TeamManagement.tsx`: lines 276, 288, 353
  - `components/IntakeOutput.tsx`: line 146
  - `components/PacManagement.tsx`: line 81
  - `components/RadiologyComparator.tsx`: line 335
  - `components/SpecialtyDataPanel.tsx`: line 112
- **What's wrong:** Android WebView renders native `<select>` as a system dialog that scrolls poorly, has tiny touch targets, and ignores all Tailwind styling. Every one of these is a regression relative to the app's otherwise polished bottom-sheet interaction pattern.
- **User / patient impact:** During patient admission on Android, the gender, PAC status, and patient status dropdowns open system dialogs instead of styled bottom sheets. The experience breaks immersion and increases tap-error rate.
- **Fix:** Create a reusable `BottomSheetPicker` component based on the existing `DateBottomSheet` pattern in `components/PatientDetail.tsx:50-85`. Systematically replace all `<select>` elements. ScoringTools will take longest due to dynamic options arrays but the pattern is straightforward.
- **Estimated effort:** 8 hours

---

### P1-4: No error monitoring — production runs completely blind
- **File:** No Sentry, LogRocket, Bugsnag, or Datadog reference anywhere in the codebase.
- **What's wrong:** When a Supabase query fails silently, when a JSON parse error destroys a round note save, or when a React render crash is caught by `ErrorBoundary`, nobody is notified. The `ErrorBoundary` component displays a generic message and swallows the exception.
- **User / patient impact:** A data-loss bug (round note failing to save due to a network race condition) can go undetected for weeks while doctors believe their notes are being saved.
- **Fix:**
  ```bash
  pnpm add @sentry/react @sentry/vite-plugin
  ```
  In `index.tsx`, add `Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment: import.meta.env.VITE_ENVIRONMENT })`. Add `VITE_SENTRY_DSN` to `.env.example`. Wrap the `ErrorBoundary` fallback to call `Sentry.captureException(error)`.
- **Estimated effort:** 3 hours

---

### P1-5: `@capacitor/camera` not installed — radiology uploads require file picker
- **File:** `package.json` — no `@capacitor/camera` dependency.
- **What's wrong:** Radiology upload uses `<input type="file">`. On Android, this opens the file gallery, not the camera. Photographing a bedside X-ray requires: open camera app → take photo → switch back to MediWard → open file picker → navigate to gallery → find photo → upload. That is 5 extra steps versus direct camera capture.
- **User / patient impact:** Radiology documentation rate drops because the upload friction is too high. Imaging data is maintained outside the app in WhatsApp groups or local camera rolls.
- **Fix:**
  ```bash
  pnpm add @capacitor/camera && npx cap sync android && npx cap sync ios
  ```
  Add a camera button in `RadiologyComparator.tsx` that calls `Camera.getPhoto({ source: CameraSource.Camera, quality: 75, resultType: CameraResultType.Uri })` — the result flows directly into the existing upload function.
- **Estimated effort:** 4 hours

---

### P1-6: Email enumeration via `lookup_user_for_login` RPC
- **File:** `supabase_rls_complete_migration.sql:47-61` — `lookup_user_for_login(p_email TEXT)` is `GRANT EXECUTE` to `anon` and returns `{id, role, hospital_id}` for registered emails, empty rows for unknown ones.
- **What's wrong:** An unauthenticated caller can determine whether any email address is registered in MediWard by observing whether the RPC returns rows. No rate limit is enforced at the RPC level.
- **User / patient impact:** Hospital staff email addresses can be systematically harvested for targeted phishing campaigns against doctors who have access to patient PHI.
- **Fix:** The primary Supabase Auth call (`supabase.auth.signInWithPassword`) already handles authentication and cannot be enumerated via this vector. The `lookup_user_for_login` RPC is only called after successful Supabase Auth to fetch the `app_users` profile. Consider removing the `GRANT EXECUTE TO anon` and requiring authentication for the RPC call, since it's never called before login anyway. Alternatively, add a Supabase rate limit on `/rest/v1/rpc/lookup_user_for_login`.
- **Estimated effort:** 2 hours

---

### P1-7: "Add investigation" button in LabTrends has no `onClick` handler — dead UI
- **File:** `components/LabTrends.tsx:434-437` — a `<button>` with the label "+ Add investigation" is rendered with no `onClick` prop:
  ```tsx
  <button className="w-full py-3 border-2 border-dashed ...">
    <Plus className="w-3.5 h-3.5" /> Add investigation
  </button>
  ```
- **What's wrong:** The button is visible and styled but does nothing when tapped. A doctor who wants to add a custom investigation type (e.g., HbA1c, eGFR) on the LabTrends screen is silently blocked.
- **User / patient impact:** Custom lab tracking is inaccessible from the LabTrends screen despite the CTA being visually present — this erodes trust in the UI.
- **Fix:** Wire the button to open the `AddEntrySheet` with a free-text investigation name input, or navigate to `PatientDetail` labs tab which already supports custom lab types via `lab_type_config`. Minimum fix: `onClick={() => alert('Use the Labs tab in Patient Detail to add new investigation types')}` or remove the button entirely until implemented.
- **Estimated effort:** 2 hours to implement properly; 30 minutes to hide/remove

---

## P2 Issues — Backlog

### P2-1: No `prefers-reduced-motion` on animations
- **File:** `App.tsx:497-499` — `fadeIn` and `slideInRight` keyframe animations applied unconditionally via `content-fade-in` / `content-slide-in` classes. No `@media (prefers-reduced-motion: reduce)` guard in `index.css` or any component.
- **Fix:** Add to `index.css`: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`
- **Estimated effort:** 30 minutes

### P2-2: Sparse ARIA labels — 52 attributes across 15+ screens
- 52 `aria-label`/`aria-describedby`/`role=` attributes detected across 26 component files — approximately 3.5 per screen. Interactive elements in patient cards, action button rows, and tab strips are missing accessible labels. Screen readers announce them as unlabelled buttons.
- **Fix:** Targeted accessibility pass. Start with `WardDashboard.tsx` (patient cards + filter buttons), `PatientDetail.tsx` (action buttons + tab strip), and the mobile bottom nav.
- **Estimated effort:** 8 hours

### P2-3: Patient list uses `<div>` elements — no semantic list HTML
- **File:** `components/WardDashboard.tsx` — TanStack Virtual's `useWindowVirtualizer` renders patient cards as bare `<div>` elements. No `role="list"` on the container, no `role="listitem"` on cards.
- Screen readers do not announce patient count or list semantics. Keyboard navigation does not get list-item behaviour.
- **Fix:** Add `role="list"` to the virtualizer container div and `role="listitem"` to each patient card div. One-line change per element.
- **Estimated effort:** 1 hour

### P2-4: Load More button instead of auto-scroll pagination
- **File:** `components/WardDashboard.tsx:727-730` — a "Load More" button is rendered when `hasMore && onLoadMore`.
- For a 200-patient ward, this requires a conscious user action to load remaining patients. IntersectionObserver auto-loading is invisible and faster.
- **Fix:** Replace the button with a sentinel `<div ref={sentinelRef}/>` and `new IntersectionObserver(entries => { if (entries[0].isIntersecting && hasMore) onLoadMore?.(); })`.
- **Estimated effort:** 2 hours

### P2-5: No backup / PITR policy documented
- No `.env.staging` file, no PITR mention in `RUNBOOK.md` or `README.md`. Supabase free plan does not include PITR. If production runs on a free/trial plan, accidental mass-delete has no recovery.
- **Fix:** Document in `RUNBOOK.md`: PITR status, RPO/RTO targets, how to trigger a point-in-time restore. Add separate staging Supabase project and `.env.staging` file.
- **Estimated effort:** 2 hours

### P2-6: No biometric unlock on lock screen
- **File:** `App.tsx:317-329` — lock screen requires typing a full password on every re-authentication after the 10-minute idle timeout.
- On a shared ward tablet, this means typing an 8+ character password up to 15 times per day. Fingerprint unlock would reduce this to a single tap.
- **Fix:** `pnpm add @aparajita/capacitor-biometric-auth`. Offer biometric as primary unlock on the `LockScreen` component, falling back to password if biometric is unavailable or fails.
- **Estimated effort:** 6 hours

### P2-7: LabTrends screen is hardcoded to 4 parameters — ignores `lab_type_config`
- **File:** `components/LabTrends.tsx:24-29` — `LAB_PARAMS` is a compile-time constant: FBS, PPBS, ESR, CRP.
- **What's wrong:** The `AdminSettings` screen allows configuring custom lab types via `lab_type_config` (e.g., HbA1c, eGFR, Creatinine, CBC). These types appear in PatientDetail's labs tab but are invisible on the LabTrends screen. The LabTrends screen is effectively an orthopaedic pre-op glycaemic monitoring tool, not a general-purpose lab trend viewer.
- **Fix:** Import `useConfig()` in LabTrends and replace the `LAB_PARAMS` constant with `labTypes` from config. Each configured lab type already carries `refMin`/`refMax`/`unit` fields that map directly to `LabParam`. The chart rendering doesn't need to change.
- **Estimated effort:** 3 hours

---

## Notable Strengths Verified During Deeper Audit

These items were flagged for verification during the initial phase and confirmed correct on re-read:

- **Edge Function `clinical-insights` is well-hardened.** CORS restricted to an explicit origin whitelist (`mediward.vercel.app`, `mediward.app`, `capacitor://localhost`). JWT required on every call — unauthenticated requests return 401. Rate limiting: 10 req/user/min via Deno KV. Payload size limit: 64 KB + ≤60 patients enforced before parsing. Prompt injection sanitization strips control characters and injection keywords from all patient fields before interpolation. AI usage is written to `audit_log` for compliance. `GEMINI_API_KEY` is server-side only — never reaches the client bundle.
- **`utils/permissions.ts` role model is clean and complete.** `attending` has an empty permissions array (truly view-only). `house_surgeon` cannot discharge patients. Only `admin`/`superadmin` can delete. The `can(user, permission)` function is the single source of truth — no ad-hoc `user.role === 'admin'` checks scattered through components.
- **Soft-delete chain is fully wired end-to-end.** `PatientDetail.tsx:157` → `PatientContext:deletePatient()` → `patientService:removePatient()` → `UPDATE patients SET deleted_at = now()`. Restore and DPDP erasure paths also exist. The only gap is P0-2 above: the column isn't in any migration.
- **DailyRounds and RoundMode serve distinct workflows.** `RoundMode` is the swipe-through bedside round workflow (the primary daily UX). `DailyRounds` is a date-based historical view with to-do list management and PDF export — it is not a duplicate; both are needed.

---

## User Journey Analysis

### Journey 1: Morning round
- **Taps to first vitals/note entry field:** **3 taps** — (1) "Start Rounds" button on WardDashboard → (2) ward picker in RoundMode → (3) tap into round note text field. **Meets the ≤4 target. ✓**
- **Auto-advance after save:** Yes — RoundMode (`components/RoundMode.tsx`) has swipe-left gesture navigation (`touchStartX` / `swipeBlocked` refs). Saving and swiping to the next patient requires no additional taps. ✓
- **Biggest friction point:** RoundMode requires selecting a ward before starting, even for single-ward units. For a resident on a 30-bed single-ward unit, this is one redundant tap on every morning and evening round.
- **Recommended fix:** Default to the user's assigned unit ward if `user.unit` is set; skip the ward picker entirely for users with a single-ward scope.

### Journey 2: Emergency lab alert
- **Current behaviour:** Nothing. The `labs` table INSERT fires. The result appears in `LabTrends` if the doctor opens the app. The `NotificationCenter` checks for threshold breaches in-app. If the device is locked, the app is closed, or the doctor is in a different screen, no alert is delivered.
- **Gap:** No `@capacitor/push-notifications`. No Supabase webhook on `labs`. No FCM/APNs token registration. The in-app notification system (`AppNotification`, `NotificationCenter`) is fully built — only the push delivery layer is missing.
- **Fix:** See P0-1. Full path: `labs` INSERT → Supabase Database Webhook → Edge Function → compare `value` to `lab_type_config.alert_high` → push via FCM/APNs to doctor's registered token. Estimated 12–16 hours.

### Journey 3: New admission
- **Number of mandatory fields:** 7 across 3 steps (IP Number, Ward, Patient Name, Diagnosis, Date of Admission, PAC Status, Patient Status). Optional: mobile, procedure, DOS, bed, unit.
- **Number of form screens:** 3 steps (Location & Identity → Patient Details → Status & Plan). Well-structured. ✓
- **Drug allergy field:** Exists — `drugAllergies: string[]` in `types.ts:493` and `AddPatientModal.tsx:184-195` renders a tag-based allergy picker. ✓
- **Missing field:** ABHA (14-digit) ID field exists in the Patient type (`abhaId?: string`) but is not exposed in the AddPatientModal wizard. Adding it to Step 1 with a camera-based QR scanner would support NDHM/ABDM interoperability from the point of admission.
- **Recommended:** Add ABHA ID to Step 1 of the wizard as an optional field with a camera scan button (requires P1-5 camera install).

### Journey 4: Department picker friction
- **Persisted between sessions:** **YES** ✓ — `AuthContext.tsx:85-90` initialises `selectedDepartment` from `localStorage.getItem('mw_dept')` and `selectedUnit` from `localStorage.getItem('mw_unit')`. Both are written back on selection.
- **Daily friction cost:** 0 extra taps per day. The picker is bypassed once a department/unit is saved in localStorage. This was correctly implemented.

---

## What World-Class Looks Like for MediWard

A 9/10 version of this app would be described by an orthopaedic resident after 30 days of use as: *"It replaced my WhatsApp groups, the paper round sheet, the OT whiteboard, and the nurse call log — and I never have to remember who last updated what because the conflict modal handles it."* The current app is 70% of the way there.

The biggest behavioural shift a world-class version would drive is **proactive alerting**. Currently the app is reactive — a doctor opens it to check on patients. In a 9/10 version, the app opens itself: a push notification at 7:15 AM showing the three patients with NEWS2 ≥ 5, and a second notification at 7:20 AM flagging which scheduled-surgery patients still have PAC pending. This transforms MediWard from a documentation tool into a clinical decision support system — the difference between an app doctors tolerate and one they would refuse to go without.

The second transformation would be eliminating the file picker from radiology workflows. In a world-class version, tapping the camera icon in RadiologyComparator opens the Capacitor camera directly, captures and compresses the image to under 1 MB, and uploads it — 3 gestures versus the current 8. The current flow is long enough that doctors photograph X-rays on WhatsApp and never transfer them to the patient record.

The third change is a **structured discharge safety gate**. Currently, setting a patient's status to `Discharged` is a single button press from PatientDetail. A world-class orthopaedic ward management tool treats discharge as a multi-step workflow: wound check confirmed, DVT prophylaxis given, medications reconciled, follow-up appointment booked, discharge summary printed, ABHA account updated, patient counselled verbally. The system should refuse to allow `PatientStatus.Discharged` until each item is checked, with the attending's digital signature and audit trail. This is both clinically safer and a stronger medico-legal record.

Finally, for Indian orthopaedic practice specifically: integration with the ABDM Health Locker to push discharge summaries directly to the patient's ABHA account, and a formulary-linked MAR that flags NSAIDs for patients with CKD or GFR < 60 in their `comorbidities` array, would put MediWard above every EMR currently available in the Indian secondary-care market.

---

## 90-Day Roadmap to 8/10

### Week 1–2: Security and data integrity (no new features until done)
- [ ] Verify live RLS policies: `supabase db dump --schema public | grep -A5 'app_users_select'` — confirm whether the `OR public.is_admin()` clause is active in production
- [ ] If active: create a new migration to drop and recreate `app_users_select` using only `hospital_id = public.get_my_hospital_id()`
- [ ] Move all 11 root `.sql` files into `supabase/migrations/` with sequential timestamps, or explicitly delete the ones that are superseded by formal migrations
- [ ] Add `deleted_at TIMESTAMPTZ` to `patients`, `labs`, `imaging`, `rounds` via new migration; update `patientService.ts` to soft-delete instead of hard-delete
- [ ] Add Sentry error monitoring — 3 hours, immediate production visibility

### Week 3–4: UX quick wins
- [ ] Replace all 30+ `<select>` elements with a reusable `BottomSheetPicker` component (standardise the existing `DateBottomSheet` pattern from `components/PatientDetail.tsx:50`)
- [ ] Add `GlobalSearch` to mobile — replace the 5th tab slot or add as a floating FAB
- [ ] Add `@media (prefers-reduced-motion: reduce)` to `index.css` — 30 minutes
- [ ] Add `role="list"` / `role="listitem"` to WardDashboard virtual scroll — 1 hour

### Month 2: Clinical completeness
- [ ] Install `@capacitor/push-notifications` — full token registration + Supabase webhook + Edge Function pipeline (P0-1)
- [ ] Install `@capacitor/camera` — direct camera capture in RadiologyComparator (P1-5)
- [ ] Add client-side image compression in RadiologyComparator before upload (P1-1)
- [ ] Replace Load More button with IntersectionObserver auto-load in WardDashboard (P2-4)
- [ ] Pre-fill vitals form from `patient.vitals[0]` when opening vitals entry in RoundMode
- [ ] Add ABHA ID field to AddPatientModal Step 1 (optional, with camera scan button)

### Month 3: Polish, scale, and compliance
- [ ] Biometric unlock for lock screen — `@aparajita/capacitor-biometric-auth` (P2-6)
- [ ] Accessibility pass: target 120+ aria-labels; focus ring audit on all interactive elements
- [ ] Document PITR policy in `RUNBOOK.md`; configure staging Supabase project + `.env.staging` (P2-5)
- [ ] Address email enumeration: remove `GRANT EXECUTE TO anon` from `lookup_user_for_login` or enforce RPC-level rate limiting (P1-6)
- [ ] Structured discharge safety gate: 8-item mandatory checklist before `PatientStatus.Discharged` can be saved
- [ ] WHO SSC three-stage format (Sign In / Time Out / Sign Out) in PreOpPrep with mandatory site-marking confirmation
- [ ] Test coverage: add React Testing Library integration tests for AddPatientModal, RoundMode save flow, and lab alert threshold logic; target 80% coverage on critical clinical paths

---

## Raw Findings (Appendix)

### Test files (11 total)
```
__tests__/components/AuditLogViewer.test.tsx
__tests__/services/patientService.test.ts
__tests__/calculations.test.ts
__tests__/fhirService.test.ts
__tests__/notifications.test.ts
__tests__/permissions.test.ts
__tests__/sanitize.test.ts
__tests__/smartAlerts.test.ts
__tests__/syncQueue.test.ts
__tests__/triage.test.ts
e2e/smoke.spec.ts
```

### Native `<select>` tags — 30+ instances
```
components/AddPatientModal.tsx:    574, 600, 651, 745, 751
components/BloodTransfusion.tsx:   117, 127, 168
components/DischargeSummary.tsx:   415, 422
components/IntakeOutput.tsx:       146
components/MedicationChart.tsx:    151, 161
components/OTListManagement.tsx:   829, 880, 918
components/PacManagement.tsx:      81
components/RadiologyComparator.tsx: 335
components/ScoringTools.tsx:       312, 494, 557, 627, 659, 702, 746, 784
components/SpecialtyDataPanel.tsx:  112
components/TeamManagement.tsx:     276, 288, 353
```

### TypeScript quality
```
@ts-ignore / @ts-expect-error: 0
as any occurrences (in source dirs): 9
console.error/warn occurrences: 38
strict: true in tsconfig.json: YES
noImplicitReturns: YES
noFallthroughCasesInSwitch: YES
```

### Capacitor / native plugins
```
@capacitor/haptics:              INSTALLED ✓
@capacitor/keyboard:             INSTALLED ✓
@capacitor/app:                  INSTALLED ✓
@capacitor/push-notifications:   NOT INSTALLED ✗
@capacitor/camera:               NOT INSTALLED ✗
capacitor-native-biometric:      NOT INSTALLED ✗
@aparajita/capacitor-biometric-auth: NOT INSTALLED ✗
```

### Build output (dist/assets, by size)
```
vendor-xlsx-BN0qlcDb.js       849 KB  (lazy — export only)
index-Cckb0JQd.js             648 KB  (main bundle — could be reduced)
vendor-pdf-BdkcHfoj.js        413 KB  (lazy — discharge summary export)
LabTrends-BJoRE1I-.js         367 KB  (lazy — Recharts)
html2canvas.esm-QH1iLAAe.js   198 KB  (lazy)
index.es-VvgKZIAD.js          156 KB  (lazy)
index-B0M0vgD-.css            116 KB
PatientDetail-DZmL_R1B.js      83 KB  (lazy)
vendor-dnd-QkA88o9U.js         62 KB  (lazy)
WardDashboard-CELJiU1Z.js      43 KB  (lazy)
DischargeSummary-BKbdxTHS.js   40 KB  (lazy)
RoundMode-vN_LxDLs.js          30 KB  (lazy)
```

### Supabase formal migrations (supabase/migrations/)
```
20240101000000_initial_schema.sql           — baseline RLS, all 9 tables scoped
20240601000000_add_unit_column.sql
20240701000000_labs_imaging_hospital_id_backfill.sql
20240801000000_fix_rls_and_helper_functions.sql  — hospital_config policy fix, superadmin override
20240901000000_drop_password_hash.sql       — SHA-256 removed ✓
20241001000000_rounds_optimistic_lock.sql   — version column + trigger
rollback_templates.sql
```

### Root SQL files (11 — outside formal migration pipeline)
```
supabase_approval_migration.sql
supabase_auth_migration.sql
supabase_constraints_migration.sql
supabase_feature_flags_migration.sql
supabase_hospital_config_migration.sql
supabase_management_pac_migration.sql
supabase_migration.sql
supabase_multitenant_migration.sql
supabase_rls_complete_migration.sql   ← contains potentially dangerous OR is_admin() in app_users SELECT
supabase_run_all_migrations.sql
supabase_unit_migration.sql
```

### Accessibility
```
aria-label / aria-describedby / role= occurrences: 52 across 26 files
<img> tags missing alt attribute: 0
focus:ring / focus:outline occurrences: 140 across 26 files
prefers-reduced-motion guards: 0
```

### Security
```
Password hashing: Supabase Auth (bcrypt) — SHA-256 removed in 20240901 migration ✓
Service role key client-side: NOT FOUND — only in supabase/functions/clinical-insights/index.ts:187 (server) ✓
Hardcoded anon/JWT keys in source: NOT FOUND ✓
RLS enabled on all tables: YES ✓
Soft delete on clinical tables: NO ✗
Error monitoring: NOT FOUND ✗
```

### Department picker persistence
```
selectedDepartment → localStorage key 'mw_dept' (AuthContext.tsx:86, 93-95) ✓
selectedUnit → localStorage key 'mw_unit' (AuthContext.tsx:88, 97-100) ✓
Both persisted across sessions — no daily picker friction.
```
