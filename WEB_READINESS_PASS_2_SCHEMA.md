# Web Readiness Pass 2 — Schema & Data Integrity Audit

> Read-only investigation. No code, schema, or data modified. Generated 2026-05-02.
>
> Source artifacts: `prisma/schema.prisma` (1,380 lines, 49 models), `prisma/migrations` (113 applied), live DB introspection via `scripts/audit-schema-pass2.ts` (read-only `information_schema` + `pg_catalog` queries against the Neon dev DB).

## Executive Summary

Schema-to-DB alignment is **clean** — `prisma migrate status` reports up-to-date, the 113 applied migrations match the on-disk files, and column types/defaults match Prisma declarations across the 49 models. No silent type-precision drift was found (the Phase-11 Float/INTEGER bug class is closed).

The largest single integrity gap is the long-deferred **`AIEstimate` foreign-key cleanup**: `AIEstimate.projectId` and `AIEstimate.sectionId` are plain text columns with no FK constraints, so when a Project (and its Rooms via cascade) is deleted, AIEstimate + downstream EstimateLineItem + PriceCorrection rows become orphans referencing dead ids. Same pattern applies, smaller blast radius, to `DeckSlide.sectionId` and `Project.coverHeroImageId`. Three singleton tables (`CompanySettings`, `Company`, `CompanyContext`) have no DB-level uniqueness — the app uses `findFirst` and would silently use the first of two if a second slipped in. Migration hygiene is good but cosmetically noisy: two intentional no-op migrations (recovery pattern), one duplicate-suffix name, and one informal name (`update_3_16_7_25am`).

**Total findings: 21.** CRITICAL: 0 · HIGH: 2 · MEDIUM: 9 · LOW: 10.
**Recommended fix scope: 4 MUST-FIX, 6 SHOULD-FIX, 11 DEFER.** Estimated 4–6 migrations, ~30–60 SQL lines.

Deferred items from Pass 1 (`EstimateJob.createdById` nullable schema correctness) reconcile cleanly — schema is shaped right, just unwired.

## Section 1: Schema-to-DB Reality Check

`prisma migrate status` → **"Database schema is up to date!"** All 113 migrations applied; none unfinished, none rolled back. Column types, defaults, NOT NULL flags, enum types, JSON shape, and index declarations match Prisma's `_runtimeDataModel`. The Pass-1 fingerprint guard in `app/lib/prisma.ts` (`REQUIRED_RECENT_FIELDS`) catches stale clients but not type drift; this section is the audit that closes that gap.

### Table A — Schema Drift Findings

| Model | Field | Prisma Says | DB Says | Severity | Notes |
|---|---|---|---|---|---|
| `Project` | (cols 6,7) | columns dropped historically | ordinal positions 6, 7 vacant | LOW | Postgres preserves ordinal numbering when columns are dropped. Cosmetic only — does not affect queries. Survives DB wipe (resets to compact ordering). |
| `InvestmentLineItem` | (col 10) | dropped historical column | ordinal position 10 vacant | LOW | Same as above. |
| All timestamp columns | every model | `DateTime` → Prisma defaults to `timestamp(3) without time zone` | `timestamp without time zone` | LOW | Single-tenant fine. SaaS-readiness concern (multi-region): consider migration to `timestamptz` before SaaS phase, but explicitly out of scope per locked decision #6. |
| `Project.supportingText` | line 47 | "LEGACY: dead column — Drop in cleanup pass" | column still present (nullable text, no default) | LOW | Comment-flagged for removal. Survives DB wipe naturally if removed from schema before wipe. |

No CRITICAL or HIGH drift. Schema and DB are in lockstep. No action required for Section 1 in Pass 2.

## Section 2: Foreign Key Cascade Audit

49 FK constraints in DB. All use `ON UPDATE CASCADE`. Delete behavior is either CASCADE (`c`) or SET NULL (`n`). No RESTRICT, NO ACTION, or SET DEFAULT in use. The notable findings are not about cascade semantics on existing FKs — they're about **fields that should be FKs but aren't**.

