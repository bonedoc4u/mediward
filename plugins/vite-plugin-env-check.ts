/**
 * plugins/vite-plugin-env-check.ts
 * Vite plugin that validates required environment variables at BUILD TIME.
 * CI build fails immediately with a clear error instead of deploying a broken app.
 *
 * Usage in vite.config.ts:
 *   import { envCheckPlugin } from './plugins/vite-plugin-env-check';
 *   plugins: [react(), envCheckPlugin()],
 */

import type { Plugin } from 'vite';

interface RequiredVar {
  name:    string;
  /** Validation predicate. Return false or throw to fail the build. */
  validate?: (value: string) => boolean;
  hint?:   string;
}

const REQUIRED_VARS: RequiredVar[] = [
  {
    name:     'VITE_SUPABASE_URL',
    validate: v => v.startsWith('https://') && v.includes('supabase.co'),
    hint:     'Must be https://<project>.supabase.co',
  },
  {
    name:     'VITE_SUPABASE_ANON_KEY',
    validate: v => v.length > 100 && v.startsWith('eyJ'),
    hint:     'Must be a JWT token (starts with eyJ)',
  },
  // VITE_ABDM_BASE_URL is optional — env.ts provides a default fallback value.
];

export function envCheckPlugin(): Plugin {
  return {
    name: 'vite-plugin-env-check',

    // configResolved runs after Vite has merged all config sources (including .env).
    // This is the right hook for build-time validation — env vars are fully resolved.
    configResolved(config) {
      // Only validate during build (not dev server, not test)
      if (config.command !== 'build') return;

      const errors: string[] = [];

      for (const { name, validate, hint } of REQUIRED_VARS) {
        const value = config.env[name];

        if (!value || value.trim() === '') {
          errors.push(`  • ${name}: missing${hint ? ` (${hint})` : ''}`);
          continue;
        }

        if (validate && !validate(value)) {
          errors.push(`  • ${name}: invalid value${hint ? ` — ${hint}` : ''}`);
        }
      }

      if (errors.length > 0) {
        // throw causes Vite build to exit with non-zero status → CI fails
        throw new Error(
          `\n\n❌ Build aborted — invalid environment variables:\n\n${errors.join('\n')}\n\n` +
          `Set these in Vercel's Environment Variables (Settings → Environment Variables).\n` +
          `For local builds, create .env.local with the required values.\n\n`,
        );
      }

      config.logger.info(
        `\n✅ All required environment variables validated (${REQUIRED_VARS.length} vars)\n`,
      );
    },
  };
}
