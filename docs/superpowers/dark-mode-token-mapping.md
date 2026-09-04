# Dark-mode token mapping

Applies when converting a hardcoded Tailwind color class to the semantic
token system established in Task 1 of the dark-mode plan. Classify each
instance by what the color actually *means* in context before mapping —
do not pattern-match on the raw color name alone.

## Structural / chrome (no clinical meaning)

| Hardcoded class | Token replacement | When |
|---|---|---|
| `bg-white`, `bg-slate-50` | `bg-surface-card` | Card, sheet, modal, panel background |
| `bg-slate-50`, `bg-slate-100` | `bg-surface-sunken` | Chip, well, input background, skeleton |
| (page-level background) | `bg-surface` | Outermost page/screen background only |
| `text-slate-800`, `text-slate-900`, `text-slate-700`, `text-slate-600` | `text-ink` | Primary body text, headings |
| `text-slate-500`, `text-slate-400` | `text-ink-muted` | Secondary/supporting text, captions |
| `text-slate-400` (specifically disabled/placeholder inputs) | `text-ink-faint` | Disabled or placeholder text ONLY — never body text |
| `border-slate-200`, `border-slate-300`, `border-slate-100` | `border-line` | Any structural border or divider |
| `bg-teal-600`, `bg-teal-700` | `bg-accent` / `bg-accent-pressed` (pressed/hover state) | Primary brand-colored buttons/fills |
| `text-teal-600`, `text-teal-700` | `text-accent-fg` | Teal used as text/link color |
| `border-teal-600`, `border-teal-200`, `border-teal-400` | `border-accent` / `border-line` | Teal-colored border → `border-accent`; if it's really just a neutral divider that happened to use teal, `border-line` |
| `bg-teal-50` | `bg-accent-soft` | Selection/hover tint |
| `bg-slate-900`, `bg-slate-800`, `bg-slate-700` (as a *dark decorative chrome block*, e.g. a footer bar, a dark stat card) | Judgment call — if it's meant to look the same as the rest of the app's dark surfaces once dark mode exists, use `bg-surface`/`bg-surface-card`; if it's a deliberately-always-dark accent block independent of theme (rare — confirm before assuming), leave it hardcoded and note why in the commit message |

## Clinical-meaning-bearing (map to `vital-*` family — per project's own design philosophy, color here is load-bearing, not decorative)

| Hardcoded class | Token replacement | When |
|---|---|---|
| `bg-red-50` + `text-red-600`/`text-red-800` + `border-red-100`/`border-red-200` | `bg-vital-critical-surface` + `text-vital-critical-fg` + `border-vital-critical-border` | Critical value, destructive action, error state — this project reserves red for this meaning exclusively (see `docs/UI-UX-CURRENT-STATE.md` section 2.1), so red almost never has a purely decorative use; if you find one, that's itself worth flagging in the task report, not silently preserving |
| `text-red-500`, `text-red-600` (icon/graphic only, no fill) | `text-vital-critical` | Critical icon/stroke without a surrounding surface tint |
| `bg-amber-50` + `text-amber-700`/`text-amber-500` + `border-amber-200`/`border-amber-300` | `bg-vital-warning-surface` + `text-vital-warning-fg` + `border-vital-warning-border` | Warning/borderline value or state |
| `bg-green-50`/`bg-green-600` + `text-green-700`/`text-green-600`/`text-green-500`/`text-green-300` + `border-green-200` | `bg-vital-normal-surface` (or `bg-vital-normal` for a solid fill) + `text-vital-normal-fg` + `border-vital-normal-border` | Normal/within-range/success meaning |
| `bg-blue-50` + `text-blue-700`/`text-blue-800` + `border-blue-100`/`border-blue-400` | `bg-vital-low-surface` + `text-vital-low-fg` + `border-vital-low-border` | Abnormal-low lab value, or a genuinely informational (non-clinical) callout — re-read `docs/UI-UX-CURRENT-STATE.md` section 2.1: blue is reserved for "abnormal-low (labs, hypo-)"; if a blue instance is really just a neutral "info" banner unrelated to any lab/clinical value, prefer `border-accent`/`bg-accent-soft` instead so blue stays reserved for its clinical meaning |
| `bg-purple-600` (as seen in `LoginPage.tsx`) | Read the specific usage before mapping — this project's chrome is deliberately ink+teal only per `docs/UI-UX-CURRENT-STATE.md`; a stray purple button is likely leftover from before the Scrub Teal restyle and should probably become `bg-accent`, not a new token — flag it in the task report either way |

## Chart series (non-semantic, categorical — leave classes as-is)

Recharts stroke/fill colors already use `var(--color-chart-*)` custom properties directly (not Tailwind utility classes) per the existing `index.css` convention — Task 1 already added dark-mode values for these. No per-screen conversion needed for chart series colors specifically; if a screen-conversion task finds a chart using a raw hex or Tailwind class instead of the `chart-*` custom properties, that's worth fixing at the same time using the existing pattern from Lab Trends (already token-clean).

## Never convert

`components/radiology/modality.ts`'s per-modality `bg-slate-900`/`bg-indigo-950`/etc. — deliberate always-dark image-viewer backgrounds, independent of app theme. Leave untouched.
