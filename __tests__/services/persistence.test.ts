import { describe, it, expect, beforeEach } from 'vitest';
import { loadFromStorage } from '../../services/persistence';

// Minimal, targeted regression test for one behavior: unwrapEnvelope() must
// normalize a missing/malformed `data` field to `null`, never `undefined`.
// Found via AuthContext.tsx's boot-time session check — isSessionValid()
// only guards against `null` (`session !== null`), so if loadFromStorage
// ever returned `undefined` for a tampered/malformed envelope, the check
// would pass through and `.sessionExpiry` would be read off `undefined`,
// throwing inside a render-phase useState initializer and crashing app
// boot instead of just logging the user out. A full test suite for
// services/persistence.ts (which has no existing coverage) is out of scope
// here — this covers just the one behavior this fix depends on.
describe('loadFromStorage — malformed envelope handling', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null (not undefined) when the stored envelope is missing its data field', () => {
    // Valid envelope shape, but no `data` key at all.
    localStorage.setItem('mediward_session', JSON.stringify({
      version: 1,
      timestamp: new Date().toISOString(),
    }));

    const result = loadFromStorage('session');

    expect(result).toBeNull();
    // Explicitly distinguish from `undefined`: `!== null` would let an
    // undefined value slip through isSessionValid()'s null check.
    expect(result).not.toBeUndefined();
  });
});
