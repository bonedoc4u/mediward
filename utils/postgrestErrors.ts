/** Human-readable messages for PostgREST error codes encountered in MediWard. */
export const POSTGREST_MESSAGES: Record<string, string> = {
  PGRST116: 'Patient not found — they may have been discharged or transferred.',
  PGRST200: 'Database relationship error — contact support if this persists.',
  PGRST301: 'JWT expired — please sign in again.',
  '42501':   'You don\'t have access to perform this action.',
  '42P01':   'Database table missing — the app may need an update.',
  '23503':   'This record is linked to others and cannot be deleted.',
  '23505':   'A duplicate record already exists.',
  '08006':   'Database connection lost — check your network.',
  '57014':   'Query timed out — the database is under load. Try again.',
  'ABDM_TIMEOUT': 'ABDM server did not respond. ABHA features are temporarily unavailable.',
};

export function getReadableError(code: string | undefined, fallback?: string): string {
  if (!code) return fallback ?? 'An unexpected error occurred.';
  return POSTGREST_MESSAGES[code] ?? fallback ?? `Database error (${code}).`;
}
