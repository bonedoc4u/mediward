---
name: mediward-dev
description: Disciplined development workflow for the MediWard clinical SaaS app. Use this skill whenever working on MediWard — fixing errors or bugs, building new features, reviewing or auditing code, improving UI/UX, or touching Supabase/database code. Also trigger when the user pastes an error message, says something "broke", asks to "fix", "audit", "review", "polish the UI", or requests any change to the codebase. This skill prevents symptom-patching, enforces safety checks for clinical data, and keeps token usage efficient.
---

# MediWard Development Discipline

This skill defines HOW to work on MediWard. Pick the workflow matching the task,
then follow it step by step. Read `references/ui-standards.md` when the task
involves UI, and `references/supabase-safety.md` when it involves the database.

## Workflow 1: Fixing an error or bug

Never jump straight to a patch. Follow this sequence:

1. **Reproduce & understand.** Read the full error. Identify the failing file AND
   the files that call into it. State the root cause in one or two sentences.
   If the root cause is unclear, investigate further — do not guess-patch.
2. **Check history.** Has this area broken before? (`git log --oneline -- <file>`)
   If this is the 2nd+ fix in the same module, STOP and propose a refactor instead.
3. **Plan.** List: root cause → files to change → what could break. Show the user
   this plan before editing if more than one file is affected.
4. **Fix the cause, not the symptom.** No try/catch-and-ignore, no `as any`,
   no `@ts-ignore`, no disabling lint rules to make errors disappear.
5. **Verify.** Run `pnpm tsc --noEmit`, `pnpm lint`, and relevant tests.
   The fix is not done until all pass.
6. **Regression test.** Add a small test that would have caught this bug.
7. **Commit** with a clear message: `fix(<area>): <what and why>`.

## Workflow 2: Building a new feature

1. **Clarify scope** in 2–3 sentences: what the user can do after this feature
   exists that they couldn't before.
2. **Plan first, always.** Files to create/modify, data model changes,
   RLS implications, UI screens. Present the plan; wait for approval.
3. **Data layer first**: migration + RLS policies + typed client helper.
4. **Logic second**: hooks/services with zod validation on all inputs.
5. **UI last**: follow `references/ui-standards.md`.
6. **Tests** for the data layer and any clinical logic.
7. **Verify** (tsc, lint, tests) and commit in small logical chunks —
   not one giant commit.

## Workflow 3: Code audit / review

Audit ONE dimension per session (token efficiency — a mega-audit produces
shallow results). Dimensions: security, data integrity, UI/UX, performance,
error handling.

For the chosen dimension:
1. List the 5–10 highest-risk files for that dimension. Read only those.
2. Report findings as: **severity (critical/major/minor) → file → issue → concrete fix**.
3. Fix criticals immediately (via Workflow 1). Log majors/minors in `AUDIT.md`
   at repo root with date, so progress is tracked across sessions.
4. Do NOT rewrite working code for style alone.

## Workflow 4: UI polish

Read `references/ui-standards.md` first. Then:
1. Screenshot or describe the current state of the target screen.
2. Identify concrete violations of the standards (touch targets, loading states,
   spacing consistency, error messaging).
3. Fix using existing design tokens and shadcn/ui components only —
   never introduce new ad-hoc colors, fonts, or spacing values.
4. Verify on mobile viewport (this app is used on phones during ward rounds).

## Universal rules (all workflows)

- **Clinical safety trumps everything.** Patient data mutations require:
  tenant scoping, RLS coverage, input validation, confirmation for destructive actions.
- **Definition of done** = types pass + lint passes + tests pass + no new console errors.
  Never declare success without running the checks.
- **Honest reporting.** If something is partially done or a check fails, say so
  plainly. Never claim "fixed" without verification.
- **Token discipline:** read only relevant files; output diffs, not whole files;
  one focused task per session; suggest `/clear` to the user when switching
  to an unrelated task.

## When stuck

If two fix attempts fail: stop, summarize what was tried and why it failed,
and present 2–3 alternative approaches to the user rather than attempting a third
blind fix. This saves tokens and prevents the fix-break-fix spiral.
