# HHI Builders Proposal App — CLAUDE.md

## What This Is
A Next.js 16 proposal deck builder for HHI Builders, a luxury
residential design-build and renovation company on Hilton Head
Island, SC. The app generates client-facing slide deck proposals
from project data, integrating AI-generated content, live pricing
from JobTread, and media from Zillow imports.

## Tech Stack
- Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- Prisma ORM + PostgreSQL (Neon)
- Cloudflare R2 for file/image storage
- Google Gemini API (Imagen 4) for AI background generation
- Clerk auth (currently disabled during development)

## Key Architecture Patterns

### Data Model Hierarchy
- Project → Rooms (sections) → each Room has a SectionType (pricing profile)
- Room pricing: SectionType rates ($/SF, per job, per each) × room dimensions
- Investment rollups: Room prices aggregate into InvestmentLineItem records
  by bucket (BASE, ALTERNATE, ALLOWANCE)
- Deck slides: DeckSlide records with type-specific content JSON, linked to project

### Pricing Pipeline (critical — do not break)

SectionType (pricing profile) rates × Room dimensions (SF)
  → computeRoomPriceRange() in app/lib/room-price-range.ts  ← SINGLE SOURCE OF TRUTH
  → writes Room.totalLow / totalTarget / totalHigh
  → recomputeInvestmentRollups() sums by bucket
  → InvestmentLineItem.rangeLow / rangeTarget / rangeHigh
  → Investment tab displays these values
  → Deck Investment slide reads from InvestmentLineItem

The shared utility computeRoomPriceRange() must be used by both the
Sections tab display AND the investment rollup. Never duplicate this math.

### Deck Editor Architecture
- Route: /admin/projects/[id]/deck
- 9 slide types with individual components in app/admin/projects/[id]/deck/slides/
- 3-layer rendering: aiBackground → brandBackground → content → logo (z-index 100)
- Slides auto-sync from project data (rooms, investment items) unless isUserModified=true
- InspectorPanel.tsx provides per-slide editing controls
- Background library: BrandBackground model with seed data

### Key File Locations
- Slide components: app/admin/projects/[id]/deck/slides/
- Deck data layer: app/lib/deck/db.ts, app/lib/deck/types.ts
- Investment rollup: app/lib/investment-rollup.ts
- Room price calculation: app/lib/room-price-range.ts
- Room actions: app/admin/projects/[id]/rooms/actions.ts
- Investment actions: app/admin/projects/[id]/investment/actions.ts
- Prisma schema: prisma/schema.prisma
- Seed data: prisma/seed.ts

### Naming Conventions
- Budget line items follow: [PREFIX] Item - Material/Install
- Room > Trade > Item hierarchy (matches JobTread)
- Bucket separator: > (e.g., "Kitchen > Plumbing > Rough-in")

### JobTread Integration
- Read-only by default — NEVER write to JobTread unless explicitly authorized
- Access via Data X MCP connector
- Budget hierarchy: Room > Trade > Material/Labor
- Search by job number to get internal ID, then query by ID
- The closed date field (not a custom field) indicates job completion status

## Commit-On-Demand Pattern

### Default Behavior: DO NOT AUTO-COMMIT

Claude Code must NEVER:
- Commit automatically at the end of a task
- Use generic commit messages like `checkpoint: auto-commit after Claude Code task`
- Run `git commit` without first showing the human the exact command and waiting for approval
- Run `git push` on its own initiative — pushing is the human's responsibility by default, unless the human explicitly instructs a push in the prompt (see Override below)
- Use `git add -A` or `git add .` — always use explicit file paths

### At End Of Every Task

After verification passes (tsc/build/tests), Claude Code MUST:

1. Run `git status` and show the output
2. Verify that only files intentionally edited by this task appear as modified or new
3. If any unexpected files appear, STOP and report — do not proceed
4. Print a suggested commit command block in this exact format:

```
## Suggested Commit

```powershell
git add <explicit file paths>
git commit -m "<type>(<scope>): <description>"
```

Reasoning: [1-2 sentences on why these files, this message, this scope]
```

5. STOP. Wait for the human to run the commit manually. Do not execute it yourself.

### Commit Message Format

Use Conventional Commits:

- `feat(<scope>): <description>` — new feature or capability
- `fix(<scope>): <description>` — bug fix
- `chore(<scope>): <description>` — tooling, config, housekeeping
- `docs(<scope>): <description>` — documentation only
- `refactor(<scope>): <description>` — code restructuring without behavior change
- `test(<scope>): <description>` — test additions or fixes

