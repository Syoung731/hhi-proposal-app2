# Engineering Assembly KB + Estimate Accuracy — STATUS (read first after compaction)

_Last updated: 2026-06-16. This is the authoritative "where we are" file for the
estimate-side work stream. Companion docs: `engineering-assembly-tags.md` (tag
vocabulary + per-assembly assignments), `engineering-kb-extraction-guide.md`
(the Claude.ai project guide), `training/engineering-assembly-kb.md` (admin
training). The deck/presentation work is tracked separately in
`presentation-studio-plan.md`._

## TL;DR
The AI estimate now retrieves **engineer-vetted structural assemblies** from a
curated KB, **asks the right structural-approach questions up front** (foundation
tie-in, drainage, ceiling finish) for exterior/addition sections, builds a
**complete load path**, and stops the interior-template / double-count errors.
Reviewed end-to-end on a real Screened Porch addition + Bahama Shutters + COPE —
**all verified correct.** The estimate-accuracy arc is CLOSED.

## Branch / ship state
- Branch **`feat/engineering-assembly-kb`** = **17 commits ahead of `main`**, tree clean, `tsc` clean.
- **NOT pushed / NOT merged.** Local only. Production is untouched.
- **THE ONE OPEN DECISION:** merge `feat/engineering-assembly-kb` → `main` to ship to prod.
  Fast-forward; the additive migration (`20260615204620_add_engineering_assembly_kb` =
  3 new tables only, ZERO alter/drop of existing tables) deploys safely via the
  Vercel build's `prisma migrate deploy`. Awaiting Steve's go after his own pass.

## What's built (all committed on the branch)
- **Schema (additive):** `EngineeringAssembly` (canonical) + `EngineeringAssemblyComponent` + `EngineeringAssemblySource` (provenance/history) + `AssemblyReviewStatus` enum. No FK on existing tables (deliberate — see Deferred).
- **Retrieval:** `app/lib/ai/engineering-assemblies.ts` — deterministic token-overlap matcher (singularize + synonyms), **fails closed**, `server-only`. MAX 8 assemblies injected into the UNCACHED estimate prompt block.
- **Prompt integration:** `generate-room-estimate.ts` fetches assemblies + threads `SectionType.category`; `ai-estimate-prompt.ts` system rules = use-vetted-assemblies, **load-path completeness** (roof on columns MUST have a carrying beam), **section-category discipline** (EXTERIOR/ADDITION: no interior-only items; require gutters/flashing; demo reflects existing material), **one finished ceiling per surface**, **include every scoped finish**, **quantity sanity checks**.
- **Clarification questions:** `review-prompts.ts` `ROOM_REVIEW_SYSTEM_PROMPT_SALES` — for EXTERIOR/ADDITION sections only, asks up to 2-3 budget-material structural-APPROACH questions (foundation tie-in, drainage, roof/ceiling finish) **ADDITIVE over** the 3-7 budget-question cap (deep engineering stays excluded — KB handles it). Both reviewers already pass category in → prompt-only change. Answers flow into the estimate via `buildClarificationsSection`.
- **Admin:** Settings → Engineering Assemblies (`app/admin/settings/engineering-assemblies/`) — list/edit/approve/reconcile + source-drawing upload.
- **Seed:** `prisma/seed-engineering-assemblies.ts` = **43 canonical assemblies / 229 components / 76 sources** reconciled from 7 parsed drawing sets (Chaplin, Heath, Genoa, Sycamore, 40 Planters ×2, Mooring Buoy). reviewStatus APPROVED. Re-run: `npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs prisma/seed-engineering-assemblies.ts`
- **Local-dev quality-of-life fixes** (also on branch): inline estimate fallback when the QStash proxy is down (no second terminal needed); JSON inch-mark recovery in the parser; prisma staleness-guard registers the new model delegates; sslmode→verify-full (silences pg warning); html/body suppressHydrationWarning (browser-extension noise); rooms delete-section transport-error handling.

## Verified done (2026-06-16 review)
- **Porch v3 ($77.4k):** one ceiling (double-count gone), brick border restored, foundation scoped to 56 LF open sides, gutters/drainage, carrying beam + house-side ledger, H2.5A=rafters, no phantom items, 19/32 OSB. The 3 new structural questions surfaced + were answered.
- **Bahama Shutters ($4.85k):** complete for the 2-shutter scope.
- **COPE ($8.8k):** complete & correct. **Decision: engineering + survey live in the DESIGN PHASE / RETAINER, NOT COPE** (COPE = construction overhead).

## Residuals (estimator-level, NOT blocking — normal per-estimate human review)
- Porch: the **step-down-to-yard** line still doesn't auto-generate (the "include scoped finishes" rule caught the brick border but not the step). Estimator adds it.
- Bahama: verify hurricane-rated mounting is in "Install"; unit price (~$1,500/shutter) may be light for custom 6×8 hurricane-rated.

## Deferred (by design)
- **`ENGINEERED` line-item source tag + nullable `assemblyId` FK on EstimateLineItem + parser qty cross-check** — held out of Phase 1+2 so the migration touches NO existing table (Steve's "don't kill prod data"). A clean follow-up once the core is proven in prod.
- **Dev-inline COPE auto-trigger** — in dev-inline mode COPE won't auto-fire (publishes to the down QStash proxy); use the manual COPE button. Small follow-up if wanted.

## Standing constraints (unchanged)
- **Production runs a SEPARATE database** from local dev (prod project ids don't exist in dev DB; prod env vars are Vercel-Sensitive/not pullable). Prod BrandIcon cache is cold by design.
- Steve reviews on **localhost — never spin up preview MCP servers**.
- **Auto-commit authorized** (commit without asking, logical groups, conventional messages, no `Co-Authored-By` trailer, flag ⚠️ high-risk) — but **NEVER push without an explicit push instruction**; Steve runs pushes/deploys.
- `tsc --noEmit` clean after every change; `prisma` rules from CLAUDE.md (never `db pull`, never `migrate reset`); JobTread read-only.

## Other open threads (separate work streams, Steve directs)
- **Presentation Studio** (deck builder, already in prod): training-overlay research is DONE + parked pending the Loom session; the master-training program (Loom transcript + `docs/training/*.md`) awaits Steve's Loom recording. See `presentation-studio-plan.md`.
- Housekeeping from `presentation-studio-plan.md` (remove studio flag gates, delete merged branches, MED/LOW verified-gap backlog).
