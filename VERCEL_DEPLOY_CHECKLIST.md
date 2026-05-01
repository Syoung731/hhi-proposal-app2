# Vercel Deploy Checklist — First Deploy to `app.hhi-builders.com`

This checklist covers the **first** production deploy of `hhi-proposal-app2` to Vercel. It is not a runbook for ongoing deploys — once the initial setup is done, subsequent deploys are git-push-driven and require no env-var changes.

Steve runs every step manually. The checkboxes are a paper trail, not an automation contract.

---

## Order of Operations (Read This First)

The order below matters. Several steps depend on prior ones:

1. **Neon production branch must exist before the first Vercel build.** Vercel runs `prisma generate` during build; if `DATABASE_URL` points to a missing branch, the build fails before deploy.
2. **Clerk production keys must be generated before the first deploy.** Without them, every page hits an "instance keys do not match" loop. Use placeholder pk_test_/sk_test_ values during initial Vercel setup if you need to defer Clerk setup, then swap to live keys before flipping the `app.hhi-builders.com` domain live.
3. **Generate fresh `INTEGRATION_ENCRYPTION_KEY` and `PDF_RENDER_SECRET` for production** — DO NOT copy dev values. Cross-environment decryption of integration secrets is a leak vector; cross-environment PDF token forgery is a render-bypass risk.
4. **R2 production bucket and DNS CNAME can be set up in parallel with the steps above** — they don't block each other, but both must be in place before the first end-to-end smoke test.
5. **QStash production tokens** can be deferred until the first time you publish a project (the bulk-estimate flow is the first code path that needs them). Vercel will deploy without them; specific routes will 500 if hit before the tokens are configured.

---

## Section 0: Env-File Hygiene (Pre-Flight)

> **⚠️ Never commit secrets in any tracked file.** The repo's `.gitignore` excludes `.env*` with a `!.env.example` exception, so `.env`, `.env.local`, and `.env.production` are all ignored. **But the files can still exist locally**, and a stray `.env` will shadow `.env.local` in some toolchains. The convention this repo follows:
>
> | File | Purpose | Tracked? |
> |---|---|---|
> | `.env.example` | Documentation. Placeholder values only. | ✅ tracked |
> | `.env.local` | Real dev secrets on your machine. | ❌ ignored |
> | `.env` | **Do not use.** Delete if it exists locally. | ❌ ignored |
> | `.env.production` | **Do not use.** Production values live in Vercel's env-var UI, not in any file. | ❌ ignored |
>
> If `git status` ever shows a `.env*` file (other than `.env.example`), stop and investigate before committing.

- [ ] Confirm no `.env` file exists at the repo root (`Test-Path .env` returns `False`)
- [ ] Confirm `.env.local` exists and is properly populated for dev
- [ ] Confirm `.gitignore` still has `.env*` with `!.env.example`

---

## Section 1: Vercel Project Setup

