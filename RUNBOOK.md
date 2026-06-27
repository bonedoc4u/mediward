# MediWard Rollback Runbook

> **On-call response guide.** Every section has exact CLI commands and an ETA.
> Start with the layer that changed last. Most incidents are caught in staging; 
> if production is affected, always roll the frontend first (< 2 min), then DB.

---

## Table of Contents
1. [Frontend rollback (Vercel)](#1-frontend-rollback-vercel)
2. [Database rollback (Supabase)](#2-database-rollback-supabase)
3. [Edge Functions rollback](#3-edge-functions-rollback)
4. [Android rollback (Play Store)](#4-android-rollback-play-store)
5. [Full-stack incident checklist](#5-full-stack-incident-checklist)

---

## 1. Frontend Rollback (Vercel)

**ETA: < 2 minutes.** Vercel keeps every previous deployment indefinitely.

### Option A — Vercel dashboard (fastest)

1. Go to `vercel.com → MediWard project → Deployments`
2. Find the last known-good deployment (green ✓)
3. Click `…` → **Promote to Production**
4. Done — DNS updates in ~10 seconds

### Option B — Vercel CLI

```bash
# 1. List recent deployments
vercel list --prod

# Output:
#   https://mediward-abc123.vercel.app   • 2 min ago  (current, broken)
#   https://mediward-def456.vercel.app   • 3 hours ago (last good)

# 2. Promote the previous good deployment
vercel promote https://mediward-def456.vercel.app --token=$VERCEL_TOKEN

# 3. Verify
curl -s https://mediward.app/health | jq .version
```

### Option C — GitHub Actions re-deploy (if specific commit needed)

```bash
# Trigger a re-deploy of a specific tag
gh workflow run deploy-production.yml --ref v1.2.2
```

**Verification:** open `https://mediward.app` in incognito — confirm version matches previous build.

---

## 2. Database Rollback (Supabase)

**ETA: 5–15 minutes.** DB rollbacks are the most dangerous — always backup first.

### Step 0 — Take a point-in-time backup before touching anything

```bash
# Supabase daily backups are automatic (Pro plan).
# Verify the last backup timestamp before proceeding:
supabase projects list  # find your project ref
supabase db dump --project-ref $PROD_PROJECT_REF -f backup-$(date +%Y%m%d-%H%M%S).sql
```

### Step 1 — Write the rollback migration

Copy the appropriate template from `supabase/migrations/rollback_templates.sql`
and save as a new migration file:

```bash
# Name format: timestamp_rollback_<description>.sql
supabase migration new rollback_add_unit_column
# Opens: supabase/migrations/YYYYMMDDHHMMSS_rollback_add_unit_column.sql
# Paste the rollback SQL from rollback_templates.sql
```

### Step 2 — Test the rollback on staging FIRST

```bash
supabase db push --project-ref $STAGING_PROJECT_REF --password "$STAGING_DB_PASSWORD"
# Verify the staging app still works before touching production
```

### Step 3 — Apply to production

```bash
supabase db push --project-ref $PROD_PROJECT_REF --password "$PROD_DB_PASSWORD"
```

### Step 4 — Verify

```bash
# Check migrations table to confirm rollback applied
supabase db remote commit --project-ref $PROD_PROJECT_REF
supabase migration list --project-ref $PROD_PROJECT_REF
```

---

### ⛔ If the rollback migration itself fails

This means the rollback SQL has an error, or the DB state is more broken than expected.

**Do not retry blindly.** Follow this sequence:

```bash
# 1. Open a direct psql connection to production (from Supabase dashboard → Database → Connection string)
psql "$PROD_DATABASE_URL"

# 2. Check what migration is stuck
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;

# 3. If the failed migration left the DB in a partial state, roll back the transaction:
ROLLBACK;

# 4. If the schema is corrupted, restore from the Point-in-Time backup:
#    Supabase dashboard → Database → Backups → Restore to point in time
#    (Select the timestamp from Step 0 above)

# 5. After restore, re-push only the migrations that were clean:
supabase db push --project-ref $PROD_PROJECT_REF
```

**Escalate to Supabase support** if PITR restore is needed:
`supabase.com/support` — include your project ref and the exact error.

---

## 3. Edge Functions Rollback

**ETA: 3 minutes.** Supabase stores deployed function code but not previous versions.
This is why Edge Functions must be in version control.

### Redeploy the previous version from Git

```bash
# 1. Find the last known-good commit
git log --oneline supabase/functions/

# 2. Checkout that commit's function code
git show <good-commit>:supabase/functions/<function-name>/index.ts \
  > supabase/functions/<function-name>/index.ts

# 3. Redeploy
supabase functions deploy <function-name> \
  --project-ref $PROD_PROJECT_REF \
  --no-verify-jwt   # only if the function doesn't need auth

# 4. Test
curl -X POST https://$PROD_PROJECT_REF.functions.supabase.co/<function-name> \
  -H "Authorization: Bearer $PROD_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### If the function is causing prod traffic issues — disable it immediately

```bash
# Delete the function (removes the endpoint, returns 404 — apps must handle gracefully)
supabase functions delete <function-name> --project-ref $PROD_PROJECT_REF

# Redeploy when fixed
supabase functions deploy <function-name> --project-ref $PROD_PROJECT_REF
```

### List all deployed functions and their updated timestamps

```bash
supabase functions list --project-ref $PROD_PROJECT_REF
```

---

## 4. Android Rollback (Play Store)

**ETA: 5 minutes to halt; up to 24 hours for full rollout reversal.**
Google Play does not support instant rollback — you halt the current release
and promote the previous one.

### Step 1 — Halt the current rollout immediately

```bash
# Via Google Play Console CLI (fastlane supply)
bundle exec fastlane supply --track production --rollout 0 \
  --json_key google-play-key.json \
  --package_name com.mediward.app

# Or via dashboard:
# Play Console → MediWard → Release → Production → Edit release → Halt rollout
```

### Step 2 — Find the previous AAB to re-promote

```bash
# Previous signed AABs are stored as GitHub Actions artifacts (30-day retention).
# Download from: GitHub → Actions → mediward-v1.2.2.aab artifact

# Or from local machine if recently built:
ls android/app/build/outputs/bundle/release/
```

### Step 3 — Create a new release with the previous AAB

Google Play does not let you re-submit an AAB with the same `versionCode`.
You must increment `versionCode` even for a rollback release.

```bash
# 1. Edit android/app/build.gradle:
#    versionCode X+1   (one higher than the broken release)
#    versionName "1.2.2-hotfix"   (clearly mark it as a rollback)

# 2. Build and sign the AAB with the PREVIOUS web dist (good version)
git checkout v1.2.2 -- dist/
pnpm exec cap sync android
cd android && ./gradlew bundleRelease

# 3. Sign (see deploy-production.yml for full signing commands)
jarsigner -keystore mediward.keystore \
  -storepass $STORE_PASSWORD \
  -keypass $KEY_PASSWORD \
  app/build/outputs/bundle/release/app-release.aab \
  mediward

# 4. Upload to internal testing first, then promote to production
gh workflow run deploy-production.yml --ref v1.2.2-hotfix
```

### Step 4 — Notify users (if the broken release reached > 5% users)

```bash
# Send in-app notification via Supabase Edge Function (if you have one)
# Or post in the hospital's WhatsApp group (fastest for clinical teams)
```

---

## 5. Full-Stack Incident Checklist

Use this when you're not sure which layer is broken.

```
□ Check Vercel status: vercel.com/status
□ Check Supabase status: status.supabase.com
□ Check Android Play Console for crash rate spike

□ FRONTEND broken:
  → Roll back Vercel deployment (Section 1)
  → ETA: 2 min

□ DB schema change broke queries:
  → Apply rollback migration to staging (Section 2, Step 2)
  → Verify on staging (5 min)
  → Apply to production (Section 2, Step 3)
  → Roll back frontend if new code depends on new schema
  → ETA: 10–15 min

□ Edge Function broken (ABHA integration, labs, etc.):
  → Redeploy previous version from Git (Section 3)
  → ETA: 3 min

□ Android app crashing for all users:
  → Halt Play Store rollout (Section 4, Step 1) — 5 min
  → Build hotfix rollback release (Section 4, Step 3) — 20 min

□ After any incident:
  □ Write a post-mortem (what broke, why, how to prevent)
  □ Add a test that would have caught it
  □ Update this runbook if the steps were wrong
```

---

*Last updated: see git blame on this file.*
*Owner: on-call engineer. Escalation: Supabase support (supabase.com/support)*