Scope examples used in this repo: `admin`, `rendr`, `ai`, `estimate`, `db`, `deck`, `cope`, `lib`, `ui`, `docs`, `claude`.

Example good messages:
- `feat(estimate): add CALC source tag for pre-calculated line items (permit fees)`
- `fix(deck): correct design retainer slide binding to investment tab value`
- `chore: gitignore Claude lock file, update launch config`

Example BAD messages (do not use):
- `checkpoint: auto-commit after Claude Code task`
- `update files`
- `wip`
- `fix stuff`

### When To Split Into Multiple Commits

If a task touches more than ~10 files OR spans multiple logical concerns (e.g., schema change + UI update + new lib utility), suggest splitting into multiple commits by logical scope. Print one suggested commit block per logical grouping.

### High-Risk Changes — Flag Explicitly

If a task touches any of the following, include a ⚠️ warning in the commit reasoning:
- Database migrations or `schema.prisma`
- Authentication (Clerk, session handling, auth middleware)
- External integrations (JobTread, Rendr, AI API clients)
- Payment or financial calculations
- Permission or admin gating

Example: `⚠️ This commit includes a Prisma migration. Human must decide whether to deploy migrations before or after this commit lands in production.`

### Override — Explicit Permission To Commit And/Or Push Directly

The human may explicitly instruct Claude Code to commit directly inside a specific prompt with language like:
- "Commit this yourself when you're done"
- "Stage and commit using [this exact message]"
- "Auto-commit at the end"

When this explicit override appears in the prompt, Claude Code MAY execute the commit, and MUST use a meaningful Conventional Commits message (never the generic checkpoint message).

The human may likewise explicitly instruct a push in the prompt with language like:
- "Push it"
- "Commit and push"
- "Push when you're done"

When the human explicitly instructs a push, Claude Code MAY run `git push` (commit first if needed). Push only what the instruction covers — do not force-push, and do not push unrelated local commits. Absent an explicit push instruction, never push on your own initiative.

Absent any explicit override, the default is always: prepare the command, show it to the human, wait.

### If The Git History Is Already Polluted

If Claude Code notices prior commits with generic `checkpoint:` messages, DO NOT attempt to rewrite git history (no `git rebase`, no `git commit --amend` on previous commits, no `git reset`). That's the human's call. Simply continue forward with proper commit hygiene.

### Branch Discipline

- Do NOT create branches unless explicitly asked
- Do NOT create worktrees
- All work happens on the current branch (typically `proposal-v2`) unless explicitly told otherwise

## Prisma Rules
- NEVER run `npx prisma db pull` or `npx prisma db pull --force`. This overwrites the hand-crafted schema.prisma with an auto-generated version that loses @updatedAt, onDelete behaviors, comments, relation names, and field ordering.
- To verify database connectivity, use: `npx prisma migrate status`
- To verify schema is in sync: `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations`
- Only use `npx prisma migrate dev` for migrations and `npx prisma generate` for client generation.

### Checksum drift on an applied migration

If `prisma migrate dev` fails with "migration was modified after it was applied" but `prisma migrate status` reports "Database schema is up to date", the DB schema is fine — only Prisma's stored checksum is stale (usually because the `migration.sql` file was reformatted after the first apply). This is metadata drift, not schema drift.

- **DO NOT run `prisma migrate reset`** — it drops all data.
- Use the checksum-repair pattern: write a one-shot script (see `scripts/repair-phase7a-migration-checksum.ts` for the canonical template) that:
  1. runs `prisma migrate status` and aborts if the DB is NOT up-to-date
  2. computes the current `migration.sql` SHA-256
  3. prints the before row from `_prisma_migrations`
  4. requires an explicit `--confirm` flag to issue the `UPDATE _prisma_migrations SET checksum = ...` write
  5. prints the after row
- Commit the repair script alongside the fix so the change is auditable in `git log`.

## CatalogSuggestion behavior

The `CatalogSuggestion` table tracks AI-priced line items observed across
estimates so estimators can promote frequently-occurring items into the
catalog. Writes go through `upsertCatalogSuggestion()` in
`app/lib/ai/generate-room-estimate.ts` as a single atomic
`INSERT ... ON CONFLICT ("itemName") DO UPDATE` statement.

- Running averages (`avgUnitPrice`, `avgUnitCost`) are atomic and race-safe.
  Postgres holds a row lock across the `DO UPDATE` clause, so concurrent
  workers (Phase 8B parallel estimate generation) serialize deterministically.
  The new avg is computed in-statement from the pre-update row values:
  `newAvg = (oldAvg * oldCount + newValue) / (oldCount + 1)`.
