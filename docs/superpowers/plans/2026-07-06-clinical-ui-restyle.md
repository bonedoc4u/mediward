# Scrub Teal Clinical UI Restyle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle MediWard onto the approved Scrub Teal token system (spec: `docs/superpowers/specs/2026-07-06-clinical-ui-restyle-design.md`) — visual classes only, zero logic changes.

**Architecture:** Add semantic tokens to the Tailwind 4 `@theme` block in `index.css`, then migrate components file-by-file using the deterministic Mapping Table below. Three phases = three PRs, each gated on user review (CLAUDE.md merge policy: no self-merge, ever, for `src/`).

**Tech Stack:** React 19 + TS strict, Tailwind CSS 4 (`@theme` CSS-first, no JS config), @fontsource self-hosted fonts, Vitest, pnpm only.

## Global Constraints

- **Visual only.** Never change props, state, handlers, hooks, DOM structure, or element order. Class attributes and style-only constants only.
- **Existing `vital-*` and `chart-*` tokens are unchanged** (values in `index.css:9-40`).
- Literal hex only in tokens — no oklch (older Android WebView).
- All text tokens ≥ 4.5:1 contrast on the surface they sit on (verified in Task 1).
- Spacing classes: untouched unless the Mapping Table says otherwise (it never does — colors/radius/shadow only).
- **Virtualized-list geometry freeze (Phase 2):** in WardDashboard patient rows, never add/remove/change classes affecting box size: `p-*`, `m-*`, `gap-*`, `h-*`, `min-h-*`, `text-{size}`, `leading-*`, `space-*`. Color, border-color, radius, shadow only. When adding `font-mono` to a row element, add an explicit `leading-*` class matching the element's current text size default (`text-xs`→`leading-4`, `text-sm`→`leading-5`, `text-base`→`leading-6`).
- **Working tree warning:** `components/patient/RadiologyPanel.tsx` has pre-existing uncommitted changes + an untracked test from another branch. NEVER `git add -A` / `git commit -am`. Stage files by exact path only. Before Task 8 (RadiologyPanel), STOP and ask the user how to handle those changes.
- Verification gate for every task: `pnpm tsc --noEmit` (0 errors), `pnpm lint` (exit 0; if eslint binary missing run `pnpm install` once), `pnpm test` (no NEW failures vs. baseline captured in Task 0).
- Commits: one per task, message format `style(<area>): <what>`.
- Package manager: pnpm ONLY.

## Mapping Table (apply top-to-bottom; classes not listed stay as-is)

**Neutrals (chrome):**

| Old | New |
|---|---|
| `text-slate-900`, `text-slate-800`, `text-slate-700` | `text-ink` |
| `text-slate-600`, `text-slate-500` | `text-ink-muted` |
| `text-slate-400`, `text-slate-300` | `text-ink-faint` |
| `bg-slate-50` | `bg-surface` |
| `bg-slate-100`, `bg-slate-200` (chips, wells, secondary buttons, skeleton blocks) | `bg-surface-sunken` |
| `bg-white` (cards/sheets/modals, only in files already being edited) | `bg-surface-card` |
| `border-slate-100`, `border-slate-200`, `border-slate-300` | `border-line` |
| `bg-slate-900`, `bg-slate-800` (dark action buttons) | `bg-accent` + hover `hover:bg-accent-pressed` |
| `divide-slate-*` | `divide-line` |

**Teal (accent):**

| Old | New |
|---|---|
| `bg-teal-600` | `bg-accent` |
| `bg-teal-700`, `hover:bg-teal-700` | `bg-accent-pressed` / `hover:bg-accent-pressed` |
| `text-teal-600`, `text-teal-700`, `text-teal-800` | `text-accent-fg` |
| `bg-teal-50`, `bg-teal-100` | `bg-accent-soft` |
| `border-teal-200..500` | `border-accent` |
| `ring-teal-400/500` | `ring-accent` |
| teal gradients (`from-teal-700 to-teal-800`) | flat `bg-accent` |

**Clinical states (semantic — route to EXISTING vital tokens):**

