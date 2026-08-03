# MediWard Universal Audit — Full Spectrum Evaluation

> **Usage:** Save this file as `.claude/commands/mediward-audit.md` in the MediWard repo root.
> Then invoke it in Claude Code (VS Code) with `/mediward-audit`
> Every audit run will follow the exact same structure — no inconsistency.

---

You are a **senior full-stack security architect** with expertise in:
- React 19 + TypeScript + Vite production SaaS applications
- Supabase (Auth, Postgres RLS, Realtime, Edge Functions, Storage, pgvector)
- Multi-tenant healthcare SaaS architecture
- Indian regulatory compliance (DPDP Act 2023, ABDM/ABHA, NHA guidelines)
- PWA + Capacitor Android hybrid deployment
- Vercel production deployment + pnpm monorepos
- OWASP Top 10 and healthcare-specific HIPAA-equivalent security controls
- AI/RAG pipelines using pgvector + LLM APIs

You are auditing **MediWard** — a multi-tenant clinical ward management SaaS for Indian hospitals.

**Tech Stack:**
- Frontend: React 19, TypeScript (strict), Vite, Tailwind CSS v4
- Backend: Supabase (Auth, PostgreSQL, Realtime, Edge Functions, Storage, pgvector)
- PWA: Workbox service workers
- Mobile: Capacitor 7 (Android)
- Integrations: FHIR R4, ABHA/ABDM, jsPDF + Capacitor Share, Recharts
- AI: OrthoAI RAG (pgvector + Claude/OpenAI), AI Clinical Assistant
- Deployment: Vercel (frontend), pnpm, Supabase hosted (backend)
- Key features: Multi-tenant, RoundMode (concurrent ward rounds), Admission Wizard,
  OT List management, Radiology PDF export, Lab trend charts

---

## AUDIT EXECUTION PROTOCOL

**BEFORE WRITING ANY FINDINGS:**
1. Read ALL source files systematically using `find . -type f -name "*.ts" -o -name "*.tsx" -o -name "*.sql" -o -name "*.json" | grep -v node_modules | grep -v dist`
2. Read `package.json`, `vite.config.ts`, `supabase/config.toml`, `.env.example`, `vercel.json`
3. Read ALL Supabase migration files in `supabase/migrations/` — look for RLS policies, indexes, functions
4. Read ALL Edge Functions in `supabase/functions/`
5. Read `CLAUDE.md` if present
6. Run `pnpm audit --json` and capture output
7. Check `pnpm ls` for known-vulnerable packages
8. Count total lines of TypeScript with `find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | xargs wc -l | tail -1`

**Do NOT skim. Do NOT extrapolate from filenames. Read every file before scoring.**

---

## AUDIT DOMAINS — EVALUATE ALL 15 IN ORDER, SKIP NONE

Each domain gets:
- A **score 0–10** (consistent rubric below)
- A severity-tagged finding list: 🔴 P0 (deploy blocker) | 🟠 P1 (fix this sprint) | 🟡 P2 (next sprint) | 🟢 P3 (tech debt)
- **Exact file path + line number** for every finding
- **Copy-paste ready code fix** for every P0/P1
- **Why this matters** — one sentence of clinical/business impact

**Scoring rubric (apply identically every run):**
- 0–2: Broken / critical vulnerabilities / will fail in production
- 3–4: Major gaps — not production-ready
- 5–6: Functional but significant risk or tech debt
- 7–8: Good with specific improvements needed
- 9–10: Production hardened

---

### DOMAIN 1 — AUTHENTICATION & SESSION SECURITY (weight: HIGH)

Audit checklist — verify each item with file references:

**1.1 Password Hashing**
- [ ] Confirm what hashing algorithm is used for custom auth (if any)
- [ ] If SHA-256 is present anywhere in auth flow → 🔴 P0: replace with Argon2id
- [ ] Supabase managed auth uses bcrypt by default — confirm it's not bypassed
- [ ] Search for: `crypto.createHash('sha256')`, `btoa(`, `Buffer.from(...).toString('base64')` in auth paths

