# Phase 8C — Slide Visual Redesigns: Investigation

**Date:** 2026-04-23
**Scope:** Read-only. No code or schema changes.
**Target slides:** 9 (Investment), 10 (Design Retainer), Scope Deep-Dive, Why HHI, Before/After — plus the SaaS hourly-rate Settings field and a tenant-reference audit.

> Note: this replaces a prior `PHASE_8C_INVESTIGATION.md` that documented the COPE auto-trigger / bulk-button work (now shipped). That content is in git history on commits landing Phase 8C COPE.

---

## 1. Current Slide 9 (Investment) State

**File:** `app/admin/projects/[id]/deck/slides/InvestmentSlide.tsx` (347 lines, 1 layout: `table-callout`)
**Default slot:** order 1000, layout `table-callout` (per `default-spec.ts:107–111`)
**Content type:** `InvestmentContent` in `app/lib/deck/types.ts:363`
**Sync function:** `syncInvestmentSlide` in `app/lib/deck/db.ts` (writes `lineItems` grouped by `Room.displayGroupId`, plus `retainerAmount`/`retainerLabel` from `syncRetainerFromProject`)

### Rendered layout (single layout, `table-callout`)

Top to bottom:

1. **Section label** (uppercase tracking, accent color) — `slide.subheadline`, conditionally shown via `content.showSectionLabel`. Default subheadline is blank on the seeded slide; most projects never populate it.
2. **Headline** — `slide.headline || "Projected Investment"`. Serif headline + orange accent rule underneath.
3. **Table** — header row with "Space to Renovate" / "Range", striped data rows. Each row renders `item.label`, optional `item.includesText` grouping descriptor ("Includes: Kitchen, Breakfast Nook, Pantry Dry Bar Area"), and `formatRange(effectiveLow, effectiveHigh)`. Table header bg defaults to navy `#1B2A4A`.
4. **Retainer callout box** — bordered box below the table, shown when `content.showRetainerSection` (default true) AND `retainerLabel` + `retainerAmount` are set. Renders label + amount inline, optional description underneath.
5. **Total line** — `"Total Cost of Project Execution Range: $X–$Y"` in accent color, serif headline font.
6. **Spacer + thin footer rule** with `content.address ?? branding.address ?? ""` at the very bottom.
7. **Logo overlay** — opt-in via `content.showLogo` (default false).

### Where "Projected Investment" title is set

Fallback string `"Projected Investment"` is **hardcoded at InvestmentSlide.tsx:117**:

```tsx
{slide.headline || "Projected Investment"}
```

`slide.headline` comes from the DB row and is editable via InspectorPanel. But when the slide is auto-seeded, `syncInvestmentSlide` doesn't set a headline — the DB row's `headline` field stays null and the hardcoded fallback renders.

### Current visual issues (per Steve's note)

Walking the layout vs. NotebookLM benchmark PDFs:

- **Too sparse.** The retainer callout box sits in the middle of the slide between the table and total. With only one retainer line, the box looks like dead space. On a slide that's already dense with line items, it reads as a speedbump rather than a summary.
- **Table row padding is tunable but the default (`0.5em 0.9em`) feels utilitarian.** Zebra striping is `#fff` / `#F9FAFB` — very subtle, almost invisible at presentation scale.
- **Footer address** is set from `branding.address` fallback, which means if a tenant doesn't set a company address the line renders as empty whitespace. Already invisible but takes ~3% of slide height.
- **Section label is optional + almost always unused.** Default projects leave `subheadline` blank, so the section label (gold uppercase) never renders. The slide jumps straight from top padding to headline.
- **Total line color uses `resolvedAccent`** which is gold by default. Good.
- **`includesText` descriptors** (Phase 8A.1 feature) render in gray at 60% body size — good for scannability but can feel disconnected from the row label when tight.

### PDF / print behavior

Slide renders as 16:9 frame inside the PDF export pipeline. No special print CSS. The `table-callout` layout uses `flex-shrink-0` / `flex-1` spacer patterns to push content apart — this works cleanly in the PDF snapshot because each slide is rendered at a fixed viewport (no scroll, no wrap).

### Visual cleanup recommendations (preserve data structure)

These are optional polish items — none require content changes:

1. **Darker zebra striping** (`#F3F0EA` linen tone vs. `#FFFFFF`). Matches the NotebookLM warm palette and makes the stripes visible at 16:9 presentation scale.
2. **Tighter table padding** (`0.42em 0.9em` as the default) — matches the compact investment tables in the reference decks.
3. **Remove the retainer callout from the middle.** The retainer is already present on Slide 10 as a hero display; duplicating it as a callout on Slide 9 adds noise. Suggest: keep the retainer value in a single footer row below the Total line, not as a bordered box. (This is also implied by the Slide 10 redesign — the retainer's proper home is Slide 10's band 1.)
4. **Section label: keep optional but add a nicer default.** If kept as-is (no subheadline shown), remove the top padding reserved for it. Alternatively, provide a default subheadline like "YOUR PROJECT" so the label always renders.

**Flag in report:** these are recommendations only. Preserve all content-layer data (lineItems, includesText, buckets, ranges). No structural rework.

---

## 2. Current Slide 10 (Design Retainer) State

**File:** `app/admin/projects/[id]/deck/slides/DesignRetainerSlide.tsx` (717 lines, 3 layouts: `centered-hero`, `framed-card`, `dark-overlay-modal`)
**Default slot:** order 1100, layout `centered-hero`
**Content type:** `DesignRetainerContent` in `app/lib/deck/types.ts:1054–1122`
**Defaults:** `app/lib/design-retainer-defaults.ts`
**Sync function:** `syncRetainerFromProject` in `db.ts:886–940` — same function that updates Slide 9's retainer fields.