### Table B — Foreign Key Cascades

Format: `c` = CASCADE, `n` = SET NULL.

| Parent | Child | FK Field | Declared | Expected | Mismatch | Risk |
|---|---|---|---|---|---|---|
| Project | Room | projectId | CASCADE | CASCADE | no | ✓ |
| Project | Media | projectId | CASCADE | CASCADE | no | ✓ |
| Project | InvestmentLineItem | projectId | CASCADE | CASCADE | no | ✓ |
| Project | TimelinePhase | projectId | CASCADE | CASCADE | no | ✓ |
| Project | PublishedSnapshot | projectId | CASCADE | CASCADE | no | ✓ |
| Project | EstimateJob | projectId | CASCADE | CASCADE | no | ✓ |
| Project | ProposalDeck | projectId | CASCADE | CASCADE | no | ✓ |
| Project | Proposal | projectId | CASCADE | CASCADE | no | ✓ |
| Project | ExtensionPairCode | projectId | CASCADE | CASCADE | no | ✓ |
| Project | ZillowBrowserConnection | projectId | SET NULL | SET NULL | no | ✓ Connections survive project delete (intentional — handshake history) |
| Project | StylePreset | stylePresetId | SET NULL | SET NULL | no | ✓ Style presets are global; project loses preset link |
| **Project** | **AIEstimate** | **projectId** | **(no FK)** | **CASCADE** | **YES** | **HIGH** — orphan AIEstimate rows on project delete |
| Room | Project | projectId | CASCADE | CASCADE | no | ✓ |
| Room | Media | roomId | SET NULL | SET NULL | no | ✓ Media kept with project even when room deleted |
| Room | RoomSubArea | roomId | CASCADE | CASCADE | no | ✓ |
| Room | RoomRenderCheck | roomId | CASCADE | CASCADE | no | ✓ |
| Room | JobItem | roomId | CASCADE | CASCADE | no | ✓ |
| **Room** | **AIEstimate** | **sectionId** (=room id) | **(no FK)** | **CASCADE** | **YES** | **HIGH** — orphan AIEstimate rows on room delete |
| AIEstimate | EstimateLineItem | estimateId | CASCADE | CASCADE | no | ✓ |
| AIEstimate | PriceCorrection | estimateId | CASCADE | CASCADE | no | ✓ |
| EstimateLineItem | PriceCorrection | lineItemId | CASCADE | CASCADE | no | ✓ |
| EstimateJob | JobItem | estimateJobId | CASCADE | CASCADE | no | ✓ |
| **AIEstimate** | **JobItem** | **estimateId** | **(no FK by design)** | **(no FK by design)** | no | LOW — schema comments "AIEstimate lifecycle is independent". Acceptable. |
| ProposalDeck | DeckSlide | deckId | CASCADE | CASCADE | no | ✓ |
| BrandBackground | DeckSlide | backgroundId | SET NULL | SET NULL | no | ✓ |
| **Room/Section** | **DeckSlide** | **sectionId** | **(no FK)** | **SET NULL** | **YES** | **MEDIUM** — orphan content reference if Room is deleted; renderer falls back gracefully but stale id pollutes JSON |
| **Media** | **Project** | **coverHeroImageId** | **(no FK)** | **SET NULL** | **YES** | **MEDIUM** — dangling pointer if cover hero is deleted. Renderer code likely tolerates missing media but Project keeps a phantom id. |
| StylePreset | Media | stylePresetId | SET NULL | SET NULL | no | ✓ |
| StylePreset | Room | stylePresetId | SET NULL | SET NULL | no | ✓ |
| RoomTemplate | Room | roomTemplateId | SET NULL | SET NULL | no | ✓ |
| RoomTemplate | AIEstimate | roomTemplateId | SET NULL | SET NULL | no | ✓ (only AIEstimate FK that exists today) |
| RoomTemplateTradeGroup | RoomTemplateItem | tradeGroupId | CASCADE | CASCADE | no | ✓ |
| PricingCatalogItem | RoomTemplateItem | catalogItemId | SET NULL | SET NULL | no | ✓ |
| PricingCatalogItem | EstimateLineItem | catalogItemId | SET NULL | SET NULL | no | ✓ |
| RoomTemplate | RoomTemplateTradeGroup | roomTemplateId | CASCADE | CASCADE | no | ✓ |
| Employee | PublishedSnapshot | sentByEmployeeId | SET NULL | SET NULL | no | ✓ Audit history survives employee delete |
| Employee | EmailSendLog | employeeId | SET NULL | SET NULL | no | ✓ |
| Employee | PdfDownloadLog | employeeId | SET NULL | SET NULL | no | ✓ |
| Employee | ShareLinkCopyLog | employeeId | SET NULL | SET NULL | no | ✓ |
| PublishedSnapshot | EmailSendLog | snapshotId | SET NULL | SET NULL | no | ✓ |
| PublishedSnapshot | PdfDownloadLog | snapshotId | CASCADE | CASCADE | no | ✓ Schema comment justifies divergence from EmailSendLog |
| PublishedSnapshot | ShareLinkCopyLog | snapshotId | CASCADE | CASCADE | no | ✓ |
| Company | ValuePillar | companyId | CASCADE | CASCADE | no | ✓ |
| Company | WhyUsDefaults | companyId | CASCADE | CASCADE | no | ✓ |
| BrandIcon | ValuePillar | brandIconId | SET NULL | SET NULL | no | ✓ |
| BrandIcon | BrandBackground | overlayIconId | SET NULL | SET NULL | no | ✓ |
| SectionType | PricingSourceRoom | sectionTypeId | SET NULL | SET NULL | no | ✓ |
| SyncedBudgetJob | SyncedBudgetRow | jobId → jobId | CASCADE | CASCADE | no | ✓ FK references non-PK `jobId` (unique) — works as designed but unusual; `PricingSourceJob → PricingSourceTrade.jobId` follows the same pattern |
| PricingSourceJob | PricingSourceRoom | pricingJobId | CASCADE | CASCADE | no | ✓ |
| PricingSourceRoom | PricingSourceTrade | roomId | CASCADE | CASCADE | no | ✓ |