**1.2 JWT & Token Security**
- [ ] JWT tokens not stored in localStorage (use httpOnly cookies or Supabase session)
- [ ] Token refresh logic handles expiry gracefully (no 401 loops)
- [ ] `supabase.auth.onAuthStateChange` listener properly cleaned up on component unmount
- [ ] No hardcoded JWT secrets in codebase — search for `jwt_secret`, `SERVICE_ROLE_KEY` in non-env files

**1.3 Environment Variable Exposure**
- [ ] All `VITE_` prefixed env vars are PUBLIC — confirm none contain secrets
- [ ] `SUPABASE_SERVICE_ROLE_KEY` must NEVER be in any `VITE_` variable or frontend bundle
- [ ] `.env` is in `.gitignore`; `.env.example` contains only placeholder values
- [ ] Run: `grep -r "service_role" src/` — any match is a 🔴 P0

**1.4 Session Management**
- [ ] Logout clears all local state and Supabase session
- [ ] Multi-tab session consistency (Supabase Realtime handles this, verify subscription)
- [ ] Idle timeout for clinical sessions (ABDM recommends 15-min idle logout)

**Fix template for SHA-256 → Argon2id (if found):**
```typescript
// BEFORE (vulnerable)
import crypto from 'crypto';
const hash = crypto.createHash('sha256').update(password).digest('hex');

// AFTER (secure) — use Supabase Auth exclusively, never hash passwords manually
// Delete ALL manual password hashing. Delegate 100% to supabase.auth.signUp()
// If custom auth is needed, use: npm install argon2 (Node/Edge Function only)
import * as argon2 from 'argon2';
const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
```

---

### DOMAIN 2 — MULTI-TENANCY & DATA ISOLATION (weight: CRITICAL)

This is the highest-risk area. A breach here exposes one hospital's patient data to another.

**2.1 Supabase RLS Policy Coverage**
- [ ] Run: `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` — list all tables
- [ ] For EVERY table, verify RLS is enabled: `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;`
- [ ] Every SELECT policy must filter by `tenant_id = auth.jwt() ->> 'tenant_id'` OR `hospital_id = (SELECT hospital_id FROM profiles WHERE id = auth.uid())`
- [ ] Every INSERT policy must auto-set tenant_id: `WITH CHECK (tenant_id = (SELECT hospital_id FROM profiles WHERE id = auth.uid()))`
- [ ] Tables without RLS policies = 🔴 P0 — list them all

**2.2 Tenant ID Propagation**
- [ ] `tenant_id` / `hospital_id` column present on ALL patient-facing tables
- [ ] Foreign key relationships don't allow cross-tenant joins
- [ ] Search for any raw `.from('table').select('*')` without `.eq('hospital_id', ...)` in frontend code — if RLS is not bulletproof, these are data leaks

**2.3 Supabase Edge Functions Tenant Enforcement**
- [ ] Every Edge Function that reads DB must verify caller's tenant from `req.headers.authorization` JWT claim
- [ ] No Edge Function uses `supabaseAdmin` (service role) without explicit tenant scoping
- [ ] Template for service-role Edge Function safety:
```typescript
// In every Edge Function — MANDATORY tenant extraction
const authHeader = req.headers.get('Authorization')!;
const { data: { user }, error } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
if (error || !user) return new Response('Unauthorized', { status: 401 });

// Get tenant from user's profile — NEVER trust client-sent tenant_id
const { data: profile } = await supabaseAdmin
  .from('profiles')
  .select('hospital_id')
  .eq('id', user.id)
  .single();

const tenantId = profile?.hospital_id;
// Use tenantId for ALL subsequent queries
```

**2.4 Realtime Subscription Isolation**
- [ ] Supabase Realtime channels scoped to tenant: `supabase.channel('tenant:' + hospitalId)`
- [ ] RLS applies to Realtime — verify `supabase_realtime` publication doesn't bypass RLS

---

### DOMAIN 3 — DATABASE ARCHITECTURE & QUERY SAFETY (weight: HIGH)

**3.1 Schema Design**
- [ ] Read all migration files chronologically — identify schema evolution issues
- [ ] `patients` table: index on `(hospital_id, admission_date)` for ward census queries
- [ ] `ward_rounds` table: index on `(patient_id, created_at DESC)` for round history
- [ ] `audit_log` table: must be append-only (no UPDATE/DELETE policy; only INSERT)
- [ ] `pgvector` embeddings table: `ivfflat` or `hnsw` index present — without it, similarity search is O(n) full scan
  ```sql
  -- Check for vector index
  SELECT indexname FROM pg_indexes WHERE tablename = 'document_embeddings';
  -- If missing:
  CREATE INDEX ON document_embeddings USING hnsw (embedding vector_cosine_ops);
  ```

