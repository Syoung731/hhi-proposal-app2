# JobTread Budget-Push — Status & Handoff (2026-06-20)

## Current state: ✅ LIVE & WORKING in production
The "Push to JobTread" feature (estimate → JobTread customer/job + Room>Trade>Item
budget, via a QStash background worker) is **shipped to prod** (app.hhi-builders.com)
and **verified end-to-end** — a small job pushed successfully on 2026-06-20 after the
fixes below. Full design/history is in memory `project_jobtread_write.md`
(authoritative; read it for any detail not here).

## ⚠️ PENDING — do these next
1. **Push `6976b0b`** (stuck-job hardening) — committed locally, **NOT on prod**.
   `main` is 1 ahead of `origin/main`. It's safe (tsc-clean): in-flight guard
   ignores >10-min-old jobs; modal flags a stuck-QUEUED job instead of spinning.
   Just `git push origin main` (triggers a Vercel deploy).
2. **Clean up empty Design jobs** in JobTread from the failed test attempts
   (24 Glenmoor Place, 15 Heather Lane) — delete them in JobTread.
3. **Verify a LARGE push in prod** (e.g. the ~1,123-line whole-home) completes
   within the 255s time-budget. Only a SMALL job is verified in prod so far. If a
   big one times out, it rolls back (no orphan) and the user can push fewer lines
   via the include/exclude checkboxes, or we move to chunked pushing.
4. **Estimate-quality backlog** (separate track, memory `project_estimate_quality_backlog`):
   (a) AI doesn't always split assemblies into Material vs Labor lines; (b) zero
   margin on materials. Deferred; revisit when ready.
5. **Deferred Phase-3 items:** catalog linkage (data-backed defer — ids don't map),
   multi-location new-job picker (review finding #13 — currently picks first location).

## Prod gotchas that bit us (don't regress)
- **DB connections:** Prisma `PrismaPg` pool capped `max:3` in `app/lib/prisma.ts`.
  Prod `DATABASE_URL` = Neon **pooled** (`-pooler`) host; `DIRECT_URL` = direct
  (migrations only). Default pool (10) + direct endpoint + deploy churn = prod
  outage. Don't raise the cap or switch DATABASE_URL off the pooler.
- **QStash worker routes MUST be in `proxy.ts` `isPublicRoute`** (Clerk allowlist),
  or Clerk 404s QStash's unsigned POST. `/api/jobs/jobtread-push` is now listed.
- **Prod QStash signing keys** (`QSTASH_CURRENT_SIGNING_KEY`/`NEXT_SIGNING_KEY`)
  must be the **Upstash cloud** account's keys matching `QSTASH_TOKEN` — NOT the
  dev `qstash-cli` proxy keys. Wrong keys → worker 403s every delivery → job
  stuck QUEUED. (This was the final blocker; user fixed it in Vercel env.)
- **After any schema change:** restart `npm run dev` (stale Prisma client); prod
  applies migrations via `vercel-build` (`prisma migrate deploy && next build`).

## Key live-confirmed JobTread facts
- `createCostItem` requires BOTH `costCodeId` AND `costTypeId`.
- Cost-item creation MUST be serial (`ITEM_CONCURRENCY=1`) — concurrent creates
  under one cost group 400.
- Deleting a parent (room) cost group cascades to child trade groups + items.
- AI notes → cost-item "Internal Notes" custom field id `22P68yhCDCde`.
- ALLOWANCE lines → `allowanceType: "costAndFee"`.
- Cost-code defaults: Material→`- Material`; Install/Labor→`- Subcontract`;
  Demolition + Construction Clean default Subcontract; trade aliases + Misc fallback.

## Key files
`app/lib/jobtread/budget-push/` (types, merge, cost-code-resolver, dry-run,
pave-payload, push-service, push-actions, push-job, push-memory) ·
`app/api/jobs/jobtread-push/route.ts` (QStash worker) ·
`app/admin/projects/[id]/jobtread-push/PushToJobTreadModal.tsx` (modal) ·
`app/lib/prisma.ts` (pool cap) · `proxy.ts` (auth allowlist) ·
`docs/training/jobtread-budget-push.md` (user training).

## Commit anchors
`c46de4f` first prod ship · `0d35f9c` pool cap · `891d75f` middleware allowlist ·
`6976b0b` stuck-job hardening (UNPUSHED).
