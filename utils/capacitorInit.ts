/**
 * capacitorInit.ts
 * Initialise native Capacitor features (back button, StatusBar, Haptics, Keyboard).
 * All calls are guarded by Capacitor.isNativePlatform() so the web/PWA build is unaffected.
 */

import { Capacitor } from '@capacitor/core';

export async function initCapacitor(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const platform = Capacitor.getPlatform(); // 'android' | 'ios'

  // ── StatusBar ─────────────────────────────────────────────────
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark }); // white icons on dark bg
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#1e293b' }); // slate-900
    }
  } catch { /* plugin not available in this build */ }

  // ── Keyboard ──────────────────────────────────────────────────
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    // Prevent the WebView from resizing when the keyboard appears;
    // we handle layout shifts via CSS env(keyboard-inset-height) instead.
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
    await Keyboard.setScroll({ isDisabled: false });
  } catch { /* plugin not available */ }

  // ── Android hardware back button ───────────────────────────────
  if (platform === 'android') {
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.minimizeApp();
        }
      });
    } catch { /* plugin not available */ }
  }
}

/**
 * Trigger a light haptic tap — call on button presses that benefit from
 * tactile confirmation (toggle todos, save round, etc.).
 * Safe to call on web — silently no-ops.
 */
export async function hapticTap(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch { /* plugin not available */ }
}

/**
 * Trigger a medium haptic impact — call on successful saves / confirmations.
 */
export async function hapticSuccess(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch { /* plugin not available */ }
}
