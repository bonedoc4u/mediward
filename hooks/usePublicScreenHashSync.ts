import { useEffect } from 'react';

interface PublicScreenSetters {
  isAuthenticated: boolean;
  setShowPrivacy: (show: boolean) => void;
  setShowTerms: (show: boolean) => void;
  setShowLogin: (show: boolean) => void;
}

/**
 * Keeps App's signed-out screen state (landing / login / privacy / terms) in
 * sync with the URL hash after the first render.
 *
 * App seeds that state from `window.location.hash` once, on mount. Without
 * this listener a later hash change — pasting `…/#/login` into a tab that is
 * already open, or pressing the browser Back button — left the wrong public
 * screen showing.
 *
 * Signed-in routing is owned by UIContext's own `hashchange` listener, so this
 * one does nothing while authenticated.
 */
export function usePublicScreenHashSync({
  isAuthenticated,
  setShowPrivacy,
  setShowTerms,
  setShowLogin,
}: PublicScreenSetters): void {
  useEffect(() => {
    if (isAuthenticated) return;

    const sync = () => {
      const hash = window.location.hash;
      setShowPrivacy(hash === '#/privacy');
      setShowTerms(hash === '#/terms');
      // Only ever *opens* the login screen. A returning device (one with the
      // has-signed-in flag) starts on login, and an empty hash must not bounce
      // it back to the landing page.
      if (hash === '#/login') setShowLogin(true);
    };

    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [isAuthenticated, setShowPrivacy, setShowTerms, setShowLogin]);
}
