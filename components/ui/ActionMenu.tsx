/**
 * ActionMenu — secondary actions behind one button (a filter icon, "⋯").
 *
 * Not a modal: it never blocks the screen. It closes on a choice, on a tap
 * outside, or on Escape, and gives focus back to its button. Items that are
 * toggles (filters) show a check and are announced as checkboxes.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  /** Set for a toggle (true / false); leave undefined for a plain action. */
  checked?: boolean;
  disabled?: boolean;
}

interface Props {
  /** Accessible name of the button, e.g. "Filters" or "More actions". */
  label: string;
  /** What the button shows (usually one icon). */
  children: React.ReactNode;
  items: ActionMenuItem[];
  /** Open the list above the button (for bars at the bottom of the screen). */
  placement?: 'below' | 'above';
  align?: 'start' | 'end';
  /** Replaces the default size and rounding (44px square, control radius). */
  triggerClassName?: string;
  /** Marks the button as "on", e.g. while a filter from the menu is active. */
  active?: boolean;
  /** Extra line under the items (e.g. "2 filters on"). */
  footer?: React.ReactNode;
}

const ActionMenu: React.FC<Props> = ({
  label, children, items, placement = 'below', align = 'end', triggerClassName = '', active, footer,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    // Escape closes only this menu. Listening on window in the capture phase
    // runs before Radix's own Escape handler, so a menu inside the patient
    // sheet does not also close the sheet.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
    const at = els.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % els.length : (at - 1 + els.length) % els.length;
    els[next]?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(v => !v)}
        className={`${triggerClassName || 'min-w-11 min-h-11 rounded-control'} flex items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          active || open
            ? 'bg-accent-soft border-accent text-accent-fg'
            : 'bg-surface-card border-line text-ink-muted hover:text-ink hover:border-accent'
        }`}
      >
        {children}
      </button>

      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onListKey}
          className={`absolute z-50 min-w-56 py-1 rounded-card border border-line bg-surface-card shadow-lg ${
            placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
          } ${align === 'end' ? 'right-0' : 'left-0'}`}
        >
          {items.map(item => {
            const Icon = item.icon;
            const isToggle = item.checked !== undefined;
            return (
              <button
                key={item.key}
                type="button"
                role={isToggle ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={isToggle ? item.checked : undefined}
                disabled={item.disabled}
                onClick={() => { item.onSelect(); close(); }}
                className="w-full min-h-11 px-3 flex items-center gap-3 text-left text-sm font-medium text-ink hover:bg-surface-sunken focus:bg-surface-sunken focus:outline-none disabled:opacity-40 transition-colors"
              >
                {Icon && <Icon className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />}
                <span className="flex-1 min-w-0">{item.label}</span>
                {isToggle && (
                  <Check className={`w-4 h-4 shrink-0 text-accent-fg ${item.checked ? '' : 'invisible'}`} aria-hidden="true" />
                )}
              </button>
            );
          })}
          {footer && <div className="px-3 pt-2 pb-1 mt-1 border-t border-line text-xs text-ink-muted">{footer}</div>}
        </div>
      )}
    </div>
  );
};

export default ActionMenu;
