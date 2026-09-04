# MediWard — Current UI/UX Reference

**Purpose of this file:** a complete, accurate snapshot of MediWard's current visual design system and screen inventory, meant to be pasted or uploaded into a conversation with an AI (Claude or otherwise) when asking for UI/UX critique or redesign ideas. It describes what exists today — not what should change.

**To get the most useful feedback:** pair this file with 3-5 real screenshots of the actual running app (Ward Dashboard, Patient Detail, Round Mode, and whichever screen you're most unhappy with). This file gives an AI accurate structural/system context; screenshots give it what things actually look like. Neither alone is as useful as both together.

---

## 1. What this app is

MediWard is a multi-tenant clinical ward management SaaS for orthopaedic departments in Indian hospitals — used by residents, unit consultants, and nursing staff, primarily **on phones, during ward rounds**, often on hospital WiFi that isn't reliable. It's a Progressive Web App (installable via "Add to Home Screen") built with React 19 + TypeScript, Tailwind CSS 4, and shadcn/ui (Radix-based) components. A native Android build also exists (Capacitor 7) for device-only features like fingerprint login; day-to-day use for most staff is through the PWA.

## 2. Design system

### 2.1 Color philosophy

The chrome (backgrounds, borders, buttons, nav) is **deliberately monochrome — ink + teal only**. Saturated color is reserved *exclusively* for clinical status meaning, so a colored badge always means something clinically real, never just decoration. This is a considered rule ("Scrub Teal" restyle, mid-2026), not an oversight — any redesign feedback should know this is intentional:

| Meaning | Color | Notes |
|---|---|---|
| Critical / abnormal-high / destructive | Red (`#dc2626` graphic, `#b91c1c` text) | This meaning ONLY — never used decoratively |
| Warning / borderline | Amber (`#d97706` / `#b45309`) | |
| Normal / within-range / success | Green (`#16a34a` / `#15803d`) | |
| Abnormal-low (labs, hypo-) | Blue (`#2563eb` / `#1d4ed8`) | |

All four have separate `-surface` (pale tint background) and `-border` tokens, and every text/graphic pair is contrast-checked (≥4.5:1 for text, ≥3:1 for graphics/strokes) — accessibility was a deliberate constraint, not an afterthought.

Chart series colors (BP systolic/diastolic, HR, SpO2, temp) are a **separate, non-semantic** palette (indigo/pink/cyan/violet) specifically so red stays reserved for "critical" and isn't accidentally reused as "just a line on a graph."

### 2.2 Chrome tokens (the actual UI surface — cards, nav, buttons, text)

```
surface           #f7f9f9   app background
surface-card      #ffffff   cards, sheets, modals
surface-sunken    #eef2f2   chips, wells, skeletons
ink               #1e2a2e   primary text (~14.9:1 contrast)
ink-muted         #5b6b70   secondary text (~5.4:1)
ink-faint         #8c989c   disabled/placeholder text ONLY
accent            #337b77   "scrub teal" — primary brand color, fills
accent-fg         #2a6763   teal as text (~4.5:1)
accent-soft       #e4efee   selection/hover tint
accent-pressed    #28615e   pressed/active state
line              #dce4e4   all borders and dividers
```

This is the actual "brand feel" of the app: a muted, clinical teal-on-off-white palette, no bright primary blues/purples anywhere in the chrome — it reads as calm and utilitarian rather than "consumer app" colorful.

### 2.3 Typography

- **DM Sans** (variable font, self-hosted — not loaded from Google's CDN, deliberately, for data-privacy reasons) — all UI text.
- **DM Mono** — reserved specifically for clinical *numbers*: vitals, drug doses, bed numbers, IP numbers. Using a monospace face for these is intentional, so digits are easy to scan and compare at a glance (e.g. telling "112" from "121" at speed).

### 2.4 Shape and elevation

- Card corner radius: 12px
- Control (button/input) corner radius: 8px
- Card shadow: a single, subtle, low-elevation shadow token (`0 1px 2px + 0 1px 3px`, all at ~4-6% opacity) — nothing floats dramatically, everything sits close to the page.

### 2.5 Layout mechanics specific to this app

- Bottom mobile tab bar is a fixed 56px, with `env(safe-area-inset-*)` respected on all sides (notches, home-indicator gesture bars).
- A floating-action-button convention (`--fab-bottom`) sits just above the bottom nav/safe area.
- Uses `100dvh` (dynamic viewport height) rather than plain `vh`, specifically to handle mobile browser chrome (address bar) hiding/showing without content jumping.
- `overscroll-behavior: none` globally — deliberately suppresses iOS rubber-banding and Android pull-to-refresh, since accidental pull-to-refresh mid-round-note-entry was a real annoyance.

### 2.6 Component conventions

- **shadcn/ui** (Radix primitives) for interactive components (dialogs, sheets), Tailwind utility classes for everything else — no separate CSS-in-JS or styled-components layer.
- **lucide-react** for all icons (a single consistent icon set throughout).
- Touch targets: minimum 44px, enforced as a project-wide rule (mobile-first, used one-handed during rounds).
- Every async action must show a loading state; every failure must show a human-readable error (not a raw error code/stack).
- Destructive actions (delete patient, discharge) always require an explicit confirmation step.
- Empty states and skeleton loaders exist for every list-type view (not just spinners).

---

## 3. Navigation structure

**Desktop:** a left sidebar, grouped into sections:
- *Overview:* Dashboard, Admission List, Pending List, Master List, Discharge, Went Home
- *Clinical Tools:* Daily Rounds, Lab Trends, Radiology, Pre-Op/PAC, Pre-Op Prep, OT List
- *Admin (role-gated):* Team Settings, Audit Log, Configuration

**Mobile:** a fixed bottom tab bar with ~5-6 primary slots (Ward, Admits, Rounds, OT List, PAC), plus a "More" overflow into the same full list as the desktop sidebar. A global search (⌘K on desktop, a search icon on mobile) can jump straight to any patient by name, IP number, bed, or diagnosis text.

---

## 4. Screen-by-screen inventory

### 4.1 Login page
Split layout on desktop (branding panel + form), single-column on mobile. Email/password form with show/hide password toggle, client-side rate-limiting with exponential backoff after failed attempts. A "Sign in with Fingerprint" button (Android only, appears conditionally once a device has enrolled) sits above the password form, never replacing it. A one-time "Enable Fingerprint Sign-In?" modal appears once after a successful password login, offering to skip retyping credentials on future logins.

### 4.2 Ward Dashboard (the main "home" screen)
The screen staff open most. A row of ward-tab pills (patient count per ward, color-coded by triage/status), a search bar, and quick-filter toggles (pending PAC, surgery today, POD 1-2, overdue todos). Below that, either:
- **Desktop:** patients grouped into per-ward tables, one row per patient (bed, name/age/gender, diagnosis, POD, PAC/status badges, NEWS2 vitals badge if enabled, quick actions).
- **Mobile:** a virtualized flat list (ward-header rows interleaved with patient cards) for scroll performance across potentially hundreds of patients.

Same component (`WardDashboard`) also renders the Pending List, Master List, and Went Home views, just with different filtering — visually near-identical, differentiated mainly by the filter chips and the ward-tabs' counts.

### 4.3 Patient Detail (opened by tapping any patient row)
A full-screen (or slide-in sheet, depending on entry point) record with a sticky header (name/bed/age once you scroll past the hero), then: diagnosis/procedure, comorbidities as pill tags, surgical history, fracture classification, radiology thumbnails, then tabs for Medications, Nursing Notes, Intake/Output, Blood Transfusion, Wound Care (each lazy-loaded). Inline-editable fields save on blur. A "Move Bed" and "Referral Letter" action live here too.

### 4.4 Round Mode (bedside, one-patient-at-a-time)
A distinct, swipe-through mobile interface for actually walking rounds — not just Patient Detail in a loop. Shows one patient at a time with quick-add shortcut chips for common orders (C&D, ESR/CRP, standard admission forms), a compact vitals/labs summary, and swipe/arrow navigation to the next patient in the ward. Designed to minimize typing during an actual round.

### 4.5 Daily Rounds
A ward-grouped view of that day's round notes and each patient's open to-do/orders list, with a date picker to look at past days (read-only for historical dates). Carried-over (not-yet-actioned) to-do items are visually flagged (amber "since DD-MM" or "carried over" tag) so stale items are distinguishable from fresh orders, without ever being hidden.

### 4.6 OT List Management
Three tabs (Major / Minor / EOT), each a per-table (Table 1/2, Spinal, Local) ordered queue, built via drag-and-drop (desktop) or tap-to-add (mobile, since dragging over a hidden list doesn't make sense on phone). A "Pending Surgery" panel (sidebar on desktop, bottom sheet on mobile) lists patients eligible for a slot, searchable, each with a one-tap "+" to add. Surgeon/unit/OT-time fields per table, auto-filled from a configurable unit-chief default. Export to Excel/PDF for the printed ward list.

### 4.7 Radiology Comparator
Side-by-side/toggle comparison of pre-op vs post-op imaging, a lightbox for full-size viewing with pinch-zoom, multi-image upload with per-image cropping before save.

### 4.8 Lab Trends
Per-lab-type line charts (the categorical chart-series colors, not the vital-status colors) showing a patient's values over time, configurable per-hospital which lab types are tracked at all.

### 4.9 Discharge Summary
The largest single screen in the app — auto-drafts a hospital-course narrative from the admission diagnosis, comorbidities, and the last several days of round notes (editable, not just a blank form), plus condition-at-discharge, wound care, restrictions, and follow-up instructions with sensible editable defaults. The same screen also handles DAMA (discharge against medical advice) and death-summary variants.

### 4.10 Admin / Configuration
A tabbed settings shell: Hospital details, Ward setup (names, active/inactive, ICU flag, sort order — this is what controls ward-tab ordering on the Dashboard), Lab types, Medication presets, Comorbidity shortcodes, weekend-duty roster, and an "Advanced" tab holding DPDP data-erasure/portability tools and compliance-facing info (data region, encryption, audit trail claims).

### 4.11 Team Management / Audit Log
Team Management lists staff with role + unit assignment, invite flow for new accounts. Audit Log (admin-only) is a filterable table of every logged action (create/update/delete/login/logout/view/export) with a small analytics summary (24h activity count, top user, deletion count).

---

## 5. Things to keep in mind for any redesign

- **Used one-handed, on phones, often while walking or standing** — anything that assumes comfortable two-handed desktop interaction will fight the actual usage pattern.
- **Color is load-bearing, not decorative** — if a redesign changes what red/amber/green mean anywhere near patient vitals or status, that's a patient-safety-relevant change, not just a style choice.
- **This app is used in bright ward lighting and sometimes in dim night-shift lighting** — contrast matters more than most consumer apps.
- **Offline tolerance matters** — ward WiFi is unreliable; loading/stale-data states are a real, frequent condition, not an edge case to design once and forget.
- **No dark mode currently exists** — if that's wanted, it would be new work, not a token-swap, since the color system was built single-theme-first.