### Notable findings

**HIGH-severity AIEstimate FK gap (the deferred Phase-9 item).** Migration `20260331064037_add_ai_pricing_models` created `AIEstimate` with three "id" columns: `projectId`, `sectionId`, `roomTemplateId`. Only `roomTemplateId` got an `ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY`. The other two were left unconstrained. Today this means:

- Deleting a Project cascades to Room, Media, ProposalDeck, etc. **but not to AIEstimate.** Orphan AIEstimate rows persist with `projectId` referencing a vanished id.
- Deleting a Room cascades to RoomSubArea, JobItem, RoomRenderCheck, etc. **but not to AIEstimate.** Orphan rows persist with `sectionId` referencing a vanished id.
- Downstream EstimateLineItem and PriceCorrection rows continue to cascade-delete with their parent AIEstimate, so the orphan tree is shallow but real.
- Today's blast radius is dev-only. Pre-launch DB wipe means no production orphans exist yet. Recommended to add the FKs **before** production traffic to prevent silent data accretion.

**MEDIUM-severity orphan-pointer fields:**
- `DeckSlide.sectionId` — nullable text with no FK. Renderer reads it to bind the slide to a Room. If the Room is deleted, the slide content keeps the dangling id and the auto-sync logic skips it.
- `Project.coverHeroImageId` — nullable text with no FK to `Media.id`. Hero image deletion leaves a dangling id; renderer code falls back but the project keeps a phantom reference.

**LOW-severity by-design omissions:**
- `JobItem.estimateId` — schema comment explicitly documents "FK-ish pointer to resulting AIEstimate row (not a relation — AIEstimate lifecycle is independent)". Acceptable.

## Section 3: Index Coverage Review

175 indexes total (74 unique, 101 non-unique, plus 50 PKs). Coverage is generous; a handful of redundant indexes exist. No HIGH-severity missing-index findings.

