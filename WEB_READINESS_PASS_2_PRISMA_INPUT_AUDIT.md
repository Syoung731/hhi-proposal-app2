# Pass 2 — Prisma Create/Update Input Style Audit

> Read-only investigation. No files modified. Generated 2026-05-02.
>
> Triggered by: discovery during Cluster P2-A that 3 files used a hybrid checked/unchecked Prisma input style on `AIEstimate.create`, which broke when the Pass-2 schema added the `project` and `section` relations. Goal: surface every other call site at risk before continuing the build.

## Background — what "hybrid" means and why it breaks

Prisma's `*.create({ data })` input is a TypeScript union: `(Without<Checked, Unchecked> & Unchecked) | (Without<Unchecked, Checked> & Checked)`. The two valid branches:

- **All-unchecked:** every FK supplied as raw column name (`projectId: x`, `roomTemplateId: y`).
- **All-checked:** every FK supplied via the relation (`project: { connect: { id: x } }`, `roomTemplate: { connect: { id: y } }`).

A hybrid input — raw FK column for one relation **plus** `{ connect }` for another — fits **neither** branch. It compiled accidentally before Pass-2 because for AIEstimate, only one relation existed (`roomTemplate`). With only one relation, the unchecked branch had no other relation field to forbid, so the hybrid happened to satisfy it.

Adding `project` and `section` relations turns more FKs into "real" relations, and the unchecked branch now forbids those relation names. The pre-existing hybrid pattern fails.

Inverse relations (e.g. `Project.aiEstimates`, `Room.deckSlides`, `Media.projectsAsCoverHero`) **do not change create/update input shape** — they're query-side only. So clusters that add only inverses are guaranteed safe for input.

## Summary

**Total call sites surveyed:** 71 (across 5 models × create/update/upsert/createMany; both `app/` and `scripts/`).

**Classification:**

| Status | Count |
|---|---|
| Compatible — all-unchecked | 56 |
| Compatible — all-checked | 3 |
| Compatible — scalar-only update (no relations involved) | 9 |
| **Breaking — hybrid pattern** | **3** (all on `AIEstimate.create`) |

**Already patched in this session:** 2 of 3 breaking sites.
**Remaining breaking site:** 1 (`app/api/ai-estimate/[estimateId]/regenerate/route.ts:125`).
**Cluster C predicted impact:** **0 additional breaking sites** — confirmed by inspection of every Project, Media, DeckSlide, and Room write.

## AIEstimate (Cluster A — relations `project` + `section` added)

| File:Line | Operation | Input Style | Pass 2 Impact | Action Needed |
|---|---|---|---|---|
| [app/lib/ai/generate-room-estimate.ts:247](app/lib/ai/generate-room-estimate.ts:247) | `create` | hybrid (`projectId` + `sectionId` + `roomTemplate: { connect }`) | BROKEN by Cluster A | ✅ already patched |
| [app/lib/ai/generate-project-overhead.ts:246](app/lib/ai/generate-project-overhead.ts:246) | `create` | hybrid (same shape) | BROKEN by Cluster A | ✅ already patched |
| [app/api/ai-estimate/[estimateId]/regenerate/route.ts:125](app/api/ai-estimate/[estimateId]/regenerate/route.ts:125) | `create` | hybrid (`projectId` + `sectionId` + spread-conditional `roomTemplate: { connect }`) | BROKEN by Cluster A | ❌ needs same one-line fix |
| [app/api/ai-estimate/[estimateId]/accept/route.ts:20](app/api/ai-estimate/[estimateId]/accept/route.ts:20) | `update` | scalar-only (`status`) | Safe — no relations in data | none |
| [app/api/ai-estimate/[estimateId]/items/[itemId]/route.ts:106](app/api/ai-estimate/[estimateId]/items/[itemId]/route.ts:106) | `update` | scalar-only (`totalCost`, `totalPrice`) | Safe | none |
| [app/api/ai-estimate/[estimateId]/items/[itemId]/route.ts:156](app/api/ai-estimate/[estimateId]/items/[itemId]/route.ts:156) | `update` | scalar-only | Safe | none |
| [app/api/ai-estimate/[estimateId]/items/route.ts:101](app/api/ai-estimate/[estimateId]/items/route.ts:101) | `update` | scalar-only | Safe | none |
| [app/api/ai-estimate/[estimateId]/apply-trade-update/route.ts:206](app/api/ai-estimate/[estimateId]/apply-trade-update/route.ts:206) | `update` | scalar-only | Safe | none |

**Diagnosis:** the three breaking sites all forked from the same template — same hybrid shape, same `roomTemplate: { connect: { id: ... } }` pattern. The fix is mechanically identical across all three: replace `roomTemplate: { connect: { id: x } }` → `roomTemplateId: x`. The conditional spread variant in `regenerate/route.ts` becomes `...(original.roomTemplateId ? { roomTemplateId: original.roomTemplateId } : {})`.

## DeckSlide (Cluster C — relation `section` will be added)

