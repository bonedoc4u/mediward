import React, { useRef, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<Props> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap: keep Tab and Shift+Tab inside the dialog; Escape → cancel
  useEffect(() => {
    if (!isOpen) return;
    const el = dialogRef.current;
    if (!el) return;
    el.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
      if (e.key !== 'Tab') return;

      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) { e.preventDefault(); return; }

      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const confirmStyles = variant === 'danger'
    ? 'bg-vital-critical hover:opacity-90 text-white'
    : 'bg-vital-warning hover:opacity-90 text-white';

  const iconStyles = variant === 'danger'
    ? 'bg-vital-critical-surface text-vital-critical-fg'
    : 'bg-vital-warning-surface text-vital-warning-fg';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog — tabIndex=-1 so .focus() works on the container */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="relative bg-surface-card rounded-card shadow-2xl w-full max-w-sm animate-in zoom-in-95 fade-in duration-200 outline-none"
      >
        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${iconStyles}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>

          {/* Close */}
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 text-ink-faint hover:text-ink-muted p-1 rounded-full hover:bg-surface-sunken"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <h3 id="confirm-dialog-title" className="text-lg font-bold text-ink mb-2">{title}</h3>
          <p id="confirm-dialog-message" className="text-sm text-ink-muted leading-relaxed">{message}</p>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-line rounded-control text-ink font-medium hover:bg-surface transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => { onConfirm(); }}
            className={`flex-1 py-2.5 rounded-control font-semibold transition-colors ${confirmStyles}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