| Old | New |
|---|---|
| `text-red-500..800` (error/critical text) | `text-vital-critical-fg` |
| `bg-red-50/100` | `bg-vital-critical-surface` |
| `bg-red-500/600/700` (destructive buttons) | `bg-vital-critical` (+ `hover:opacity-90` if a hover shade existed) |
| `border-red-*` | `border-vital-critical-border` |
| amber equivalents | `vital-warning` set, same pattern |
| green/emerald equivalents | `vital-normal` set, same pattern |
| blue/sky equivalents (info, abnormal-low) | `vital-low` set, same pattern |

**Decorative colors (violet/purple/orange/indigo/pink used as chrome):** collapse to neutral/accent per the monochrome-chrome rule — specific cases are spelled out in each task; if an unlisted one is found, use `bg-surface-sunken text-ink-muted border-line` and note it in the commit body.

---

### Task 0: Baseline capture

**Files:** none modified.

- [ ] **Step 1:** `pnpm install` (restores eslint binary if missing). Expected: exits 0.
- [ ] **Step 2:** `pnpm tsc --noEmit` — expected 0 errors. `pnpm lint` — expected exit 0.
- [ ] **Step 3:** `pnpm test 2>&1 | tail -20` — record the exact failed-test count (~36 known pre-existing). Write the number into the PR description later; every subsequent task compares against it.
- [ ] **Step 4:** `git status -s` — confirm only the known dirty files (RadiologyPanel.tsx, untracked test/docs). No commit.

### Task 1: Tokens + DM Mono (Phase 1 start)

**Files:**
- Modify: `index.css` (extend `@theme`, add font import)
- Create: `scripts/check-contrast.mjs` (one-off verification, committed for reuse)

**Interfaces — Produces (all later tasks consume):** Tailwind utilities `bg-surface`, `bg-surface-card`, `bg-surface-sunken`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `bg-accent`, `text-accent-fg`, `bg-accent-soft`, `bg-accent-pressed`, `border-line`, `ring-accent`, `rounded-card`, `rounded-control`, `shadow-card`, `font-mono` (now DM Mono).

- [ ] **Step 1:** `pnpm add @fontsource/dm-mono` (regular 400 + 500 imported below).
- [ ] **Step 2:** In `index.css`, add after the existing dm-sans import (line 3):

```css
/* Self-hosted DM Mono — clinical numbers only (vitals, doses, beds, IP nos) */
@import "@fontsource/dm-mono/400.css";
@import "@fontsource/dm-mono/500.css";
```

- [ ] **Step 3:** Append inside the existing `@theme` block (after `--color-chart-temp`):

```css
  /* ── Scrub Teal chrome tokens (2026-07-06 restyle) ──────────────
   * Chrome is monochrome ink+teal; ONLY vital-* above may be saturated. */
  --color-surface:         #f7f9f9; /* app background            */
  --color-surface-card:    #ffffff; /* cards, sheets, modals     */
  --color-surface-sunken:  #eef2f2; /* chips, wells, skeletons   */
  --color-ink:             #1e2a2e; /* primary text  ~14.9:1     */
  --color-ink-muted:       #5b6b70; /* secondary     ~5.4:1      */
  --color-ink-faint:       #8c989c; /* disabled/placeholder ONLY */
  --color-accent:          #337b77; /* scrub teal, fills ≥3:1    */
  --color-accent-fg:       #2a6763; /* teal as text  ≥4.5:1      */
  --color-accent-soft:     #e4efee; /* selection tint            */
  --color-accent-pressed:  #28615e; /* pressed/hover fill        */
  --color-line:            #dce4e4; /* all borders & dividers    */

  --font-mono: 'DM Mono', ui-monospace, 'Cascadia Mono', monospace;
  --radius-card: 12px;
  --radius-control: 8px;
  --shadow-card: 0 1px 2px 0 rgb(30 42 46 / 0.06), 0 1px 3px 0 rgb(30 42 46 / 0.04);
```

- [ ] **Step 4:** Create `scripts/check-contrast.mjs`:

```js
// WCAG contrast check for Scrub Teal text tokens. Run: node scripts/check-contrast.mjs
const L = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) =>
    parseInt(hex.slice(i, i + 2), 16) / 255,
  ).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const surfaces = { surface: '#f7f9f9', card: '#ffffff', sunken: '#eef2f2', soft: '#e4efee' };
const text = { ink: '#1e2a2e', 'ink-muted': '#5b6b70', 'accent-fg': '#2a6763' };
let fail = 0;
for (const [tn, tv] of Object.entries(text))
  for (const [sn, sv] of Object.entries(surfaces)) {
    const r = ratio(tv, sv);
    const ok = r >= 4.5;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${tn} on ${sn}: ${r.toFixed(2)}:1`);
  }
