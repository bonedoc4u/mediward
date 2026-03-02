import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  sanitizeInput,
  sanitizePatientInput,
  isValidEmail,
  isValidPhone,
  generateId,
} from '../utils/sanitize';

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes angle brackets (prevents HTML injection)', () => {
    expect(escapeHtml('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;&#x2F;b&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"value"')).toBe('&quot;value&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('escapes forward slash', () => {
    expect(escapeHtml('a/b')).toBe('a&#x2F;b');
  });

  it('escapes a complete XSS payload', () => {
    const xss = '<script>alert("xss")</script>';
    const result = escapeHtml(xss);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('John Doe')).toBe('John Doe');
  });
});

// ─── sanitizeInput ────────────────────────────────────────────────────────────

describe('sanitizeInput', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeInput('')).toBe('');
  });

  it('returns empty string for falsy input', () => {
    expect(sanitizeInput(null as unknown as string)).toBe('');
    expect(sanitizeInput(undefined as unknown as string)).toBe('');
  });

  it('strips <script> tags', () => {
    const result = sanitizeInput('<script>alert(1)</script>hello');
    expect(result).not.toContain('<script>');
    expect(result).toContain('hello');
  });

  it('strips multiline script tags', () => {
    const payload = '<script\ntype="text/javascript">evil()</script>';
    expect(sanitizeInput(payload)).not.toContain('<script');
  });

  it('removes inline onclick handlers (double-quoted)', () => {
    const result = sanitizeInput('<img onclick="evil()">');
    expect(result).not.toContain('onclick');
  });

  it('removes inline onerror handlers (single-quoted)', () => {
    const result = sanitizeInput("<img onerror='evil()'>");
    expect(result).not.toContain('onerror');
  });

  it('removes javascript: URIs', () => {
    const result = sanitizeInput('<a href="javascript:evil()">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('removes data:text/html URIs', () => {
    const result = sanitizeInput('<iframe src="data:text/html,<script>evil()</script>">');
    expect(result).not.toContain('data:text/html');
  });

  it('trims leading/trailing whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('passes safe clinical text unchanged', () => {
    const safe = 'Fracture of right femur, post-op day 2';
    expect(sanitizeInput(safe)).toBe(safe);
  });
});

// ─── sanitizePatientInput ─────────────────────────────────────────────────────

describe('sanitizePatientInput', () => {
  it('sanitizes string values in objects', () => {
    const result = sanitizePatientInput({ name: '<script>alert(1)</script>John' });
    expect(result.name).not.toContain('<script>');
    expect(result.name).toContain('John');
  });

  it('sanitizes XSS payloads inside string arrays', () => {
    // sanitizeInput strips script tags and on* handlers, not generic HTML like <b>
    const result = sanitizePatientInput({
      tags: ['<script>alert(1)</script>safe', '<img onerror="evil()">safe2'],
    });
    expect(result.tags[0]).not.toContain('<script>');
    expect(result.tags[0]).toContain('safe');
    expect(result.tags[1]).not.toContain('onerror');
    expect(result.tags[1]).toContain('safe2');
  });

  it('passes through non-string values unchanged', () => {
    const result = sanitizePatientInput({ age: 45, active: true });
    expect(result.age).toBe(45);
    expect(result.active).toBe(true);
  });

  it('passes through non-string array items unchanged', () => {
    const result = sanitizePatientInput({ scores: [1, 2, 3] });
    expect(result.scores).toEqual([1, 2, 3]);
  });

  it('handles an empty object', () => {
    expect(sanitizePatientInput({})).toEqual({});
  });
});

// ─── isValidEmail ─────────────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('accepts standard email', () => {
    expect(isValidEmail('doctor@hospital.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(isValidEmail('resident@ortho.hospital.in')).toBe(true);
  });

  it('accepts email with plus addressing', () => {
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(isValidEmail('notanemail.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects spaces in email', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

// ─── isValidPhone ─────────────────────────────────────────────────────────────

describe('isValidPhone', () => {
  it('accepts valid 10-digit Indian mobile starting with 9', () => {
    expect(isValidPhone('9876543210')).toBe(true);
  });

  it('accepts valid number starting with 6', () => {
    expect(isValidPhone('6012345678')).toBe(true);
  });

  it('accepts valid number starting with 8', () => {
    expect(isValidPhone('8123456789')).toBe(true);
  });

  it('accepts number with spaces (stripped internally)', () => {
    expect(isValidPhone('98765 43210')).toBe(true);
  });

  it('rejects number starting with 5', () => {
    expect(isValidPhone('5123456789')).toBe(false);
  });

  it('rejects short number', () => {
    expect(isValidPhone('98765')).toBe(false);
  });

  it('rejects number with letters', () => {
    expect(isValidPhone('9876ABCDEF')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidPhone('')).toBe(false);
  });
});

// ─── generateId ──────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique values on each call', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateId()));
    expect(ids.size).toBe(20);
  });
});
