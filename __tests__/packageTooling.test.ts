/**
 * pnpm only (CLAUDE.md; audit CODE-03). Mixing npm and pnpm has broken
 * Vercel and GitHub Actions builds before.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

describe('package tooling', () => {
  it('Vercel builds with pnpm', () => {
    const vercel = JSON.parse(read('vercel.json')) as { buildCommand?: string; installCommand?: string };
    expect(vercel.buildCommand).toBe('pnpm build');
    if (vercel.installCommand) expect(vercel.installCommand).toMatch(/^pnpm /);
  });

  it('only the pnpm lock file exists', () => {
    expect(fs.existsSync(path.join(root, 'pnpm-lock.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'package-lock.json'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'yarn.lock'))).toBe(false);
  });

  it('no workflow uses npm to install or build', () => {
    const dir = path.join(root, '.github/workflows');
    for (const f of fs.readdirSync(dir).filter(n => /\.ya?ml$/.test(n))) {
      expect(read(`.github/workflows/${f}`), f).not.toMatch(/\bnpm (ci|install|run)\b|cache:\s*['"]?npm/);
    }
  });
});
