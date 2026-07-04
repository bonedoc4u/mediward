/**
 * Sheet.tsx — a right-side (or bottom) slide-over built on Radix Dialog.
 *
 * Radix gives us focus trapping, ESC-to-close, scroll-lock and ARIA wiring for
 * free — important for a surface that shows PHI. Styling uses plain Tailwind
 * class strings to match the rest of the codebase (no cva/clsx/tailwind-merge).
 * Slide/fade animations are defined in index.css (.sheet-in-right / .sheet-overlay).
 */
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

const Sheet = DialogPrimitive.Root;
const SheetClose = DialogPrimitive.Close;
const SheetTitle = DialogPrimitive.Title;
const SheetDescription = DialogPrimitive.Description;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={`fixed inset-0 z-[80] bg-black/50 sheet-overlay ${className}`}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: 'right' | 'bottom';
  /** Suppress the built-in top-right close button (caller provides its own). */
  hideClose?: boolean;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className = '', children, side = 'right', hideClose = false, ...props }, ref) => {
  const position =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 w-full max-h-[92dvh] rounded-t-2xl sheet-in-bottom'
      : 'top-0 right-0 h-[100dvh] w-full sm:max-w-xl md:max-w-2xl sheet-in-right';
  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={`fixed z-[81] bg-white shadow-2xl outline-none flex flex-col ${position} ${className}`}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-3 right-3 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="w-5 h-5" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
SheetContent.displayName = 'SheetContent';

export { Sheet, SheetContent, SheetClose, SheetTitle, SheetDescription };