### Table C — Index Coverage

| Model | Query Pattern | Existing Index | Recommended | Reason |
|---|---|---|---|---|
| `ZillowBrowserConnection` | `findUnique({ where: { nonce } })` | `nonce_key` (unique) **AND** `nonce_idx` (non-unique) | drop `nonce_idx` | Unique covers all queries on `nonce`. LOW. |
| `Proposal` | lookups by `projectId` | `projectId_key` (unique) **AND** `projectId_idx` (non-unique) | drop `projectId_idx` | Same. LOW. |
| `InvestmentLineItem` | filters by `projectId` | `projectId_bucket_key` (unique composite, projectId leftmost) **AND** `projectId_idx` (non-unique) | drop `projectId_idx` | Composite unique answers projectId-only queries via index prefix scan. LOW. |
| `Room` | filters by `projectId` | `projectId_idx` **AND** four composites all leading with `projectId` | (keep `projectId_idx`) | Acceptable — explicit single-col index avoids planner ambiguity for the most common pattern. No change. |
| `EstimateJob` | `findMany({ where: { projectId, status } })` (progress polling) | `projectId_idx`, `status_idx` (separate) | DEFER composite | Polling is per-job-id, not per-project+status. Single-col indexes sufficient. |
| `JobItem` | `findMany({ where: { estimateJobId, status } })` (worker fan-out) | `estimateJobId_idx`, `status_idx` (separate) | DEFER composite | Job-scoped queries are bounded; single-col adequate at expected job sizes (~30 rooms). |
| `User` | `findUnique({ clerkUserId })` (post-Clerk restoration) | `clerkUserId_key` (unique) | none | ✓ Pre-existing, ready for Clerk re-enablement. |
| `Project` | search by `title` | none | DEFER | App searches by `slug` (unique-indexed) and lists all. Title search not in user-facing critical path. |
| `EmailSendLog` | filter by `providerMessageId` (de-dup) | none | DEFER (see Section 4) | Code does not currently de-dup on this field. |
| `PublishedSnapshot` | `findFirst({ where: { projectId }, orderBy: { version: "desc" } })` | `(projectId, version)` unique composite | none | ✓ Composite serves the query. |

**Three redundant non-unique indexes** (ZillowBrowserConnection.nonce, Proposal.projectId, InvestmentLineItem.projectId) are LOW-severity wasted writes. Drop in Pass 2 if a cleanup migration ships, otherwise DEFER.

## Section 4: Unique Constraint Audit

### Table D — Missing or Weak Unique Constraints