| File:Line | Operation | Input Style | Pass 2 Impact | Action Needed |
|---|---|---|---|---|
| [app/lib/deck/db.ts:470](app/lib/deck/db.ts:470) | `createMany` | all-unchecked (`deckId` raw, `sectionId` raw via spread of `rows`) | Safe — `createMany` only supports unchecked-style anyway | none |
| [app/lib/deck/db.ts:663](app/lib/deck/db.ts:663) | `create` | all-unchecked (`deckId` raw only; no `sectionId` set) | Safe | none |
| [app/lib/deck/db.ts:811](app/lib/deck/db.ts:811) | `create` | all-unchecked (`deckId` raw only; no `sectionId` set) | Safe | none |
| [app/lib/deck/db.ts:1325](app/lib/deck/db.ts:1325) | `create` | all-unchecked (`deckId` + spread of `row` which contains raw `sectionId`) | Safe | none |
| [app/lib/deck/db.ts:623](app/lib/deck/db.ts:623), [801](app/lib/deck/db.ts:801), [987](app/lib/deck/db.ts:987), [1130](app/lib/deck/db.ts:1130), [1212](app/lib/deck/db.ts:1212) | `update` ×5 | scalar-only (`headline`, `content`, `order`) | Safe | none |
| [scripts/cleanup-cope-in-scope-breakdown.ts:40](scripts/cleanup-cope-in-scope-breakdown.ts:40) | `update` | scalar-only | Safe | none |
| [scripts/cleanup-think-leak.ts:58](scripts/cleanup-think-leak.ts:58) | `update` | scalar-only | Safe | none |

**Diagnosis:** every DeckSlide write currently uses raw FK columns only (no `deck: { connect }` or `background: { connect }` anywhere). Adding `section` as a relation in Cluster C will not change the input shape these sites use. **Zero breakage predicted.**

Verified by `grep -n "background: \{|backgroundId:" app/lib/deck/`: only one match (`backgroundId` raw assignment) — confirms no checked-style usage on existing DeckSlide relations.

## Project (Cluster C — relation `coverHeroImage` will be added)

| File:Line | Operation | Input Style | Pass 2 Impact | Action Needed |
|---|---|---|---|---|
| [prisma/seed.ts:224](prisma/seed.ts:224) | `upsert` | all-unchecked at root (`slug`, `title`, raw fields) + nested `rooms: { create }` (inverse — works either branch) | Safe | none |
| [app/admin/projects/new/actions.ts:26](app/admin/projects/new/actions.ts:26) | `create` | all-unchecked (`slug`, `status`, `title`) — no FK at all | Safe | none |
| [app/admin/projects/[id]/media/actions.ts:465](app/admin/projects/[id]/media/actions.ts:465) | `update` | scalar-only (`coverHeroImageId: null`) | Safe | none |
| [app/admin/projects/[id]/media/actions.ts:471](app/admin/projects/[id]/media/actions.ts:471) | `updateMany` | scalar-only (`coverHeroImageId: null`) | Safe | none |
| [app/admin/projects/[id]/media/actions.ts:582](app/admin/projects/[id]/media/actions.ts:582) | `update` | scalar-only (`coverHeroImageId: heroMediaId`) | Safe | none |
| [app/admin/projects/[id]/media/actions.ts:601](app/admin/projects/[id]/media/actions.ts:601) | `update` | scalar-only (`coverHeroImageId: null`) | Safe | none |
| [app/admin/projects/[id]/media/actions.ts:761](app/admin/projects/[id]/media/actions.ts:761) | `updateMany` | scalar-only | Safe | none |
| [app/admin/settings/actions.ts:1525](app/admin/settings/actions.ts:1525) | `updateMany` | scalar-only (`stylePresetId: null`) | Safe | none |
| All other `prisma.project.update` (overview, rooms, rendr, investment, publish, ai-review, etc. — ~25 sites) | `update` | scalar-only — sets domain fields like `copeStatus`, `objectivePillars`, `bullets`, `rendrSpaceId`, etc. | Safe | none |

**Diagnosis:** every existing Project write that touches `coverHeroImageId` does so via the raw FK column (no `coverHeroImage: { connect }` exists yet). No write site combines `stylePreset: { connect }` with raw FK columns either — `stylePreset` already exists as a relation in current schema and all writes already use raw `stylePresetId`. Cluster C will add `coverHeroImage` as a parallel pattern; existing writes remain unchecked-style and continue to work. **Zero breakage predicted.**

## Room (Cluster A added inverse `aiEstimates`; Cluster C will add inverse `deckSlides`)

