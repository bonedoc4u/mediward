/**
 * toast.ts
 * Lightweight singleton toast notification system.
 * Callable from anywhere (AppContext, components) without extra context.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

type Listener = (toasts: ToastItem[]) => void;

let _toasts: ToastItem[] = [];
let _listeners: Listener[] = [];

function notify() {
  _listeners.forEach(l => l([..._toasts]));
}

function show(message: string, type: ToastType = 'success', duration = 3500) {
  const id = Math.random().toString(36).slice(2, 9);
  _toasts = [..._toasts, { id, message, type }];
  notify();
  setTimeout(() => {
    _toasts = _toasts.filter(t => t.id !== id);
    notify();
  }, duration);
}

export const toast = {
  success: (msg: string) => show(msg, 'success'),
  error:   (msg: string) => show(msg, 'error', 5000),
  info:    (msg: string) => show(msg, 'info'),
  warning: (msg: string) => show(msg, 'warning'),

  subscribe(listener: Listener): () => void {
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter(l => l !== listener); };
  },
};
