# MediWard Supabase Safety Checklist

Read this before ANY database-related change. MediWard is multi-tenant and holds
patient data — a single missing policy can leak one hospital's patients to another.

## Every new table
- [ ] `tenant_id` (or equivalent) column, NOT NULL, FK to the tenants table
- [ ] RLS ENABLED (`alter table X enable row level security;`) — in the same migration
- [ ] Policies for select / insert / update / delete, each scoped to the user's tenant
- [ ] `created_at`, `updated_at` timestamps
- [ ] Migration file committed; never change schema only through the dashboard

## Every query change
- [ ] Still tenant-scoped? (RLS covers it, but don't rely on client filters alone)
- [ ] Uses the typed client helper in `src/lib/`, not an inline query in a component
- [ ] Errors handled — a failed save must be visible to the user, never swallowed

## Auth
- Supabase Auth ONLY. Never custom password hashing, never roll your own sessions.
- Role/permission checks server-side (RLS or edge functions), never trust client role flags.
- Service-role key: server/edge functions only. If it appears anywhere in `src/`, that is a critical bug.

## Secrets
- All keys in `.env` files; `.env*` in `.gitignore`.
- Only `VITE_`-prefixed variables reach the client — and only the anon key belongs there.
- If a secret was ever committed: rotate it, don't just delete the line.

## Migrations & data safety
- One migration per logical change; never edit an already-applied migration.
- Destructive migrations (drop column/table) need an explicit backup note and user confirmation.
- Test migrations against a local/staging Supabase before production.

## pgvector / OrthoAI
- Embedding tables follow the same tenant + RLS rules.
- Ingestion scripts run server-side with service key — never from the app.

## Red flags to catch in review
- A table without RLS
- `select *` returning patient data to a list view that needs 3 columns
- Client-side-only permission checks
- Any `service_role` string in frontend code
- Clinical values stored as free text where a typed/validated column is possible