- `tradeGroup` and `suggestedUnit` are overwritten on every write keyed by
  `itemName` (last-writer-wins). Accepted behavior — the learning table
  expects consistent values per item name, and if two rooms disagree on
  the trade group for the same item, we want the most recent observation.
- `id` is mixed format across rows: legacy rows created via Prisma's
  `upsert` have cuid IDs; new rows created through the atomic raw INSERT
  use `crypto.randomUUID()`. Cosmetic, no action needed — the column is
  just `String @id` with no format constraint.

## Background Jobs — Local Dev Setup

Phase 8B introduced QStash-backed bulk estimate jobs. To test the bulk
flow end-to-end (`POST /api/ai-estimate/bulk` → worker → progress banner)
on localhost, you need **two** things running alongside `npm run dev`:

### 1. QStash dev proxy

In a separate terminal, start the Upstash QStash local proxy:

```bash
npx @upstash/qstash-cli dev
```

This spins up a local QStash-compatible server (default
`http://127.0.0.1:8080`) that accepts publishes from the Next app and
delivers webhooks back to localhost without needing the public QStash
cloud. The CLI prints fresh signing keys on each start — copy them into
`.env.local` (see below).

### 2. `.env.local` shape

The QStash client + `verifySignatureAppRouter` both read from these
three env vars. The estimate-job lib in
`app/lib/ai/estimate-job.ts` strips surrounding quotes defensively, but
prefer unquoted values for cleanliness:

```dotenv
# Dev (qstash-cli dev)
QSTASH_URL=http://127.0.0.1:8080
QSTASH_TOKEN=<token printed by qstash-cli dev>
QSTASH_CURRENT_SIGNING_KEY=<from qstash-cli dev>
QSTASH_NEXT_SIGNING_KEY=<from qstash-cli dev>

# Prod (Upstash cloud) — commented out during dev
# QSTASH_URL=https://qstash.upstash.io
# QSTASH_TOKEN=<from Upstash console>
# QSTASH_CURRENT_SIGNING_KEY=<from Upstash console>
# QSTASH_NEXT_SIGNING_KEY=<from Upstash console>
```

### 3. `NEXT_PUBLIC_APP_URL`

The bulk route builds the worker webhook URL from this env var. For
local dev it must be reachable from the QStash dev proxy process
(same machine, so localhost works):

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Troubleshooting

- **401 on webhook delivery** — signing keys in `.env.local` don't
  match what `qstash-cli dev` is using. Restart the proxy, copy the new
  keys, restart `npm run dev`.
- **Worker returns HTML 500** — often a stale Prisma client after a
  schema change. Restart `npm run dev` after any `prisma generate`.
- **Bulk job starts but items stay QUEUED forever** — either the proxy
  isn't running, or `NEXT_PUBLIC_APP_URL` doesn't match the port the
  dev server is actually listening on. Check both.
- **Publish fails with "Invalid URL"** — `QSTASH_URL` has surrounding
  quotes in `.env.local`. Remove them (the dotenv loader doesn't
  strip, though the app code does as a defense).

### Production

On Vercel, set `NEXT_PUBLIC_APP_URL` to the deployed origin and use
the real Upstash credentials. No `qstash-cli dev` needed.

### Project Overhead (COPE) Auto-Trigger

Phase 8C adds automatic project-overhead (COPE) generation after a bulk
estimate job lands COMPLETED. Key facts for future changes:

- **COPE is one call per project, NOT per-room.** There's exactly one
  "COPE room" per project (`isProjectOverhead: true`), and
  `POST /api/cope-estimate` writes a single `AIEstimate` to it using
  aggregates across every non-COPE room's latest estimate. "Generate COPE
  for all rooms" is a labeling mistake — there's only ever one to generate.
- **Auto-trigger fires ONLY on `EstimateJob.status === "COMPLETED"`**,
  never on PARTIAL (stale aggregate math) or FAILED (nothing to aggregate).
  `rollUpJobStatus()` returns the new terminal status so the estimate-room
  worker can fire exactly once from both the happy-path and recovery-path
  completion transitions.
- **Two code paths reach the same service.** Auto-trigger publishes a
  QStash message to `/api/jobs/cope-generate`; the manual banner/COPE-card
  buttons hit `POST /api/cope-estimate` directly. Both call
  `generateProjectOverhead()` in `app/lib/ai/generate-project-overhead.ts`,
  which acquires the single `Project.copeStatus` lock — so concurrent or
  duplicate triggers converge on one in-flight generation.
