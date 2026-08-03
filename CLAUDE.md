# MediWard — Project Instructions for Claude Code

## What this project is
MediWard is a multi-tenant clinical ward management SaaS for Indian hospitals.
It handles real patient data, so **correctness, security, and data integrity always
take priority over speed of delivery**.

Built and maintained by a solo developer (an orthopaedics resident, not a professional
engineer). Explain non-obvious decisions briefly. Never assume advanced DevOps knowledge.

## Tech stack
- **Frontend:** React 19 + TypeScript (strict) + Vite
- **Styling:** Tailwind CSS 4 + shadcn/ui components
- **Backend:** Supabase (Postgres, Auth, Storage, RLS, pgvector for OrthoAI RAG)
- **Mobile:** Capacitor 7 (Android)
- **Compliance targets:** FHIR R4, ABHA/ABDM
- **Package manager:** pnpm (never mix with npm/yarn — Vercel builds break on lockfile mismatch)

## Golden rules (non-negotiable)
1. **Plan before code.** For any change touching more than one file, first state:
   root cause → files affected → plan → risks. Wait for approval, then implement.
2. **Never patch symptoms.** Find the root cause. If the same module breaks twice,
   propose a refactor instead of a third patch.
3. **Security first.**
   - Every new table MUST have RLS policies. Every query change: re-check RLS impact.
   - Never put secrets/API keys in client code. Use environment variables only.
   - Use Supabase Auth — never custom-rolled auth or hashing schemes.
   - All patient data access must be tenant-scoped (multi-tenant isolation).
4. **After every change**, run and pass:
   - `pnpm tsc --noEmit`
   - `pnpm lint`
   - relevant tests (`pnpm test`)
   Do not report a task as done if any of these fail.
5. **Small commits.** One logical change per commit, clear message
   (e.g. `fix(rounds): prevent duplicate vitals entry in RoundMode`).
6. **No silent breaking changes.** If a fix changes behaviour elsewhere, say so explicitly.
7. **Merge policy.** Claude may self-merge a PR only when ALL of these hold:
   - (a) the change touches CI/config/docs only — never `src/` or database code,
   - (b) it restores a broken `main` rather than adding anything new, and
   - (c) it is verified by an actual passing run (real build/deploy, not just a diff read).
   Everything else waits for the user's review, even if `main` is red.
   Anything touching patient data paths, auth, or RLS ALWAYS waits — no exceptions.

## Architecture conventions
- Feature-folder structure: `src/features/<feature>/` (components, hooks, api, types together)
- Shared UI in `src/components/ui/` (shadcn), shared logic in `src/lib/`
- No component over ~250 lines — split it
- Data fetching through typed Supabase client helpers, not inline queries in components
- All forms: validated with zod schemas; never trust raw input, especially clinical values

## UI / UX standards
- Mobile-first: doctors/nurses use this on phones during rounds
- Touch targets ≥ 44px; primary actions reachable with thumb
- Every async action shows loading state; every failure shows a human-readable error
- Use the design tokens defined in `tailwind.config` — no ad-hoc colors or spacing
- Clinical safety: destructive actions (delete patient, discharge) always require confirmation
- Empty states, skeleton loaders, and offline-tolerant behaviour on ward Wi-Fi

## Testing policy
- Vitest for unit tests; priority order:
  1. Auth & tenant isolation
  2. Patient data mutations
  3. Clinical calculations / OCR parsing output
  4. Everything else
- A bug fix is not complete without a test that would have caught it.

## Token & workflow discipline
- Keep answers concise; no restating the whole file back
- When editing, show only the diff/changed sections
- Prefer reading only the files relevant to the task
- Use the `mediward-dev` skill (in `.claude/skills/`) for error-fixing, audits,
  and feature-building workflows

## Things that have gone wrong before (do not repeat)
- Custom SHA-256 auth scheme → replaced with Supabase Auth. Never reintroduce.
- Exposed API keys in client bundle → env vars only.
- pnpm/npm lockfile mixing → Vercel build failures. pnpm only.
- Removing `package-lock.json` broke GitHub Actions workflows still using `npm ci` /
  `cache: npm` → when changing package tooling, grep ALL workflows in `.github/workflows/`
  for the old tool and migrate them in the same change.
- Missing RLS on new tables → data leakage risk. Always add policies with the migration.
- Monolithic components → keep them small and feature-scoped.
