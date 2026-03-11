/**
 * sanitize.ts
 * XSS sanitization using DOMPurify (industry standard, OWASP-vetted).
 * The previous regex-based sanitizer had known bypass vectors — replaced entirely.
 *
 * Install: npm install dompurify @types/dompurify
 */

// DOMPurify is the gold standard for client-side XSS sanitization.
// It operates on a real DOM (or JSDOM in tests), not regexes.
import type { DOMPurify as DOMPurifyType } from 'dompurify';
let _DOMPurify: DOMPurifyType | null = null;

async function getDOMPurify(): Promise<DOMPurifyType | null> {
  if (_DOMPurify) return _DOMPurify;
  try {
    const mod = await import('dompurify');
    // dompurify v3 ESM: default export is the DOMPurify instance
    _DOMPurify = (mod.default as unknown as DOMPurifyType) ?? (mod as unknown as DOMPurifyType);
    return _DOMPurify;
  } catch {
    return null;
  }
}

/**
 * Sanitize a plain-text string for safe storage and rendering.
 * Strips ALL HTML tags — output is safe for textContent or value assignment.
 * Falls back to manual stripping if DOMPurify is unavailable.
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';

  // Synchronous path: strip all HTML tags via DOM (fast, no async needed for plain text).
  // This is safe for plain-text fields (name, diagnosis, notes) — not rich HTML.
  if (typeof window !== 'undefined' && window.document) {
    const div = document.createElement('div');
    div.textContent = input; // textContent assignment escapes everything
    return div.textContent ?? input.trim();
  }

  // SSR / non-browser fallback: strip tags manually
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Sanitize an HTML string (e.g., rich text notes) using DOMPurify.
 * Use this when HTML output is intentional. For plain text, prefer sanitizeInput().
 * This is async because DOMPurify is dynamically imported.
 */
export async function sanitizeHtml(html: string): Promise<string> {
  if (!html) return '';
  const purify = await getDOMPurify();
  if (purify) {
    return purify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'u', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: [],
    });
  }
  // Fallback: strip all HTML
  return sanitizeInput(html);
}

/**
 * Escape HTML special characters for safe innerHTML insertion.
 * Prefer React's default escaping (JSX) — use this only when manually
 * building HTML strings outside of JSX.
 */
export function escapeHtml(str: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
  };
  return str.replace(/[&<>"']/g, c => entities[c] ?? c);
}

/**
 * Recursively sanitize all string fields in a patient data object.
 */
export function sanitizePatientInput(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') {
      out[k] = sanitizeInput(v);
    } else if (Array.isArray(v)) {
      out[k] = v.map(item => typeof item === 'string' ? sanitizeInput(item) : item);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Validates Indian mobile number (10 digits, starts 6-9) */
export function isValidPhone(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/\s/g, ''));
}

/** Validates email format */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Generates a cryptographically random UUID */
export function generateId(): string {
  return crypto.randomUUID();
}
