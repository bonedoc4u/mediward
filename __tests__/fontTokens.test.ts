/**
 * The app's fonts are self-hosted with @fontsource. The CSS must ask for the
 * family names those packages actually register, or every screen silently
 * falls back to the system font (which happened: "DM Sans" vs the registered
 * "DM Sans Variable", plus an unlayered `* { font-family }` rule in App.tsx
 * that also overrode Tailwind's font-mono).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const registeredFamily = (css: string) => css.match(/font-family:\s*'([^']+)'/)?.[1];

describe('font tokens match the self-hosted faces', () => {
  const appCss = read('index.css');

  it('--font-sans starts with the family @fontsource-variable/dm-sans registers', () => {
    const family = registeredFamily(read('node_modules/@fontsource-variable/dm-sans/index.css'));
    expect(family).toBeTruthy();
    expect(appCss).toMatch(new RegExp(`--font-sans:\\s*'${family}'`));
  });

  // Clinical numbers use DM Sans: DM Mono's zero has a line through it,
  // which the user did not want. font-mono must point at the sans face.
  it('--font-mono (clinical numbers) uses the sans face, not DM Mono', () => {
    expect(appCss).toMatch(/--font-mono:\s*var\(--font-sans\)/);
    expect(appCss).not.toMatch(/dm-mono|'DM Mono'/i);
  });

  it('App.tsx sets no global font-family that would override font-mono', () => {
    expect(read('App.tsx')).not.toMatch(/\*\s*\{\s*font-family/);
  });
});
