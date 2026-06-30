/**
 * toast.ts
 * Lightweight singleton toast notification system.
 * Callable from anywhere (AppContext, components) without extra context.
 *
 * Dedup rules:
 *   - Same message already visible → skip (prevents realtime-reconnect spam)
 *   - Same `id` already visible → replace in-place (allows "sticky" toasts)
 *   - More than MAX_TOASTS visible → oldest is evicted
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

type Listener = (toasts: ToastItem[]) => void;

const MAX_TOASTS = 3;

let _toasts: ToastItem[] = [];
let _listeners: Listener[] = [];
const _timers = new Map<string, ReturnType<typeof setTimeout>>();

function notify() {
  _listeners.forEach(l => l([..._toasts]));
}

function show(message: string, type: ToastType = 'success', duration = 3500, id?: string) {
  // Replace in-place if same id already showing
  if (id && _toasts.some(t => t.id === id)) {
    _toasts = _toasts.map(t => t.id === id ? { id, message, type } : t);
    notify();
    // Reset the auto-dismiss timer
    clearTimeout(_timers.get(id));
    _timers.set(id, setTimeout(() => dismiss(id), duration));
    return;
  }

  // Skip duplicate message that is already visible
  if (_toasts.some(t => t.message === message)) return;

  const toastId = id ?? Math.random().toString(36).slice(2, 9);

  // Evict oldest if at cap
  if (_toasts.length >= MAX_TOASTS) {
    const oldest = _toasts[0];
    clearTimeout(_timers.get(oldest.id));
    _timers.delete(oldest.id);
    _toasts = _toasts.slice(1);
  }

  _toasts = [..._toasts, { id: toastId, message, type }];
  notify();

  _timers.set(toastId, setTimeout(() => dismiss(toastId), duration));
}

function dismiss(id?: string) {
  if (id) {
    clearTimeout(_timers.get(id));
    _timers.delete(id);
    _toasts = _toasts.filter(t => t.id !== id);
  } else {
    _timers.forEach(t => clearTimeout(t));
    _timers.clear();
    _toasts = [];
  }
  notify();
}

export const toast = {
  success: (msg: string, id?: string) => show(msg, 'success', 3500, id),
  error:   (msg: string, id?: string) => show(msg, 'error',   5000, id),
  info:    (msg: string, id?: string) => show(msg, 'info',    3500, id),
  warning: (msg: string, id?: string) => show(msg, 'warning', 4000, id),
  dismiss,

  subscribe(listener: Listener): () => void {
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter(l => l !== listener); };
  },
};
