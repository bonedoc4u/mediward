# Biometric (Fingerprint) Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user unlock the lock screen and sign back in after a real session expiry/logout using their fingerprint instead of retyping credentials, without widening the security window this app already carefully enforces.

**Architecture:** A new `services/biometricAuthService.ts` wraps the native biometric plugin and a small stored credential (reusing this project's existing `services/persistence.ts` storage layer, not a new mechanism). `contexts/AuthContext.tsx` gains three new context functions (`loginWithBiometric`, `unlockWithBiometric`, `enrollBiometric`) plus a fix to a pre-existing gap where an expired session at boot never signs out of Supabase. Two small UI wiring points: `App.tsx`'s `LockScreen` and `components/LoginPage.tsx`.

**Tech Stack:** `@aparajita/capacitor-biometric-auth` (new dependency), existing Supabase Auth, existing `@capacitor/preferences`-backed persistence layer.

## Global Constraints

- TypeScript strict mode; `pnpm tsc --noEmit` must pass after every task.
- `pnpm lint` (`eslint . --max-warnings 0`) must pass after every task.
- pnpm only — never `npm`/`yarn`.
- **Session-boundary anchoring is the single most safety-critical rule in this plan**: a fingerprint-based unlock or re-login must NEVER extend `sessionExpiry` past what the original password login already established. This mirrors how `verifyPassword` (the existing lock-screen re-auth) already does not extend `sessionExpiry` (`contexts/AuthContext.tsx:372-373`). Every task that touches session timing must preserve this.
- No component over ~250 lines.
- No new/duplicated storage mechanism — the biometric credential is stored via this project's existing `saveToStorage`/`loadFromStorage`/`removeFromStorage` (`services/persistence.ts`), not a fresh direct `@capacitor/preferences` call.
- This plan's new auth-boundary logic (unlike this session's two prior, UI-only features) gets real unit tests, per this project's stated testing priority ("Auth & tenant isolation" first) and its rule that a bug fix is not complete without a test that would have caught it.
- After all code tasks are done, a native build sync (`pnpm android:sync`, i.e. `cap sync android` — see `package.json:20`) is required before this can run on a real device — this is a step the user does themselves; no task in this plan can run it (no native Android build tooling in this session).
- One logical commit per task.

---

### Task 1: `services/biometricAuthService.ts` — plugin wrapper + credential storage

**Files:**
- Modify: `package.json` (new dependency)
- Modify: `services/persistence.ts:16` (add the new storage key to `DURABLE_KEYS`)
- Create: `services/biometricAuthService.ts`
- Test: `__tests__/services/biometricAuthService.test.ts`

**Interfaces:**
- Consumes: `saveToStorage`, `loadFromStorage`, `removeFromStorage` from `../services/persistence` (existing, unchanged signatures — generic `<T>(key: string, data: T)` / `<T>(key: string): T | null` / `(key: string): void`).
- Produces (consumed by Tasks 3 and 4):
  ```ts
  export interface BiometricCredential { refreshToken: string; expiresAt: number; }
  export function isBiometricCredentialValid(credential: BiometricCredential | null, now: number): credential is BiometricCredential;
  export function isBiometricAvailable(): Promise<boolean>;
  export function promptBiometric(reason: string): Promise<boolean>;
  export function storeBiometricCredential(refreshToken: string, expiresAt: number): Promise<void>;
  export function loadBiometricCredential(): Promise<BiometricCredential | null>;
  export function clearBiometricCredential(): Promise<void>;
  ```

- [ ] **Step 1: Install the plugin**

Run: `pnpm add @aparajita/capacitor-biometric-auth`

- [ ] **Step 2: Check the plugin's actual exported API**

