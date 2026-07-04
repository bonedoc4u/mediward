import React, { useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export interface PickerOption {
  value: string;
  label: string;
  description?: string;
}

interface Props {
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Extra classes applied to the trigger button (replaces the default style when provided). */
  triggerClassName?: string;
  /** Title shown in the bottom sheet header. */
  title?: string;
}

const BottomSheetPicker: React.FC<Props> = ({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select…',
  triggerClassName,
  title,
}) => {
  const [open, setOpen] = React.useState(false);
  const sheetRef = useFocusTrap<HTMLDivElement>(open);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const defaultTrigger = `w-full flex items-center justify-between gap-2 p-2 border border-slate-300
    rounded text-sm bg-white focus:outline-none text-slate-700
    disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`;

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(true)}
        className={triggerClassName ?? defaultTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'text-slate-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title ?? placeholder}
          className="fixed inset-0 z-[200] flex items-end justify-center md:items-center"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />

          {/* Sheet */}
          <div
            ref={sheetRef}
            role="listbox"
            aria-label={title ?? placeholder}
            className="relative w-full max-w-lg bg-white rounded-t-2xl md:rounded-2xl
                       shadow-2xl animate-in slide-in-from-bottom duration-300
                       max-h-[70vh] flex flex-col"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0 md:hidden">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            {title && (
              <div className="px-5 pt-3 pb-2 shrink-0 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">{title}</p>
              </div>
            )}

            <div className="overflow-y-auto overscroll-contain">
              {options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors
                    hover:bg-teal-50 active:bg-teal-100 ${opt.value === value ? 'bg-teal-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${
                      opt.value === value ? 'text-teal-700' : 'text-slate-800'
                    }`}>
                      {opt.label}
                    </p>
                    {opt.description && (
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">{opt.description}</p>
                    )}
                  </div>
                  {opt.value === value && (
                    <Check className="w-4 h-4 text-teal-600 shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="pb-[env(safe-area-inset-bottom,16px)] md:pb-4 shrink-0" />
          </div>
        </div>
      )}
    </>
  );
};

export default BottomSheetPicker;
