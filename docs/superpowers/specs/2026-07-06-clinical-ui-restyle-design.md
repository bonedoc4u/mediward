# Clinical UI Restyle — "Scrub Teal" Design Language

**Date:** 2026-07-06
**Branch:** `redesign/clinical-ui`
**Status:** Approved by user (direction, tokens, and rollout) — pending spec review

## Goal

Restyle MediWard to a calmer, clinical design language. **Visual changes only** — zero
changes to logic, props, state, handlers, or data flow. Must preserve scroll restoration
(`hooks/useScrollRestoration.ts`, window-virtualized ward list) and work in the
Capacitor 7 Android WebView.

Light mode only. Tokens are structured so a dark theme can be added later without
re-touching components (all colors flow through `@theme` custom properties).

## Design language

**Scrub Teal.** Cool near-white surfaces, deep blue-gray ink, one desaturated
surgical-scrub teal accent. The chrome is monochrome (ink + teal only); the **only
saturated colors on any screen are the `vital-*` clinical-state tokens**. This is the
core rule: an abnormal value must be the most colorful thing in view.

The existing `vital-*` (critical/warning/normal/low) and `chart-*` tokens from the
2026-07-02 token cleanup are **unchanged**. Migrating decorative uses of red/amber/
green/blue onto ink/teal completes that cleanup (e.g. VitalsWidget decorative red,
RoundMode red-for-ICU).

Rationale for teal: it is the vernacular of the hospital world (scrubs, drapes), reads
calm at low saturation, and moves the brand off blue — blue was found overloaded three
ways in the 2026-07-02 audit and is now reserved for `vital-low` only.

## Tokens (added to the existing `@theme` block in `index.css`)

| Token | Value | Role |
|---|---|---|
| `--color-surface` | `#F7F9F9` | app background |
| `--color-surface-card` | `#FFFFFF` | cards, sheets, modals |
| `--color-ink` | `#1E2A2E` | primary text (never pure black) |
| `--color-ink-muted` | `#5B6B70` | secondary text (≥4.5:1 on both surfaces) |
| `--color-ink-faint` | `#8C989C` | placeholders/disabled, non-essential text only |
| `--color-accent` | `#337B77` | scrub teal — primary buttons, active tab, links |
| `--color-accent-fg` | `#2A6763` | teal as text (≥4.5:1) |
| `--color-accent-soft` | `#E4EFEE` | selected / hover / active-nav tint |
| `--color-accent-pressed` | `#28615E` | pressed state |
| `--color-line` | `#DCE4E4` | borders, dividers |

Non-color tokens: `--radius-card: 12px`, `--radius-control: 8px`, one soft
`--shadow-card`, `--font-mono: 'DM Mono'`.

All values are literal hex (no oklch — older Android WebView safety). Every token used
for text will be contrast-verified computationally (≥4.5:1) before Phase 1 commits.

## Typography

- **DM Sans** (existing, self-hosted) — all UI text. Hierarchy stays within the
  ui-standards rule: max two heading sizes per screen beyond body.
- **DM Mono** (new; `@fontsource/dm-mono`, latin subset, weights 400/500, self-hosted
  woff2 — same no-CDN/DPDP pattern as DM Sans) — clinical numbers **only**: vitals,
  doses, lab values, bed numbers, IP numbers. This is the signature element: numeric
  data has a visibly different texture, so it can be found at arm's length.
- Estimated bundle cost ~20–30 KB. Accepted.

## Rollout phases (each is its own PR; all touch `src/`, so all wait for user review)

### Phase 1 — tokens + shared primitives
- Extend `@theme` in `index.css` with the tokens above; add DM Mono import.
- Restyle shared primitives in `components/ui/` (Sheet, BottomSheetPicker,
  PatientStatusBadge, EmptyState, QueryError, buttons/dialogs/toasts) to consume tokens.
- No screen-level components touched.

### Phase 2 — ward list
- `components/WardDashboard.tsx`, `components/skeletons/PatientCardSkeleton.tsx`,
  `components/WardSkeleton.tsx`.
- **Class-level restyling only — no DOM restructuring.** The list is window-virtualized
  and `useScrollRestoration` (keyed by view) depends on stable layout.
- **Hard constraint: patient-row height identical before/after**, verified by
  measurement. Skeletons updated to match final layout.
- `__tests__/useScrollRestoration.test.ts` must stay green; manual
  list → patient → back check on desktop + Android.

### Phase 3 — detail surfaces
- `components/PatientDetail.tsx` (as rendered inside `PatientSheet`),
  `components/patient/RadiologyPanel.tsx`, `components/LabTrends.tsx`.
- LabTrends strokes move onto existing `chart-*` tokens.
- May split into smaller PRs if diffs grow large.

## Out of scope

- Dark mode (tokens are structured to allow it later).
- Any logic/behaviour change, DOM restructuring, or component splitting.
- WardDashboard.tsx is 828 lines (over the 250-line rule) — splitting it is explicitly
  deferred; logged in `AUDIT.md` instead.
- Settings/admin screens beyond what shared primitives change automatically.

## Verification (every phase)

1. `pnpm tsc --noEmit`
2. `pnpm lint`
3. `pnpm test` — no **new** failures vs. the known baseline (~36 pre-existing failures)
4. `pnpm build`
5. Phase 2+: Android WebView sanity pass (fonts render, scroll restoration lands
   correctly, touch targets ≥ 44px).

## Risks

- Tests asserting on Tailwind class strings will need updates — test-only edits,
  flagged individually.
- Row-height drift in the virtualized list would break scroll-restoration accuracy —
  mitigated by the fixed-height constraint + measurement.
- DM Mono adds bundle weight — mitigated by latin subset, two weights, woff2 only.
