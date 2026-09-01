/**
 * Which unit a query should be scoped to.
 *
 * Non-admin users are already scoped by their own assigned unit. For admins,
 * `user.unit` is always undefined ("sees all patients" is only the *default*
 * state, per types.ts's own comment on AuthUser.unit) — once an admin picks
 * a specific unit via UnitPicker, THAT selection must be used instead, or
 * every admin-facing patient list silently ignores the picker and shows
 * every unit's patients regardless of what's selected.
 *
 * Single source of truth so this decision is made in exactly one place —
 * contexts/PatientContext.tsx previously re-derived it correctly for the
 * paginated fetch but re-used the wrong value (user.unit) for
 * loadAllPatients(), which is exactly the kind of mistake a second call site
 * duplicating this ternary makes easy to reintroduce.
 */
export function resolveEffectiveUnit(
  role: string | undefined,
  selectedUnit: string | null | undefined,
  userUnit: string | undefined,
): string | undefined {
  return role === 'admin' && selectedUnit && selectedUnit !== 'all'
    ? selectedUnit
    : userUnit ?? undefined;
}
