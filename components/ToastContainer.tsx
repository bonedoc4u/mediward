import React, { useState, useEffect } from 'react';
import { toast, ToastItem } from '../utils/toast';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

const ICONS = {
  success: <CheckCircle className="w-5 h-5 text-vital-normal shrink-0" />,
  error:   <XCircle    className="w-5 h-5 text-vital-critical shrink-0" />,
  info:    <Info       className="w-5 h-5 text-vital-low shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-vital-warning shrink-0" />,
};

const STYLES = {
  success: 'border-vital-normal-border bg-vital-normal-surface',
  error:   'border-vital-critical-border bg-vital-critical-surface',
  info:    'border-vital-low-border bg-vital-low-surface',
  warning: 'border-vital-warning-border bg-vital-warning-surface',
};

const TEXT = {
  success: 'text-vital-normal-fg',
  error:   'text-vital-critical-fg',
  info:    'text-vital-low-fg',
  warning: 'text-vital-warning-fg',
};

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => toast.subscribe(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none" style={{ bottom: 'calc(var(--content-bottom-pad, 88px) + 4px)' }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg pointer-events-auto
            animate-in slide-in-from-bottom-2 fade-in duration-300
            ${STYLES[t.type]}`}
        >
          {ICONS[t.type]}
          <p className={`text-sm font-medium flex-1 ${TEXT[t.type]}`}>{t.message}</p>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            className="text-ink-faint hover:text-ink-muted shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
