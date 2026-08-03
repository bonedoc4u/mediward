# MediWard UI Standards

Target: a world-class, calm, clinical interface that a tired nurse on a night
shift can use one-handed on a phone. Every decision below serves that.

## Layout & touch
- Mobile-first. Design at 375px width, then scale up.
- Touch targets ≥ 44×44px. Primary action in the bottom third of the screen (thumb zone).
- One primary action per screen. Secondary actions visually quieter.
- Max content width 720px on desktop; center it.

## Design tokens (never deviate)
- Spacing: only Tailwind scale steps 1, 2, 3, 4, 6, 8, 12, 16 (no arbitrary values like `p-[13px]`).
- Colors: only tokens defined in the Tailwind config / CSS variables.
  Semantic usage: red = destructive/critical vitals only, amber = warnings,
  green = success/normal range. Never use red decoratively.
- Typography: two sizes of hierarchy per screen maximum beyond body text.
  Numbers (vitals, doses) in tabular-nums.
- Border radius and shadows: one consistent scale, from shadcn defaults.

## Components
- Use shadcn/ui primitives; do not hand-roll buttons, dialogs, selects, toasts.
- Forms: react-hook-form + zod. Inline validation errors below the field,
  in plain language ("Enter a pulse between 20 and 250"), never raw zod messages.
- Destructive actions (delete patient, discharge, remove record):
  AlertDialog confirmation stating exactly what will be lost.

## States — every screen must handle all four
1. **Loading:** skeleton loaders matching final layout (no spinners on full pages).
2. **Empty:** friendly message + the action to fill it ("No patients in this ward yet — Add patient").
3. **Error:** human-readable message + retry action. Never show stack traces or "Error: undefined".
4. **Success:** toast confirmation for mutations; optimistic UI where safe (never for clinical values).

## Clinical-specific
- Patient identity (name, bed, hospital ID) always visible while editing that patient's data — prevents wrong-patient entry.
- Abnormal vitals visually flagged automatically (out-of-range styling).
- Ward-round screens: minimal taps — target ≤ 3 taps from patient list to saving a vital.
- Assume flaky hospital Wi-Fi: show clear pending/failed states for saves; never silently drop data.

## Accessibility
- Labels on all inputs (not placeholder-only).
- Contrast ≥ 4.5:1 for text.
- Focus states visible; the app must be navigable by keyboard on desktop.