This plan's code below is written from general knowledge of this plugin's typical shape (a `BiometricAuth` object with a `checkBiometry()` availability check and an `authenticate(options)` prompt) — verify this is accurate for the version that was actually just installed before writing the wrapper. Read `node_modules/@aparajita/capacitor-biometric-auth/dist/esm/definitions.d.ts` (or wherever its type declarations landed — `ls node_modules/@aparajita/capacitor-biometric-auth/dist/` if that exact path doesn't exist) to confirm the exported names, the shape of `checkBiometry()`'s return value (specifically: does it return a plain boolean, or an object with e.g. `isAvailable`/`biometryType` fields?), and `authenticate()`'s options and how it signals success vs. failure vs. user-cancellation (does it resolve, or reject/throw on failure?). Adjust Step 3's code to match whatever you find — the function names and behavior `biometricAuthService.ts` exposes to the REST of this app (`isBiometricAvailable`, `promptBiometric`) must stay exactly as specified above regardless of what the underlying plugin's exact shape turns out to be; only the internal implementation inside those two functions may need adjusting.

- [ ] **Step 3: Write the failing tests**

Create `__tests__/services/biometricAuthService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSave   = vi.hoisted(() => vi.fn());
const mockLoad   = vi.hoisted(() => vi.fn());
const mockRemove = vi.hoisted(() => vi.fn());
vi.mock('../../services/persistence', () => ({
  saveToStorage: mockSave,
  loadFromStorage: mockLoad,
  removeFromStorage: mockRemove,
}));

import {
  isBiometricCredentialValid,
  storeBiometricCredential,
  loadBiometricCredential,
  clearBiometricCredential,
  type BiometricCredential,
} from '../../services/biometricAuthService';

beforeEach(() => {
  mockSave.mockReset();
  mockLoad.mockReset();
  mockRemove.mockReset();
});

describe('isBiometricCredentialValid', () => {
  it('is true for a credential that has not expired yet', () => {
    const cred: BiometricCredential = { refreshToken: 'tok', expiresAt: 2000 };
    expect(isBiometricCredentialValid(cred, 1000)).toBe(true);
  });

  it('is false for a credential exactly at its expiry instant', () => {
    const cred: BiometricCredential = { refreshToken: 'tok', expiresAt: 1000 };
    expect(isBiometricCredentialValid(cred, 1000)).toBe(false);
  });

  it('is false for an expired credential', () => {
    const cred: BiometricCredential = { refreshToken: 'tok', expiresAt: 1000 };
    expect(isBiometricCredentialValid(cred, 2000)).toBe(false);
  });

  it('is false for null (no credential stored)', () => {
    expect(isBiometricCredentialValid(null, 1000)).toBe(false);
  });
});

describe('storeBiometricCredential', () => {
  it('saves under the biometric_credential key with the given refreshToken/expiresAt', async () => {
    await storeBiometricCredential('my-refresh-token', 5000);
    expect(mockSave).toHaveBeenCalledWith('biometric_credential', { refreshToken: 'my-refresh-token', expiresAt: 5000 });
  });
});

describe('loadBiometricCredential', () => {
  it('returns the stored credential when present', async () => {
    mockLoad.mockReturnValue({ refreshToken: 'tok', expiresAt: 5000 });
    const result = await loadBiometricCredential();
    expect(mockLoad).toHaveBeenCalledWith('biometric_credential');
    expect(result).toEqual({ refreshToken: 'tok', expiresAt: 5000 });
  });

  it('returns null when nothing is stored', async () => {
    mockLoad.mockReturnValue(null);
    const result = await loadBiometricCredential();
    expect(result).toBeNull();
  });
});

describe('clearBiometricCredential', () => {
  it('removes the biometric_credential key', async () => {
    await clearBiometricCredential();
    expect(mockRemove).toHaveBeenCalledWith('biometric_credential');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm vitest run __tests__/services/biometricAuthService.test.ts`
Expected: FAIL with "Cannot find module '../../services/biometricAuthService'".

- [ ] **Step 5: Add `'biometric_credential'` to `DURABLE_KEYS`**

In `services/persistence.ts:16`, change:
```ts
const DURABLE_KEYS = new Set(['session', 'patients_cache']);
```
to:
```ts
const DURABLE_KEYS = new Set(['session', 'patients_cache', 'biometric_credential']);
```
(A biometric-enabled device should keep working after an iOS memory-pressure purge, same reasoning as the session key it's stored alongside.)

- [ ] **Step 6: Create `services/biometricAuthService.ts`**

Write the file with these exact exports (adjust the plugin-facing internals of `isBiometricAvailable`/`promptBiometric` per what Step 2 found — the shape below is a reasonable starting point, not guaranteed-correct for the plugin's exact current API):

```ts
/**
 * biometricAuthService.ts — device fingerprint/Face ID for two flows:
 * unlocking an already-valid but backgrounded session (no server call
 * needed), and signing back in without retyping credentials after a real
 * logout/expiry (gated by a stored Supabase refresh token). See
 * docs/superpowers/specs/2026-08-07-biometric-login-design.md for the full
 * design, especially why the stored credential's expiresAt must always be
 * copied from the ORIGINAL password login's sessionExpiry, never a fresh
 * window computed at biometric-check time.
 */
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { saveToStorage, loadFromStorage, removeFromStorage } from './persistence';

export interface BiometricCredential {
  refreshToken: string;
  expiresAt: number;
}

const STORAGE_KEY = 'biometric_credential';

/**
 * Pure boundary check — the one piece of this feature that MUST be
 * correct, kept trivial and directly testable on purpose. A credential is
 * only usable strictly before its expiresAt, matching how a real session's
 * sessionExpiry is checked elsewhere in this app (AuthContext.tsx).
 *
 * Written as a type predicate (not a plain boolean) so every call site
 * gets TypeScript's narrowing for free — after `if (isBiometricCredentialValid(x, now))`,
 * `x` is known non-null with no `!` assertion needed.
 */
export function isBiometricCredentialValid(
  credential: BiometricCredential | null,
  now: number,
): credential is BiometricCredential {
  return credential !== null && credential.expiresAt > now;
}

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const result = await BiometricAuth.checkBiometry();
    return result.isAvailable;
  } catch {
    return false;
  }
}

export async function promptBiometric(reason: string): Promise<boolean> {
  try {
    await BiometricAuth.authenticate({ reason });
    return true;
  } catch {
    // Covers both a genuine failure and a user cancel — both fall back to
    // the password/email form already visible underneath, so callers don't
    // need to distinguish them.
    return false;
  }
}

export async function storeBiometricCredential(refreshToken: string, expiresAt: number): Promise<void> {
  saveToStorage<BiometricCredential>(STORAGE_KEY, { refreshToken, expiresAt });
}

export async function loadBiometricCredential(): Promise<BiometricCredential | null> {
  return loadFromStorage<BiometricCredential>(STORAGE_KEY);
}

export async function clearBiometricCredential(): Promise<void> {
  removeFromStorage(STORAGE_KEY);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm vitest run __tests__/services/biometricAuthService.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 8: Run the full suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit` then `pnpm lint`
Expected: all pass, no new errors, zero lint warnings.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml services/persistence.ts services/biometricAuthService.ts __tests__/services/biometricAuthService.test.ts
git commit -m "feat(auth): add biometricAuthService with credential storage and boundary check"
```

---

### Task 2: Fix the boot-time session-expiry gap (pre-existing bug, closed as part of this feature)

**Files:**
- Create: `utils/sessionValidity.ts`
- Test: `__tests__/sessionValidity.test.ts`
- Modify: `contexts/AuthContext.tsx`
- Test: `__tests__/contexts/AuthContext.test.tsx` (new — this file has no existing test coverage)

**Interfaces:**
- Consumes: `AuthUser` type from `../types` (existing).
- Consumes: `clearBiometricCredential` from `../services/biometricAuthService` (Task 1).
- Produces: `isSessionValid(session, now): boolean`, used by Task 3 as the canonical way to check whether a stored `AuthUser` is still within its `sessionExpiry`.

**The bug being fixed:** `contexts/AuthContext.tsx`'s `useState` initializer (lines 128-133) discards an expired local session on boot without calling `supabase.auth.signOut()`. Supabase's own client (`lib/supabase.ts`, default options: `persistSession: true`, `autoRefreshToken: true`) persists its own session independently in `localStorage`, so it can keep silently refreshing itself past the app's intended 8-hour cutoff. Every OTHER teardown path in this file (the timer-based 8h expiry at line 206, inactivity auto-logout at line 234, explicit `logout()` at line 389) already correctly calls `signOut()` — only this boot-time path doesn't.

- [ ] **Step 1: Write the failing test for the pure boundary check**

Create `__tests__/sessionValidity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isSessionValid } from '../utils/sessionValidity';
import { UserRole } from '../types';

const makeSession = (sessionExpiry: number) => ({
  id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test',
  role: 'resident' as UserRole, hospitalId: 'h1', sessionExpiry,
});

describe('isSessionValid', () => {
  it('is true for a session that has not expired yet', () => {
    expect(isSessionValid(makeSession(2000), 1000)).toBe(true);
  });

  it('is false for a session exactly at its expiry instant', () => {
    expect(isSessionValid(makeSession(1000), 1000)).toBe(false);
  });

  it('is false for an expired session', () => {
    expect(isSessionValid(makeSession(1000), 2000)).toBe(false);
  });

  it('is false for null (no session)', () => {
    expect(isSessionValid(null, 1000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/sessionValidity.test.ts`
Expected: FAIL with "Cannot find module '../utils/sessionValidity'".

- [ ] **Step 3: Create `utils/sessionValidity.ts`**

```ts
import { AuthUser } from '../types';

/**
 * Pure check for whether a locally-stored AuthUser is still within its
 * absolute session window. Kept separate from AuthContext.tsx and
 * deliberately trivial so this exact boundary condition — the thing a bug
 * here would silently widen — is directly unit-tested, not just exercised
 * incidentally through a full component render.
 */
export function isSessionValid(session: AuthUser | null, now: number): boolean {
  return session !== null && session.sessionExpiry > now;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/sessionValidity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Fix the boot-time initializer in `AuthContext.tsx`**

Add the import (near the other local imports, e.g. after the `clearPatientCache` import at line 16):
```ts
import { isSessionValid } from '../utils/sessionValidity';
import { clearBiometricCredential } from '../services/biometricAuthService';
```

Replace the `useState` initializer at lines 128-133:
```ts
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = loadFromStorage<AuthUser>('session');
    if (saved && saved.sessionExpiry > Date.now()) return saved;
    removeFromStorage('session');
    return null;
  });
```
with:
```ts
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = loadFromStorage<AuthUser>('session');
    if (isSessionValid(saved, Date.now())) return saved;
    if (saved) {
      // A session was found but had already expired by the time the app
      // reopened — clean up fully, not just the local copy, so a
      // lingering Supabase session (persistSession/autoRefreshToken are
      // both on by default, see lib/supabase.ts) can't silently keep
      // itself alive past this app's own 8-hour cutoff. Fire-and-forget,
      // matching every other teardown path in this file (the timer-based
      // expiry, inactivity logout, and explicit logout all do the same).
      supabase.auth.signOut().catch(() => {});
      clearBiometricCredential().catch(() => {});
    }
    removeFromStorage('session');
    return null;
  });
```

- [ ] **Step 6: Fix the effect mirror at what's now around lines 194-201** (line numbers will have shifted slightly from the import/initializer additions above — find the "Session Expiry Timers" effect's `if (msUntilExpiry <= 0)` branch)

Replace:
```ts
    const msUntilExpiry = user.sessionExpiry - Date.now();
    if (msUntilExpiry <= 0) {
      setUser(null);
      removeFromStorage('session');
      return;
    }
```
with:
```ts
    const msUntilExpiry = user.sessionExpiry - Date.now();
    if (msUntilExpiry <= 0) {
      // Same narrow race the initializer above now also covers (session
      // was valid at initializer-time by a few ms, expired by the time
      // this effect actually runs) — same fix, for the same reason.
      supabase.auth.signOut().catch(() => {});
      clearBiometricCredential().catch(() => {});
      setUser(null);
      removeFromStorage('session');
      return;
    }
```

- [ ] **Step 7: Write the failing behavioral test**

Create `__tests__/contexts/AuthContext.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

const mockSignOut = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: mockSignOut,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

const mockClearBiometric = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../services/biometricAuthService', () => ({
  clearBiometricCredential: mockClearBiometric,
}));

vi.mock('../../services/userService', () => ({ findUserByEmail: vi.fn() }));
vi.mock('../../services/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../../services/patientCache', () => ({ clearPatientCache: vi.fn() }));
vi.mock('../../components/ClinicalDisclaimer', () => ({ clearDisclaimerAccepted: vi.fn() }));

const Probe: React.FC = () => {
  useAuth();
  return null;
};

beforeEach(() => {
  mockSignOut.mockClear();
  mockClearBiometric.mockClear();
  localStorage.clear();
});

describe('AuthProvider boot with an expired stored session', () => {
  it('signs out of Supabase and clears the biometric credential, not just the local session', async () => {
    const expired = {
      version: 1,
      timestamp: new Date().toISOString(),
      data: {
        id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test',
        role: 'resident', hospitalId: 'h1',
        sessionExpiry: Date.now() - 1000, // already expired
      },
    };
    localStorage.setItem('mediward_session', JSON.stringify(expired));

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockClearBiometric).toHaveBeenCalled();
    });
  });

  it('does NOT sign out when the stored session is still valid', async () => {
    const valid = {
      version: 1,
      timestamp: new Date().toISOString(),
      data: {
        id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test',
        role: 'resident', hospitalId: 'h1',
        sessionExpiry: Date.now() + 60_000, // still valid for another minute
      },
    };
    localStorage.setItem('mediward_session', JSON.stringify(valid));

    render(<AuthProvider><Probe /></AuthProvider>);

    // Give any stray async work a tick, then confirm signOut was never called.
    await new Promise(r => setTimeout(r, 10));
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run test to verify the first case fails, second passes**

Run: `pnpm vitest run __tests__/contexts/AuthContext.test.tsx`
Expected before Step 5/6's fix: the first test ("signs out... not just the local session") FAILS (`mockSignOut` never called) — this is the test that proves the bug existed. Since you already applied the fix in Steps 5-6 before writing this test, run it now to confirm it PASSES instead — both tests green.

- [ ] **Step 9: Run the full suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit` then `pnpm lint`
Expected: all pass, no new errors, zero lint warnings.

- [ ] **Step 10: Commit**

```bash
git add utils/sessionValidity.ts __tests__/sessionValidity.test.ts contexts/AuthContext.tsx __tests__/contexts/AuthContext.test.tsx
git commit -m "fix(auth): sign out of Supabase when a stored session is found already expired at boot"
```

---

### Task 3: Wire enrollment, `loginWithBiometric`, and `unlockWithBiometric` into `AuthContext.tsx`

**Files:**
- Modify: `contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: `isBiometricAvailable`, `promptBiometric`, `storeBiometricCredential`, `loadBiometricCredential`, `clearBiometricCredential`, `isBiometricCredentialValid` from `../services/biometricAuthService` (Task 1).
- Produces (consumed by Task 4):
  ```ts
  loginWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  unlockWithBiometric: () => Promise<boolean>;
  offerBiometricEnrollment: boolean;
  enrollBiometric: () => Promise<void>;
  dismissBiometricOffer: () => void;
  ```
  All added to `AuthContextType` and the provider's returned value.

- [ ] **Step 1: Add the imports and the pending-enrollment ref/state**

Add to the existing biometricAuthService import from Task 2 (extend it, don't duplicate the import line):
```ts
import {
  clearBiometricCredential,
  isBiometricAvailable,
  promptBiometric,
  storeBiometricCredential,
  loadBiometricCredential,
  isBiometricCredentialValid,
} from '../services/biometricAuthService';
```

Add new state/ref near the other `useState`/`useRef` declarations at the top of `AuthProvider` (e.g. right after `hiddenAtRef` at line 84):
```ts
  const [offerBiometricEnrollment, setOfferBiometricEnrollment] = useState(false);
  // Holds the just-issued refresh token + this login's sessionExpiry between
  // the moment login() succeeds and the moment the user responds to the
  // "enable fingerprint?" prompt (enrollBiometric() consumes this). Not
  // React state — nothing needs to re-render when this changes.
  const pendingBiometricEnrollmentRef = React.useRef<{ refreshToken: string; expiresAt: number } | null>(null);
```

- [ ] **Step 2: Offer enrollment after a successful password login**

In `login()` (lines 338-369), replace:
```ts
    if (!authError && authData.user) {
      const found = await findUserByEmail(email);
      if (!found) return { success: false, error: 'User role not configured. Contact admin.' };

      const session: AuthUser = {
        id:            authData.user.id,
        email:         found.email,
        name:          found.name,
        role:          found.role,
        ward:          found.ward,
        unit:          found.unit,
        hospitalId:    found.hospitalId,
        sessionExpiry: Date.now() + SESSION_DURATION,
      };
      setUser(session);
      saveToStorage('session', session);
      logAuditEvent(session.id, session.name, 'LOGIN', 'session', session.id, `Login: ${email}`);
      return { success: true };
    }
```
with:
```ts
    if (!authError && authData.user) {
      const found = await findUserByEmail(email);
      if (!found) return { success: false, error: 'User role not configured. Contact admin.' };

      const session: AuthUser = {
        id:            authData.user.id,
        email:         found.email,
        name:          found.name,
        role:          found.role,
        ward:          found.ward,
        unit:          found.unit,
        hospitalId:    found.hospitalId,
        sessionExpiry: Date.now() + SESSION_DURATION,
      };
      setUser(session);
      saveToStorage('session', session);
      logAuditEvent(session.id, session.name, 'LOGIN', 'session', session.id, `Login: ${email}`);

      // Offer fingerprint sign-in once per fresh password login, if this
      // device supports it and nothing is enrolled for it yet. The refresh
      // token comes straight from this same signInWithPassword response —
      // no extra Supabase call needed. expiresAt is deliberately the exact
      // same session.sessionExpiry just computed above, not a separately
      // derived value, so the stored credential's window can never drift
      // from the real session's window.
      if (authData.session?.refresh_token) {
        const alreadyEnrolled = await loadBiometricCredential();
        if (!alreadyEnrolled && await isBiometricAvailable()) {
          pendingBiometricEnrollmentRef.current = {
            refreshToken: authData.session.refresh_token,
            expiresAt: session.sessionExpiry,
          };
          setOfferBiometricEnrollment(true);
        }
      }

      return { success: true };
    }
```

- [ ] **Step 3: Add `enrollBiometric` and `dismissBiometricOffer`**

Add near `unlock` (after line 281):
```ts
  const enrollBiometric = useCallback(async () => {
    const pending = pendingBiometricEnrollmentRef.current;
    if (pending) {
      await storeBiometricCredential(pending.refreshToken, pending.expiresAt);
      pendingBiometricEnrollmentRef.current = null;
    }
    setOfferBiometricEnrollment(false);
  }, []);

  const dismissBiometricOffer = useCallback(() => {
    pendingBiometricEnrollmentRef.current = null;
    setOfferBiometricEnrollment(false);
  }, []);
```

- [ ] **Step 4: Add `unlockWithBiometric`**

Add right after `unlock` (after line 281, or after the two functions from Step 3 if added there first):
```ts
  // Lock-screen unlock via fingerprint — the session is already valid while
  // locked, so unlike loginWithBiometric this never touches Supabase at
  // all, exactly mirroring how the existing password-based verifyPassword
  // path is really just a local "prove you're still you" gate.
  const unlockWithBiometric = useCallback(async (): Promise<boolean> => {
    if (!(await isBiometricAvailable())) return false;
    const ok = await promptBiometric('Unlock MediWard');
    if (ok) unlock();
    return ok;
  }, [unlock]);
```

- [ ] **Step 5: Add `loginWithBiometric`**

Add near `login` (after its closing, around line 369):
```ts
  // Cold-start sign-in via fingerprint — no session currently exists (a
  // real logout/expiry already happened). Gated by a stored refresh token
  // whose expiresAt was captured from a real password login's own
  // sessionExpiry (see login()'s enrollment step above) and is NEVER
  // extended here — a successful fingerprint check re-establishes a
  // Supabase session but the resulting AuthUser keeps the credential's
  // original expiresAt, not Date.now() + SESSION_DURATION.
  const loginWithBiometric = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const credential = await loadBiometricCredential();
    if (!isBiometricCredentialValid(credential, Date.now())) {
      await clearBiometricCredential();
      return { success: false, error: 'expired' };
    }

    if (!(await isBiometricAvailable())) return { success: false, error: 'unavailable' };
    const ok = await promptBiometric('Sign in to MediWard');
    if (!ok) return { success: false, error: 'cancelled' };

    // credential is narrowed to non-null here — isBiometricCredentialValid
    // is a type predicate (see services/biometricAuthService.ts), so no `!`
    // assertion is needed.
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: credential.refreshToken });
    if (error || !data.session) {
      // Refresh token rejected server-side (revoked, or genuinely past
      // Supabase's own refresh-token lifetime) — this credential is dead,
      // clear it so the fingerprint button stops being offered.
      await clearBiometricCredential();
      return { success: false, error: 'Please log in again.' };
    }

    const email = data.session.user.email;
    if (!email) {
      await clearBiometricCredential();
      return { success: false, error: 'Please log in again.' };
    }

    const found = await findUserByEmail(email);
    if (!found) return { success: false, error: 'User role not configured. Contact admin.' };

    const session: AuthUser = {
      id:            data.session.user.id,
      email:         found.email,
      name:          found.name,
      role:          found.role,
      ward:          found.ward,
      unit:          found.unit,
      hospitalId:    found.hospitalId,
      sessionExpiry: credential.expiresAt, // anchored to the ORIGINAL login, never extended
    };
    setUser(session);
    saveToStorage('session', session);
    logAuditEvent(session.id, session.name, 'LOGIN', 'session', session.id, `Fingerprint login: ${email}`);
    return { success: true };
  }, []);
```

**Distinguishing a network failure from a real auth rejection (spec requirement — do not skip):** `@supabase/auth-js` (which `@supabase/supabase-js` re-exports from) has a dedicated error class for exactly this — a fetch-level failure (offline, DNS, timeout) throws/returns an `AuthRetryableFetchError`, distinct from `AuthApiError` (a real server-side rejection like an invalid or revoked refresh token). Verify this is still accurate for the installed version by checking `node_modules/@supabase/auth-js/dist/module/errors.d.ts` (or wherever its type declarations actually are — `find node_modules/@supabase/auth-js -name "errors.d.ts"` if that exact path doesn't exist) for an exported `AuthRetryableFetchError` class or an `isAuthRetryableFetchError()` helper function. If you find one, import it and use it to gate the credential-clearing decision:
```ts
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: credential.refreshToken });
    if (error || !data.session) {
      if (!isAuthRetryableFetchError(error)) {
        // A real rejection (revoked, or genuinely past Supabase's own
        // refresh-token lifetime), not a connectivity blip — this
        // credential is dead, clear it so the fingerprint button stops
        // being offered.
        await clearBiometricCredential();
      }
      return { success: false, error: !isAuthRetryableFetchError(error) ? 'Please log in again.' : 'network' };
    }
```
(Adjust the exact import/helper name to whatever Step 2-style verification against the real package finds — `isAuthRetryableFetchError` is the name to look for first, matching this library's established naming convention for its other `isAuth*Error` helpers, but confirm rather than assume.) If no such distinguishable error type exists in the installed version, fall back to the safe default: always clear the credential on any `refreshSession` failure (as shown in the earlier code block above). Clearing too eagerly costs the user one password re-entry; NOT clearing a genuinely-dead credential means the fingerprint button silently fails forever until they log in with a password anyway — the safe direction if you can't cleanly tell the two apart is to clear. State clearly in your task report which path you took and why.

- [ ] **Step 6: Clear the biometric credential on logout**

In `logout()` (lines 384-403), add `clearBiometricCredential()` alongside the existing cleanup. Replace:
```ts
  const logout = useCallback(() => {
    if (user) {
      logAuditEvent(user.id, user.name, 'LOGOUT', 'session', user.id, 'User logged out');
      clearPatientCache(user.hospitalId); // clear hospital-scoped cache so next user can't read it
    }
    supabase.auth.signOut().catch(() => {});
    setUser(null);
    setIsLocked(false);
    removeFromStorage('session');
```
with:
```ts
  const logout = useCallback(() => {
    if (user) {
      logAuditEvent(user.id, user.name, 'LOGOUT', 'session', user.id, 'User logged out');
      clearPatientCache(user.hospitalId); // clear hospital-scoped cache so next user can't read it
    }
    supabase.auth.signOut().catch(() => {});
    clearBiometricCredential().catch(() => {});
    setUser(null);
    setIsLocked(false);
    removeFromStorage('session');
```
(Every other line in `logout()` stays exactly as it is.)

- [ ] **Step 7: Add the new functions/state to `AuthContextType` and the provider's return value**

In the `AuthContextType` interface (lines 42-69), add after `unlock: () => void;` (line 54):
```ts
  /** Fingerprint unlock for an already-valid, backgrounded session — no server call. Returns whether it succeeded. */
  unlockWithBiometric: () => Promise<boolean>;
  /** Fingerprint sign-in after a real logout/expiry, using a stored, boundary-limited credential. */
  loginWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  /** True right after a successful password login on a device that supports biometrics and has none enrolled yet. */
  offerBiometricEnrollment: boolean;
  /** Store the pending login's credential for future fingerprint sign-in. */
  enrollBiometric: () => Promise<void>;
  /** Decline the one-time enrollment offer without storing anything. */
  dismissBiometricOffer: () => void;
```

In the provider's returned context value (lines 405-426), add the same five alongside the existing `unlock,` line:
```ts
      unlock,
      unlockWithBiometric,
      loginWithBiometric,
      offerBiometricEnrollment,
      enrollBiometric,
      dismissBiometricOffer,
```

- [ ] **Step 8: Run the full suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit` then `pnpm lint`
Expected: all pass, no new errors, zero lint warnings. (No new tests in this task — the pure boundary logic was already tested in Tasks 1-2; this task is integration wiring inside `AuthContext.tsx`, which has no broader existing test harness to extend beyond what Task 2 already added. `loginWithBiometric`'s session-boundary anchoring — `sessionExpiry: credential!.expiresAt` never `Date.now() + SESSION_DURATION` — is the one line in this task where a mistake would be genuinely dangerous; re-read it once after writing it to confirm this specific detail before moving on.)

- [ ] **Step 9: Commit**

```bash
git add contexts/AuthContext.tsx
git commit -m "feat(auth): wire biometric enrollment, loginWithBiometric, and unlockWithBiometric"
```

---

### Task 4: UI wiring — lock screen auto-prompt and login-page fingerprint button

**Files:**
- Modify: `App.tsx`
- Modify: `components/LoginPage.tsx`

**Interfaces:**
- Consumes: `unlockWithBiometric`, `loginWithBiometric`, `offerBiometricEnrollment`, `enrollBiometric`, `dismissBiometricOffer` from `useAuth()` (Task 3).
- Consumes: `isBiometricAvailable`, `loadBiometricCredential`, `isBiometricCredentialValid` from `../services/biometricAuthService` (Task 1) — used directly by `LoginPage.tsx` to decide whether to show its fingerprint button, kept out of `AuthContextType` to avoid growing that interface further than the actions it needs to expose.

- [ ] **Step 1: `LockScreen` auto-prompts biometric on mount**

In `App.tsx`, the `LockScreen` component (lines 59-120) gains an `onAutoBiometric` prop and a mount effect. Replace:
```tsx
const LockScreen: React.FC<{
  userName: string;
  onUnlock: (password: string) => Promise<{ success: boolean; error?: string }>;
  onLogout: () => void;
}> = ({ userName, onUnlock, onLogout }) => {
  const [password, setPassword] = React.useState('');
  const [error, setError]       = React.useState('');
  const [loading, setLoading]   = React.useState(false);
```
with:
```tsx
const LockScreen: React.FC<{
  userName: string;
  onUnlock: (password: string) => Promise<{ success: boolean; error?: string }>;
  onLogout: () => void;
  onAutoBiometric: () => Promise<boolean>;
}> = ({ userName, onUnlock, onLogout, onAutoBiometric }) => {
  const [password, setPassword] = React.useState('');
  const [error, setError]       = React.useState('');
  const [loading, setLoading]   = React.useState(false);

  // Auto-prompt biometric the moment the lock screen appears — the
  // password field below stays visible and usable the whole time as the
  // fallback, not gated behind waiting for this to resolve.
  React.useEffect(() => {
    onAutoBiometric();
    // Intentionally run only once per mount (a fresh lock screen instance),
    // not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 2: Wire `onAutoBiometric` where `LockScreen` is rendered**

Find where `useAuth()` is destructured near the top of `App.tsx`'s main component (line 163: `isAuthenticated, isRecoveryMode, isLocked, unlock, user, verifyPassword, logout,`) and add `unlockWithBiometric` to that destructuring list.

Then update the `LockScreen` render (lines 437-449):
```tsx
  if (isAuthenticated && isLocked) {
    return (
      <LockScreen
        userName={user?.name ?? ''}
        onUnlock={async (password) => {
          const result = await verifyPassword(password);
          if (result.success) unlock();
          return result;
        }}
        onLogout={logout}
      />
    );
  }
```
to:
```tsx
  if (isAuthenticated && isLocked) {
    return (
      <LockScreen
        userName={user?.name ?? ''}
        onUnlock={async (password) => {
          const result = await verifyPassword(password);
          if (result.success) unlock();
          return result;
        }}
        onLogout={logout}
        onAutoBiometric={unlockWithBiometric}
      />
    );
  }
```

- [ ] **Step 3: `LoginPage.tsx` shows a fingerprint button when a valid stored credential exists**

Replace the top of `components/LoginPage.tsx`:
```tsx
import React, { useState } from 'react';
import { useAuth } from '../contexts/AppContext';
import { Stethoscope, Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';

const LoginPage: React.FC<{ onPrivacy?: () => void; onTerms?: () => void }> = ({ onPrivacy, onTerms }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Client-side rate limiting: exponential backoff after failed attempts
  const [failCount, setFailCount] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
```
with:
```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AppContext';
import { Stethoscope, Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff, Fingerprint } from 'lucide-react';
import { isBiometricAvailable, loadBiometricCredential, isBiometricCredentialValid } from '../services/biometricAuthService';

const LoginPage: React.FC<{ onPrivacy?: () => void; onTerms?: () => void }> = ({ onPrivacy, onTerms }) => {
  const { login, loginWithBiometric } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Client-side rate limiting: exponential backoff after failed attempts
  const [failCount, setFailCount] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [showBiometricButton, setShowBiometricButton] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [available, credential] = await Promise.all([isBiometricAvailable(), loadBiometricCredential()]);
      setShowBiometricButton(available && isBiometricCredentialValid(credential, Date.now()));
    })();
  }, []);

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setError('');
    const result = await loginWithBiometric();
    setBiometricLoading(false);
    if (!result.success) {
      // A stored credential that's now invalid/expired means the button
      // shouldn't be offered again this visit — silently fall through to
      // the always-present email/password form below, no error message
      // (this is the expected "fast-login window ran out" case, not a
      // failure the user needs to see).
      setShowBiometricButton(false);
    }
  };
```

- [ ] **Step 4: Render the fingerprint button above the form**

In `components/LoginPage.tsx`, find the `<form onSubmit={handleSubmit} className="space-y-4">` opening tag (currently line 105) and insert the fingerprint button immediately before it, inside the same parent `<div className="mb-8">...</div>` block's closing and the form:

```tsx
          {showBiometricButton && (
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={biometricLoading}
              className="w-full mb-4 flex items-center justify-center gap-2 py-3 border-2 border-teal-600 text-teal-700 font-bold rounded-lg hover:bg-teal-50 disabled:opacity-60 transition-colors"
            >
              <Fingerprint className="w-5 h-5" />
              {biometricLoading ? 'Verifying…' : 'Sign in with Fingerprint'}
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
```
(Only the new `{showBiometricButton && (...)}` block is added — the `<form ...>` line itself and everything inside it stays exactly as it already is.)

- [ ] **Step 5: Add the one-time enrollment-offer prompt**

Add near the end of `components/LoginPage.tsx`'s JSX, as a sibling to the outer returned `<div className="min-h-screen ...">` (i.e. use a fragment `<>...</>` wrapping both, since this needs to render on top of everything when it appears) — read the current full return statement first to place this correctly, then add:

```tsx
{offerBiometricEnrollment && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] px-4">
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 text-center">
      <Fingerprint className="w-10 h-10 text-teal-600 mx-auto" />
      <h3 className="text-lg font-bold text-slate-800">Enable Fingerprint Sign-In?</h3>
      <p className="text-sm text-slate-500">
        Skip typing your password next time you open MediWard on this device.
      </p>
      <div className="flex gap-3">
        <button
          onClick={dismissBiometricOffer}
          className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Not now
        </button>
        <button
          onClick={enrollBiometric}
          className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl"
        >
          Enable
        </button>
      </div>
    </div>
  </div>
)}
```

Add `offerBiometricEnrollment`, `enrollBiometric`, `dismissBiometricOffer` to the `useAuth()` destructuring at the top of the component (alongside `login, loginWithBiometric` from Step 3):
```ts
  const { login, loginWithBiometric, offerBiometricEnrollment, enrollBiometric, dismissBiometricOffer } = useAuth();
```

Note: this prompt is rendered from `LoginPage.tsx`, but `offerBiometricEnrollment` is actually set to `true` by `login()` — meaning by the time it becomes true, the user has JUST been authenticated and `LoginPage` is about to unmount (the app navigates to the dashboard once `isAuthenticated` becomes true in `App.tsx`). Read `App.tsx`'s render logic around where it decides between `<LoginPage />` and the authenticated app tree (near the `!isAuthenticated` check at line 451) to confirm whether `LoginPage` actually stays mounted long enough for this prompt to be seen, or whether it needs to be rendered from a higher, longer-lived location (e.g. `App.tsx` itself, rendered as an overlay regardless of which view is showing) instead. If `LoginPage` unmounts immediately on successful login, move this exact prompt block (and the `useAuth()` fields it needs) into `App.tsx` instead, rendered unconditionally near its other top-level overlays (alongside where `ToastContainer` or similar always-present elements are rendered), rather than inside `LoginPage.tsx`. Use your judgment based on what you actually find — this is the one genuinely open integration detail in this task, and getting the mount timing right matters more than matching this step's exact file placement.

- [ ] **Step 6: Run the full suite, type-check, and lint**

Run: `pnpm vitest run` then `pnpm tsc --noEmit` then `pnpm lint`
Expected: all pass, no new errors, zero lint warnings. (No new tests for this task — this is UI wiring with no existing test file for `App.tsx` or `LoginPage.tsx` to extend, matching this project's convention for dense interactive UI components; the underlying logic it calls into was already tested in Tasks 1-3.)

- [ ] **Step 7: Manually verify — requires a real device, cannot be done in this environment**

This cannot be exercised in this session (no browser/device access, and biometric prompts specifically require real hardware — not just a running browser). After this task is committed, the user needs to run `pnpm android:sync` (syncs the new native dependency into the Android project — required before Step 8 below can work at all) then build and install the app on a real Android device with a fingerprint enrolled, and confirm:
- A fresh password login shows the "Enable Fingerprint Sign-In?" prompt; tapping Enable stores it.
- Backgrounding the app for 11+ minutes then returning shows the lock screen, which auto-prompts fingerprint; a successful scan unlocks immediately with no typing.
- Force-quitting the app and reopening within the original 8-hour window (or role-based inactivity window, whichever is shorter) shows a "Sign in with Fingerprint" button on the login page; using it signs in without typing.
- After that window has genuinely passed (or by manually clearing the app's storage to simulate it), the fingerprint button no longer appears and a real password login is required.

State plainly in your task report that this step was not (and could not be) performed in this session, per this project's documented `local-dev-test-baseline` limitation — do not claim success for anything in this step.

- [ ] **Step 8: Commit**

```bash
git add App.tsx components/LoginPage.tsx
git commit -m "feat(auth): wire fingerprint unlock into the lock screen and login page"
```
