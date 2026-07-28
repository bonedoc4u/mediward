/**
 * Lets the Android hardware back-button handler in App.tsx know a Lightbox
 * (fullscreen image viewer) is currently open, so pressing back closes the
 * viewer instead of falling through to view-level navigation (a real bug —
 * closing an X-ray from Admission List used to jump all the way to the
 * dashboard). Lightbox is rendered from several independent call sites
 * (RadiologyPanel, RadiologyComparator, AdmissionList), each owning its own
 * open/close state — this is a thin, app-wide "is one open, and how do I
 * close it" bridge rather than lifting that state into a shared context.
 * Only one Lightbox is ever mounted at a time in practice.
 */
let activeCloseHandler: (() => void) | null = null;

export function registerLightboxClose(onClose: () => void): void {
  activeCloseHandler = onClose;
}

/** Only clears if still the registered handler — guards a rapid unmount
 *  immediately followed by a different Lightbox's mount (e.g. swapping
 *  images) from clobbering the newer registration. */
export function unregisterLightboxClose(onClose: () => void): void {
  if (activeCloseHandler === onClose) activeCloseHandler = null;
}

/** Called by the back-button handler. Returns true if a Lightbox was open
 *  and has now been asked to close. */
export function closeActiveLightbox(): boolean {
  if (!activeCloseHandler) return false;
  activeCloseHandler();
  return true;
}
