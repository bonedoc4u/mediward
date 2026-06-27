import React, { useRef, useEffect } from 'react';
import { useKeyboard, scrollInputIntoView } from '../../hooks/useKeyboard';

interface Props {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps scrollable form areas. Automatically adds bottom padding equal to
 * the keyboard height so content is never obscured on iOS/Android.
 * Uses capacitor.config.ts `resize: 'body'` for the actual resize; this
 * handles the scroll-to-active-input so the focused field stays visible.
 */
export function KeyboardAwareView({ children, className = '' }: Props) {
  const { isKeyboardOpen, keyboardHeight } = useKeyboard();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isKeyboardOpen) return;
    const activeEl = document.activeElement as HTMLElement | null;
    scrollInputIntoView(activeEl, keyboardHeight);
  }, [isKeyboardOpen, keyboardHeight]);

  return (
    <div
      ref={containerRef}
      className={`transition-[padding-bottom] duration-200 ${className}`}
      style={{ paddingBottom: isKeyboardOpen ? keyboardHeight : undefined }}
    >
      {children}
    </div>
  );
}
