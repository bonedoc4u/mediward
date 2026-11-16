# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(A PWA used mainly as "Add to Home Screen" on phones. Capacitor 7 Android and iOS builds wrap the same web app for device features such as fingerprint sign-in. The design language is web, not native.)

## Users

- **Residents and house surgeons** (primary): on a phone, often one-handed, walking ward rounds. They admit patients, write round notes and orders, schedule the OT, chase PAC and labs, and draft discharge summaries.
- **Consultants (attendings / unit chiefs)**: review patients during rounds. They write round notes and orders only; everything else is read-only to them.
- **Nursing staff**: nursing notes, intake/output, medications, blood transfusion and wound care at the bedside.
- **Hospital admin**: team, ward, unit-chief and hospital configuration; removes and restores patient records.
- **Super-admin**: runs MediWard across hospitals (tenants).

Who may write what is fixed by the role rules in `utils/permissions.ts` and enforced in the database (RLS). Design must never offer a control a role cannot use.

## Product Purpose

MediWard runs an inpatient ward from admission to discharge: the ward census, daily rounds and to-dos, round mode at the bedside, OT lists, pre-op/PAC, labs and imaging, and discharge paperwork, in one place, on a phone, during the actual round. It replaces paper lists, WhatsApp groups and memory. Success means a team runs the whole round and the next day's OT list from MediWard without falling back to paper, and nothing clinical gets lost between shifts.

## Positioning

Built by a practising orthopaedics resident from the workflow of a real Indian teaching-hospital ward: IP numbers, beds and wards, PAC, Major/Minor/EOT OT tables with unit-chief defaults, POD counting, DAMA and death-summary variants, and printed ward lists. Round Mode is a swipe-through, one-patient-at-a-time bedside interface designed to minimise typing mid-round. It is not a general hospital EMR and not a ported Western product.

## Operating Context

- Phones during ward rounds, often on unreliable hospital Wi-Fi: offline-tolerant behaviour, sync banners and concurrent-edit handling are part of the product.
- Desktop/sidebar use for the OT list, discharge summaries and admin.
- Printed and exported artefacts still matter: OT lists (Excel/PDF), discharge summaries, referral letters, handover summaries.
- Multi-tenant: each hospital is isolated. All patient data is tenant-scoped.
- The Indian clinical and regulatory setting: FHIR R4 export and ABHA/ABDM integration are compliance targets.

## Capabilities and Constraints

- Department scope: **orthopaedics first, extending to other departments.** Ortho is the reference workflow; screens should generalise to other surgical and clinical departments (department/specialty configuration already exists) without stripping ortho specifics.
- Core areas: Ward Dashboard (also Pending, Master and Went Home lists), Admission List, Patient Detail, Round Mode, Daily Rounds, Lab Trends, Radiology Comparator, Pre-Op/PAC, Pre-Op Prep, OT List, Discharge Summary, Handover, Scoring Tools, OrthoAI clinical assistant (RAG), Team/Admin settings, Audit Log.
- Clinical safety: destructive actions (delete patient, discharge) always confirm; every async action shows loading; every failure shows a human-readable error; clinical values are validated (zod).
- Stack (existing): React 19, TypeScript strict, Vite, Tailwind CSS 4, shadcn/ui, Supabase, Capacitor 7, pnpm.
- Language: **English only** for UI and records.

## Brand Commitments

- Name: **MediWard**.
- Voice: calm, plain, clinical; written for doctors and nurses mid-shift, not for marketing.
- Fonts are self-hosted, never loaded from Google's CDN (data-privacy decision).
- Existing visual system ("Scrub Teal", documented in `docs/UI-UX-CURRENT-STATE.md`) is the incumbent; this file does not set visual direction.

## Evidence on Hand

- MediWard is **live in the founder's own orthopaedics department**, used on real rounds. No other hospitals or departments use it yet.
- No testimonials, customer logos, usage metrics, outcome data, pricing or certifications exist. Do not invent them, and do not claim FHIR/ABDM certification.
- Seeded demo users (attending, resident, nurse) exist for demos; see `README.md`.
- Screen inventory and current UI: `docs/UI-UX-CURRENT-STATE.md`.

## Product Principles

1. **The round is the product.** Optimise for one-handed phone use at the bedside, on bad Wi-Fi, under time pressure.
2. **Clinical truth over decoration.** Status colour, numbers and alerts mean something clinically real; nothing may look alarming or reassuring by accident.
3. **Never lose or leak a patient's data.** Offline tolerance, confirmation on destructive actions, and strict tenant and role isolation outrank speed of delivery.
4. **Ortho depth, department breadth.** Keep ortho workflows specific and excellent while building them so other departments can adopt the same flow.
5. **Less typing, fewer taps.** Prefer defaults, presets, and auto-drafts the clinician edits over blank forms.

## Accessibility & Inclusion

- Touch targets at least 44px; primary actions reachable with the thumb.
- Text contrast at least 4.5:1 and graphics/strokes at least 3:1, including clinical status colours.
- Safe-area insets respected; no pull-to-refresh or rubber-banding during note entry.
