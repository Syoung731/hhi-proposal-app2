# Investment Refactor — Investigation Report

**Date:** 2026-04-22
**Scope:** Phase 8A.1 read-only investigation. No code / schema changes. Supersedes prior draft — revised to reflect Steve's decision that grouping lives on the Investment tab (parent/child tree with drag-to-reparent), not in the deck sync.

---

## 1. InvestmentLineItem Consumer Audit

### Readers

| File | Line(s) | Op | Purpose |
|---|---|---|---|
| `app/admin/projects/[id]/investment/actions.ts` | 58, 108, 142, 199–207 | `findFirst` / `findMany` | Validate item exists; list for sort-swap — Investment tab CRUD |
| `app/admin/projects/[id]/publish/actions.ts` | 18, 22–36 | `include: { investmentLineItems }` + transform | **PUBLISH SNAPSHOT** — line items flow into `PublishedSnapshot.snapshotJson.investmentLineItems` (consumed by every published proposal) |
| `app/lib/deck/db.ts` | 642–645 | `findMany({ includeInTotals: true })` | `syncInvestmentSlide` — the call site this refactor retires |

### Writers (must be preserved)

| File | Line(s) | Op | Triggered when |
|---|---|---|---|
| `app/lib/investment-rollup.ts` | 220–240 | `upsert({ projectId_bucket })` — 3 rows/project | `recomputeInvestmentRollups()` runs |
| `app/admin/projects/[id]/investment/actions.ts` | 84–87 | `update()` ranges/notes/overrides/includeInTotals | Admin edits on Investment tab (current UI) |
| `app/admin/projects/[id]/investment/actions.ts` | 122–131 | `update()` form-based variant | Admin edits (form path) |
| `app/admin/projects/[id]/investment/actions.ts` | 146 | `delete()` | Admin manual delete |
| `app/admin/projects/[id]/investment/actions.ts` | 214–222 | `update(sortOrder)` × 2 | Admin reorder (row swap) |

### `recomputeInvestmentRollups()` call sites (12 total, unchanged)

Every room mutation (`createRoomAction`, `updateRoomPricingTierAction`, `deleteRoomAction`, `acceptAIEstimateAction`, `updateRoomAreaAction`, `updateOrCreateSubAreaAction`, `mergeRoomsAction`, `unmergeRoomsAction`, `deleteSubAreaAction` — all in `rooms/actions.ts`) plus `ProjectPage` server component (fire-and-forget on every page load) plus `ensureInvestmentLineItemsForBucketsDB` bootstrap plus `generateProjectOverhead` (COPE AI completion).

### Direct answers

1. **Other readers besides the deck sync?** — **Yes**: `publish/actions.ts` reads line items into `SnapshotData.investmentLineItems` at publish time. Every already-published proposal still renders them from the snapshot. The Investment tab's own mutation paths also read for validation. **The model stays.**
2. **Snapshot serializer?** — `snapshot-serializer.ts` handles the deck portion only. Investment line items are assembled in `publish/actions.ts:22–36` and merged into `SnapshotData` at line 79. Net: **yes, persisted into published snapshots.**
3. **Tab writes directly or only via recompute?** — **Directly.** 5 Prisma calls in `investment/actions.ts` mutate rows. `recomputeInvestmentRollups` is called for bootstrap + room-mutation paths only.
4. **Is `recomputeInvestmentRollups` dead?** — **No.** 12 call sites. Its output rows are consumed by (a) the current `syncInvestmentSlide`, (b) `publish/actions.ts` → published snapshot. After this refactor, consumer (a) is retired but (b) remains. **Do not remove.**

**Verdict:** The refactor **adds** the grouped-tree read path to the Investment tab. It retires `syncInvestmentSlide`'s use of `InvestmentLineItem` — but the table and its rollup remain, still written + still consumed by the publish pipeline.

---

## 2. Current `syncInvestmentSlide` Architecture

Location: `app/lib/deck/db.ts:632–683`.

```ts
async function syncInvestmentSlide(
  _deckId: string,
  projectId: string,
  existing: DbRow[]
): Promise<void>
```