### Data sources today

| Field | Source | Notes |
|---|---|---|
| `retainerAmount` (string, e.g. "$22,000") | `syncRetainerFromProject` → `formatRetainerAmount(computeRetainer(subtotalHigh, {percent, roundTo, override}))` | Computed from ALL rooms' `totalHigh` sum × `Project.retainerPercent` (default 0.08, rounded to nearest `retainerRoundTo` / default $1,000). Overridden by `Project.retainerOverride` if set. |
| `sectionLabel` | `content.sectionLabel ?? "DESIGN RETAINER"` | Hardcoded fallback; editable via InspectorPanel. |
| `headline` | `slide.headline ?? "Your Design Retainer"` | Same pattern as Slide 9. Not set at seed time → hardcoded fallback renders. |
| `tagline` | `content.tagline ?? "Your investment in certainty before construction begins."` | Editable. Default in `HHI_DESIGN_RETAINER_DEFAULTS`. |
| `benefits[]` | `content.benefits ?? DEFAULT_DESIGN_RETAINER_BENEFITS` | **Already exactly matches the new spec's locked bullet copy** — see section below. Editable via InspectorPanel with legacy string[] → object[] migration via `normalizeBenefit`. |
| `description` | `content.description` | Only rendered in `framed-card` layout. |
| `noteText` | `content.noteText` | Fine print footer. Only rendered in `framed-card` and `dark-overlay-modal`. |
| `backgroundImage` | `content.backgroundImage` | Only `dark-overlay-modal`. |

### Default benefits (already matches Phase 8C spec!)

From `app/lib/design-retainer-defaults.ts:3`:

```ts
export const DEFAULT_DESIGN_RETAINER_BENEFITS: string[] = [
  "Full architectural design and space planning",
  "HOA / ARB submission and approval management",
  "Complete material and finish specifications",
  "Fixed-price build contract before construction begins",
];
```

These four strings are an **exact match** for the four checkmark bullets in the locked spec. No copy change needed for the bullets — just position them inside the new band-1 layout.

### Current layout (default: `centered-hero`)

Vertically centered single card:

- "DESIGN RETAINER" section label (top-left absolute)
- Centered serif headline (default "Your Design Retainer")
- Orange accent rule
- **Massive serif retainer amount** — `3.0em` × body scale, navy color (hero number)
- Muted italic tagline underneath
- Gold check + bullet list (flex-start, left-aligned)
- Architectural watermark SVG (circle + cross-lines, ~4% opacity) in top-right corner
- No explicit footer

### Does this slide know about construction totals today?

**No.** `DesignRetainerContent` has no field for construction-subtotal display. The current layout is a single hero amount + benefits list. It does NOT receive any Slide 9 data.

### Layout tokens that can be preserved in the 3-band redesign

| Token | Source | Reuse? |
|---|---|---|
| `LINEN = "#F5F0E8"` | component local | ✅ Keep — band background |
| `NAVY = "#1B2A4A"` | component local | ✅ Keep — main text color |
| `GOLD = "#B8860B"` | component local | ✅ Keep — accent default |
| `MUTED_NAVY = "#4A5568"` | component local | ✅ Keep — secondary body text |
| `GoldCheck` SVG component | lines 36–52 | ✅ Reuse directly — Band 1 bullets |
| `ArchitecturalWatermark` SVG | lines 56–82 | ✅ Reuse — background watermark |
| `TitleAccentRule` | shared | ✅ Reuse — separator between bands |
| `makeOutlineShadow` helper | lines 17–20 | ✅ Keep |

### Current architecture: single-card, NOT ready for three bands

`CenteredHeroLayout` is a vertically-centered flex column with `justifyContent: "center"`. It places ONE block centered on the slide. Rearchitecting to a three-band vertical layout is a **structural rewrite** of this layout (not a tweak). Proposal:

- Replace `centered-hero` as the default with a new `three-band-summary` layout key.
- Keep `centered-hero` / `framed-card` / `dark-overlay-modal` available for tenants who want the old look (or mark them deprecated and plan removal in a future phase).
- `three-band-summary` uses `flex-direction: column; justify-content: space-between` with three child bands, each ~30% slide height.

Each band's internal composition:

**Band 1 (retainer):** left-aligned block. Sub-label "Design / Feasibility Retainer" (small uppercase tracked) + large navy amount inline-right. Narrow tagline (optional hourly-rate sentence — see Section 8) + third-party-services sentence below. Bullet list of 4 gold-check benefits underneath.

**Band 2 (construction subtotal):** labeled "Projected Construction Investment" in small caps. Large navy range `$299,658 – $368,773` below. Small gray helper text "(Per the detail on the previous slide.)" underneath.

**Band 3 (total):** labeled "TOTAL PROJECT INVESTMENT" in caps at the top. Below it the **largest number on the slide** — sum of retainer + construction high (or retainer + full range). Gold or navy, tbd per Steve.

---

## 3. Construction Subtotal Sourcing (critical architectural question)

The answer is already built into the sync pipeline. **Option (a) is the right choice.**

### What the investigation found

`syncRetainerFromProject` in `db.ts:886` **already reads all rooms' `totalHigh`** to compute the retainer percentage:

```ts
const rooms = await prisma.room.findMany({
  where: { projectId },
  select: { totalHigh: true },
});
const subtotalHigh = rooms.reduce((sum, r) => sum + (r.totalHigh ?? 0), 0);
```

This same function writes to **both** `design-retainer` and `investment` slide rows. Extending it to also write a `constructionLow` / `constructionHigh` pair into `DesignRetainerContent` is a 5–10 line addition — no new sync fn, no new query, no slide-to-slide coupling.

### Why not option (b) "Slide 10 reads Slide 9's content"

Would require Slide 10 to either:
- query the DB for another slide's content at render time (adds a DB round-trip per deck render), or
- receive an extra prop via `SlideRenderer` / RSC page (tighter coupling, changes the slide contract).

Neither is worth it when the retainer sync already has the rooms query open.

### Why not option (c) "New sync writes aggregate to Slide 10 when Slide 9 changes"

Adds a second sync trigger chain. The existing `syncRetainerFromProject` runs on every `getDeckForProject` — same cadence as `syncInvestmentSlide`, guaranteed consistency.

### Recommended data flow

```
Room.totalLow / totalHigh
  ↓
syncRetainerFromProject (db.ts:886)
  reads: retainer fields + room totals  (already does this)
  computes: retainer amount  (already does this)
  computes: constructionLow / constructionHigh  (NEW: sum of Room.totalLow / totalHigh)
  writes to design-retainer slide:
    - retainerAmount (existing)
    - constructionLow (new)
    - constructionHigh (new)
    - totalLow = retainer + constructionLow (new — OR derive at render)
    - totalHigh = retainer + constructionHigh (new — OR derive at render)
  writes to investment slide:
    - retainerAmount (existing)
```

Alternative: don't persist `totalLow`/`totalHigh` on the slide content — derive at render time (`const total = retainerNum + constructionHigh`). Avoids staleness if the slide is read without re-syncing. Prefer this.

**New `DesignRetainerContent` fields needed:**
- `constructionLow?: number | null`
- `constructionHigh?: number | null`
- `constructionDisplayText?: string | null` — optional override for "(Per the detail on the previous slide.)" helper sentence. Default `null` → hardcoded text renders.

### One structural concern worth flagging

The retainer math is currently **percentage-based** (`subtotalHigh × 0.08`, rounded). The locked Phase 8C copy has a literal `$30,000` printed next to "Design / Feasibility Retainer". Options:

- (a) Interpret the `$30,000` as an example value — the actual number is still computed from `Project.retainerPercent` × subtotal, possibly overridden via existing `Project.retainerOverride`.
- (b) Switch to a fixed-dollar retainer model (new schema field, breaks current percentage-based computation).

**Recommendation: (a).** `Project.retainerOverride` already exists as an `Int?` — the per-project dollar override. If a tenant wants a fixed $30K retainer, they set `retainerOverride = 30000`. The copy shows whatever the sync computed. **No schema change.** The "$30,000" in the spec is an illustrative example, not a hardcode.

**If (b) is what Steve actually wants, flag now** — it's a bigger change touching the retainer computation, the Project schema, and the Investment slide's retainer footer.

---

## 4. Scope Deep-Dive Current State + Categorization Plan

**File:** `app/admin/projects/[id]/deck/slides/ScopeBreakdownSlide.tsx` (610 lines, 6 layouts: `text-grid` default, `dark-table`, `icon-columns`, `cards-split`, `photo-grid`, `three-pillars`)
**Default slot:** order 400, layout `text-grid` (per spec — only included if project has ≥2 rooms)
**Content type:** `ScopeBreakdownContent` in `app/lib/deck/types.ts:652`
**Row type:** `ScopeBreakdownRoom` in `app/lib/deck/types.ts:618`

### Current content structure

Room list — each row has:
- `id` (Room.id)
- `name` (snapshotted from Room.name)
- `description` (snapshotted from `Room.scopeNarrative`, editable)
- `isIncluded` (per-slide toggle)
- Per-row style overrides (title/desc font, size, color, etc.)

No category field. No grouping. No buckets. The slide is a flat list rendered as 1/2/3-column grid depending on room count (`gridColumns` helper at line 32).

### Where the data comes from

`syncScopeBreakdownFromRooms` (not shown in files I read, but referenced in db.ts). Snapshots `Room.name` + `Room.scopeNarrative` (via `stripScopeClarifications` helper in `app/lib/scope-narrative.ts`) into `content.rooms` at auto-gen time. After first snapshot, the `description` field is freely editable.

### Existing icon infrastructure (important — makes categorization cheaper than expected)

`ScopeBreakdownSlide.tsx:296–303` already has a **`SCOPE_ICONS` map keyed by five categories**:

```ts
const SCOPE_ICONS: Record<string, React.ReactNode> = {
  demolition: <>…</>,
  systems: <>…</>,
  cabinetry: <>…</>,
  surfaces: <>…</>,
  lighting: <>…</>,
  default: <>…</>,
};
```

**These categories match the Phase 8C spec exactly** (Demo / Systems / Cabinetry / Surfaces / Lighting). The icon SVGs are already implemented — hammer, cog, cabinet, grid, lightbulb. But the rendered slide layouts (IconColumns, CardsSplit, ThreePillars) all call `<ScopeIcon color={accent} />` **without passing a `name` prop** (lines 350, 430, 589), so the `default` icon always renders.

Whoever built this already anticipated categorization but didn't wire up the per-room assignment — it's been sitting dormant. Phase 8C can light it up.

### Categorization plan — options ranked