| Table | Field(s) | Currently Constrained? | Should Be? | Risk if Not |
|---|---|---|---|---|
| `Project` | `slug` | YES (`Project_slug_key`) | YES | ✓ |
| `Project` | `title` | NO | OPEN — duplicates seem allowed today | Two projects with same title can exist. App lists both fine; nothing breaks but UX is confusing. **Open question for Steve.** |
| `Room` | `(projectId, name)` | NO | OPEN — duplicates currently allowed | Same as above. Investment rollups key by display-group, not by name, so no functional break. **Open question for Steve.** |
| `Section/Room` | `(projectId, sortOrder)` | NO | NO | sortOrder is a soft order; ties allowed. ✓ |
| `DeckSlide` | `(deckId, type)` | NO | NO (some types intentionally repeat: before-after, scope-breakdown) | Pass-1 C.6 found legacy/canonical type duplicates were a *data* bug (rename without DB migration), not a constraint failure. Defensive renderer-side fix already shipped. ✓ |
| `DeckSlide` | `(deckId, order)` | NO | NO (Float, intentional fractional slotting) | ✓ |
| `InvestmentLineItem` | `(projectId, bucket)` | YES | YES | ✓ |
| `PublishedSnapshot` | `(projectId, version)` | YES | YES | ✓ |
| `PricingSourceJob.jobId` | unique | YES | YES | ✓ Required by FK reference from PricingSourceTrade. |
| `SyncedBudgetJob.jobId` | unique | YES | YES | ✓ Required by FK reference from SyncedBudgetRow. |
| `Integration` | `(provider, name)` | YES | YES | ✓ |
| `IntegrationSetting.service` | unique | YES | YES | ✓ |
| **`CompanySettings`** | **singleton (≤1 row)** | **NO** | **YES** (or formal singleton enforcement) | **MEDIUM**. `findFirst()` everywhere; if a second row appears (race during seed or admin fat-finger), the app silently uses whichever row PG returns first. Add a partial unique index on a derived constant column, or a CHECK on `id = 'singleton'`. |
| **`Company`** | **singleton** | **NO** | **YES** | **MEDIUM**. Same pattern. |
| **`CompanyContext`** | **singleton** | **NO** | **YES** | **MEDIUM**. Same pattern. `/api/settings/context` GET creates if missing — concurrent requests at deploy time could race-create two. |
| `WhyUsDefaults.companyId` | unique | YES | YES | ✓ |
| `User.clerkUserId` | unique | YES | YES | ✓ |
| `Employee.email` | unique | YES (nullable unique allows multiple null rows) | YES (or NOT NULL if all employees must have email) | LOW. Acceptable today — null-allowed unique is standard PG. |
| `RoomRenderCheck` | `(roomId, itemText)` | YES | YES | ✓ |
| `CatalogSuggestion.itemName` | unique | YES | YES | ✓ |
| **`EmailSendLog.providerMessageId`** | unique | NO | OPEN — Gmail message IDs SHOULD be globally unique | **MEDIUM**. Today no code de-dups on this field. If retry logic is wired up later (Cleanup H is partially landed), missing constraint allows duplicate audit rows for the same message. **Open question for Steve.** |
| `EstimateJob` | idempotency key | NO field exists | OPEN — does Steve want idempotency keys on bulk jobs? | DEFER until concept exists. |

## Section 5: Nullability Audit

### Table E — Nullability Issues

| Model | Field | Currently | Should Be | Severity |
|---|---|---|---|---|
| All models | `createdAt` / `updatedAt` | NOT NULL with default | NOT NULL with default | ✓ across the board |
| `Project` | `slug`, `title`, `status` | NOT NULL | NOT NULL | ✓ |
| `Room` | `projectId`, `name` | NOT NULL | NOT NULL | ✓ |
| `Room` | `scopeNarrative` | NOT NULL with `default("")` | NOT NULL | ✓ |
| `EstimateJob.createdById` | nullable text | nullable | nullable (until Clerk restored) → eventually NOT NULL | ✓ for now. After Clerk restoration, consider backfill + NOT NULL. **Defer to Clerk wiring.** |
| `User.email` | nullable text | nullable | nullable | ✓ Clerk users may not have an email until verified. |
| `DeckSlide.content` | nullable jsonb, no default | nullable | LOW — could `default('{}')` to simplify reader code | LOW. Reader handles null. |
| `JobItem.payload` | NOT NULL jsonb, no default | NOT NULL | NOT NULL with caller required to supply | ✓ Intentional — workers need explicit payload. |
| `Media.fileKey`, `Media.url` | NOT NULL | NOT NULL | ✓ |
| `ZillowBrowserConnection.userId` | NOT NULL text | NOT NULL | currently holds Clerk userId or "dev-user" stub. After Clerk: consider FK to `User.clerkUserId`. **Defer.** | LOW |
| `PublishedSnapshot.snapshotJson` | NOT NULL jsonb | NOT NULL | ✓ |
| `Company.name` | NOT NULL with default | NOT NULL | ✓ |
| `CompanyContext.market` | NOT NULL with default | NOT NULL | ✓ |

No NULL/NOT-NULL mismatches today. The deferred items hinge on Clerk restoration, not Pass 2.

## Section 6: Data Invariants Not Enforced

### Table F — Unenforced Invariants