console.log(`white on accent: ${ratio('#ffffff', '#337b77').toFixed(2)}:1 (button text, need ≥4.5)`);
if (ratio('#ffffff', '#337b77') < 4.5) fail++;
process.exit(fail ? 1 : 0);
```

- [ ] **Step 5:** Run `node scripts/check-contrast.mjs`. Expected: all PASS, exit 0. **If `white on accent` fails, darken `--color-accent` to `#2f7370` and re-run — update index.css to whatever passes.** (`ink-faint` is exempt: decorative/disabled only.)
- [ ] **Step 6:** `pnpm tsc --noEmit && pnpm lint && pnpm test` — no new failures. `pnpm build` — succeeds; grep the built CSS to confirm tokens emitted: `grep -c "color-surface" dist/assets/*.css` ≥ 1.
- [ ] **Step 7:** Commit **exact paths**: `git add index.css scripts/check-contrast.mjs package.json pnpm-lock.yaml && git commit -m "style(tokens): Scrub Teal chrome tokens + self-hosted DM Mono"`

### Task 2: Skeleton, EmptyState, QueryError

**Files:** Modify `components/ui/Skeleton.tsx`, `components/ui/EmptyState.tsx`, `components/ui/QueryError.tsx`.
**Interfaces:** props/exports unchanged (visual only).

- [ ] **Step 1:** `Skeleton.tsx` — both components: `bg-slate-200` → `bg-surface-sunken` (2 occurrences).
- [ ] **Step 2:** `EmptyState.tsx` — apply Mapping Table: icon well `bg-slate-100`→`bg-surface-sunken`, `text-slate-400`→`text-ink-faint`; title `text-slate-800`→`text-ink`; body `text-slate-500`→`text-ink-muted`; primary button `bg-teal-600 hover:bg-teal-700`→`bg-accent hover:bg-accent-pressed`, `rounded-lg`→`rounded-control`; secondary button `bg-slate-100 text-slate-700 hover:bg-slate-200`→`bg-surface-sunken text-ink hover:bg-accent-soft`, `rounded-lg`→`rounded-control`.
- [ ] **Step 3:** `QueryError.tsx` — inline variant: `text-red-600`→`text-vital-critical-fg`, retry `text-red-700 hover:text-red-900`→`text-vital-critical-fg hover:opacity-80`; card variant: `bg-red-50`→`bg-vital-critical-surface`, `text-red-500`→`text-vital-critical`, title `text-slate-800`→`text-ink`, body `text-slate-500`→`text-ink-muted`, retry button `bg-slate-900 hover:bg-slate-700`→`bg-accent hover:bg-accent-pressed`, `rounded-lg`→`rounded-control`.
- [ ] **Step 4:** Verification gate (tsc/lint/test vs baseline).
- [ ] **Step 5:** `git add components/ui/Skeleton.tsx components/ui/EmptyState.tsx components/ui/QueryError.tsx && git commit -m "style(ui): migrate Skeleton/EmptyState/QueryError to Scrub Teal tokens"`

### Task 3: PatientStatusBadge

**Files:** Modify `components/ui/PatientStatusBadge.tsx`.
**Interfaces:** `PatientStatusBadge({status, size})` unchanged; only `CONFIG[...].classes` strings change.

