import { useState, useEffect } from 'react';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

interface KeyboardState {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
}

/**
 * Tracks Capacitor keyboard visibility and height.
 * On web (non-native), always returns closed/0 — the browser handles resize itself.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>({
    isKeyboardOpen: false,
    keyboardHeight: 0,
  });

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const showSub = Keyboard.addListener('keyboardWillShow', (info) => {
      setState({ isKeyboardOpen: true, keyboardHeight: info.keyboardHeight });
    });

    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      setState({ isKeyboardOpen: false, keyboardHeight: 0 });
    });

    return () => {
      void showSub.then(h => h.remove());
      void hideSub.then(h => h.remove());
    };
  }, []);

  return state;
}

/**
 * Scrolls the nearest scroll container to keep the focused input
 * visible above the keyboard after it opens.
 */
export function scrollInputIntoView(inputEl: HTMLElement | null, keyboardHeight: number) {
  if (!inputEl || keyboardHeight === 0) return;
  const rect = inputEl.getBoundingClientRect();
  const visibleBottom = window.innerHeight - keyboardHeight - 16; // 16px breathing room
  if (rect.bottom > visibleBottom) {
    const overflow = rect.bottom - visibleBottom;
    // Walk up until we find a scrollable container
    let el: HTMLElement | null = inputEl.parentElement;
    while (el) {
      const style = window.getComputedStyle(el);
      const overflow_ = style.overflowY;
      if (overflow_ === 'auto' || overflow_ === 'scroll') {
        el.scrollTop += overflow;
        return;
      }
      el = el.parentElement;
    }
    window.scrollBy({ top: overflow, behavior: 'smooth' });
  }
}