| Invariant | Currently Enforced By | Where It Could Break | Recommendation |
|---|---|---|---|
| Every project has at most one COPE Room (`isProjectOverhead = true`) | App code (`backfillCopeRoom`, COPE generation) | Concurrent backfill writes; admin UI mistake | Partial unique index: `CREATE UNIQUE INDEX project_cope_singleton ON "Room" ("projectId") WHERE "isProjectOverhead" = true`. **MEDIUM**. |
| Every project has exactly one ProposalDeck | `ProposalDeck.projectId @unique` | — | ✓ Enforced. |
| Every project has exactly one Proposal | `Proposal.projectId @unique` | — | ✓ Enforced. |
| `PublishedSnapshot.version` monotonically increases per project | App code computes `project.publishedVersion + 1`; `(projectId, version)` unique prevents duplicates | Concurrent publish races (unlikely at this team size) | LOW. Race-recovery would surface as a unique-violation 500; add retry if observed. |
| `Project.copeStatus` state machine (IDLE→GENERATING→READY/FAILED) | App code via conditional `updateMany` (CLAUDE.md documents this) | Direct DB writes | ✓ Acceptable — documented protocol. |
| `EstimateJob.status` state machine | App code (`rollUpJobStatus`) | Direct DB writes | ✓ Acceptable. |
| Singleton tables (CompanySettings, Company, CompanyContext) hold exactly 1 row | App `findFirst()` + create-if-missing | Race in seed or `/api/settings/context` auto-create; admin double-submit | See Section 4 — add singleton enforcement. **MEDIUM**. |
| `DeckSlide.type` is a known canonical type (not a legacy rename leftover) | App-side `KNOWN_SLIDE_TYPES` registry consulted by `backfillMissingDefaults` (Pass 1 C.6 fix) | Future renames without registry update | ✓ Acceptable — application-level guard documented. |
| `Media.kind` matches `Media.url` file extension | nothing | URL is opaque blob path | DEFER — not worth enforcing. |
| Every project has at least one Room | nothing | New project creation | Acceptable — empty projects exist briefly during creation. App handles. |
| `InvestmentLineItem` rangeLow ≤ rangeTarget ≤ rangeHigh | nothing | UI input | DEFER — financial-display only; no downstream math depends on ordering. |

**Singleton enforcement** is the only invariant worth Pass-2 attention. Two clean options:

1. Add a fixed-id constraint: `id TEXT NOT NULL DEFAULT 'singleton'` + `CHECK (id = 'singleton')`. Ugly but explicit.
2. Partial unique index on a derived constant: `CREATE UNIQUE INDEX company_settings_singleton ON "CompanySettings" ((true))`. Compact.

Either survives the pre-launch DB wipe.

## Section 7: Migration History Hygiene

113 migrations applied to the dev DB; all `finished_at` populated, none `rolled_back_at`. No unfinished migrations, no orphan records, no ghost rows in `_prisma_migrations`. The known checksum-repair script (`scripts/repair-phase7a-migration-checksum.ts`) handles a one-off bookkeeping drift on `20260416120000_phase7a_rendr_structured_fields` — that drift is documented in CLAUDE.md and the script is committed for auditability.

**Cosmetic noise found, no functional issues:**

- **Two no-op recovery migrations** exist with explanatory comments inside the SQL file:
  - `20260311210121_add_synced_budget_job_and_row/migration.sql`: `"-- No-op: SyncedBudgetJob and SyncedBudgetRow were already created by migration 20260311210000_add_synced_budget_job_and_row."`
  - `20260401113845_add_price_range_fields/migration.sql`: `"-- This is an empty migration."` (no comment explaining why; first one of the same name actually adds the columns)
- **One duplicate-name suffix** (`add_is_available_to_brand_background`, dated 20260304113111 and 20260304114259). The two files do **different** things: the first adds `previewImageKey` and `previewImageUrl`; the second adds `isAvailable`. Misleading directory names; **migration content is correct.**
- **One informal name** (`20260316112606_update_3_16_7_25am`) — describes a clean RoomSubArea creation with FK and index. Name has no semantic meaning; cosmetic only.
- **Two no-op-resolution patterns documented in CLAUDE.md** under "Checksum drift on an applied migration" — the standing repair pattern is in place.