**Reads**: `prisma.investmentLineItem.findMany({ where: { projectId, includeInTotals: true }, orderBy: { sortOrder: 'asc' } })` (3 bucket-rollup rows) + `prisma.room.findFirst({ where: { projectId, isProjectOverhead: true } })` (COPE pricing detection for the `isCope: true` flag on BASE).

**Writes**: Maps the 3 ILI rows onto `content.lineItems[]` of the one `investment`-type slide. Preserves `retainerLabel`, `retainerAmount`, `address`.

**Short-circuits**: `if (!investmentRow || investmentRow.isUserModified) return` at line 639. User-edited slides are immune.

**Call sites** (all internal to `db.ts`):
- `getDeckForProject()` at `db.ts:924` — every page load on a non-empty deck.
- `regenerateDefaultDeck()` at `db.ts:1033` — Generate Default Deck button + empty-state CTA.

No external callers. Fully idempotent. After this refactor, **this function is replaced** by a new sync that reads grouped rooms from the DB and projects them into `content.lineItems` as parent/child entries.

---

## 3. Room Pricing Model + Bucket Question

### Where Room.total* are written

Single source of truth: `computeRoomPriceRange()` at `app/lib/room-price-range.ts:80–119`:

```ts
export function computeRoomPriceRange(
  room: RoomForRange,
  st: SectionTypeForRange,
  lowPct: number = DEFAULT_LOW_PCT,    // -10%
  highPct: number = DEFAULT_HIGH_PCT,  // +10%
): { rangeLow: number; rangeHigh: number } | null
```

`recomputeInvestmentRollups()` at `investment-rollup.ts:176–202` calls it and backfills `Room.totalLow/totalTarget/totalHigh` for PROFILE and AI_ESTIMATE tiers. MANUAL tier rooms are never overwritten (line 178).

### Recompute triggers

12 call sites already enumerated in Section 1. Most relevant: every project page load triggers fire-and-forget recompute at `page.tsx:49–60`, so `Room.total*` is effectively always current.

### Null-value handling — real data

**9 of 64 non-COPE rooms have `totalLow = null`** (≈14%). Spot-checks of which rooms:

- `Dining Room`, `Entry Way`, `Attic`, `Exterior` on Oyster Reef
- `Kitchen To Living Room Wall Opening`, `Wall Openings And Partial Wall Removal`, `Living Room Slider Replacement` on small projects
- `Primary Closet (7 Ft X 11 Ft)` on Carma Court
- `Laundry Room` on one Sussex project

Pattern: rooms without a SectionType assigned, "scope description" pseudo-rooms, or user-incomplete MANUAL entries. **Render policy recommendation: skip rows where both `totalLow` and `totalHigh` are null.** Matches the Phase 8A T6 Investment bug-fix pattern already shipped.

### Room.bucket — exists ✅

`prisma/schema.prisma:228`:
```prisma
bucket  SectionBucket  @default(BASE)
```

Enum `SectionBucket` at schema.prisma:475: `BASE | ALTERNATE | ALLOWANCE`. Not nullable. Default BASE. **No new bucket field needed.**

Index `@@index([projectId, bucket])` at line 254 already exists — bucket-filtered queries are fast.

### displayGroupId — no existing field fits

Room's nullable string fields: `roomTypeId`, `stylePresetId`, `sectionTypeId`, `selectedRenderMediaId`, `customUnitLabel`, `measurementSource`, `estimateStaleReason`. All semantically committed. **New nullable columns required.**

### Distinct RoomType names in DB (7 values)

```
Breakfast Nook | Carolina Room | Dining Room | Kitchen | Laundry | Living Room | Primary Bath
```

### Distinct Room.name across all projects (48 values)

Captured by `scripts/investigate-room-grouping.ts`. Highlights:
- Both `"Cope"` (legacy) and `"Cost of Project Execution"` exist.
- 14 distinct Primary-Suite sub-rooms ("Primary Bathroom His Water Closet", "Primary Closet (7 Ft X 11 Ft)", etc).
- Several "scope description" rooms ("Kitchen To Living Room Wall Opening", "Partial Wall Removal – Kitchen To Living Room", "Wall Openings And Partial Wall Removal") that aren't physical spaces.
- One `"Attic"` that matches nothing in the current ruleset.

---

## 4. Name-Matching Robustness Check