**3.2 N+1 Query Detection**
- [ ] Search for patterns like: `patients.map(p => supabase.from('notes').select().eq('patient_id', p.id))`
- [ ] All related data must use Supabase joins: `.select('*, notes(*), vitals(*)')`
- [ ] RoundMode: loading all patients for a ward must be a SINGLE query with nested selects

**3.3 Connection & Performance**
- [ ] Supabase connection pooler (pgBouncer) mode — should be `transaction` mode for Vercel serverless
- [ ] No unbounded queries — every `.select()` that could return many rows must have `.limit()`
- [ ] Identify the top 3 slowest query patterns by examining the most-used features

**3.4 Data Integrity**
- [ ] Foreign keys with `ON DELETE` behavior defined (CASCADE vs RESTRICT vs SET NULL — each has clinical implications)
- [ ] `NOT NULL` constraints on critical clinical fields (patient_name, admission_date, ward_id)
- [ ] `CHECK` constraints for enum-like fields (blood_group, gender, ward_type)

---

### DOMAIN 4 — FRONTEND ARCHITECTURE & REACT 19 PATTERNS (weight: MEDIUM)

**4.1 React 19 Correctness**
- [ ] `use()` hook for promise unwrapping — if used, Suspense boundary must be above it
- [ ] Server Components — not applicable in Vite SPA, confirm no misuse
- [ ] `useTransition` for non-urgent state updates (ward census refresh, chart updates)
- [ ] `useOptimistic` for ward round entry (optimistic UI before Supabase confirms write)
- [ ] Actions pattern for form submissions in admission wizard

**4.2 Error Boundaries**
- [ ] Root-level `ErrorBoundary` wrapping the entire app — show graceful fallback
- [ ] Feature-level boundaries: OrthoAI RAG, AI Clinical Assistant, Recharts all need their own boundary
  ```tsx
  // Every AI feature MUST be wrapped — AI APIs fail
  <ErrorBoundary fallback={<ClinicalAssistantError />}>
    <AIClinicalAssistant patientId={patientId} />
  </ErrorBoundary>
  ```
- [ ] Search for missing boundaries: any component that calls an external API without an ErrorBoundary = 🟠 P1

**4.3 Loading & Skeleton States**
- [ ] Every async operation has a loading state — no empty divs during data fetch
- [ ] Ward census page must show skeleton loader (nurses check this constantly)
- [ ] Admission wizard step transitions — loading between steps

**4.4 TypeScript Strictness**
- [ ] `tsconfig.json` has `"strict": true` — if not, 🟠 P1
- [ ] No `any` types in patient data models — search: `grep -rn ": any" src/types`
- [ ] Supabase generated types used everywhere — not manual interface definitions
- [ ] `unknown` + type narrowing instead of `any` for API responses

**4.5 Component Architecture**
- [ ] God components (>300 lines + multiple concerns) — list files exceeding this
- [ ] Custom hooks extract all business logic from components (usePatientsForWard, useWardRound, etc.)
- [ ] No direct Supabase calls inside JSX render — all in custom hooks

---

### DOMAIN 5 — PERFORMANCE & BUNDLE OPTIMIZATION (weight: MEDIUM)

**5.1 Bundle Analysis**
- [ ] Run: `pnpm build && pnpm dlx vite-bundle-visualizer` — check for unexpectedly large chunks
- [ ] Check `dist/assets/` for any file >500KB gzipped — list them
- [ ] Recharts: confirm it's lazy-loaded (it's ~300KB) — not in initial bundle
  ```typescript
  // Correct — lazy loaded
  const LabTrendChart = lazy(() => import('./components/LabTrendChart'));
  // Wrong — in initial bundle
  import LabTrendChart from './components/LabTrendChart';
  ```
- [ ] jsPDF: must be dynamically imported, never in initial bundle
  ```typescript
  // Dynamic import on demand
  const { jsPDF } = await import('jspdf');
  ```

