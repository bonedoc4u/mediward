/**
 * SwUpdateBanner.tsx
 * Prompts the user to reload when a new service worker version is waiting.
 * Uses vite-plugin-pwa's useRegisterSW with registerType: 'prompt' so the app
 * NEVER silently reloads mid-session — critical in an active clinical workflow.
 */
import React, { useRef, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

// Dismissing must never mean "stuck on old code for the rest of a multi-day
// ward session" — a device that's dismissed once had no further reminder
// until the app was fully closed and reopened. Re-arm the reminder instead
// of losing it silently.
const DISMISS_SNOOZE_MS = 30 * 60 * 1000;

const SwUpdateBanner: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (!r) return;
      // Poll for updates every 60 minutes while the app is open…
      setInterval(() => r.update(), 60 * 60 * 1000);
      // …and whenever the user comes back to the tab — ward desktops keep
      // the app open for days, so returning focus is the natural moment to
      // discover a new version.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') r.update();
      });
    },
  });

  // Clear any pending snooze timer on unmount so it can't call setNeedRefresh
  // after the component is gone.
  const snoozeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(snoozeTimeoutRef.current), []);

  const handleDismiss = () => {
    setNeedRefresh(false);
    snoozeTimeoutRef.current = setTimeout(() => setNeedRefresh(true), DISMISS_SNOOZE_MS);
  };

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-0 left-0 right-0 z-[9998] flex items-center justify-between gap-3 px-4 py-3 bg-slate-800 text-white shadow-2xl md:bottom-4 md:left-4 md:right-auto md:max-w-sm md:rounded-xl"
    >
      <div className="flex items-center gap-2 min-w-0">
        <RefreshCw className="w-4 h-4 text-teal-400 shrink-0" />
        <p className="text-sm font-medium truncate">New version available</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => updateServiceWorker(true)}
          className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-white text-xs font-bold rounded-lg transition-colors"
        >
          Update now
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss update banner"
          className="p-1 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default SwUpdateBanner;
