# Biometric (Fingerprint) Login — Design Spec

**Date:** 2026-08-07
**Status:** Approved by user, ready for implementation planning

## Context

Logging back into MediWard currently always requires typing. Two distinct
paths force this today:

1. **Lock screen re-auth** (`App.tsx`'s `LockScreen`, wired at
   `App.tsx:436-448`): after the app is backgrounded for more than
   `LOCK_REAUTH_AFTER_MS` (10 minutes — `contexts/AuthContext.tsx:23`),
   `isLocked` becomes `true` and the user must re-type their password (not
   email — that's pulled from the existing session) via `verifyPassword()`
   (`AuthContext.tsx:374-381`), which re-confirms the password against
   Supabase without extending the session.
2. **Cold-start login** (`components/LoginPage.tsx`): after the app's own
   8-hour absolute session (`SESSION_DURATION`, `AuthContext.tsx:18`)
   expires, after a role-based inactivity auto-logout (`AuthContext.tsx:29-39`,
   1-4h depending on role), or after an explicit logout, the user must type
   both email and password from scratch.

The user hit this directly: re-entering credentials repeatedly during ward
rounds is slow, and they asked for fingerprint login to replace it. This
project's own audit document (`MEDIWARD_AUDIT_REPORT.md`, item **P2-6**)
already identified the lock-screen half of this gap and named
`@aparajita/capacitor-biometric-auth` as the intended library — this spec
extends that scoped intent to cover cold-start login too, per the user's
explicit request, while preserving the security boundaries the existing
code already enforces carefully.

**A related, pre-existing gap found while investigating this** (not
introduced by, but directly relevant to, this feature): when the app's own
8-hour session is found expired at boot time (the `useState` initializer at
`AuthContext.tsx:128-133`, and its mirror in the effect at lines 187-195),
the code only discards the local session object — it never calls
`supabase.auth.signOut()`. Supabase's own client (`lib/supabase.ts`, no
custom options — `persistSession: true`, `autoRefreshToken: true` by
default) persists and silently keeps refreshing its own session
independently in `localStorage` under a separate key
(`sb-<project-ref>-auth-token`), so a lingering Supabase session can outlive
the app's intended 8-hour cutoff without the app ever noticing. Every other
teardown path (the timer-based 8h expiry, inactivity auto-logout, explicit
`logout()`) already correctly calls `signOut()` — only the boot-time reject
path doesn't. This spec closes that gap as part of building cold-start
biometric re-login correctly (that flow needs to explicitly reason about
Supabase's session state at boot anyway).

## Goals

- Lock screen: fingerprint is offered first when the screen appears;
  success unlocks immediately with no typing. Password remains the fallback
  (unavailable/unenrolled hardware, failed/cancelled prompt, or user
  preference).
- Cold-start login: after opting in once, fingerprint can sign the user
  back in without retyping email or password, **but only within the same
  time boundary a real login already gets** — the 8-hour absolute session
  cap (or the shorter role-based inactivity limit) is anchored to the
  original password login and is never extended or reset by a successful
  fingerprint check, exactly matching how unlocking the lock screen today
  already does not extend `sessionExpiry`.
- Closes the pre-existing boot-time `signOut()` gap described above, so a
  lingering Supabase session can never outlive the app's own intended
  session boundary, biometric or not.
- Biometric opt-in is per-device, offered once after a successful password
  login (skippable), remembered until the user logs out or the device no
  longer has biometric hardware/enrollment.
- Logging out always clears any stored biometric credential on that device
  — "log out" means actually logged out, not "still fingerprint-able."
- The new session-boundary and credential-storage logic is written as
  testable pure functions in their own module, so this feature gets real
  unit test coverage even though `AuthContext.tsx` itself has none today
  (this project has no existing test file for it) — matching this
  project's stated testing priority ("Auth & tenant isolation" first).

## Non-goals

- No settings-page toggle for biometric login in this pass — enable at
  login (one prompt, skippable), disable at logout is the full lifecycle
  for v1. A dedicated settings UI can be added later if needed.
- No OS-keystore-backed secure storage plugin in this pass — the stored
  refresh token uses the same `@capacitor/preferences` mechanism already
  used for session durability (`services/persistence.ts`). The phone's own
  lock screen is the primary defense; this feature reduces in-app typing
  once the phone is already unlocked in the user's hand, not a defense
  against a compromised/rooted device. (Explicitly discussed with the user
  — the stronger, Keystore-backed alternative was considered and deferred,
  not overlooked.)
- No change to the existing 8-hour absolute session length or the
  role-based inactivity limits themselves — this feature only changes how
  the user re-proves their identity within those already-decided
  boundaries, never how long the boundaries are.
- No biometric enrollment/management UI (adding/removing fingerprints) —
  that's entirely OS-level, out of this app's scope.
- Shared-device usage is explicitly out of scope — this design assumes one
  user per device (confirmed with the user: MediWard runs on personal
  phones, not shared ward tablets). If that assumption ever changes,
  biometric login would need to be revisited.

## Architecture

**New library:** `@aparajita/capacitor-biometric-auth` (per the existing
audit doc's own recommendation) — wraps native `BiometricPrompt`
(Android, AndroidX Biometric library, compatible with this project's
`minSdkVersion = 23`) and Face ID/Touch ID (iOS). Provides an availability
check (hardware present + at least one biometric enrolled) and a prompt
that resolves success/failure/cancel.

**New module — `services/biometricAuthService.ts`:** owns all
biometric-specific logic, kept separate from `AuthContext.tsx` specifically
so the boundary-anchoring math and storage round-trip are unit-testable in
isolation:
- `isBiometricAvailable(): Promise<boolean>` — wraps the plugin's
  availability check.
- `promptBiometric(reason: string): Promise<boolean>` — wraps the actual
  native prompt, resolves `true`/`false` (never throws for a normal
  cancel/fail — only for a genuine plugin/platform error, which callers
  treat the same as `false`).
- `storeBiometricCredential(refreshToken: string, expiresAt: number): Promise<void>`
  and `loadBiometricCredential(): Promise<{ refreshToken: string; expiresAt: number } | null>`
  and `clearBiometricCredential(): Promise<void>` — read/write/clear a
  small object (`{ refreshToken, expiresAt }`) via `@capacitor/preferences`
  under its own key (`mediward_biometric_credential`), following the exact
  persistence pattern `services/persistence.ts` already uses for
  `mediward_session`.
- `isBiometricCredentialValid(credential: { expiresAt: number } | null, now: number): boolean`
  — the pure boundary check: `credential !== null && credential.expiresAt > now`.
  This is the one piece of logic that MUST be correct (it's what prevents
  fingerprint re-login from silently outliving the original 8-hour/
  inactivity window), so it's written as a trivial, directly-testable pure
  function rather than inlined into a React effect.

**`contexts/AuthContext.tsx` changes:**
- `login()` (lines 338-369): after a successful login, if
  `isBiometricAvailable()` and no biometric credential is currently stored
  for this device, surface a one-time "Enable fingerprint sign-in?" prompt
  (a new small piece of UI state, e.g. `offerBiometricEnrollment: boolean`,
  consumed by a small modal/banner in `App.tsx` or `LoginPage.tsx`). If the
  user accepts, capture the CURRENT Supabase session's refresh token
  (`supabase.auth.getSession()`) and call
  `storeBiometricCredential(refreshToken, session.sessionExpiry)` — the
  SAME `sessionExpiry` value already computed for the app's own `AuthUser`
  object (line ~356), so the stored credential's expiry is anchored
  identically to the app's own session boundary from the very same login,
  not a separately-computed value that could drift.
- New `loginWithBiometric(): Promise<{ success: boolean; error?: string }>`
  — loads the stored credential, checks `isBiometricCredentialValid()`; if
  invalid/missing, clears it and returns `{ success: false, error: 'expired' }`
  without prompting biometric at all (nothing to unlock). If valid, prompts
  biometric; on success, calls
  `supabase.auth.refreshSession({ refresh_token: credential.refreshToken })`,
  and on THAT success, runs the exact same post-auth steps `login()` already
  runs (`findUserByEmail` using `session.user.email` from the refreshed
  session, build the `AuthUser` object with `sessionExpiry` still anchored
  to the ORIGINAL stored `expiresAt` — not a fresh 8-hour window from now
  — `setUser`, `saveToStorage`, audit log). On a Supabase-side failure
  (refresh token revoked/invalid), clears the stored credential and falls
  back to `{ success: false, error: 'Please log in again.' }`. On a network
  failure specifically (distinguishable from an auth rejection), returns
  `{ success: false, error: 'network' }` WITHOUT clearing the stored
  credential, so a temporary connectivity blip doesn't permanently lose the
  convenience for that device.
- The lock-screen unlock path gains an analogous `unlockWithBiometric()`
  helper: since the session is already valid while locked, this is simpler
  — just `promptBiometric()`, and on success call the existing `unlock()`
  directly (no Supabase call needed at all, matching how `verifyPassword`'s
  password check today is really just a local "prove you're still you"
  gate, not a session-refresh).
- **Boot-time gap fix**: the `useState` initializer (lines 128-133) and its
  effect mirror (lines 187-195) both currently discard an expired local
  session without calling `supabase.auth.signOut()`. Both now also call
  `supabase.auth.signOut().catch(() => {})`, matching the pattern the
  timer-based expiry, inactivity logout, and explicit logout paths already
  use. `clearBiometricCredential()` is also called here — a session that's
  aged out at boot means any stored biometric credential for it is stale
  too (its `expiresAt` was anchored to that same lapsed session).
- `logout()` (lines 384-403): add `clearBiometricCredential()` alongside
  its existing cleanup — logging out always removes the device's stored
  credential, regardless of whether its own `expiresAt` has technically
  passed yet.

**UI changes:**
- `App.tsx`'s `LockScreen` (lines 59-120): on mount, if
  `isBiometricAvailable()`, immediately call `unlockWithBiometric()`
  (auto-triggering the native prompt rather than waiting for a tap — this
  matches typical mobile-OS lock-screen conventions). The existing password
  field and "log out and switch user" button remain visible underneath as
  the fallback, always reachable without waiting for the biometric attempt
  to resolve.
- `components/LoginPage.tsx`: if a valid (per
  `isBiometricCredentialValid`) stored credential exists for this device,
  show a "Sign in with fingerprint" button above the email/password form,
  calling `loginWithBiometric()`. The form itself is unchanged and always
  available as a fallback (tap into it directly, or arrives there
  automatically if biometric login returns `success: false`).
- A small one-time enrollment prompt (triggered by `login()`'s
  `offerBiometricEnrollment` state, per above) — a simple two-button
  confirm ("Enable" / "Not now"), not a new full page.

## Data Flow

**Enrollment (once, after a real password login):**
1. `login()` succeeds → `isBiometricAvailable()` checked → if true and no
   credential stored yet, `offerBiometricEnrollment` is set.
2. User accepts → current session's refresh token +
   `AuthUser.sessionExpiry` are captured and stored via
   `storeBiometricCredential`.
3. User declines → nothing stored; not asked again until the next fresh
   password login (declining doesn't set a "never ask again" flag — kept
   simple for v1, matching Non-goals).

**Lock-screen unlock:**
1. `isLocked` becomes `true` (unchanged, existing 10-minute-backgrounded
   logic).
2. `LockScreen` mounts → auto-prompts biometric if available.
3. Success → `unlock()` called directly, no Supabase call.
4. Failure/cancel/unavailable → existing password field is the fallback,
   behavior unchanged from today.

**Cold-start biometric re-login:**
1. App loads with no valid local `AuthUser` (boot-time check already
   failed/rejected, `signOut()` gap now fixed per Architecture above).
2. `LoginPage` checks for a valid stored biometric credential — if present,
   shows the fingerprint button.
3. User taps it → `loginWithBiometric()` → biometric prompt → on success,
   `refreshSession()` re-establishes the Supabase session →
   `findUserByEmail` → new `AuthUser` built with `sessionExpiry` equal to
   the STORED credential's original `expiresAt` (not extended) → normal
   login completes.
4. Any failure at any step → falls back to the visible email/password
   form, which is unchanged.

## Error Handling

- Biometric hardware absent or nothing enrolled: `isBiometricAvailable()`
  returns `false`; the enrollment prompt, the lock-screen auto-trigger, and
  the login-page fingerprint button are all simply never shown. No error
  messaging needed — the feature is just invisible on that device.
- User cancels or fails the biometric prompt (wrong finger, gloved hands,
  etc.): treated as a normal, expected outcome, not an error — silently
  falls back to the password/email form already visible underneath. No
  toast, no error banner (matches how declining the phone's own biometric
  prompts elsewhere in the OS behaves).
- Stored credential expired (per `isBiometricCredentialValid`) or Supabase
  rejects the refresh token (revoked, e.g. an admin force-logout, or
  genuinely expired past Supabase's own project-level refresh-token
  lifetime): credential is cleared, fingerprint option disappears, user
  sees the normal password/email form with no special messaging — this is
  the expected "your fast-login window ran out, log in properly" case.
- Network failure specifically during `refreshSession()`: distinguished
  from an auth rejection (Supabase's client surfaces network errors
  differently from 4xx auth errors) — credential is NOT cleared, user sees
  a plain "Couldn't reach the server — check your connection" message and
  can retry the fingerprint button or fall back to password immediately.

## Testing

- `services/biometricAuthService.ts`'s `isBiometricCredentialValid()` gets
  direct unit tests: valid credential before expiry, expired credential,
  `null` credential, boundary case (`expiresAt === now`).
- `storeBiometricCredential`/`loadBiometricCredential`/
  `clearBiometricCredential` get tests with a mocked
  `@capacitor/preferences`, matching the mocking pattern already used for
  the existing `services/persistence.ts` (or, if that module itself has no
  test file, matching the general mocked-external-module pattern this
  project uses elsewhere, e.g. `__tests__/services/storageService.test.ts`).
- The boot-time `signOut()` gap fix and the "biometric re-login never
  extends `sessionExpiry` past the original login's boundary" rule are the
  two most safety-critical pieces of new behavior in this feature (a bug
  in either would silently widen the session-security window this project
  has otherwise carefully tuned) — both get explicit test coverage, even
  though `AuthContext.tsx` as a whole has no existing test file to extend
  a precedent from. A new, narrowly-scoped test file is warranted here
  specifically because this is genuinely new auth-boundary logic, unlike
  the pure-UI features earlier in this session that correctly had no new
  tests.
- No test coverage for the native biometric prompt itself (`promptBiometric`,
  `isBiometricAvailable`) — these are thin wrappers around a native plugin
  that cannot be meaningfully exercised in Vitest's jsdom environment; this
  matches how this project already treats other native-Capacitor-plugin
  wrappers (e.g. camera capture in `RadiologyComparator.tsx` has no test
  coverage for the actual native call, only for logic around it).
- Manual verification after implementation, on a real Android device (this
  cannot be exercised in this session's environment, consistent with the
  documented `local-dev-test-baseline` limitation): enroll a fingerprint on
  a test device → log in with password → accept the enrollment prompt →
  background the app 11+ minutes → confirm the lock screen auto-prompts
  fingerprint and unlocks on success → force-quit and reopen the app after
  manually adjusting the device clock forward past the original 8-hour
  window (or wait it out) → confirm fingerprint login is no longer offered
  and a real password login is required.