Ruleset applied to **all 74 rooms across 10 projects** via `scripts/investigate-room-grouping.ts`. Priority resolution: COPE → Primary Suite → Kitchen & Dining → Living Spaces → Carolina → Utility → Outdoor → Bedrooms → Bathrooms → Ungrouped.

### Distribution table

| Group | Rooms | % | Distinct names |
|---|---|---|---|
| Primary Suite | 19 | 25.7% | 14 |
| Kitchen & Dining | 10 | 13.5% | 6 |
| Living Spaces | 6 | 8.1% | 4 |
| Bedrooms (individualized) | 4 | 5.4% | 4 |
| Bathrooms (individualized) | 15 | 20.3% | 12 |
| Carolina Room | 1 | 1.4% | 1 |
| Utility Rooms | 5 | 6.8% | 2 |
| Outdoor | 1 | 1.4% | 1 |
| Ungrouped | 2 | 2.7% | 2 |
| COPE | 11 | 14.9% | 2 |

**Ungrouped rate 2.7%** — acceptable.

### Ambiguity (matched multiple groups)

| Room name | Matched | Resolved to |
|---|---|---|
| `Kitchen To Living Room Wall Opening` | Kitchen & Dining + Living Spaces | Kitchen & Dining |
| `Partial Wall Removal – Kitchen To Living Room` | Kitchen & Dining + Living Spaces | Kitchen & Dining |

Both are **scope-description pseudo-rooms**, not physical spaces. Priority pick feels arbitrary but harmless — and the user can always drag them to Ungrouped (or to either group) on the tree UI. Resolution-by-priority is acceptable for the auto-pass.

### Closet orphan cases

**None in current data.** Every non-primary closet in the DB (`Bedroom 2 Closet`, `Bedroom 3 Closet`) has its parent bedroom's name as a substring. "Primary Closet (7 Ft X 11 Ft)" matches Primary Suite via the "primary" token. **Risk for future data**: a future closet named "Walk-in Closet" (no bedroom reference) falls to Ungrouped. User fixes via drag. Acceptable — rule works for the current convention.

### Ungrouped rooms (fell through)

| Room name | Project | Note |
|---|---|---|
| `Attic` | Oyster Reef | Real space, no rule matches — user drags to Utility or its own group |
| `Wall Openings And Partial Wall Removal` | Isle of Pines | Pseudo-room, Ungrouped is correct |

### Feels-wrong cases — **zero**

Full Oyster Reef render-order preview (23 rooms):

```
[Primary Suite]        Primary Bedroom, Primary Closet 1, Primary Closet 2, Primary Bath, Primary Hallway
[Kitchen & Dining]     Dining Room, Breakfast Nook, Kitchen, Pantry Dry Bar Area
[Living Spaces]        Entry Way, Living Room
[Bedrooms]             Bedroom 2, Bedroom 2 Closet, Bedroom 3, Bedroom 3 Closet
[Bathrooms]            Jack And Jill Bathroom, Powder Room
[Carolina Room]        Carolina Room
[Utility Rooms]        Laundry Room, Mudroom
[Outdoor]              Exterior
[Ungrouped]            Attic
[COPE]                 Cost of Project Execution
```

Every auto-assignment is intuitive. The ruleset is **ready to build against**.

---

## 5. Proposed Schema Changes

### Migration

```prisma
model Room {
  // ... existing fields ...

  /// Slug of the display group this room belongs to on the Investment tab.
  /// Set automatically at room creation via the auto-group rule; updated by
  /// user drag-to-reparent. Null only on legacy rows before migration.
  displayGroupId      String?

  /// Position within the displayGroupId. Root-level lines (displayGroupId =
  /// null or "ungrouped") use the same field for flat-list ordering.
  displayGroupOrder   Int      @default(0)

  @@index([projectId, displayGroupId, displayGroupOrder])
}
```

SQL shape (additive, zero-downtime):
```sql
ALTER TABLE "Room" ADD COLUMN "displayGroupId"    TEXT;
ALTER TABLE "Room" ADD COLUMN "displayGroupOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Room_projectId_displayGroupId_displayGroupOrder_idx"
  ON "Room" ("projectId", "displayGroupId", "displayGroupOrder");
```

### Slug allowlist (TypeScript-side; not a DB enum, for forward compatibility)