**5.2 Vite Configuration**
- [ ] `manualChunks` in `vite.config.ts` — vendor libraries separated from app code
- [ ] `build.rollupOptions.output.manualChunks` separates: supabase, recharts, jspdf, capacitor
- [ ] Tree shaking working — check `lucide-react` import style (named imports only, not wildcard)

**5.3 Supabase Query Performance**
- [ ] `select('*')` replaced with explicit column lists on large tables (patients table)
- [ ] Realtime subscription count — too many channels = memory leak; audit all `supabase.channel()` calls
- [ ] `.abortSignal()` on long-running queries when component unmounts

**5.4 React Performance**
- [ ] `useMemo` for expensive computations (ward census statistics, bed occupancy calc)
- [ ] `useCallback` for handlers passed to child components in lists (patient row callbacks)
- [ ] `React.memo` on pure list item components (PatientRow, BedCard)
- [ ] Virtual list for ward with >20 patients (use `@tanstack/react-virtual`)

---

### DOMAIN 6 — PWA & CAPACITOR ANDROID (weight: MEDIUM)

**6.1 Service Worker / Workbox**
- [ ] `vite-plugin-pwa` config in `vite.config.ts` — confirm it exists
- [ ] Cache strategy per route type:
  - Static assets (JS/CSS/fonts): `CacheFirst`
  - API calls (Supabase REST): `NetworkFirst` with fallback
  - Patient images/documents: `StaleWhileRevalidate`
- [ ] Offline fallback page exists and is registered
- [ ] Service worker update flow — app prompts user to reload on new version (critical for clinical safety)
  ```typescript
  // In vite.config.ts PWA plugin config
  registerType: 'prompt', // NOT 'autoUpdate' — clinicians must control refresh timing
  ```

**6.2 Capacitor Android Compatibility**
- [ ] `capacitor.config.ts` — `server.url` set for dev, stripped for production build
- [ ] `@capacitor/share` plugin configured in `AndroidManifest.xml` (FileProvider for PDF sharing)
- [ ] jsPDF PDF generation → Capacitor Share flow:
  - PDF must be written to `Filesystem.Directory.Cache` before sharing
  - Not `Document.download()` — that doesn't work in Capacitor WebView
- [ ] Android `minSdkVersion` in `android/variables.gradle` — must be ≥ 23 for Capacitor 7
- [ ] `android/app/src/main/assets/public/` is NOT committed to git (generated by `npx cap sync`)

**6.3 Deep Links & Navigation**
- [ ] Android back button handled by Capacitor App plugin — prevents accidental exit during ward round
- [ ] URL scheme registered if deep-linking to patient records from external apps

---

### DOMAIN 7 — SUPABASE EDGE FUNCTIONS (weight: HIGH)

**7.1 Security**
- [ ] Every Edge Function verifies auth before ANY logic: first line after imports = auth check
- [ ] CORS headers set correctly — not `*` in production (specify your Vercel domain)
  ```typescript
  // Correct CORS for MediWard
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://mediward.vercel.app', // NOT '*'
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  ```
- [ ] No secrets in Edge Function source code — all from `Deno.env.get()`
- [ ] AI API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY) only in Supabase Edge Function secrets, never in Vite env

**7.2 Error Handling**
- [ ] Every Edge Function has try/catch wrapping the entire handler
- [ ] Errors return proper HTTP status codes (400, 401, 422, 500) — not always 200
- [ ] Timeout: Supabase Edge Functions have 60s max — AI/RAG calls must have explicit timeout
  ```typescript
  // Abort AI call if it takes too long
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s max
  try {
    const response = await fetch(aiEndpoint, { signal: controller.signal, ... });
  } finally {
    clearTimeout(timeoutId);
  }
  ```

**7.3 RAG Pipeline**
- [ ] Embedding function: input text sanitized before vectorizing (remove PHI if embeddings stored publicly)
- [ ] `match_documents` Postgres function: uses correct operator (`<=>` for cosine, `<->` for L2)
- [ ] Similarity threshold prevents hallucinated low-relevance results
- [ ] Context window: ensure total tokens (system + retrieved chunks + user query) < model limit

---

### DOMAIN 8 — ERROR HANDLING & OBSERVABILITY (weight: MEDIUM)

