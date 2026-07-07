// ESLint 9 flat config. First lint baseline for this codebase (2026-07-04):
// correctness rules on, stylistic churn off — tighten incrementally.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dev-dist/**',
      'node_modules/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'public/**',
      '.claude/**',   // local agent skills, not app code
      'scripts/**',   // Node build helpers (CommonJS)
      'supabase/functions/**', // Deno edge functions — different runtime/globals
      '*.config.js',
      '*.config.ts',
      'playwright.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Correctness rules stay on (defaults). The overrides below silence
      // pre-existing patterns that are pervasive and low-risk, so the gate
      // can be green from day one without a 100-file cleanup commit.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Empty catch blocks are used deliberately for offline-tolerant paths.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `cond && fn()` / ternary side-effect statements are idiomatic here.
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
      // The TS compiler already errors on unknown identifiers; eslint's
      // no-undef false-positives on TS types and DOM lib globals.
      'no-undef': 'off',
      // 34 pre-existing violations. Fixing hook deps blindly can introduce
      // infinite re-render loops, so this is deferred to its own pass.
      // TODO: re-enable as 'warn' and burn the list down file by file.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    // Node build/utility scripts: CommonJS require() is the norm.
    files: ['scripts/**'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Supabase Edge Functions run on Deno with URL imports — the TS
    // compiler here can't resolve them, hence the @ts-nocheck headers.
    files: ['supabase/functions/**'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-control-regex': 'off',
    },
  },
  {
    // Tests mock aggressively; loosen rules that fight vitest patterns.
    files: ['__tests__/**', 'e2e/**', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