- **Lock is a conditional `updateMany`** on `Project.copeStatus` from
  `{IDLE, READY, FAILED}` to `GENERATING`. `updateMany.count === 0` on
  the caller means either the project doesn't exist (→ `NOT_FOUND`) or
  someone else holds the lock (→ `BUSY`). Disambiguation with a
  follow-up `findUnique`. The `BUSY` branch returns HTTP 409 from the
  HTTP wrapper and 200 `status: skipped_busy` from the QStash worker.
- **Status flow:** `IDLE → GENERATING → READY` (happy) or
  `IDLE → GENERATING → FAILED` + `copeError` (unhappy). FAILED transitions
  back to GENERATING on any subsequent trigger (lock allows `FAILED → GENERATING`).
- **`CompanySettings.autoGenerateCope`** (default `true`) gates the
  auto-trigger only. The manual button always works regardless of this
  setting. Read fresh each completion — no cache.
- **No CopeJob model.** A single call per project, single lock column,
  no fan-out. Resist the temptation to build one — `Project.copeStatus`
  + `copeError` + `copeGeneratedAt` is the whole state machine.
- **Polling payload carries `project.copeStatus` + `autoGenerateCope`**
  so the `<EstimateJobProgressBanner />` can render a combined
  job × copeStatus state machine from one endpoint.
- **`maxDuration = 300`** on both `/api/cope-estimate` and
  `/api/jobs/cope-generate` — COPE streams 60–120s against Anthropic,
  which will time out on Vercel Pro's 60s default.

## Manual smoke tests

Located at `scripts/smoke/`. These are NOT part of any automated suite; run
them manually when you want to validate the estimate service or
`CatalogSuggestion` upsert against the live dev DB / Anthropic API.

- **`scripts/smoke/single-room.ts`** — calls `generateRoomEstimate()` against a
  real room (`Primary Bedroom` on the Oyster Reef project, Standard Room
  template). Verifies end-to-end: service extraction, prompt caching wire
  format, AIEstimate persistence, line-item shape, token usage,
  stale-reason clearing. Useful after any change to the estimate pipeline,
  prompt builder, or parser. Expect ~90–120s and ~40 line items.
- **`scripts/smoke/catalog-suggestion-upsert.ts`** — exercises the atomic
  `INSERT ... ON CONFLICT DO UPDATE` in `upsertCatalogSuggestion()`. Runs
  three phases: (1) fresh insert, (2) single-write running-avg math,
  (3) 10-way parallel upsert race check. Creates and cleans up a synthetic
  `__smoke_<uuid>` row so it's safe to run against real data. Useful after
  any change to the upsert SQL, id-generation strategy, or schema for
  `CatalogSuggestion`.
- **`scripts/smoke/cope-auto-trigger.ts`** — Phase 8C regression. Six
  scenarios: happy-path auto-trigger (estimates COMPLETED → `copeStatus`
  READY), `autoGenerateCope=false` skip + manual override, PARTIAL skip,
  409 BUSY on concurrent trigger, extended polling payload shape, FAILED →
  READY recovery. ~10–15 min wall-clock (two full bulk estimate + COPE
  cycles plus cheap cases). Useful after any change to the COPE service,
  auto-trigger wiring in `estimate-job.ts`, or `rollUpJobStatus` return
  semantics.
- **`scripts/smoke/internal/lock-test.ts`** — direct-DB smoke for the
  `Project.copeStatus` idempotency lock (no HTTP, no Anthropic). Verifies
  `updateMany` conditional transition math + NOT_FOUND vs BUSY
  disambiguation. ~1s. Runs even when the dev server is down — useful
  during schema changes to `CopeStatus`.

Run either with:

```bash
npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/smoke/<name>.ts
```

Both scripts print expected-vs-actual comparisons and exit non-zero on math
drift or lost writes, so they can be wired into a CI gate later if desired.

## Code Quality Rules
- Run tsc --noEmit after every set of changes — zero errors required
- Do not break existing auto-save or hydration pipelines
- When adding shared logic, extract into reusable utilities — never duplicate
- When fixing bugs, investigate and report findings BEFORE writing any fix

## Style / Branding
- NotebookLM-inspired slide deck aesthetic
- Warm linen backgrounds, Cormorant Garamond typography
- 16:9 landscape slide format
- Orange accent color: #F47216
- Navy primary: #1A2332
- Every slide title gets an orange horizontal accent rule underneath
- Bronze/gold accents for luxury feel

## Communication Rules
- Report findings BEFORE writing fixes when investigating bugs
- If a prompt is ambiguous, ask for clarification rather than guessing
- When modifying shared utilities, verify all callers still work
- After completing a task, summarize what was changed and what to test