- [ ] In Vercel, create a new project from the `Syoung731/hhi-proposal-app2` GitHub repo
- [ ] Set production branch (`proposal-v2` or whatever's current at deploy time)
- [ ] Framework preset: **Next.js** (auto-detected)
- [ ] Node version: 20.x (or whatever `package.json` engines specifies)
- [ ] Build command: `npm run build` (default)
- [ ] Output directory: `.next` (default)
- [ ] Install command: `npm install` (default)
- [ ] Verify the project builds locally first: `npm run build` should succeed before pushing to Vercel

---

## Section 2: Environment Variables in Vercel

Set in **Vercel → Project Settings → Environment Variables**. Apply to **Production** scope (and **Preview** if you want preview deploys to work). Mark every secret as **Encrypted** (the lock icon).

The full manifest lives in `.env.example`. The list below is grouped for set-up convenience.

### 2.1 Database — Neon Production Branch

> Setup order: create the Neon branch BEFORE adding these vars, then run migrations against it (Section 6).

- [ ] `DATABASE_URL` — Neon **pooler** URL for the production branch
- [ ] `DIRECT_URL` — Neon **direct** URL for the production branch (no pooling — required by `prisma migrate`)

### 2.2 Authentication — Clerk Production Keys

> ⚠️ **Both keys MUST be from the same Clerk app and same environment (production).** Mismatched keys cause an "infinite redirect loop" that the C.5 investigation traced to dev `.env.local` having two pairs of Clerk keys (lines 4-5 and 13-14 of an earlier `.env.local` carried two test instances). In production: pick one Clerk app, generate live keys, paste both into Vercel.

- [ ] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — `pk_live_*` from Clerk production environment
- [ ] `CLERK_SECRET_KEY` — `sk_live_*` from same Clerk production environment
- [ ] `NEXT_PUBLIC_CLERK_SIGN_IN_URL` — `/sign-in`
- [ ] `NEXT_PUBLIC_CLERK_SIGN_UP_URL` — `/sign-up`

### 2.3 App URL — Aggressive Callout

> **⚠️ `NEXT_PUBLIC_APP_URL` MUST be set in production.** Multiple code paths (`app/proposals/[snapshotId]/pdf/route.ts`, `app/lib/ai/estimate-job.ts`, Rendr import actions, the email-send delivery action) silently fall back to `"http://localhost:3000"` when this variable is unset. The fallback means a production deploy without this variable would:
>
> - **PDF generation breaks silently** — Playwright drives `localhost:3000` from the Vercel runtime, which doesn't exist there → PDFs fail or hang.
> - **Rendr imports break** — server actions self-fetch `localhost:3000/api/rendr/...` → 404.
> - **Email sends break** — the share-link URL in outgoing emails points to `localhost:3000` → recipients can't open the proposal.
>
> No error is thrown when the variable is unset. This is the highest-priority env var to verify after deploy.

- [ ] `NEXT_PUBLIC_APP_URL` — `https://app.hhi-builders.com` (no trailing slash, https only)

### 2.4 Encryption Secrets — Generate Fresh

> Generate each with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Do not copy dev values.** Different dev/prod values protect against cross-environment decryption (if a dev key leaks, prod data stays sealed) and prevent dev-minted PDF tokens from working in production.

- [ ] `INTEGRATION_ENCRYPTION_KEY` — fresh 32-byte hex, encrypts JobTread/Rendr/Anthropic/Gemini API keys stored in DB
- [ ] `PDF_RENDER_SECRET` — fresh 32-byte hex, HMAC for the headless-Chromium PDF render bypass token

### 2.5 Object Storage — Cloudflare R2 Production Bucket

> Setup order: create the R2 bucket BEFORE adding these vars (Section 7).

- [ ] `R2_ENDPOINT` — `https://<account-id>.r2.cloudflarestorage.com`
- [ ] `R2_ACCESS_KEY_ID` — production access key
- [ ] `R2_SECRET_ACCESS_KEY` — production secret
- [ ] `R2_BUCKET` — production bucket name (separate from dev)
- [ ] `R2_PUBLIC_BASE_URL` — public URL (use a custom domain like `media.hhi-builders.com` once configured; otherwise the `pub-<hash>.r2.dev` Cloudflare default)

### 2.6 Background Jobs — Upstash QStash

> Setup order: configure Upstash production endpoint BEFORE adding these vars (Section 5).

- [ ] `QSTASH_TOKEN` — production token
- [ ] `QSTASH_URL` — `https://qstash.upstash.io`
- [ ] `QSTASH_CURRENT_SIGNING_KEY` — for verifying webhook signatures
- [ ] `QSTASH_NEXT_SIGNING_KEY` — for verifying during key rotation

### 2.7 Optional — Set if needed

- [ ] `ADMIN_EMAILS` — comma-separated emails to relax the demotion guard (allows the only employee admin to demote themselves without first onboarding another admin)
- [ ] `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` — set if you want address autocomplete on the Overview tab to work in production
- [ ] `NEXT_PUBLIC_ZILLOW_EXTENSION_STORE_URL` — set once the Zillow Importer extension is published to the Chrome Web Store
- [ ] `ENABLE_DIRECT_ZILLOW_HANDSHAKE`, `ZILLOW_EXTENSION_ALLOWLIST` — set if using the Zillow extension

> **Anthropic and Gemini API keys** are normally configured via the admin UI (Settings → Integrations) and stored encrypted in the DB. Set the env vars only as fallbacks for `/api/rendr/match-rooms` (Anthropic) and the seed script (Gemini).

### 2.8 DEV-ONLY — Confirm These Are NOT Set in Production

> ⚠️ Setting these in Vercel will silently corrupt audit attribution, attempt phone-home to non-existent local services, or leak debug logs. Verify each is **absent** from the Vercel env-var list:

- [ ] `DEV_EMPLOYEE_ID` — must NOT exist
- [ ] `HHI_DEV_CONTEXT_*` (`_ENABLED`, `_BASE_URL`, `_PORT`, `_DB`) — must NOT exist
- [ ] `HHI_TASK_STATUS` — must NOT exist
- [ ] `DEBUG_JOBTREAD_SYNC` — must NOT exist
- [ ] `SYNC_ONE_ROW_TEST` — must NOT exist

---

## Section 3: DNS Configuration

- [ ] In your domain registrar (e.g., Cloudflare DNS, GoDaddy), add a CNAME record:
  - **Name:** `app`
  - **Value:** `cname.vercel-dns.com`
  - **TTL:** auto / 5 minutes
- [ ] In **Vercel → Project Settings → Domains**, add `app.hhi-builders.com`
- [ ] Wait for DNS propagation and Vercel SSL provisioning (typically <15 min). Vercel shows a green checkmark on the domain when ready.

---

## Section 4: Clerk Production Setup

- [ ] In **Clerk dashboard**, create or switch to the **Production environment** for the HHI Builders app
- [ ] **Domains** → add `app.hhi-builders.com` to allowed origins
- [ ] **Paths** → set:
  - Sign-in URL: `https://app.hhi-builders.com/sign-in`
  - Sign-up URL: `https://app.hhi-builders.com/sign-up` (the `/sign-up` page renders an "invitation only" notice — see [app/sign-up/[[...sign-up]]/page.tsx](app/sign-up/[[...sign-up]]/page.tsx))
  - After-sign-in URL: `https://app.hhi-builders.com/admin`
  - After-sign-out URL: `https://app.hhi-builders.com/sign-in`
- [ ] **Restrictions** → confirm self-signup is **disabled** (Clerk dashboard → User & Authentication → Email, Phone, Username → Sign-up). The deployment is invitation-only.
- [ ] **API Keys** → generate `pk_live_*` and `sk_live_*`; copy both into the Vercel env vars from Section 2.2
- [ ] **Users** → manually add Steve, Dalton, Danielle as users (or send Clerk invitation emails)

---

## Section 5: QStash Production Setup

- [ ] In **Upstash console**, switch to or create the production QStash endpoint
- [ ] **URL allowlist** → add `https://app.hhi-builders.com/api/jobs/cope-generate`, `.../api/jobs/estimate-room`
- [ ] **Schedules** → none yet (cron-based scheduled jobs are not in Pass 1)
- [ ] Copy production `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` to the Vercel env vars from Section 2.6
- [ ] Set `QSTASH_URL` to `https://qstash.upstash.io` (Upstash default)

---

## Section 6: Neon Production Branch

- [ ] In **Neon dashboard**, create a `production` branch (separate from `main` / dev)
- [ ] Apply schema migrations to the production branch:
  ```powershell
  $env:DIRECT_URL = "<neon-direct-url-for-production-branch>"
  npx prisma migrate deploy
  ```
- [ ] Verify the production schema matches expected state via Prisma Studio against the production branch:
  ```powershell
  $env:DATABASE_URL = "<neon-pooler-url-for-production-branch>"
  npx prisma studio
  ```
- [ ] Confirm `DATABASE_URL` and `DIRECT_URL` in Vercel point to the production branch (Section 2.1)
- [ ] **Optional seed data** — run `npx prisma db seed` against the production branch only if you want the initial company-settings, brand backgrounds, etc. seeded. This is destructive on existing rows; safest only on an empty production branch.

---

## Section 7: Cloudflare R2 Production Bucket

- [ ] In **Cloudflare R2 dashboard**, create a production bucket (separate from the dev bucket — do not reuse)
- [ ] **CORS** → configure to allow `https://app.hhi-builders.com` for `GET`, `PUT`, `POST`, `DELETE`, `OPTIONS`
- [ ] **API tokens** → generate production access keys with read+write scope on the new bucket; copy to the Vercel env vars from Section 2.5
- [ ] **Public URL** → either use the auto-generated `pub-<hash>.r2.dev` URL or configure a custom domain (e.g., `media.hhi-builders.com`). Update `R2_PUBLIC_BASE_URL` accordingly.
- [ ] If using a custom domain, add the corresponding `remotePatterns` entry to `next.config.ts` and redeploy. The current config allows `pub-2d4238639a274f32ba8641274e00f39c.r2.dev` and `media.hhi-builders.com`.

---

## Section 8: Email — Google Workspace Domain-Wide Delegation (DWD)

> Email config is stored in the **DB** (`Integration` table), not in env vars. Set up via the admin UI after first deploy.

- [ ] In **Google Workspace Admin**, configure DWD for the service account that will send proposal emails (one-time per Workspace tenant)
- [ ] Sign into the deployed app as Steve
- [ ] Navigate to **Settings → Integrations → Google Workspace**
- [ ] Paste service-account JSON, configure delegated user (typically `proposals@hhi-builders.com`)
- [ ] Test send (Settings → Integrations → Google Workspace → Test)
- [ ] Optional: set `EMPLOYEE_DAILY_EMAIL_LIMIT` in Vercel env if you want to override the code default

---

## Section 9: First Deploy

- [ ] Trigger first deploy: either push to the production branch or click "Redeploy" in Vercel after env vars are set
- [ ] Watch build logs for errors. Common first-deploy failures:
  - `prisma migrate deploy` not run yet → DB schema mismatch → fix Section 6 first
  - `DATABASE_URL` typo / wrong branch → check Section 2.1
  - Clerk keys mismatched → check Section 2.2
  - Build OOM on Vercel default 1GB → upgrade to Pro or split build
- [ ] Confirm deploy succeeds (green checkmark in Vercel)
- [ ] Confirm `https://app.hhi-builders.com` resolves and serves the app

---

## Section 10: Post-Deploy Smoke Tests

Run these in order. Each step assumes the previous succeeded.

### 10.1 Auth flow (real Clerk UI from D4.5)

- [ ] Visit `https://app.hhi-builders.com` (signed out, fresh incognito browser)
- [ ] Confirm redirect to `https://app.hhi-builders.com/sign-in`
- [ ] Confirm Clerk's actual sign-in form renders (not the dev placeholder text "Authentication temporarily disabled")
- [ ] Sign in as Steve using the Clerk live key
- [ ] Confirm redirect to `/admin` and the admin home loads
- [ ] Confirm the orange-bar header shows: HHI Builders logo on the left, nav + display name + UserButton on the right
- [ ] Click the **UserButton** → dropdown opens with "Manage account" and "Sign out"
- [ ] Click **Sign out** → redirects to `/sign-in` and shows the real Clerk sign-in form again
- [ ] Sign back in as Steve → admin loads normally
- [ ] **Acceptance:** the full sign-in / sign-out / sign-back-in cycle completes without DevTools cookie clearing

### 10.2 Auth gating (regression check from C.5)

- [ ] In an **incognito window**, visit `https://app.hhi-builders.com/admin/dashboard` → must redirect to `/sign-in` (not 404, not error)
- [ ] In an **incognito window**, visit `https://app.hhi-builders.com/proposals/some-id` → must redirect to `/sign-in`
- [ ] Visit `https://app.hhi-builders.com/api/jobs/cope-generate` directly with curl → 401 from QStash signature verification (NOT a redirect — webhook routes bypass Clerk)

### 10.3 Project + publish + PDF flow (regression check from C.5 + C.6)

- [ ] Sign in as Steve
- [ ] Open an existing project (or create one)
- [ ] Navigate to the **Deck** tab → confirm the deck builder loads with no "Unknown slide type" pages
- [ ] Click **Publish new version** → confirm a new PublishedSnapshot is created
- [ ] On the publish tab, click **Download PDF** → confirm a PDF downloads with:
  - Branding (logo, colors, company info) on cover
  - No "Unknown slide type" pages
  - No duplicate slides
  - Inspiration slide either renders photos OR shows a clean panel (no "No hero photo selected" / "Photo 1" / "Photo 2" placeholder text)

### 10.4 Snapshot share link (auth gate works)

- [ ] Copy the share link from the publish tab
- [ ] Open it in the same browser (still signed in) → confirm the proposal renders
- [ ] Open it in **incognito** → confirm redirect to Clerk sign-in (snapshots are Clerk-gated in Pass 1)

### 10.5 Multi-user check

- [ ] Sign in as Dalton in a separate incognito session → confirm he can access projects and the deck builder
- [ ] Confirm Dalton sees his own UserButton state, not Steve's

### 10.6 Email send (if DWD is configured)

- [ ] On a published snapshot, click **Send to client**
- [ ] Confirm the email lands in the recipient's inbox
- [ ] Confirm the share link in the email points to `https://app.hhi-builders.com/...` (NOT `localhost:3000` — that would mean `NEXT_PUBLIC_APP_URL` is unset; see Section 2.3)

---

## Known Dev-Only Artifacts (Should NOT Appear in Production)

### Clerk session token refresh loop

The warning `Clerk: Refreshing the session token resulted in an infinite redirect loop. This usually means that your Clerk instance keys do not match` appears in dev when:

- Two pairs of `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are declared in `.env.local` (last-writer-wins shadowing — fixed during Pass 1 development)
- Cookies from a stale Clerk session linger across key rotations

In production with stable, consistent live keys and a clean cookie state on first visit, this should never appear. If it does in prod:

1. Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in Vercel are from the same Clerk app, same environment
2. Have the affected user clear cookies for `app.hhi-builders.com` and try again

### Dev-context warnings

`HHI_DEV_CONTEXT_ENABLED` should be unset in production. If you see logs about phoning home to `127.0.0.1:3999` or a missing dev-context service, an env var leaked from dev — purge it from the Vercel env-var list.

### `console.warn` from `backfillMissingDefaults`

If logs show `[backfillMissingDefaults] Skipping unknown slide type: '...'`, it means a `DeckSlide` row in the DB has a type string the renderer doesn't know about. This is the C.6 regression guard at work; investigate the offending row but it's not a blocker.

---

## Rollback Plan

- [ ] **Bad deploy:** Vercel → Deployments → "Promote previous deployment" rolls back in one click. DNS doesn't need to change.
- [ ] **Bad migration:** Neon → branches → restore from earlier point-in-time on the production branch (Neon stores branch history). Do NOT delete and recreate the production branch — you'll lose the audit history.
- [ ] **Bad DNS:** in your registrar, change the CNAME target or remove it; takes effect after the registrar's TTL expires.
- [ ] **Compromised secret (leaked Clerk / R2 / encryption key):** rotate in the source dashboard (Clerk / Cloudflare / generate-fresh-locally for `INTEGRATION_ENCRYPTION_KEY`), update Vercel env, redeploy. **`INTEGRATION_ENCRYPTION_KEY` rotation is destructive** — every encrypted Integration row in the DB needs to be re-encrypted with the new key, or the underlying secrets become unrecoverable. Plan a maintenance window if rotating.

---

## Notes

- **Subsequent deploys** are git-push-driven once Section 1 is done. No env-var changes unless you're adding a feature that needs a new variable; in that case update `.env.example` first, then add the corresponding Vercel env var, then merge the code change.
- **Preview deploys** can share the production env vars or use a separate preview env var set in Vercel. For Pass 1's private-team deploy, sharing is acceptable.
- **DB migrations on subsequent deploys** are not currently auto-run by the build. After merging a migration, run `npx prisma migrate deploy` manually against the production branch. (Wiring this into the build is a future-phase decision — automatic migrations on deploy can be a sharp edge if a migration fails midway.)
- **Pass 1 is the foundation.** Multi-tenancy, RBAC, public client-share token flows, and audit-trail attribution are deferred to later phases — see `WEB_READINESS_PASS_1_AUTH.md` Section 9 for the open questions captured during Pass 1.