```
primary-suite | kitchen-dining | living-spaces | bedrooms |
bathrooms | carolina-room | utility-rooms | outdoor |
ungrouped | cope
```

Plus **per-bedroom and per-bathroom child slugs** for the individualized groups:
- `bedrooms:<roomId>` — e.g. `bedrooms:cmo8mgpmh3000p87k`
- `bathrooms:<roomId>`
- `carolina-room:<roomId>`

Example: Bedroom 2 gets `displayGroupId = "bedrooms:<bedroom2-id>"`. Bedroom 2 Closet gets the same value (because it was name-matched to Bedroom 2 at creation). The parent row on the UI tree is Bedroom 2; the closet is nested under it.

If this feels too clever for persisted state, the alternative is: Bedroom 2 gets `displayGroupId = "bedrooms"`, Bedroom 2 Closet gets `parentRoomId = <bedroom2-id>`. This uses a second FK instead of a composite slug. **See Section 7 Q4.**

### Backfill

```sql
-- One-off: populate displayGroupId + displayGroupOrder for every existing Room
-- by running the auto-group rule. Runs as part of the migration transaction.
```

Implementation: a TS migration script that iterates every Room, applies the classifier, and writes the slug + order. Runs once at migration time; not on hot paths.

### The "auto vs user-confirmed" question — **no flag needed**

Steve asked whether we need to distinguish `displayGroupSource: 'auto' | 'user'`. **Recommendation: no.** Rationale:

- Auto-group runs **once** at room creation. After that, `displayGroupId` is authoritative.
- Room renames do **not** re-trigger auto-group. (We don't re-classify on `updatedAt` or any field change.)
- If the product ever wants to re-classify an existing room (e.g., because you improved the rules), it's a one-off operation — write a migration, not a per-row flag.
- A `source` enum adds state we'd have to maintain without a clear read-side consumer.

The null-state of `displayGroupId` itself signals "needs backfill" (legacy rows only). After backfill, null never occurs for new data.

---

## 6. Parent/Child Tree UI Proposal

### Current Investment tab

`app/admin/projects/[id]/investment/investment-tab.tsx:114–171` — flat `<table>` inside a collapsible section. Columns: `Section | Bucket | Pricing profile | Range`. Rows built from `sectionsSorted` (Room-sourced data, already). Filter-and-map by `bucket` at render. No drag today, no grouping.

### Existing drag infrastructure — dnd-kit already installed ✅

```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2"
```

Used today in:
- `app/admin/projects/[id]/rooms/rooms-tab.tsx:1945–1990` — `DndContext` + `SortableContext` + `useSortable` with `verticalListSortingStrategy`. Flat vertical reorder. Server-side via `reorderRoomsAction`.
- `app/admin/projects/[id]/media/client-media-grid.tsx`.

**Recommend: reuse dnd-kit.** Specifically, a nested sortable pattern: one `DndContext`, two `SortableContext`s — outer over parent groups (non-interactive), inner over children within each group. `closestCenter` collision detection; `onDragEnd` reparents and recomputes `displayGroupOrder`.

### Tree UX (minimal-change)

```
┌─────────────────────────────────────────────────────────────┐
│  Per-section breakdown (23)              [+ Add Group]       │
├─────────────────────────────────────────────────────────────┤
│ ▾ 🏠 Primary Suite                       Base   $67k–$83k    │
│     Primary Bedroom                            $17k–$21k     │
│     Primary Closet 1                            $1k–$1.6k    │
│     Primary Closet 2                            $3k–$4k      │
│     Primary Bath                               $42k–$51k     │
│     Primary Hallway                             $3.8k–$4.7k  │
│ ▾ 🍳 Kitchen & Dining                    Base   $72k–$88k    │
│     Dining Room                                 TBD          │
│     Breakfast Nook                              $7.5k–$9k    │
│     Kitchen                                    $51k–$63k     │
│     Pantry Dry Bar Area                        $12k–$15k     │
│ ▸ 🛋️ Living Spaces                       Base   $27k–$34k    │
│ ▾ 🛏️ Bedroom 2                           Base   $13k–$16k    │
│     Bedroom 2                                  $11k–$14k     │
│     Bedroom 2 Closet                            $1k–$1.5k    │
│ ▸ 🛏️ Bedroom 3                           Base   $13k–$17k    │
│ ▸ 🚿 Jack & Jill Bathroom                Base   $17k–$20k    │
│   Powder Room                            Base   $11k–$14k    │
│   Carolina Room                          Base   $21k–$26k    │
│ ▸ 🧺 Utility Rooms                       Base   $30k–$36k    │
│   Exterior                               Base   (no pricing) │
│   Attic                                  Base   (no pricing) │
├─────────────────────────────────────────────────────────────┤
│ 🔒 Cost of Project Execution             Base   $13k–$16k    │
└─────────────────────────────────────────────────────────────┘
```

Key behaviors:
- Chevron (▸/▾) toggles expand/collapse per group.
- **Parent row always shows summed range** (whether expanded or collapsed) — matches Steve's JobTread reference.
- Every row has a drag handle **except** COPE (locked, shown with 🔒 icon).
- Single-room "groups" (Powder Room, Carolina Room, Exterior, Attic in the mockup) render at root level with their own name — no fake parent wrapper. Matches Steve's decision: "Single-room groups show no descriptor" + "Parents with only one child still render as the group" — the latter only applies when the room is in a named group (e.g., Carolina Room slug). If Carolina Room is its own slug-group with 1 room, it DOES render as a parent. If a Room landed in `ungrouped`, it renders flat at root.
- Bucket column preserved. Pricing profile column preserved.
- **Parent header dragging**: proposing **parent headers are NOT draggable**. Group order is fixed by the priority constant in code (Primary Suite → COPE). Users re-organize *within* groups or re-parent children by dropping onto a different parent header. Simplifies drag logic; aligns with Steve's "fixed render order" spec. See Section 7 Q5 if you want this changed.
- COPE at bottom, bolted.

### Drop zones

1. **Onto a parent header** → `child.displayGroupId = parent.slug`, `displayGroupOrder = lastOrder + 1`.
2. **Onto another child** (within or across groups) → same slug as target, insert at target's position.
3. **Between two parents** (empty row separator) → `child.displayGroupId = "ungrouped"`, `displayGroupOrder` positions it at drop point in root-level sequence. Rendered alphabetically today; explicit position on drop.
4. **COPE** is not a drop target. Its drag handle is absent.

### + Add Group affordance

Placement: **top-right of the tree header**, next to the row count. Click → popover with checkboxes for any **empty** predefined groups (Primary Suite, Kitchen & Dining, etc.) that no room currently belongs to. Selecting one creates an empty group row the user can then drag rooms into. Groups auto-disappear when empty (per Steve's decision #6) — "+ Add Group" is the restore mechanism.

For individualized groups (Bedroom 2, Bedroom 3), the popover lists every non-primary bedroom Room on the project, allowing its group to be restored. For ungrouped rooms, there's nothing to add — they land at root.

### Server-side

New server action `updateRoomDisplayGroup(projectId, moves: { id, displayGroupId, displayGroupOrder }[])`. Batch update in one Prisma transaction. Mirrors `reorderRoomsAction` (rooms-tab:1644). No new `/api` route needed — server actions are fine for admin-only mutations.

### Scope

UI change: ~150 lines for the tree view + dnd integration. Schema: 2 columns + 1 index. Backfill: one-off script in `prisma/migrations/<timestamp>/migration.sql` or as a TS migration script.

---

## 7. Risks, Flags, Open Questions

### Flags

- **F1 — `Attic` → Ungrouped.** Rare enough to leave as manual-drag fixable. If Steve wants to auto-group storage-type spaces, add a slug `storage` and rules matching `attic|basement|garage|storage`. Low effort.
- **F2 — Scope-description pseudo-rooms** (`Kitchen To Living Room Wall Opening`, `Wall Openings And Partial Wall Removal`, `Living Room Slider Replacement`): these aren't physical rooms but exist in the DB as `Room` records without pricing. They render on the tree with "TBD". **Recommend: filter `totalLow == null && totalHigh == null` out of both the Investment tab tree *and* the deck slide.** Already the T6 pattern on the current deck slide. Low risk.
- **F3 — 9 of 64 real rooms have null pricing** (see Section 3). Hide these at render. Matches F2's policy.
- **F4 — Parent "Includes: X, Y, Z" descriptor length.** Primary Suite can have 14 sub-rooms on Sussex. Recommend: deck slide truncates to 3 names + "… and N more". Investment tab tree has no descriptor — just the children themselves render.
- **F5 — `InvestmentLineItem` rollup stays live.** Confirmed via consumer audit: publish snapshot reads these rows. The current `syncInvestmentSlide` becomes a candidate for retirement **after** the tree sync ships and bakes in, but that's a follow-up decision. Do not remove in this phase.
- **F6 — Auto-group runs once at Room creation.** If a room is imported through Rendr's LiDAR flow, the classifier must be called at the Rendr import path too (not just the manual `createRoomAction`). Check `rooms/actions.ts` creation call sites during build.
- **F7 — Group header drag.** Recommending headers are NOT draggable (group priority is hardcoded). Simplifies UX and drag logic. If Steve wants group reordering, we'd need `Project.displayGroupOrder Json` or similar — new scope.

### Open questions for Steve

- **Q1 — Null pricing render policy.** Hide the row entirely, or render "TBD"? Recommend hide (matches T6).
- **Q2 — Auto-group on Rendr import.** The Rendr path (`app/admin/projects/[id]/rendr/**`) may also create Rooms. Confirm: classifier runs there too at import time? (I'd say yes — same rule, applied at any Room-creation call site.)
- **Q3 — "Storage" auto-group for Attic/Basement/Garage?** Ship it with the initial ruleset, or rely on manual drag? Recommend: ship it — `\b(attic|basement|garage|storage)\b` → slug `storage`. Adds a small affordance for whole-home projects.
- **Q4 — `displayGroupId = "bedrooms:<roomId>"` composite slug vs a second FK.** The composite is one field, less DB surface; the FK (`parentRoomId`) is more conventional but adds relation overhead. Recommend the composite slug — simpler, no referential integrity needed (slug is opaque). If Steve prefers a clean FK, we add `Room.parentRoomId String?` with `SetNull` on delete.
- **Q5 — Parent header drag.** My recommendation: parents not draggable; group order fixed by priority constant. Steve may disagree (JobTread lets you reorder). If so, add `Project.groupOrder Json @default("[]")` to store the override sequence. 5 extra lines.
- **Q6 — COPE "Cope" legacy name normalization.** One-off data migration to rename `Room.name = "Cope"` → `"Cost of Project Execution"`? Cosmetic only; the classifier catches both today.
- **Q7 — Where does the "+ Add Group" popover live?** Inline dropdown or a small modal? Recommend inline — fewer clicks.

### Architectural surprises

- **Project page load triggers `recomputeInvestmentRollups` fire-and-forget** (`page.tsx:49–60`). `Room.total*` is therefore always current. The new tree sync can read directly without worrying about staleness.
- **`Room.bucket` already exists** and is indexed. Grouping by bucket is free.
- **dnd-kit is already in use** (`rooms-tab.tsx`). No new dependency.
- **The Investment tab currently receives `items` from `InvestmentLineItem` but never uses them** in the Per-section breakdown — it already renders Room-sourced data. The refactor is mostly augmentation, not replacement.

---

# 5-sentence summary

Steve's direction inverts the earlier approach: instead of the deck slide classifying rooms at render time, the **Investment tab becomes the source of truth** via a parent/child tree with drag-to-reparent, and the deck sync reads the already-grouped result. Schema adds two Room columns (`displayGroupId: String?`, `displayGroupOrder: Int`) + one composite index — the auto-group rule runs once at Room creation and is never re-run, so no "auto vs user" flag is needed. The ruleset holds up against real data: **2.7% Ungrouped, zero feels-wrong matches across 74 rooms in 10 projects**, with only two scope-description pseudo-rooms landing ambiguously (harmless, user-draggable). The tree UI is buildable against the existing dnd-kit already used by `rooms-tab.tsx` — estimated ~150 lines for the view + a batch `updateRoomDisplayGroup` server action; `InvestmentLineItem` stays intact because the publish snapshot still reads it. Open questions for Steve are mostly policy (null-pricing hide vs TBD, composite slug vs `parentRoomId` FK, whether to ship a "Storage" auto-rule for Attic) — **none block the build**.