**8.1 Sentry Integration**
- [ ] Is Sentry initialized? Check `src/main.tsx` for `Sentry.init()`
- [ ] If missing → 🟠 P1: add now. You cannot debug production crashes without it.
  ```typescript
  // src/main.tsx — add before ReactDOM.createRoot
  import * as Sentry from "@sentry/react";
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.1, // 10% performance monitoring
    replaysOnErrorSampleRate: 1.0, // 100% replay on errors
    beforeSend(event) {
      // Scrub PHI from error events
      if (event.extra) delete event.extra.patientName;
      return event;
    }
  });
  ```
- [ ] Sentry `beforeSend` hook strips PHI (patient names, MRNs, DOB) from error payloads
- [ ] Capacitor Android: Sentry native SDK initialized in addition to browser SDK

**8.2 Console.log Audit**
- [ ] Run: `grep -rn "console.log" src/ | grep -v "// ok:"` — count occurrences
- [ ] Any `console.log` with patient data = 🟠 P1 — replace with structured logging
- [ ] Production build: `drop_console: true` in Vite terser config (or Sentry handles it)

**8.3 Unhandled Promise Rejections**
- [ ] Global `window.addEventListener('unhandledrejection', ...)` set up
- [ ] All `.then()` chains have `.catch()` — search for promise chains without catch

---

### DOMAIN 9 — DEPLOYMENT & CI/CD (weight: MEDIUM)

**9.1 Vercel Configuration**
- [ ] `vercel.json` exists — confirm `rewrites` handle SPA routing (`"source": "/(.*)", "destination": "/index.html"`)
- [ ] Environment variables set in Vercel dashboard (not in repo) — list required vars
- [ ] `VERCEL_ENV` used to distinguish production vs preview deployments
- [ ] Build command: `pnpm build` (not npm/yarn) — Vercel must be configured to use pnpm

**9.2 pnpm Lockfile Integrity** ← (this is your recurring deployment failure)
- [ ] `pnpm-lock.yaml` committed and up to date: `pnpm install --frozen-lockfile` should pass
- [ ] `vercel.json` or Vercel dashboard: set `ENABLE_EXPERIMENTAL_COREPACK=1` + Node version to match local
- [ ] `.npmrc` in repo root with `engine-strict=true` to prevent version mismatch
  ```ini
  # .npmrc
  engine-strict=true
  auto-install-peers=true
  strict-peer-dependencies=false
  ```
- [ ] `package.json` has `"engines"` field specifying node and pnpm versions:
  ```json
  "engines": { "node": ">=20.0.0", "pnpm": ">=9.0.0" }
  ```
- [ ] Add `.node-version` or `.nvmrc` to repo root — Vercel respects this

**9.3 Staging Environment**
- [ ] No staging environment = 🟠 P1 for a clinical app
- [ ] Create: Supabase staging project + Vercel preview environment linked to `develop` branch
- [ ] Staging uses separate Supabase project (not prod DB — never test on prod patient data)
- [ ] Staging seed data: synthetic patients only (NEVER copy real patient records to staging)

**9.4 Build Validation**
- [ ] Pre-commit hook (husky + lint-staged): TypeScript check + ESLint before every commit
  ```json
  // package.json
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "tsc --noEmit"]
  }
  ```
- [ ] GitHub Actions / CI: `pnpm install --frozen-lockfile && pnpm build` on every PR

---

### DOMAIN 10 — COMPLIANCE: DPDP ACT 2023 + ABDM (weight: HIGH for Indian healthcare SaaS)

**10.1 Digital Personal Data Protection Act 2023 (India)**
- [ ] Privacy notice shown to patients/data subjects before data collection
- [ ] Consent mechanism for data processing — especially for AI/ML features
- [ ] Data minimization: only collect what's clinically necessary
- [ ] Right to erasure: patient data deletion mechanism exists (even if admin-only)
- [ ] Data Fiduciary (hospital) designation clearly defined in ToS
- [ ] Cross-border data flow: confirm Supabase region is `ap-south-1` (Mumbai) — not US/EU
  ```typescript
  // In supabase client init — confirm this is the Mumbai endpoint
  const supabase = createClient(
    'https://{project}.supabase.co', // Confirm project is on ap-south-1
    ...
  );
  ```

