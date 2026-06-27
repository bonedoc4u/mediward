/**
 * env.ts — Environment variable validation (Task 5)
 *
 * All VITE_ env vars are validated at startup using Zod.
 * Import `env` from here instead of using import.meta.env directly.
 * This gives you:
 *   1. A descriptive error at startup (not a cryptic undefined.foo crash)
 *   2. Full TypeScript types on every env var
 *   3. Build-time failure via the vite-plugin-env-check (plugins/vite-plugin-env-check.ts)
 *
 * Usage:
 *   import { env } from './env';
 *   const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
 */

import { z } from 'zod';

// ─── Schema ──────────────────────────────────────────────────────────────────

const EnvSchema = z.object({
  // Core Supabase connection (required in every environment)
  VITE_SUPABASE_URL: z
    .string()
    .url('VITE_SUPABASE_URL must be a valid URL (e.g. https://xxxx.supabase.co)')
    .refine(u => u.includes('supabase.co') || u.includes('localhost'),
      'VITE_SUPABASE_URL must point to a Supabase project or local instance'),

  VITE_SUPABASE_ANON_KEY: z
    .string()
    .min(100, 'VITE_SUPABASE_ANON_KEY looks too short — check your .env file')
    .refine(k => k.startsWith('eyJ'),
      'VITE_SUPABASE_ANON_KEY must be a JWT (starts with eyJ)'),

  // ABDM / NDHM integration
  VITE_ABDM_BASE_URL: z
    .string()
    .url('VITE_ABDM_BASE_URL must be a valid URL')
    .default('https://healthid.ndhm.gov.in'),

  // Runtime environment tag — used for analytics, Sentry, feature flags
  VITE_ENVIRONMENT: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

// ─── Validate ────────────────────────────────────────────────────────────────

function validateEnv(): Env {
  const result = EnvSchema.safeParse({
    VITE_SUPABASE_URL:     import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_ABDM_BASE_URL:    import.meta.env.VITE_ABDM_BASE_URL,
    VITE_ENVIRONMENT:      import.meta.env.VITE_ENVIRONMENT,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map(i => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');

    // Throw immediately — a misconfigured app must not start
    throw new Error(
      `\n\n❌ MediWard startup failed — missing or invalid environment variables:\n\n${errors}\n\n` +
      `Check your .env.local file. Required vars:\n` +
      `  VITE_SUPABASE_URL=https://xxxx.supabase.co\n` +
      `  VITE_SUPABASE_ANON_KEY=eyJ...\n\n`,
    );
  }

  return result.data;
}

// Singleton — validated once at module load time.
// In test environments, this will throw if the test doesn't provide vars.
// Use VITE_SUPABASE_URL=https://placeholder.supabase.co in vitest.config.ts.
export const env: Env = validateEnv();

// ─── Convenience re-exports ──────────────────────────────────────────────────
export const isProduction  = env.VITE_ENVIRONMENT === 'production';
export const isStaging     = env.VITE_ENVIRONMENT === 'staging';
export const isDevelopment = env.VITE_ENVIRONMENT === 'development';
