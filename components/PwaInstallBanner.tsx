/**
 * PwaInstallBanner.tsx
 *
 * Prompts users to install MediWard as a PWA (home screen app).
 * Handles two distinct flows:
 *
 *   Android / Chrome / Edge — captures the `beforeinstallprompt` event and
 *   shows a one-tap install button.
 *
 *   iOS Safari — `beforeinstallprompt` is never fired on iOS. Instead we
 *   detect the platform and show a manual instruction banner ("Tap Share →
 *   Add to Home Screen").
 *
 * The banner is suppressed once dismissed (14-day localStorage TTL) and
 * never shown if the app is already running in standalone mode.
 */

import React, { useEffect, useState } from 'react';
import { X, Download, Share } from 'lucide-react';

// ─── platform detection ────────────────────────────────────────────────────

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

// ─── dismiss TTL ──────────────────────────────────────────────────────────

const DISMISS_KEY = 'mediward_pwa_dismissed';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function saveDismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch { /* storage unavailable — safe to ignore */ }
}

// ─── component ────────────────────────────────────────────────────────────

const PwaInstallBanner: React.FC = () => {
  // Android: deferred native install prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  // Which banner type to show: null = hidden
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);

  useEffect(() => {
    // Never show if already installed or dismissed
    if (isStandalone() || isDismissed()) return;

    if (isIos()) {
      // Show iOS manual instructions after a short delay
      const t = setTimeout(() => setMode('ios'), 8000);
      return () => clearTimeout(t);
    }

    // Android / Chrome: listen for the browser's install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show after 20 s to avoid being intrusive on first load
      setTimeout(() => setMode('android'), 20000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Hide once actually installed
    const onInstalled = () => {
      setMode(null);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setMode(null);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    saveDismiss();
    setMode(null);
  };

  if (!mode) return null;

  return (
    <div
      className="md:hidden fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 z-[45] px-3 pb-2"
      role="banner"
      aria-live="polite"
    >
      <div className="bg-teal-800 text-white rounded-xl shadow-xl p-3.5 flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-300">

        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          {mode === 'android'
            ? <Download className="w-5 h-5 text-teal-200" />
            : <Share className="w-5 h-5 text-teal-200" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {mode === 'android' ? (
            <>
              <p className="text-sm font-bold leading-snug">Install MediWard</p>
              <p className="text-xs text-teal-200 mt-0.5 leading-snug">
                Add to your home screen for instant bedside access, even offline.
              </p>
              <button
                onClick={handleInstall}
                className="mt-2 px-3 py-1 bg-white text-teal-800 text-xs font-bold rounded-lg hover:bg-teal-50 active:scale-95 transition-all"
              >
                Add to Home Screen
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-bold leading-snug">Add to Home Screen</p>
              <p className="text-xs text-teal-200 mt-0.5 leading-snug">
                Tap <span className="font-bold">Share</span> then{' '}
                <span className="font-bold">"Add to Home Screen"</span> for the best bedside experience.
              </p>
              {/* iOS Share icon hint */}
              <div className="mt-1.5 flex items-center gap-1.5 text-teal-300">
                <Share className="w-3.5 h-3.5" />
                <span className="text-[10px] font-semibold tracking-wide uppercase">
                  Tap the Share button in Safari
                </span>
              </div>
            </>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss install banner"
          className="shrink-0 p-1 text-teal-300 hover:text-white hover:bg-teal-700 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PwaInstallBanner;
