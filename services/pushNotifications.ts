/**
 * pushNotifications.ts
 * Browser Notification API — no server required.
 * Shows OS-level desktop alerts for critical patient alerts on app load.
 */

import { Patient } from '../types';
import { getSmartAlerts } from '../utils/smartAlerts';

const NOTIFIED_KEY = 'mediward_notified_alerts';

/** Register the service worker (required for Notification API in modern browsers). */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('[Push] Service worker registration failed:', err);
  }
}

/** Ask user for notification permission (once). Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** Show a single OS-level notification. De-duped by tag. */
export function showCriticalAlert(title: string, body: string): void {
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `${title}:${body}`, // prevents duplicate toasts for same alert
      requireInteraction: false,
    });
  } catch (err) {
    console.warn('[Push] Notification failed:', err);
  }
}

/**
 * Check all active patients for critical smart alerts and fire notifications
 * for any that haven't already been shown today.
 */
export function checkAndNotifyAlerts(patients: Patient[]): void {
  if (Notification.permission !== 'granted') return;

  const today = new Date().toISOString().split('T')[0];
  const stored = localStorage.getItem(NOTIFIED_KEY);
  const alreadyNotified: string[] = stored ? JSON.parse(stored) : [];

  // Only keep keys from today to reset daily
  const todayKeys = alreadyNotified.filter(k => k.startsWith(today));
  const newKeys: string[] = [...todayKeys];

  for (const patient of patients) {
    const alerts = getSmartAlerts(patient);
    for (const alert of alerts) {
      if (alert.type !== 'critical') continue;
      const key = `${today}:${patient.ipNo}:${alert.message}`;
      if (todayKeys.includes(key)) continue;

      showCriticalAlert(`\u26A0\uFE0F ${patient.name} \u2014 Bed ${patient.bed}`, alert.message);
      newKeys.push(key);
    }
  }

  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(newKeys));
}