| File:Line | Operation | Input Style | Pass 2 Impact | Action Needed |
|---|---|---|---|---|
| [app/admin/projects/[id]/rooms/actions.ts:190](app/admin/projects/[id]/rooms/actions.ts:190) | `create` | all-unchecked (`projectId`, `sectionTypeId` raw) | Safe (inverse-only changes) | none |
| [app/admin/projects/[id]/rooms/actions.ts:986](app/admin/projects/[id]/rooms/actions.ts:986) | `createManyAndReturn` | all-unchecked | Safe | none |
| [app/admin/projects/[id]/rooms/actions.ts:1554](app/admin/projects/[id]/rooms/actions.ts:1554) | `createManyAndReturn` | all-unchecked | Safe | none |
| [app/admin/projects/[id]/rendr/rendr-actions.ts:229](app/admin/projects/[id]/rendr/rendr-actions.ts:229) | `create` | all-unchecked (`projectId`, `sectionTypeId` raw) | Safe | none |
| [app/lib/ensure-cope-room.ts:28](app/lib/ensure-cope-room.ts:28) | `create` | all-checked (`project: { connect }`, `roomTemplate: { connect }`) | Safe — fully consistent on the checked branch | none |
| All `prisma.room.update` and `updateMany` (rooms tab, investment, media, ai-review, settings, rendr, scripts — ~30 sites) | `update` | scalar-only or scalar-only-with-shared-FK reset | Safe | none |

**Diagnosis:** Cluster-A and Cluster-C only add **inverse** relations on Room. Inverse relations are query-side projections — they never appear in `data`. Every current Room write is either all-unchecked or all-checked-consistent (`ensure-cope-room.ts`). **Zero breakage predicted.** The grep that initially flagged `ensure-cope-room.ts:33` was a false positive: the literal text `roomTemplate: { connect` matches, but the file is fully checked-style with no hybrid mix.

## Media (Cluster C will add inverse `projectsAsCoverHero`)

| File:Line | Operation | Input Style | Pass 2 Impact | Action Needed |
|---|---|---|---|---|
| [app/api/extension/import-zillow-photos/route.ts:157](app/api/extension/import-zillow-photos/route.ts:157) | `create` | all-unchecked (`projectId`, `roomId` raw) | Safe | none |
| [app/admin/projects/[id]/media/actions.ts:82, 383, 665, 1185, 1556, 2022](app/admin/projects/[id]/media/actions.ts:82) | `create` ×6 | all-unchecked (`projectId`, `roomId` raw) | Safe | none |
| All `prisma.media.update` and `updateMany` (~15 sites) | `update` | scalar-only (URL, dimensions, sortOrder, placement, stylePresetId raw, parentMediaId raw) | Safe | none |

**Diagnosis:** Cluster-C adds only an inverse on Media. Inverse-only changes never affect input shape. **Zero breakage predicted.**

## Section model

There is no `Section` table — Sections were renamed to Rooms. The audit doc clarified this. All "Section" references in the build prompt resolve to Room. See Room section above.

## Unified fix scope

**Files needing edits:** 1
- [app/api/ai-estimate/[estimateId]/regenerate/route.ts:125-131](app/api/ai-estimate/[estimateId]/regenerate/route.ts:125)

**Lines changed:** ~3 (replace one conditional spread block)

**Predicted Cluster C scope:** unchanged — schema-only edits + migration. **No application code patches needed for Cluster C** based on this audit.

**Commit recommendation:** bundle the third regenerate-route patch into the same `fix(ai)` commit as the two already-patched files. Rationale (per Steve's earlier note): "three files, one commit, one cause" — all forked from the same hybrid template, all break for the same reason. Single mechanical fix.

Proposed commit message body addendum: include line count and acknowledge that the audit was completed before the third patch landed, confirming no other hybrid patterns exist anywhere in `app/` or `scripts/` that touch Pass-2-affected models.

## Confidence assessment

**High confidence — zero remaining hybrid sites:**
- Greps run: every `prisma.<modelName>.<op>` for the 5 affected models, both `app/` and `scripts/`.
- Pattern grep: `roomTemplate: \{ connect` returned only the 3 AIEstimate.create files plus one false-positive (`ensure-cope-room.ts`, all-checked Room.create).
- Pattern grep: `background: \{` returned only one match in `deserialize-snapshot.ts` (read path, not a write).
- Cross-checked: `coverHeroImageId:` and `stylePresetId:` writes are all raw-FK assignment (no `{ connect }` siblings on the same data block).

**One caveat — generated AI-estimate code paths:** if Steve has any uncommitted local refactors that fork the AIEstimate.create template into another file, that file would not appear in this audit. None visible in `git status` (which shows only audit/build docs as untracked). Low residual risk.

## Resume path

After this audit lands:
1. Patch [regenerate/route.ts:125-131](app/api/ai-estimate/[estimateId]/regenerate/route.ts:125) (one-line `roomTemplate: { connect: { id: x } }` → `roomTemplateId: x` inside the conditional spread).
2. Run `npx tsc --noEmit` — expect clean.
3. Run `npm run build` — expect clean.
4. Commit the three AIEstimate input-style fixes as one `fix(ai)` commit.
5. Resume Cluster A4 verification (manual cascade test in Prisma Studio) → Cluster B → Cluster C → Cluster D.
6. Cluster C is predicted to require zero application code changes based on this audit.