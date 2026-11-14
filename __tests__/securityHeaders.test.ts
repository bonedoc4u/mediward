/**
 * Site security settings (audit SEC-05).
 * - Source maps (the app's readable source) must not be published.
 * - The security header must let error reports reach Sentry, and must not let
 *   the browser send data straight to Google's AI (that goes through the
 *   clinical-insights server function, which strips names).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')) as {
  headers: { headers: { key: string; value: string }[] }[];
};
const csp = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy')?.value ?? '';
const directive = (name: string) => csp.split(';').map(d => d.trim()).find(d => d.startsWith(`${name} `)) ?? '';

describe('Content-Security-Policy', () => {
  it('exists', () => expect(csp).not.toBe(''));

  it('lets the app reach Supabase and Sentry', () => {
    const connect = directive('connect-src');
    expect(connect).toContain('https://*.supabase.co');
    expect(connect).toContain('wss://*.supabase.co');
    expect(connect).toContain('https://*.sentry.io');
  });

  it('does not let the browser call Google\'s AI directly', () => {
    expect(directive('connect-src')).not.toContain('generativelanguage.googleapis.com');
  });
});

describe('source maps', () => {
  const config = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');

  it('are built only for the Sentry upload, never published by default', () => {
    expect(config).not.toMatch(/sourcemap:\s*true/);
    expect(config).toMatch(/sourcemap:\s*env\.SENTRY_AUTH_TOKEN \? 'hidden' : false/);
  });

  it('are deleted after the upload', () => {
    expect(config).toMatch(/filesToDeleteAfterUpload:\s*\['\.\/dist\/\*\*\/\*\.map'\]/);
  });
});