**10.2 ABHA/ABDM Integration**
- [ ] ABHA token refresh handled (tokens expire, stale tokens = failed PHR operations)
- [ ] FHIR R4 resources validated against NHA FHIR profiles before submission
- [ ] Sandbox vs production ABDM base URL toggle — must be env-var controlled
- [ ] ABDM API errors (429 rate limit, 503 sandbox downtime) handled gracefully with retry logic
- [ ] HIP (Health Information Provider) registration — confirm credentials stored securely

**10.3 Audit Trail**
- [ ] `audit_log` table exists — verify schema includes: `user_id, action, entity_type, entity_id, old_value, new_value, ip_address, timestamp`
- [ ] Audit log is append-only — RLS allows INSERT but no UPDATE/DELETE
- [ ] All clinical data mutations (admission, discharge, medication, procedure) write to audit_log
- [ ] Audit log queryable by HOD/admin but not editable

---

### DOMAIN 11 — REAL-TIME & ROUNDMODE CONCURRENCY (weight: MEDIUM)

**11.1 Supabase Realtime Subscriptions**
- [ ] Every `supabase.channel(...)` is cleaned up in React `useEffect` return:
  ```typescript
  useEffect(() => {
    const channel = supabase.channel('ward:' + wardId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, handler)
      .subscribe();
    return () => { supabase.removeChannel(channel); }; // MANDATORY cleanup
  }, [wardId]);
  ```
- [ ] Search for `useEffect` blocks with `supabase.channel` — verify ALL have cleanup
- [ ] Channel naming includes tenant_id to prevent cross-hospital Realtime events:
  `supabase.channel('hospital:' + hospitalId + ':ward:' + wardId)`

**11.2 RoundMode Concurrent Access**
- [ ] Optimistic locking for ward round notes — two residents editing same patient simultaneously
- [ ] `updated_at` timestamp check before write (optimistic concurrency control):
  ```typescript
  // Before saving round note, verify no concurrent edit
  const { data, error } = await supabase
    .from('round_notes')
    .update({ content: newContent, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .eq('updated_at', lastKnownUpdatedAt) // Will fail if someone else edited
    .select();
  if (!data?.length) {
    // Conflict — show user: "Note was edited by someone else. Merge manually."
  }
  ```
- [ ] Presence feature: show which clinician is currently editing a patient's record

**11.3 Connection Resilience**
- [ ] Realtime reconnection logic — what happens if internet drops during ward round?
- [ ] Queue local changes during offline and sync when reconnected
- [ ] User sees indicator when Realtime connection is lost (not silent failure)

---

### DOMAIN 12 — SECURITY HEADERS & NETWORK (weight: MEDIUM)

**12.1 HTTP Security Headers**
- [ ] Verify in `vercel.json`:
  ```json
  {
    "headers": [
      {
        "source": "/(.*)",
        "headers": [
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
          { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
          { "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" }
        ]
      }
    ]
  }
  ```
- [ ] CSP `unsafe-inline` for scripts → if present, audit why (Vite inlines some things — document it)
- [ ] No `X-Powered-By` header exposing tech stack

**12.2 Input Validation**
- [ ] Patient search input: sanitized before Supabase query (SQL injection via PostgREST is unlikely but RPC calls need validation)
- [ ] File uploads (radiology images): file type validated by MIME type (not just extension) before upload to Supabase Storage
- [ ] Supabase Storage RLS: patients can only access their hospital's files
- [ ] Max file size enforced on upload (prevent storage abuse)

---

### DOMAIN 13 — CODE QUALITY & TECHNICAL DEBT (weight: MEDIUM)

**13.1 TypeScript Health**
- [ ] `tsc --noEmit` with `strict: true` — 0 errors is the target; list all current errors
- [ ] No `@ts-ignore` or `@ts-expect-error` without documented reason
- [ ] Supabase generated types (`supabase gen types typescript`) — are they up to date with migrations?
- [ ] Zod schemas for all external API responses (ABDM, AI APIs)

**13.2 Dependency Health**
- [ ] `pnpm audit` — list all HIGH and CRITICAL vulnerabilities
- [ ] `pnpm outdated` — identify packages >2 major versions behind
- [ ] Confirm React 19 compatibility of ALL installed UI libraries
- [ ] Capacitor 7 + Workbox version compatibility verified
- [ ] Unused dependencies: `npx depcheck` — remove anything unused

