import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerLightboxClose, unregisterLightboxClose, closeActiveLightbox } from '../hooks/useLightboxBackHandler';

// Module-level state persists across tests in the same file — reset it
// explicitly rather than relying on import order.
beforeEach(() => {
  closeActiveLightbox(); // drains any handler left over from a failed prior test
});

describe('useLightboxBackHandler', () => {
  it('returns false when no Lightbox is registered', () => {
    expect(closeActiveLightbox()).toBe(false);
  });

  it('calls the registered close handler and reports it was handled', () => {
    const onClose = vi.fn();
    registerLightboxClose(onClose);
    expect(closeActiveLightbox()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('unregisters so a later back-press is not handled', () => {
    const onClose = vi.fn();
    registerLightboxClose(onClose);
    unregisterLightboxClose(onClose);
    expect(closeActiveLightbox()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not clobber a newer registration (guards a rapid unmount racing a remount)', () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    registerLightboxClose(firstClose);
    registerLightboxClose(secondClose); // e.g. swapping to a different Lightbox instance
    unregisterLightboxClose(firstClose); // the OLD instance's cleanup runs after the swap
    expect(closeActiveLightbox()).toBe(true);
    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(firstClose).not.toHaveBeenCalled();
  });
});