**No ghost migration records detected.** `_prisma_migrations` row count (113) equals on-disk migration directory count (113).

Pass-2 recommendation: leave history alone. Per CLAUDE.md ("If The Git History Is Already Polluted") + locked decision #4 (no `db pull`, no rewriting). Cosmetic naming can be fixed only at next reset.

## Section 8: Deferred Items from Pass 1

Cross-referenced `WEB_READINESS_PASS_1_AUTH.md`, `WEB_READINESS_PASS_1_C5_PROPOSAL_RENDER.md`, `WEB_READINESS_PASS_1_C6_PDF_RENDER.md`.

| Pass-1 Item | Status in Pass 2 |
|---|---|
| `EstimateJob.createdById` — nullable Clerk userId column exists, written as null today | ✓ Schema correct. Nullable is right while auth is disabled. **No Pass-2 action.** Backfill + NOT NULL enforcement waits for Clerk restoration. |
| `AIEstimate.createdByUserId` (mentioned in Pass-2 brief Section 8) | **Does not exist in current schema.** Brief was speculative — no column needs adjustment. If desired, add when wiring Clerk. **No Pass-2 action.** |
| `Project.createdByUserId` (mentioned in Pass-2 brief Section 8) | **Does not exist in current schema.** Same as above. |
| `getCurrentEmployeeId()` falls back to `findFirst({ isActive, isAdmin })` (Pass-1 §7) | Application-code concern, not schema. **No Pass-2 action.** Already documented as Clerk-restoration follow-up in `app/lib/current-employee.ts`. |
| `AIEstimate` foreign key cascade cleanup (Phase 9 deferred) | **Confirmed open.** See Section 2 HIGH findings. Recommended for Pass 2. |
| Pass-1 C.6 legacy slide-type alias map | Defensive renderer fix already shipped. Schema does not need a unique constraint on `(deckId, type)` — see Section 4. |
| Pass-1 brief mention of `EstimateJob.idempotencyKey` | **Field does not exist.** No idempotency-key concept in schema today. **DEFER** until product needs it. |

## Section 9: Recommended Fix Scope

### MUST FIX in Pass 2 (HIGH severity, blocks deploy or imminent bug)