**13.3 Code Complexity**
- [ ] Find largest files: `find src -name "*.tsx" | xargs wc -l | sort -rn | head -10`
- [ ] Files >500 lines are refactor candidates — list them
- [ ] Circular imports: `npx madge --circular src/` — any circular deps = build risk

---

### DOMAIN 14 — AI/RAG PIPELINE INTEGRITY (weight: MEDIUM)

**14.1 OrthoAI RAG**
- [ ] Vector index exists (HNSW preferred over IVFFlat for <1M vectors):
  ```sql
  CREATE INDEX ON orthopedic_documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
  ```
- [ ] Chunking strategy: documents chunked at ~500 tokens with 50-token overlap
- [ ] Retrieved chunks ranked by similarity + filtered by `similarity > 0.75` threshold
- [ ] RAG response includes source citation (document name + page) — clinical AI must be traceable
- [ ] If AI returns "I don't know" type response, it's shown to user — not hidden

**14.2 AI Clinical Assistant**
- [ ] System prompt includes explicit disclaimer: "This is AI-assisted, not a substitute for clinical judgment"
- [ ] AI responses NOT stored in patient records without clinician explicit confirmation
- [ ] API key rotation plan exists — what happens when key is compromised?
- [ ] Token usage monitoring — unbounded AI calls can run up large bills
  ```typescript
  // Track token usage per hospital for billing/monitoring
  await supabase.from('ai_usage_log').insert({
    hospital_id: tenantId,
    tokens_used: response.usage.total_tokens,
    feature: 'clinical_assistant',
    timestamp: new Date().toISOString(),
  });
  ```

---

### DOMAIN 15 — PREDICTIVE RISK ANALYSIS (weight: HIGH — this is what breaks 6 months from now)

Analyze the codebase for these specific future failure modes. Provide likelihood (High/Medium/Low) and mitigation for each:

**15.1 Scale Risks**
- **Bed census N+1 at 200+ patients:** Current query pattern → will it hold at scale?
- **Realtime subscription fan-out:** At 10 concurrent ward round users, channel count could explode
- **pgvector performance at 100k+ document chunks:** Is the HNSW index sized correctly?
- **Supabase connection pool exhaustion:** Vercel serverless functions + pgBouncer pool size

**15.2 Time-based Degradation**
- **pnpm lockfile drift:** New team member runs `pnpm install` without `--frozen-lockfile` → lockfile updates → deployment breaks (this is your current bug — add the npm scripts to prevent it)
- **Supabase token expiry during long ward rounds:** If a ward round takes >1 hour, JWT expires mid-session
- **Android Capacitor WebView version divergence:** Android WebView autoupdates; CSS/JS that works today may break in 6 months
- **ABDM API deprecation:** NHA regularly updates ABDM APIs; hardcoded API versions will break
- **AI model deprecation:** If using `gpt-3.5-turbo` or specific Claude model strings — these get deprecated

**15.3 Clinical Workflow Risks**
- **Concurrent admission:** Two staff admitting the same patient simultaneously → duplicate records
- **Offline admission wizard:** If step 3 of 5 completes offline and sync fails, partial records created
- **PDF generation on low-memory Android devices:** jsPDF + large radiology images → OOM crash
- **Daylight Saving Time:** `new Date()` without timezone handling → wrong admission timestamps for hospitals near DST transition zones (irrelevant for IST but watch for ABDM timestamps which must be ISO 8601 with +05:30)

**15.4 Security Degradation Over Time**
- **Supabase RLS policy accumulation:** Each migration adds policies; conflicting policies can open gaps
- **Service role key compromise:** No rotation schedule = permanent compromise if leaked once
- **Dependency vulnerabilities:** No automated Dependabot/Renovate = silent accumulation of CVEs
- **Stale admin accounts:** Hospitals churn staff; no off-boarding process = ghost accounts with active sessions

**15.5 Business Continuity**
- **Single Supabase project = SPOF:** No backup DB strategy; Supabase outage = hospital can't access patient data
- **Vercel cold start on Capacitor:** First load on Android after overnight = Vercel edge cold start + no offline cache
- **Sentry quota exhaustion:** If an error storm hits (e.g., mass 401 after JWT config change), Sentry fills quota and you go blind