**Option (a): AI classification at sync time.**
Prompt Claude with each room's scope narrative: "Classify the primary trade category as one of: demolition, systems, cabinetry, surfaces, lighting." Store result on `ScopeBreakdownRoom.category`. Runs once per room at auto-gen/resync.
- Pros: Automatic. Handles nuanced cases (e.g., a kitchen room touches all five — AI picks the dominant one).
- Cons: Inference cost. Can misclassify. Needs a manual override UI anyway for corrections. One extra AI call per room on first sync.

**Option (b): Keyword/rule-based classifier.**
Create a small lookup like `classifyScope(narrative, roomName)` that regex-matches scope text:
- "demo", "demolition", "remove", "tear out" → demolition
- "plumbing", "electrical", "hvac", "mechanical" → systems
- "cabinet", "vanity", "millwork", "built-in" → cabinetry
- "flooring", "tile", "countertop", "backsplash", "paint" → surfaces
- "lighting", "fixture", "recessed", "pendant", "sconce" → lighting
- Pros: Deterministic. Zero runtime cost. Testable.
- Cons: Almost every kitchen narrative mentions several of these — which wins? Would need priority ordering that might feel arbitrary.

**Option (c): Manual per-room tagging.**
Add a `category` select to each row in the ScopeBreakdownInspector UI. No automatic classification — user picks.
- Pros: Most accurate. Zero AI cost. No regex brittleness.
- Cons: User effort per room. If they skip, default icon shows — no categorization happens.

**Recommendation: hybrid (b + c).**

1. Run the keyword classifier at sync time as an initial guess (free, deterministic).
2. Store the guess on `ScopeBreakdownRoom.category` (new optional field).
3. Add a dropdown in InspectorPanel to override per-row — falls back to the classifier result.
4. The render layer reads `room.category` and passes it to `<ScopeIcon name={room.category} />`.

This gets categories working for every project automatically with minimal AI cost and gives tenants a manual correction lever without requiring them to use it. Phase 8C work:
- New field `category?: "demolition" | "systems" | "cabinetry" | "surfaces" | "lighting"` on `ScopeBreakdownRoom`
- New helper `classifyScopeCategory(narrative, roomName)` in `app/lib/scope-narrative.ts`
- Sync layer: `syncScopeBreakdownFromRooms` runs classifier on new/refreshed rows
- Render layer: `<ScopeIcon name={room.category ?? "default"} />` in the three icon-layouts

**Precision concern to flag:** the classifier will occasionally misfire on rooms like "Powder Room" (surfaces? cabinetry? systems?). Acceptable because: (1) InspectorPanel override handles the minority case, (2) the default icon still renders reasonably when no category matches, (3) misclassification is cosmetic, not functional.

---

## 5. Why HHI Current State + 2-Pillar Plan

**File:** `app/admin/projects/[id]/deck/slides/WhyUsSlide.tsx` (1005 lines, 4 layouts: `pillars-grid` default, `editorial-cards`, `stacked-list`, `testimonials-split`)
**Default slot:** order 800, layout `pillars-grid`
**Content type:** `WhyUsContent` in `app/lib/deck/types.ts:470`
**Pillar type:** `WhyUsPillarItem` in `app/lib/deck/types.ts:436–463`

### Where pillars come from

`content.pillars` is **baked in at deck-load time from the `ValuePillar` table** (per the docblock at type definition, line 466–468). This is tenant-level content managed in Settings → Value Pillars (`app/admin/settings/value-pillars/`). Pillars have `title`, `body`, optional `iconUrl` (pointing to a `BrandIcon` PNG).

`selectedPillarIds` on the slide content controls which subset appear. Empty array / absent → show all.

### Section title default

`WhyUsSlide.tsx:38`:
```tsx
return content.sectionTitle || slide.headline || "The HHI Difference";
```

Hardcoded tenant string fallback. Flagged in Section 7.

### Current pillar count

Whatever the tenant has configured in `ValuePillar`. The `pillars-grid` layout renders them inline with vertical separators — visually breaks down at 5+. The `stacked-list` layout works for any count. The `editorial-cards` layout renders as flex cards that wrap awkwardly at 5+.

**No hardcoded pillar count** on any layout — the layouts adapt to whatever `getVisiblePillars()` returns.

### Current copy visible on the slide

Not hardcoded in the component. Rendered from `ValuePillar.title` + `ValuePillar.body`. To see what "The HHI Difference" looks like for a given project, need to read the seed data or live tenant DB. From `app/admin/settings/value-pillars/` + prisma seed, the HHI defaults are likely things like "Design-Build under One Roof", "Zero Change Orders", "Master Craftsmen", "White-Glove Service", etc. — but tenant-editable.

### 2-pillar collapse plan

**The slide doesn't need a layout change** — `pillars-grid` with 2 pillars already renders cleanly (two side-by-side columns with a vertical divider). The change is purely **content**: the tenant's ValuePillar table is trimmed from N pillars down to 2.

Two approaches:

**Approach A (no code change).** Steve/tenant edits the Settings → Value Pillars list, leaves only two. Existing deck UI lets the user `selectedPillarIds` to the chosen 2. Phase 8C "feature" is really "guidance + UX nudge" — update default tenant pillar seed data, update slide subhead / tagline copy, that's it.

**Approach B (layout-specific).** Add a new `two-pillar-emphasis` layout that's designed specifically for a two-pillar story — larger pillar titles, bigger iconography, maybe a diagonal split layout inspired by Slide 2 (Objective) three-pillar pattern. More code, more polish.

