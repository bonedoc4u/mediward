/**
 * hashRoute.ts — read the screen and its id out of the URL hash.
 *
 *   "#/patient/TEST-0001" → { view: 'patient', params: { id: 'TEST-0001' } }
 *   "#/round-mode"        → { view: 'round-mode', params: {} }
 *   ""                    → { view: '', params: {} }
 *
 * One function for both moments the app reads the hash: at start-up and on
 * every later change. They used to be two copies, and the start-up copy kept
 * the id inside the view name ("patient/TEST-0001"), which matched no screen —
 * so reloading a patient page, or opening a link to one, showed the ward
 * dashboard while the address bar still named the patient.
 */
export interface HashRoute {
  /** Screen name, or '' when the hash is empty. */
  view: string;
  params: Record<string, string>;
}

export function parseHashRoute(hash: string): HashRoute {
  const [view = '', id] = hash.replace(/^#\/?/, '').split('/');
  return { view, params: id ? { id } : {} };
}