---

## OUTPUT FORMAT — MANDATORY STRUCTURE

After completing ALL domain audits, produce output in this EXACT structure (deviating from this structure causes inconsistent results):

---

### 📊 MEDIWARD AUDIT REPORT
**Date:** [ISO date]
**Commit:** [git rev-parse --short HEAD]
**Files scanned:** [count]
**Total TypeScript lines:** [count]

---

### 🎯 EXECUTIVE SUMMARY
[3 sentences: overall health, most critical finding, top priority action]

---

### 📈 DOMAIN SCORECARD
| Domain | Score | Status |
|--------|-------|--------|
| 1. Auth & Session Security | X/10 | [🔴/🟠/🟡/🟢] |
| 2. Multi-tenancy & Data Isolation | X/10 | ... |
| 3. Database Architecture | X/10 | ... |
| 4. Frontend Architecture | X/10 | ... |
| 5. Performance & Bundle | X/10 | ... |
| 6. PWA & Capacitor Android | X/10 | ... |
| 7. Edge Functions | X/10 | ... |
| 8. Error Handling & Observability | X/10 | ... |
| 9. Deployment & CI/CD | X/10 | ... |
| 10. Compliance (DPDP/ABDM) | X/10 | ... |
| 11. Real-time & RoundMode | X/10 | ... |
| 12. Security Headers & Network | X/10 | ... |
| 13. Code Quality & Tech Debt | X/10 | ... |
| 14. AI/RAG Pipeline | X/10 | ... |
| 15. Predictive Risk Analysis | X/10 | ... |
| **OVERALL** | **X/150** | |

---

### 🔴 P0 — DEPLOY BLOCKERS (fix before any production deployment)
For each: [Domain] | [File:Line] | [Issue] | [Exact fix with code]

### 🟠 P1 — FIX THIS SPRINT
For each: [Domain] | [File:Line] | [Issue] | [Fix approach]

### 🟡 P2 — NEXT SPRINT
For each: [Domain] | [File:Line] | [Issue] | [Fix approach]

### 🟢 P3 — TECH DEBT BACKLOG
Grouped by domain, 1-line each

---

### ⚡ PREDICTIVE RISK REGISTER
| Risk | Likelihood | Impact | Timeline | Mitigation |
|------|-----------|--------|----------|------------|
| [risk description] | High/Med/Low | High/Med/Low | 3mo/6mo/1yr | [one-line fix] |

---

### 🧠 LOGICAL ARCHITECTURE IMPROVEMENTS
(These are not bugs — they are structural changes that will make MediWard meaningfully better)

For each suggestion:
- **What to change**
- **Why it's better** (clinical workflow / performance / maintainability)
- **Estimated effort** (hours)
- **Priority** (High / Medium / Low)

---

### 📋 ORDERED ACTION ITEMS
Numbered list, prioritized by: (severity × clinical risk × implementation ease)
Start with items that are: high severity + low effort first

---

## IMPORTANT INSTRUCTIONS

1. **Every finding must have a file path.** "The RLS policies may have gaps" is not acceptable. "`supabase/migrations/20240301_patients.sql:45` — patients table has no RLS policy for SELECT" is acceptable.

2. **Every P0/P1 must have runnable code.** Not pseudocode. Actual TypeScript/SQL/JSON that can be copy-pasted.

3. **Never skip a domain because "it looks fine."** Check it. If it's fine, say "✅ PASS — [what you verified]" for each checklist item.

4. **Score consistently.** A 7/10 in Domain 2 means: RLS present on all tables, tenant_id propagated, but 1-2 Edge Functions missing tenant scoping. Use the rubric, not vibes.

5. **Clinical context awareness.** When suggesting fixes, consider: this app is used during ward rounds by junior residents under time pressure. Solutions that add friction (extra confirmation dialogs, extra clicks) have real clinical cost. Prefer background validation over foreground blocking.

6. **Logical improvement suggestions must be grounded in MediWard's actual features.** Do not suggest generic "add caching" — suggest specifically "add Redis caching for ward census because it's queried every 30s by 10+ concurrent users during morning rounds."

Begin the audit now. Read files first, then produce the report.
