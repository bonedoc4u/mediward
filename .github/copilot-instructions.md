# Copilot / AI Agent Instructions for MediWard

This project is a React + TypeScript single-page app built with Vite. Focus on changes that respect the offline-first, local-first sync model and the centralized `AppContext` state.

- **Big picture**: UI components (in `components/`) are thin. App state, routing, and core actions live in `contexts/AppContext.tsx`. Persistence and offline sync are implemented via `services/persistence.ts` and `services/syncQueue.ts`. Cloud sync uses the Supabase client in `lib/supabase.ts` and service modules in `services/`.

- **Key files to read before editing core logic**:
  - `contexts/AppContext.tsx` — central state, auth, session timings, and public API exposed via `useApp()`.
  - `services/persistence.ts` — localStorage envelopes, versioning, and quota handling.
  - `services/syncQueue.ts` — write-ahead queue for retries; use `enqueue()` instead of directly writing to Supabase when offline.
  - `lib/supabase.ts` — Supabase client; requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
  - `services/*` — domain operations (patientService, labsService, imagingService, userService, auditLog).
  - `types.ts` — canonical types used across the app.

- **Architecture notes / patterns**:
  - Offline-first: writes may be queued in `syncQueue` and replayed later; do not bypass this mechanism.
  - Persistence envelope: `saveToStorage()` wraps data with `version` and `timestamp` — migrations should inspect `version`.
  - Audit trail: all user actions go through `services/auditLog.ts`; keep this append-only behavior intact.
  - Auth/session: `contexts/AppContext.tsx` seeds demo users and uses an 8-hour session constant (`SESSION_DURATION`). Avoid hard-coding other session lengths.
  - UI: heavy views are lazy-loaded (see `App.tsx`) — when adding large components, prefer `React.lazy` + `Suspense`.

- **Developer workflows**:
  - Install & run: `npm install` then `npm run dev`.
  - Build: `npm run build`; preview with `npm run preview`.
  - Tests: `npm run test` (uses `vitest`); use `npm run test:watch` for TDD.
  - Env: create `.env.local` (or set Vite env) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The app throws early if these are missing (`lib/supabase.ts`).

- **Conventions specific to this repo**:
  - Services return plain JS objects; conversion/parsing happens in service helpers (see `patientService` and `parsePatientRow`).
  - Use `sanitizeInput()` from `utils/sanitize.ts` for any user-provided strings before persistence.
  - Use `toast()` for user-visible errors rather than alert dialogs.
  - Use the `enqueue()`/`syncQueue` API for operations that write to Supabase so failures are retried; `MAX_ATTEMPTS` logic lives in `syncQueue.ts`.
  - Keep UI-only state local to components (modals, local form state); global patient lists, notifications and navigation live in `AppContext`.

- **Tests & debugging tips**:
  - Unit tests use `vitest` + `jsdom`. Mock `localStorage` and `supabase` calls when testing services.
  - For debugging sync behavior, inspect `localStorage` keys starting with `mediward_` and `mediward_sync_queue`.

- **When modifying persistence or sync**:
  - Add migration code if changing `StorageEnvelope.version` handling in `services/persistence.ts`.
  - If you change op types for the sync queue, update `QueuedOpType` in `services/syncQueue.ts` and any consumers in `contexts/AppContext.tsx`.

- **Good entry points for common tasks**:
  - Add a patient: `useApp().addPatient()` (see `AppContext`).
  - Insert lab result: `services/labsService.insertLab()` or `useApp().addLabResult()`.
  - View audit logs: `components/AuditLogViewer.tsx` + `services/auditLog.ts`.

If anything here is unclear or you want me to expand examples (e.g., line-level links for migration points), tell me which area to elaborate.
