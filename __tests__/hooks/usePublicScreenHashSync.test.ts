import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePublicScreenHashSync } from '../../hooks/usePublicScreenHashSync';

function setHash(hash: string) {
  window.location.hash = hash;
  // jsdom updates location.hash but does not always dispatch hashchange
  // synchronously; dispatch it explicitly so the test is deterministic.
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function setup(isAuthenticated = false) {
  const setters = {
    setShowPrivacy: vi.fn(),
    setShowTerms: vi.fn(),
    setShowLogin: vi.fn(),
  };
  const hook = renderHook(
    ({ auth }) => usePublicScreenHashSync({ isAuthenticated: auth, ...setters }),
    { initialProps: { auth: isAuthenticated } },
  );
  return { ...setters, ...hook };
}

describe('usePublicScreenHashSync', () => {
  beforeEach(() => { window.location.hash = ''; });
  afterEach(() => { window.location.hash = ''; });

  it('opens the login screen when #/login is entered into an already-open tab', () => {
    const { setShowLogin } = setup();
    setHash('#/login');
    expect(setShowLogin).toHaveBeenCalledWith(true);
  });

  it('opens and closes privacy/terms as the hash changes (e.g. browser Back)', () => {
    const { setShowPrivacy, setShowTerms } = setup();

    setHash('#/privacy');
    expect(setShowPrivacy).toHaveBeenLastCalledWith(true);
    expect(setShowTerms).toHaveBeenLastCalledWith(false);

    setHash('');
    expect(setShowPrivacy).toHaveBeenLastCalledWith(false);
  });

  it('never closes the login screen, so a returning device is not bounced to landing', () => {
    const { setShowLogin } = setup();
    setHash('#/privacy');
    setHash('');
    expect(setShowLogin).not.toHaveBeenCalledWith(false);
  });

  it('ignores hash changes while signed in (UIContext owns that routing)', () => {
    const { setShowLogin, setShowPrivacy } = setup(true);
    setHash('#/login');
    setHash('#/privacy');
    expect(setShowLogin).not.toHaveBeenCalled();
    expect(setShowPrivacy).not.toHaveBeenCalled();
  });

  it('stops listening after unmount', () => {
    const { setShowLogin, unmount } = setup();
    unmount();
    setHash('#/login');
    expect(setShowLogin).not.toHaveBeenCalled();
  });
});