1. **Add `AIEstimate.projectId` FK with `ON DELETE CASCADE`** (Section 2). 1 migration, ~3 SQL lines. No code change. ⚠ Touches `prisma.schema` relation declaration.
2. **Add `AIEstimate.sectionId` FK to `Room.id` with `ON DELETE CASCADE`** (Section 2). Bundles with #1. 1 migration, ~3 SQL lines. ⚠ Schema relation update.
3. **Singleton enforcement on `CompanySettings`** (Section 4). 1 migration. Small but ⚠ requires either schema-level workaround (custom check) or explicit `id` default. Steve to choose pattern (Open Q #4).
4. **Singleton enforcement on `Company` and `CompanyContext`** (Section 4). Bundle with #3. Same pattern × 2 more tables.

### SHOULD FIX in Pass 2 (MEDIUM, low risk, batch with required work)

5. **Add `DeckSlide.sectionId` FK to `Room.id` with `ON DELETE SET NULL`** (Section 2). 1 migration, ~3 SQL lines. ⚠ Schema relation update.
6. **Add `Project.coverHeroImageId` FK to `Media.id` with `ON DELETE SET NULL`** (Section 2). 1 migration. ⚠ Self-referential-ish: Media cascades from Project, so the FK must be added carefully (probably no constraint cycles — Media is a child of Project, not the other way around). ⚠ Schema relation update.
7. **Partial unique index for COPE-room singleton per project** (Section 6). 1 migration, 1 SQL line. No schema relation change.
8. **Drop three redundant non-unique indexes** (Section 3): `ZillowBrowserConnection_nonce_idx`, `Proposal_projectId_idx`, `InvestmentLineItem_projectId_idx`. Bundle into one cleanup migration. ~3 SQL lines. Slight write-throughput improvement.
9. **Decide and apply `EmailSendLog.providerMessageId` constraint** (Section 4 / Open Q #5). If Steve says yes, 1 migration with `@@unique` on a nullable field. If no, document and DEFER.
10. **Drop the dead `Project.supportingText` column** (Section 1) per its own LEGACY comment. 1 migration, 1 SQL line. Survives DB wipe regardless; doing it now means no orphan column at launch.

### DEFER

- Migration name cleanups (Section 7 cosmetic noise) — leave as-is.
- Project ordinal-position gaps (Section 1) — survives DB wipe.
- All Pass-1 deferred items waiting on Clerk restoration.
- Composite indexes on `EstimateJob` and `JobItem` until polling shows pressure.
- Title/name uniqueness on `Project` and `Room` (Open Qs #1 and #2).
- `EstimateJob.idempotencyKey` — concept doesn't exist yet.
- Future `timestamptz` migration for SaaS multi-region readiness.

### Effort estimate

- **5–7 migrations** (most can bundle into 2–3 logical commits: AIEstimate FKs, then singletons + COPE partial-unique, then index cleanup + dead-column drop).
- **~30–60 SQL lines.**
- **2–3 commits** (per CLAUDE.md "Split into multiple commits if a task spans multiple logical concerns"):
  - `fix(db): backfill missing AIEstimate foreign keys and DeckSlide/Project pointer FKs`
  - `feat(db): enforce singleton on CompanySettings/Company/CompanyContext + COPE-room per project`
  - `chore(db): drop redundant indexes and dead supportingText column`
- **No code changes required** for the FK adds (Prisma client regenerates from schema; existing queries unchanged). Singleton enforcement may need a 1-line tweak in seed/init code if `id` becomes a fixed constant.
- **Risk:** schema-only changes; no data backfill needed (pre-launch DB wipe). Type-cache nuke (`.next/`) recommended after Prisma client regen.
- **Interdependence:** none. All migrations are independent and can ship in any order.

## Section 10: Open Questions for Steve

1. **`Project.title` uniqueness.** Today two projects can share the same title (only `slug` is unique). Intentional (clients with same address rev'd over time)? Or should we add `(title)` unique?

2. **`Room.name` uniqueness within a project.** Today two Rooms in the same project can share a name (e.g. two "Bathroom"). Investment rollups handle this fine via display-group, but the deck Investment-by-Space slide will list both with identical labels. Intentional?

3. **AIEstimate FK `ON DELETE` policy.** When a Project or Room is deleted, what should happen to AIEstimate rows? Recommendation: `CASCADE` (matches the parent's intent — if you're nuking the project, you're nuking its estimates). Alternative: `SET NULL` on `sectionId` to keep the historical estimate as a project-level archive even when the room is gone. Which?

4. **Singleton enforcement pattern.** Two options for `CompanySettings`/`Company`/`CompanyContext`: (a) fixed-id pattern — `id TEXT DEFAULT 'singleton'` + `CHECK (id = 'singleton')`, ugly but explicit; (b) partial unique index on a derived constant — `CREATE UNIQUE INDEX ... ON ((true))`, compact but obscure. Preference?

5. **`EmailSendLog.providerMessageId` uniqueness.** Should Gmail message IDs be unique-constrained? This would prevent accidental duplicate audit rows (e.g. if a retry path is added later) but introduces error-handling complexity (unique-violation on race). Today nothing de-dups; rough audit log only.

6. **`Project.coverHeroImageId` FK.** Add FK with `ON DELETE SET NULL`? This would prevent dangling pointers when a hero media row is deleted. Edge case: deleting media that happens to be a cover would now require either an explicit unset on Project first, or accepting the SET NULL behavior. Default: SET NULL (zero-friction).

7. **Drop the LEGACY `Project.supportingText` column now or wait?** The schema marks it for removal (Pass 2 included). Drop it in this pass since the DB will be wiped anyway, or leave it for a later sweep that bundles other LEGACY removals?

---

**Pass 2 audit complete. Awaiting Steve's review before any build prompt is written.**
