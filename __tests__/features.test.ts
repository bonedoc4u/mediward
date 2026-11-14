/**
 * The Clinical Assistant is switched off (14 Nov 2026, department's request):
 * no button, no panel, so no ward data goes to Google's AI.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CLINICAL_ASSISTANT_ENABLED } from '../utils/features';

const app = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');

describe('Clinical Assistant switch', () => {
  it('is off', () => {
    expect(CLINICAL_ASSISTANT_ENABLED).toBe(false);
  });

  it('guards every assistant button in the app', () => {
    const buttons = app.match(/<AssistantButton\b[^>]*\/>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    const guarded = app.match(/CLINICAL_ASSISTANT_ENABLED && <AssistantButton\b/g) ?? [];
    expect(guarded.length).toBe(buttons.length);
  });

  it('guards the assistant panel', () => {
    const panels = app.match(/<AiClinicalAssistant\b/g) ?? [];
    expect(panels.length).toBe(1);
    expect(app).toMatch(/\{CLINICAL_ASSISTANT_ENABLED && assistantUsed && \(/);
  });

  it('is not opened from anywhere else', () => {
    const roots = ['components', 'src', 'contexts', 'hooks'].map(d => path.resolve(__dirname, '..', d));
    const users: string[] = [];
    const walk = (d: string) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/AiClinicalAssistant|AssistantButton/.test(e.name)
        && /<(AssistantButton|AiClinicalAssistant)\b/.test(fs.readFileSync(p, 'utf8'))) users.push(p);
    });
    roots.forEach(walk);
    expect(users).toEqual([]);
  });
});