**Recommendation: A first, then B if time.** The value-pillars table is where the content lives. A Phase 8C build that just (1) updates the default seeded pillars to be 2 strong ones and (2) picks a better default `selectedPillarIds` shape would nail 80% of the ask. Layout work is additive.

**Which two pillars?** Open question for Steve. Investigation can't pick — this is positioning/copy work that requires marketing judgment. Candidates surfaced from existing tenant references:
- "Design-Build under One Roof" (implicit in `DesignBuildAdvantageSlide`, `"HHI Design-Build"` column header in RiskBriefSlide)
- "ZERO Change Orders" (strong value-prop if it's defensible)
- "Our Process" / "White-Glove Service"
- "Experience" (x years in Lowcountry)

Need Steve to pick. See Open Questions.

### Relationship to Slide 2 (Objective) three-pillar pattern

`ObjectiveSlide.tsx` renders 3 pillars from `project.objectivePillars` in a 3-column grid — that's a per-project, project-specific Why list (what the homeowner cares about on THIS renovation). `WhyUsSlide` is tenant-level — constant across all projects for a given tenant. Mirroring the 3-pillar grid visually at 2 pillars is visually fine, but they're meaningfully different content types. Don't conflate.

---

## 6. Before/After Current State + Bullet Strip Plan

**File:** `app/admin/projects/[id]/deck/slides/BeforeAfterSlide.tsx` (541 lines, 2 layouts: `side-by-side` default, `after-emphasis`)
**Default slot:** order 500 + `roomIndex * 10` (one slide per eligible room — needs `selectedRenderMediaId` AND ≥1 before photo)
**Content type:** `BeforeAfterContent` in `app/lib/deck/types.ts:1540`
**Sync function:** `syncBeforeAfterSlides` in `db.ts:435–525`

### Current layout

**`side-by-side` (default):** Header bar with `roomName` + accent line. Two equal image columns with dark-gradient bottom-left "BEFORE" / "AFTER" labels. Single italic `caption` line at the bottom.

**`after-emphasis`:** Left panel (~35% width, dark navy) with room name + caption + a small before-photo thumbnail stacked. Right panel is the after image as a full-bleed hero.

### Text data today

Only two text fields:
- `roomName` — snapshotted from `Room.name`
- `caption` — snapshotted via `stripScopeClarifications(Room.scopeNarrative)` at auto-gen; kept fresh unless `isUserModified`

**No bullet array field exists.** Adding bullets = schema (type) change + new sync/render code + InspectorPanel editing surface.

### Where bullets would come from

Bullet content options:

**Option (a): AI-generated from scope narrative.**
At sync time, prompt Claude: "Extract 3–5 concise before/after change bullets from this scope. Format: imperative past-tense, under 8 words each." Store on `content.bullets` (string[]). Free to regenerate.
- Pros: Automatic, no manual work. Scope narratives are often verbose prose — AI good at compressing.
- Cons: AI call per Before/After slide on first sync. Needs prompt tuning to avoid verbose fallbacks. **Over-summarization risk high** unless prompt is strict about word count.

**Option (b): Manually authored via InspectorPanel.**
Add an editable bullet list in the Before/After inspector. Tenant writes 3–5 bullets per slide.
- Pros: Accurate, zero AI cost, writer has full control.
- Cons: Manual work per slide. If a tenant has 8 Before/After slides, that's 8 bullet lists to write. Easy to skip, leaving bullets empty.

**Option (c): Derived from a subset of scope items (hybrid).**
If scope narratives become structured in a future phase (bullets already, not prose), this becomes free. Today the narrative is prose — can't reliably split.

**Recommendation: (a) with (b) override.**

1. Sync layer: AI generates bullets at first snapshot. Stored on `content.bullets`.
2. InspectorPanel: shows the AI bullets, editable inline (same pattern as `DesignRetainerBenefit[]`).
3. User edits → slide flips to `isUserModified`; sync leaves bullets alone after that point.

**Number of bullets: 3–5 is right.** Three is the floor (any fewer and the strip feels incomplete); five is the ceiling (any more and it crowds the image). Soft default: 4.

**Placement on the layout:**

- **`side-by-side`:** Replace the current bottom `caption` line with a horizontal bullet strip at the bottom. Bullets render as a flex row: `• Removed wall between kitchen and dining  • New oversized island with waterfall quartz  • Rift-sawn white oak flooring  • Flush recessed lighting throughout`. Limits on width handled by `flex-wrap: wrap` + ellipsis.
- **`after-emphasis`:** Bullets go in the left panel below the caption, as a vertical list with small gold checks or bullet dots.

**Brevity enforcement plan:**

The prompt needs:
- Hard word cap per bullet ("≤ 8 words")
- Present-perfect or past-tense verbs ("Removed wall", "Added built-ins")
- Prohibit filler ("The existing wall between the kitchen and dining room will be demolished…" → REJECT)
- Provide 2-3 few-shot examples in the prompt

Server-side validation: after AI returns, enforce a max word count and drop any bullet exceeding it. If fewer than 3 survive, fall back to the single `caption` line (current behavior).

### Implementation sketch for Phase 8C build

**Type change:**
```ts
// BeforeAfterContent adds:
bullets?: string[] | null;  // 3-5 concise change summaries
```

**Sync change:** `syncBeforeAfterSlides` calls a new helper `generateBeforeAfterBullets(room.scopeNarrative)` on first create and on refresh-when-not-user-modified. Helper lives in `app/lib/ai/` alongside existing AI fns. Uses a cheap short-context prompt.

**Render change:** `SideBySideLayout` replaces the bottom caption line with a bullet strip component when `content.bullets?.length >= 3`. Falls back to existing caption behavior when bullets are absent.

**Editor change:** `BeforeAfterInspector` gets a bullet-list editor (reuse the `DesignRetainerBenefit[]` pattern — it's already solved for similar ordered-editable string lists).

---

## 7. Tenant-Reference Audit

Goal: inventory every place the codebase has "HHI Builders" / "Hilton Head" / etc. that renders to a tenant's proposal. Phase 8C will fix the ones touching slides it redesigns; the rest becomes a SaaS-readiness backlog item.

**Total hits across `app/`: ~45 matches.** Many are AI prompts (legitimate — prompts ARE tenant-specific) or metadata titles (app-level, not tenant-rendered). Breakdown:

### Group 1 — Slide-rendered copy (proposal-facing) — FIX IN 8C IF THE SLIDE IS IN SCOPE

| # | File | Line | Current text | Recommendation |
|---|---|---|---|---|
| 1 | `deck/slides/WhyUsSlide.tsx` | 38 | `"The HHI Difference"` (fallback title) | **FIX IN 8C** — generic fallback like `"The Difference"` or `"Why Choose Us"`. Section 5's 2-pillar redesign touches this file already. |
| 2 | `deck/slides/RiskBriefSlide.tsx` | 683 | `"Diagnostic Matrix: The Traditional Model vs. HHI"` (default title in comparison-table layout) | Not in 8C slide scope — **flag for later**. Parameterize to `…vs. ${companyName}`. |
| 3 | `deck/slides/RiskBriefSlide.tsx` | 714 | `"HHI Design-Build"` (default right column header) | Not in 8C — **flag**. Parameterize to `${companyName} Design-Build`. |
| 4 | `deck/slides/DesignBuildAdvantageSlide.tsx` | 743–747 | Centerpiece SVG text renders literal "HHI" + "Builders" as two stacked `<text>` elements in the hub-and-spoke diagram | Not in 8C slide scope — **flag**. High-impact visual tenant-leak. Replace with `{companyName}` rendered as two lines (SVG wrapping). |
| 5 | `deck/InspectorPanel.tsx` | 2153, 2342 | Placeholders `"The HHI Difference"` for WhyUs section-title inputs | **FIX ALONGSIDE #1** — these are editor placeholders; can be blanked or made generic. |
| 6 | `deck/InspectorPanel.tsx` | 3615, 3669 | Placeholders `"Diagnostic Matrix: The Traditional Model vs. HHI"`, `"HHI Design-Build"` for RiskBrief inputs | Follows #2–#3 fate — flag for later. |
| 7 | `deck/InspectorPanel.tsx` | 1299 | Address placeholder `"e.g. 1 Mathews Dr, Hilton Head, SC 29926"` | Low-risk: placeholder only, not rendered in proposal. Could update to a generic example. Not in 8C. |
| 8 | `lib/deck/types.ts` | 694 | Type docblock says `comparison-table default: "HHI Design-Build"` | Docstring only — fix alongside #3. |

### Group 2 — Default-content files (HHI_* named constants seeded at app init)

| File | Contents |
|---|---|
| `app/lib/design-retainer-defaults.ts` | `HHI_DESIGN_RETAINER_DEFAULTS` — section label, headline, tagline, retainer amount, 4 benefit bullets. **Benefits are already tenant-neutral.** Headline "Your Design Retainer" is tenant-neutral. No HHI-specific copy in the actual values — the constant name is "HHI_*" but the data isn't HHI-branded. **No fix needed in 8C**; constant name rename can happen in a cleanup phase. |
| `app/lib/core-values-defaults.ts` | `HHI_DEFAULT_CORE_VALUES` — not read in 8C, flag for later review. |
| `app/lib/cope-defaults.ts` | `HHI_DEFAULT_COPE_ITEMS` — flag for later. |
| `app/lib/next-steps-defaults.ts` | `HHI_DEFAULT_NEXT_STEPS` + `HHI_NEXT_STEPS_DEFAULTS` — flag for later. |
| `app/lib/timeline-phases.ts` | Comment `"Canonical HHI Builders project timeline copy."` — docstring only. |

### Group 3 — AI prompts (legitimately tenant-specific — these SHOULD reference the tenant)

All in `app/lib/ai-*prompt.ts`, `app/api/ai-review/…`, `app/lib/ai/objective-content.ts`. These are **system prompts to Claude** that describe the estimator's identity and market context ("You are a construction estimating assistant for HHI Builders on Hilton Head Island, SC…"). These are appropriate where they parameterize from `companyName` / `market`, and work as-is today because the app IS single-tenant HHI. For multi-tenant, these need to read from `CompanySettings.companyName` + `CompanyContext.market` (most already do — see `settings?.companyName ?? "HHI Builders"` fallback pattern).

**Flag for later:** audit each prompt for hardcoded HHI references. Most already have the tenant-aware pattern; some still have the literal "HHI Builders" baked in. Not urgent — the prompts still work for HHI.

### Group 4 — App-level metadata (not tenant-rendered)

- `app/layout.tsx:80` — HTML `<title>` "HHI Builders Proposal App" — app chrome, not proposal content
- `app/page.tsx:17` — Landing page heading "HHI Builders Proposal App"
- `app/proposals/[snapshotId]/layout.tsx:4` — Client-facing proposal page `<title>` "HHI Builders — Proposal" — **tenant-leak** on published links
- `app/proposals/[snapshotId]/not-found.tsx:10` — Text: "Please contact HHI Builders for an updated link." — **tenant-leak**

### Group 5 — Infrastructure / tooling

- `app/admin/settings/integrations/google-workspace/actions.ts:28` — `INTEGRATION_NAME = "HHI Builders Workspace"` — internal integration label
- `app/lib/email/providers/google-workspace-dwd.ts:150, 411, 418` — SMTP test email subject/body uses "HHI Builders" — tenant-leak only on test sends
- `app/lib/jobtread/catalog-api.ts:126` — Fallback org ID for JobTread — HHI-specific, acceptable for single-tenant

### Audit summary

- **Slide-level tenant-leaks touching Phase 8C scope:** 2 (WhyUs #1, InspectorPanel #5). FIX IN 8C.
- **Slide-level tenant-leaks NOT in Phase 8C scope:** 4 (RiskBrief × 2, DesignBuildAdvantage SVG text, RiskBrief placeholders). FLAG FOR LATER.
- **HHI_* constant names:** ~8. Cosmetic rename can be a cleanup phase. Not urgent.
- **Client-facing published-proposal tenant-leaks:** 2 (published proposal `<title>` + not-found page). **High-impact for multi-tenant.** Flag as Phase 10 priority.
- **AI prompts:** ~15 hits. Most already parameterize via `CompanySettings`. Remaining hardcodes are low-stakes (literal HHI where tenant is HHI).

---

## 8. Settings Field Proposal (Design Hourly Rate)

### Where in Settings UI

**Proposal Defaults tab** (`app/admin/settings/proposal-defaults-tab.tsx`) is the correct semantic bucket.

Rationale:
- The field is a **default used across proposals**, not a branding asset (color/logo) and not a pricing profile (used for estimation math).
- The form is already wired for `CompanySettings` mutations via `saveProposalDefaultsAction`.
- The existing field `defaultProposalDisclaimer` is the same class of thing (text used on rendered proposals).
- Route: `/admin/settings/proposal-defaults` — already in `SHARED_SETTINGS_TABS`.

Alternatives considered and rejected:
- `branding-tab.tsx` — wrong semantic (hourly rate isn't a visual asset)
- `company-profile-tab.tsx` — reasonable but this tab is about legal/contact identity, not pricing
- Creating a new "Pricing" tab — overkill for one field; can grow later

### Schema

**Add to `CompanySettings` model** (`prisma/schema.prisma:551`):

```prisma
designHourlyRate Int? // null = hide hourly-rate sentence on retainer slide; set = display "billed at $N/hour"
```

- `Int?` (not `Float?`): rates like $200, $175, $250 are integer dollars. If someone needs $200.50 they can use 201 — don't add decimal complexity for a tenant-visible headline number.
- **Nullable with `null` default.** Matches the spec: when null, the slide omits the hourly-rate sentence entirely. When set, sentence renders as "Design work billed at our published rate of $200/hour." with the number interpolated.
- **No per-project override yet.** A tenant has one published hourly rate; per-project variation is unlikely to be needed soon. If it becomes needed, add `Project.designHourlyRate Int?` later — pattern matches existing `Project.retainerOverride`.

**Migration:** one-line ALTER:

```sql
-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN "designHourlyRate" INTEGER;
```

### Default value strategy

- Field defaults to **`null`** on all existing rows (migration's `ADD COLUMN` without default leaves NULL).
- `HHI_DESIGN_RETAINER_DEFAULTS` in `app/lib/design-retainer-defaults.ts` does NOT bake a default hourly rate (keep SaaS-neutral).
- Retainer slide render logic:
  ```ts
  const rate = settings.designHourlyRate;
  const hourlyLine = rate != null
    ? `Design work billed at our published rate of $${rate}/hour.`
    : null;
  ```
  When `null`, the whole sentence is omitted. When set, it renders inline in band 1.

### Settings UI addition

One row in `proposal-defaults-tab.tsx`, something like:

```tsx
<div>
  <label htmlFor="designHourlyRate" className={labelClass}>
    Design hourly rate (USD)
  </label>
  <input
    id="designHourlyRate"
    name="designHourlyRate"
    type="number"
    min={0}
    max={5000}
    step={1}
    defaultValue={settings.designHourlyRate ?? ""}
    placeholder="e.g. 200 — leave blank to hide from retainer slide"
    className={inputClass}
  />
  <p className="mt-1 text-xs text-zinc-500">
    Shown on the Your Investment slide. Leave blank to omit the hourly-rate sentence entirely.
  </p>
</div>
```

Matching FormData handler logic in `saveProposalDefaultsAction`: parse as `Number(raw)` → if NaN or empty, persist `null`; else persist as int.

### Other tenant-level pricing settings to consider

Steve asked in the prompt whether other pricing settings should live alongside the hourly rate. Candidates surfaced during investigation:

- **Default retainer percent** — currently `Project.retainerPercent` with default `0.08`. Moving the default to `CompanySettings.defaultRetainerPercent` would let tenants configure their standard retainer without editing the Project schema default. Low urgency.
- **Default retainer round-to** — currently `Project.retainerRoundTo` default `1000`. Same pattern.
- **Third-party markup percentage for internal use** — doesn't appear to exist in schema today. Would be a new pricing input.

**Recommendation:** add ONLY the hourly rate in Phase 8C per spec. Flag the retainer-percent/round-to migration candidates for a future "Pricing Defaults" settings section (not 8C).

---

## Risks, Flags, Open Questions

### Structural concerns

1. **Retainer amount in the locked spec ("$30,000") conflicts with the percentage-based math.** The sync computes retainer as `subtotalHigh × retainerPercent`, rounded. To show a literal $30K, either (a) treat $30K as an example value and let `Project.retainerOverride` drive the actual number, or (b) switch to fixed-dollar retainer math. **Need Steve to confirm.** See Section 3.

2. **Slide 10 rewrite is a new layout, not a tweak of `centered-hero`.** The existing hero-card pattern doesn't decompose into three bands — introducing `three-band-summary` as a new layout key is cleaner than mutating `centered-hero`. Impact: new layout registration, potential migration for existing tenant decks where `centered-hero` was user-selected.

3. **Scope Deep-Dive has dormant icon infrastructure** for the exact five categories the spec asks for — but the wire-up was never finished. Phase 8C can light it up, but should test with tenant scope narratives to confirm the keyword classifier has acceptable precision before shipping.

4. **Before/After bullet brevity is a prompt engineering risk.** AI-generated bullets from prose scope narratives will over-summarize by default. Needs a strict word-count prompt + server-side validation + graceful fallback to the existing caption when bullets don't land.

5. **`DesignBuildAdvantageSlide.tsx:743–747` renders hardcoded "HHI" + "Builders" as SVG text** in the hub-and-spoke diagram. Not in 8C slide scope, but it's a visible tenant-leak on published proposals. Flagged for later.

### Lower-risk flags

- Published-proposal `<title>` ("HHI Builders — Proposal") appears in browser tabs when clients open share links. Tenant-leak, Phase 10 item.
- `HHI_*` constant names are cosmetic; rename in a later cleanup.
- Most AI prompts already tenant-parameterize; the leftover hardcodes are low-stakes.

### Open questions for Steve (need answers before build)

1. **Retainer math interpretation.** Is the locked `$30,000` an illustrative example (actual value from percentage × subtotal, or from `retainerOverride`) — or does Phase 8C switch to a fixed-dollar retainer model? (Recommend: illustrative; use existing `retainerOverride` lever.)

2. **Scope Deep-Dive categorization approach.** Keyword classifier + manual override (my recommendation), pure AI classification, or pure manual tagging?

3. **Why HHI 2-pillar content.** Which two pillars win? Candidates: "Design-Build under One Roof", "ZERO Change Orders", "Our Process / White-Glove Service", "Experience". Investigation can't pick — this is positioning.

4. **Before/After bullet source.** AI-generated at sync with manual override (my recommendation), or fully manual?

5. **Slide 10 layout migration strategy.** Ship `three-band-summary` as a new layout while keeping the three existing layouts, or deprecate the existing three in favor of the new default?

6. **Total-project number styling.** "Visually the largest, labeled in CAPS" is spec'd. What color — gold accent or navy? What about when retainer is disabled (`project.retainerEnabled = false`) — does band 1 disappear entirely, or remain with a "Retainer not included" state?

7. **Band-2 helper text copy.** Spec says "(Per the detail on the previous slide.)" — confirm this exact copy is locked, or would something like "(See previous slide for breakdown.)" work?

8. **`hasAddition` projects.** Slide 9 → Slide 10 is order 1000 → 1100. Addition Overview (order 1300) and Closing (order 1400) come after. Does "the previous slide" in band-2 helper text still work when `hasAddition` inserts an extra slide? (It does today — Addition Overview comes AFTER retainer — confirming.)

---

## 5-sentence summary for Steve

The Investment slide (9) needs only a minor polish pass — the layout already supports the Phase 8A.1 grouped line items cleanly, and the only meaningful structural change is removing the mid-slide retainer callout (which duplicates Slide 10's content) and tightening the zebra striping for presentation scale. The Retainer slide (10) redesign is the heaviest lift: the existing `centered-hero` layout is a single-card pattern that doesn't decompose into three bands, so Phase 8C introduces a new `three-band-summary` layout reusing the existing gold-check/accent tokens; the construction subtotal architecturally sources from `syncRetainerFromProject` (which already reads all room totals to compute the retainer), so adding `constructionLow`/`constructionHigh` fields to `DesignRetainerContent` is a 5–10 line extension with zero slide-to-slide coupling. Scope Deep-Dive already has the exact five-category icon infrastructure (demolition/systems/cabinetry/surfaces/lighting) sitting dormant — the recommendation is a keyword classifier seeding a new per-row `category` field with InspectorPanel override, which lights up existing code without AI inference cost. The Why HHI 2-pillar collapse is primarily a content decision (which two pillars?) rather than a code change — `pillars-grid` renders 2 pillars cleanly as-is — with optional polish available as a `two-pillar-emphasis` layout if time allows. Tenant-reference audit found 2 slide-level hits in Phase 8C scope (parameterize in the build) and 4 outside scope (`RiskBrief` × 2, `DesignBuildAdvantage` SVG text, InspectorPanel placeholders) to defer to a SaaS-readiness phase; the new `CompanySettings.designHourlyRate` field is a nullable int, defaults null → slide omits the hourly-rate sentence entirely, lives in Proposal Defaults settings tab.

**Waiting for "proceed" before any build prompt is written.** Key questions for Steve: (1) retainer math — is $30K illustrative or do we switch to fixed-dollar, (2) which two pillars for Why HHI, (3) bullet-source approach for Before/After, (4) Slide 10 new-layout migration strategy.