- [ ] **Step 1:** Replace the six `classes` values (icons/labels already carry meaning per the file's WCAG comment; color collapses to clinical semantics + neutral):

```ts
  [PatientStatus.Fit]: { /* … */ classes: 'bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border' },
  [PatientStatus.Review]: { /* … */ classes: 'bg-vital-warning-surface text-vital-warning-fg border-vital-warning-border' },
  [PatientStatus.Critical]: { /* … */ classes: 'bg-vital-critical-surface text-vital-critical-fg border-vital-critical-border' },
  [PatientStatus.WentHome]: { /* … */ classes: 'bg-accent-soft text-accent-fg border-accent' },
  [PatientStatus.DischargeReady]: { /* … */ classes: 'bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border' },
  [PatientStatus.Discharged]: { /* … */ classes: 'bg-surface-sunken text-ink-muted border-line' },
```

(`/* … */` = keep the existing `label` and `Icon` lines exactly as they are.)
**Behavior note for PR:** Fit and DischargeReady become visually identical (both "normal/green"); Review moves purple→amber. Icons + labels still distinguish them. Flag this to the user in the PR description as the one deliberate visual-meaning change.
- [ ] **Step 2:** Verification gate.
- [ ] **Step 3:** `git add components/ui/PatientStatusBadge.tsx && git commit -m "style(ui): PatientStatusBadge onto vital-* semantic tokens"`

### Task 4: ConfirmDialog + ToastContainer

**Files:** Modify `components/ConfirmDialog.tsx`, `components/ToastContainer.tsx`.
**Interfaces:** props unchanged.

- [ ] **Step 1:** `ConfirmDialog.tsx` — apply Mapping Table. Specifics: danger variant `bg-red-600 hover:bg-red-700`→`bg-vital-critical hover:opacity-90`, icon well `bg-red-100 text-red-600`→`bg-vital-critical-surface text-vital-critical-fg`; warning variant ambers→`vital-warning` set same pattern; neutral text/borders per Neutrals table; `rounded-*` on the panel→`rounded-card`, on buttons→`rounded-control`.
- [ ] **Step 2:** `ToastContainer.tsx` — per-type mapping: success `bg-green-50/border-green-200/text-green-900/text-green-500`→`bg-vital-normal-surface border-vital-normal-border text-vital-normal-fg` (icon `text-vital-normal`); error→`vital-critical` set; warning→`vital-warning` set; info blues→`vital-low` set; close icon `text-slate-400/600`→`text-ink-faint`/`text-ink-muted`.
- [ ] **Step 3:** Verification gate.
- [ ] **Step 4:** `git add components/ConfirmDialog.tsx components/ToastContainer.tsx && git commit -m "style(ui): ConfirmDialog + toasts onto semantic feedback tokens"`

### Task 5: BottomSheetPicker + Sheet + KeyboardAwareView — Phase 1 gate

**Files:** Modify `components/ui/BottomSheetPicker.tsx`, `components/ui/Sheet.tsx`, `components/ui/KeyboardAwareView.tsx` (the latter two only if they contain color classes — Sheet showed none in the survey; check `bg-white`/`bg-black` overlays: overlay scrims stay `bg-black/NN`).

- [ ] **Step 1:** `BottomSheetPicker.tsx` — Mapping Table: `bg-teal-50/100`→`bg-accent-soft`, `text-teal-600/700`→`text-accent-fg`, slate text→ink scale, `border-slate-100/300`→`border-line`, `bg-slate-50`→`bg-surface`, `bg-slate-200` (drag handle)→`bg-surface-sunken`, sheet panel `bg-white`→`bg-surface-card`.
- [ ] **Step 2:** `Sheet.tsx` — panel `bg-white`→`bg-surface-card` if present; nothing else.
- [ ] **Step 3:** Verification gate + `pnpm build`.
- [ ] **Step 4:** `git add components/ui/BottomSheetPicker.tsx components/ui/Sheet.tsx` (+ KeyboardAwareView if touched) `&& git commit -m "style(ui): pickers and sheet surfaces onto tokens"`
- [ ] **Step 5 — PHASE 1 GATE:** Push branch, open PR titled `style: Scrub Teal tokens + shared primitives (restyle 1/3)`. Body: link spec, baseline test count, PatientStatusBadge behavior note, screenshots if available. **STOP. Wait for user review. Do not start Task 6.**

### Task 6: Ward list (Phase 2 — after Phase 1 approved)

**Files:** Modify `components/WardDashboard.tsx`, `components/WardSkeleton.tsx`, `components/skeletons/PatientCardSkeleton.tsx`.

- [ ] **Step 1:** Re-read the **geometry freeze** in Global Constraints. Then apply the Mapping Table to `WardDashboard.tsx`. File-specific rulings: ward-header gradient `from-teal-700 to-teal-800`→flat `bg-accent`; ICU/section chrome using red decoratively (`bg-red-*`/`border-red-*` on ward headers, not on patient-state)→`bg-accent-soft border-line text-ink` (this finishes the RoundMode-style "red-for-ICU" cleanup in the list); violet/orange/indigo chips (OT/POD/misc markers)→`bg-surface-sunken text-ink-muted border-line`; true clinical-state colors (critical patient highlight, pending-PAC amber, etc.)→matching `vital-*` set; `bg-indigo-600` action→`bg-accent`.
- [ ] **Step 2:** Bed number + IP number elements: add `font-mono` + explicit `leading-*` per the freeze rule.
- [ ] **Step 3:** Skeletons: `bg-slate-200`→`bg-surface-sunken`, `bg-slate-100`→`bg-surface-sunken`, borders→`border-line`. PatientCardSkeleton block dimensions must continue to mirror the real card (visual diff by eye at 375px).
- [ ] **Step 4:** `pnpm test -- useScrollRestoration` — PASS. Full verification gate. `pnpm build`.
- [ ] **Step 5:** Manual check (dev server, 375px viewport): list → open patient → back restores scroll position; row height unchanged (measure one row in devtools before/after — must be equal to the pixel).
- [ ] **Step 6:** `git add components/WardDashboard.tsx components/WardSkeleton.tsx components/skeletons/PatientCardSkeleton.tsx && git commit -m "style(ward): ward list onto Scrub Teal tokens, geometry frozen"`
- [ ] **Step 7 — PHASE 2 GATE:** Push, open PR `style: ward list restyle (2/3)` noting the row-height verification result. **STOP for review.**

### Task 7: PatientDetail (Phase 3 — after Phase 2 approved)

**Files:** Modify `components/PatientDetail.tsx` (+ `components/patient/DemographicsSection.tsx`, `ComorbiditiesSection.tsx`, `EditableSectionCard.tsx`, `StickyPatientHeader.tsx` if the mapping finds hits there).

- [ ] **Step 1:** Apply Mapping Table. File-specific rulings: dark header gradient `from-slate-900 to-slate-800`→`bg-accent` (white text stays); green/emerald "done" chips→`vital-normal` set; amber pending→`vital-warning` set; blue info→`vital-low` set; violet/purple chips→`bg-surface-sunken text-ink-muted`; `bg-green-400/500`, `bg-amber-400/500`, `bg-emerald-500`, `bg-blue-500` dot indicators→`bg-vital-normal`/`bg-vital-warning`/`bg-vital-normal`/`bg-vital-low`.
- [ ] **Step 2:** Clinical numbers (vitals values, doses, IP no in StickyPatientHeader): `font-mono` + explicit leading.
- [ ] **Step 3:** Verification gate.
- [ ] **Step 4:** `git add` exact touched paths, `git commit -m "style(patient): patient detail sheet onto tokens"`

### Task 8: RadiologyPanel

**Files:** Modify `components/patient/RadiologyPanel.tsx`.

- [ ] **Step 0 — MANDATORY:** Working tree has pre-existing uncommitted changes to THIS file. **STOP and ask the user** whether to (a) commit/stash them first or (b) restyle on top. Do not proceed silently.
- [ ] **Step 1:** Apply Mapping Table (file is small: slate scale + one teal pair + dark viewer chrome `bg-slate-800/900` which STAYS dark — image-viewer surfaces are exempt from surface tokens; keep as-is).
- [ ] **Step 2:** Verification gate; commit `style(radiology): radiology panel onto tokens` (exact path staging).

### Task 9: LabTrends — Phase 3 gate

**Files:** Modify `components/LabTrends.tsx`.

- [ ] **Step 1:** Apply Mapping Table to chrome. Chart specifics: Recharts stroke/fill props using hex or `text-*` classes for series → `var(--color-chart-*)` per series; axis/grid strokes → `var(--color-line)`; axis label text → `var(--color-ink-muted)`; abnormal-value highlights keep `vital-critical`/`vital-low` semantics (high=critical red, low=blue).
- [ ] **Step 2:** Lab values in table cells: `font-mono` + explicit leading.
- [ ] **Step 3:** Verification gate + `pnpm build`.
- [ ] **Step 4:** Commit `style(labs): lab trends onto tokens + chart-* strokes`.
- [ ] **Step 5 — PHASE 3 GATE:** Push, open PR `style: detail surfaces restyle (3/3)`. Android WebView sanity pass per spec (fonts render, scroll restoration, 44px targets). **STOP for review.**
