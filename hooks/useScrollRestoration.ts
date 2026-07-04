/**
 * useScrollRestoration.ts
 *
 * Restores scroll position per "path" key when returning to a view — so a
 * resident who scrolls to patient #40 in the ward list, opens them, and comes
 * back lands at the same spot instead of the top.
 *
 * Why this is bespoke (not React Router's <ScrollRestoration>):
 *   MediWard uses a custom hash router (UIContext), not a data router, so the
 *   built-in component isn't available. This is the manual fallback.
 *
 * Two scrollers, one hook:
 *   - Desktop renders the ward list inside <main> (an overflow-y-auto div).
 *   - Mobile renders a window-virtualized (`useWindowVirtualizer`) card list,
 *     which scrolls the document/window.
 *   We therefore read from whichever is actually scrolled and, on restore, set
 *   both — the non-scroller clamps to 0 and is a harmless no-op.
 *
 * Persistence: a module-level Map (fast, survives view switches) mirrored to
 * sessionStorage so the position also survives a Capacitor webview reload.
 */
import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'mw_scroll_';
const memory = new Map<string, number>();

function readOffset(key: string): number | undefined {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (raw != null) {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n)) {
        memory.set(key, n);
        return n;
      }
    }
  } catch { /* private mode / quota — memory Map still works */ }
  return undefined;
}

function writeOffset(key: string, offset: number): void {
  memory.set(key, offset);
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, String(offset));
  } catch { /* ignore */ }
}

/** Current scroll offset, preferring whichever container is actually scrolled. */
function currentOffset(el: HTMLElement | null): number {
  const elTop = el?.scrollTop ?? 0;
  if (elTop > 0) return elTop;
  return window.scrollY || document.documentElement.scrollTop || elTop;
}

/** Apply an offset to both candidate scrollers; the wrong one clamps to 0. */
function applyOffset(el: HTMLElement | null, offset: number): void {
  if (el) el.scrollTop = offset;
  window.scrollTo(0, offset);
}

interface Options {
  /** Stable key for the current view (e.g. the router view name / pathname). */
  key: string;
  /**
   * Gate: only restore once the list data has rendered. Restoring before the
   * rows mount silently fails because the scrollable content isn't tall yet.
   */
  ready: boolean;
  /** Returns the overflow scroll container, or null to use the window. */
  getScrollElement: () => HTMLElement | null;
}

export function useScrollRestoration({ key, ready, getScrollElement }: Options): void {
  const getEl = getScrollElement;

  // ── Continuously record the active view's offset while the user scrolls ──
  useEffect(() => {
    const el = getEl();
    const record = () => writeOffset(key, currentOffset(el));
    const target: HTMLElement | Window = el ?? window;
    target.addEventListener('scroll', record, { passive: true });
    // The virtualized list scrolls the window even when a <main> ref exists,
    // so listen to both to be certain we capture the real scroller.
    if (el) window.addEventListener('scroll', record, { passive: true });
    return () => {
      target.removeEventListener('scroll', record);
      if (el) window.removeEventListener('scroll', record);
    };
  }, [key, getEl]);

  // ── Restore on return, after data is ready, across two animation frames ──
  useEffect(() => {
    if (!ready) return;
    const saved = readOffset(key);
    if (saved == null || saved === 0) return;
    let raf1 = 0;
    let raf2 = 0;
    // rAF twice: first frame commits the list DOM, second lets the virtualizer
    // establish total height so the offset is actually reachable.
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => applyOffset(getEl(), saved));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [key, ready, getEl]);
}

// ── Last-viewed patient tracking (for the return-highlight) ──────────────────
const LAST_VIEWED_KEY = 'mw_last_viewed_patient';

export function setLastViewedPatient(ipNo: string): void {
  try { sessionStorage.setItem(LAST_VIEWED_KEY, ipNo); } catch { /* ignore */ }
}

export function getLastViewedPatient(): string | null {
  try { return sessionStorage.getItem(LAST_VIEWED_KEY); } catch { return null; }
}

export function clearLastViewedPatient(): void {
  try { sessionStorage.removeItem(LAST_VIEWED_KEY); } catch { /* ignore */ }
}

/**
 * Convenience hook for the highlight lifecycle: returns the ipNo to highlight
 * once (after `ready`), then clears it after ~1.6s so the accent fades and
 * doesn't re-fire on the next render.
 */
export function useReturnHighlight(ready: boolean): string | null {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const id = getLastViewedPatient();
    if (!id) return;
    setHighlightId(id);
    clearLastViewedPatient();
    const t = setTimeout(() => setHighlightId(null), 1600);
    return () => clearTimeout(t);
  }, [ready]);
  return highlightId;
}
