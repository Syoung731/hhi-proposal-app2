# Deck Builder Refactor — Investigation Report

**Date:** 2026-04-21
**Scope:** Phase 8A read-only investigation. No code was modified.
**Branch at investigation:** `proposal-v2`

---

## 1. Current Architecture

### Data model

**Prisma models** (`prisma/schema.prisma`):

| Model | Purpose | Key fields |
|---|---|---|
| `ProposalDeck` (lines 901–908) | One deck per project | `id`, `projectId` (unique FK), `slides[]` |
| `DeckSlide` (lines 910–938) | Individual slide record | `id`, `deckId`, `type`, `layoutKey`, `order` (Int, gap-based), `isEnabled`, `isUserHidden`, `isUserModified`, `source` ("manual"\|"auto"), `sectionId?`, `headline?`, `subheadline?`, `body?`, `content` (Json), `isLocked`, `lockPosition` ("first"\|"last"), `backgroundId?`, `textZone` (Json) |

- **Order strategy:** gap-based integers with fixed anchor values (cover=0, objective=100, scope-overview=200, before-after=300+10×i, scope-breakdown=400, why-us=500, investment=600, next-steps=700, closing=900). Reorders rewrite the full `order` set on save.
- **Self-contained slides:** `beforeImageUrl` / `afterImageUrl` URLs are snapshotted into `content` so published decks survive media deletion.
- **Type registry:** discriminated string union at [app/lib/deck/types.ts:6](app/lib/deck/types.ts:6) — no central enum; switch statements throughout.

### Orchestration (deck generation)

Single entry point: `getDeckForProject()` in [app/lib/deck/db.ts:1025](app/lib/deck/db.ts:1025).

Flow on every page load:

1. **Upsert** `ProposalDeck` (empty record if absent).
2. **Seed** via `seedDefaultSlides()` (lines 84–338) if `deck.slides.length === 0`. Creates **13 base slides** in one batch.
3. **Backfill** (lines 729–1009) — every page load adds any slide types missing from the deck (design-retainer, visual-inspiration, client-testimonials were added this way post-launch).
4. **Auto-sync** (lines 1070–1074):
   - `syncBeforeAfterSlides()` — one per room
   - `syncScopeBreakdownSlide()` — unrendered rooms combined
   - `syncInvestmentSlide()` — from `InvestmentLineItem`
   - `syncProjectTimelineSlide()` — from `TimelinePhase`
   - `syncRetainerFromProject()` — from project settings
5. Filter `isUserHidden=false`, sort by `order`, return.

**Net effect today:** a new deck lands with ~16–18 slides. There is no manual "generate" button; generation is implicit on first load.

### Deck Builder page

Route: [app/admin/projects/[id]/deck/page.tsx](app/admin/projects/[id]/deck/page.tsx). Client: `DeckEditorClient.tsx`.

Three-column sticky layout:

- **Left (192px)** — `SlideRail.tsx`. Thumbnails at 0.135× scale, native drag-and-drop (not dnd-kit), enable/disable toggle, lock indicators. Locked slides respect "first"/"last" position.
- **Center** — `SlideCanvas.tsx`. 1280×720 preview, `overflow: hidden`, aspect-ratio locked. No shrink-to-fit, no overflow scroll.
- **Right** — `InspectorPanel.tsx` (~6,500 lines). Per-slide form fields, background picker, text-zone editor, Duplicate/Remove, type-specific controls.

Toolbar (in `ProjectTabNav` right slot, lines 815–852): **+ Add Slide ▾**, **⚡ Before/After ▾**, **Save**. No "Generate Deck", no "Library".

### Full slide inventory (19 types)

| # | slideType | Component | Default deck? | Data source | Known issues |
|---|---|---|---|---|---|
| 1 | `cover` | [CoverSlide.tsx](app/admin/projects/[id]/deck/slides/CoverSlide.tsx) | ✅ seed, locked first | Project + hero media | — |
| 2 | `objective` | [ObjectiveSlide.tsx](app/admin/projects/[id]/deck/slides/ObjectiveSlide.tsx) | ✅ seed | AI (objective-content.ts) | **Prose wall-of-text, 10+ lines** |
| 3 | `scope-overview` | [ScopeOverviewSlide.tsx](app/admin/projects/[id]/deck/slides/ScopeOverviewSlide.tsx) | ✅ seed | AI narrative | Duplicate sentence (bug #4) |
| 4 | `before-after` | [BeforeAfterSlide.tsx](app/admin/projects/[id]/deck/slides/BeforeAfterSlide.tsx) | ✅ auto-sync (per room) | Room media pair | — |
| 5 | `scope-breakdown` | [ScopeBreakdownSlide.tsx](app/admin/projects/[id]/deck/slides/ScopeBreakdownSlide.tsx) | ✅ auto-sync | Rooms list | **COPE appears as a "room" (bug #7)** |
| 6 | `why-us` | [WhyUsSlide.tsx](app/admin/projects/[id]/deck/slides/WhyUsSlide.tsx) | ✅ seed | `ValuePillar[]` | Too many pillars (target: 2) |
| 7 | `risk-brief` | [RiskBriefSlide.tsx](app/admin/projects/[id]/deck/slides/RiskBriefSlide.tsx) | ✅ seed | Static | Company-trust overlap |
| 8 | `design-build-advantage` | [DesignBuildAdvantageSlide.tsx](app/admin/projects/[id]/deck/slides/DesignBuildAdvantageSlide.tsx) | ✅ seed | Pillars array | **"New Pillar" placeholder (bug #3)** |
| 9 | `process` | [ProcessSlide.tsx](app/admin/projects/[id]/deck/slides/ProcessSlide.tsx) | ✅ seed | Static 3 stages | Layout comment/code mismatch for 4+ stages |
| 10 | `core-values` | [CoreValuesSlide.tsx](app/admin/projects/[id]/deck/slides/CoreValuesSlide.tsx) | ✅ seed | Global settings | Redundant with Why Us |
| 11 | `project-timeline` | [ProjectTimelineSlide.tsx](app/admin/projects/[id]/deck/slides/ProjectTimelineSlide.tsx) | ✅ seed | `TimelinePhase[]` | — |
| 12 | `cope-page` | [CopePageSlide.tsx](app/admin/projects/[id]/deck/slides/CopePageSlide.tsx) | ✅ seed | `CopeLineItem[]` | **"Add a hero image" placeholder (bug #2)** |
| 13 | `investment` | [InvestmentSlide.tsx](app/admin/projects/[id]/deck/slides/InvestmentSlide.tsx) | ✅ seed | `InvestmentLineItem[]` | **"—" on empty rows (bug #5)** |
| 14 | `design-retainer` | [DesignRetainerSlide.tsx](app/admin/projects/[id]/deck/slides/DesignRetainerSlide.tsx) | ✅ backfill | Project settings | **"Think" placeholder may leak (bug #1)** |
| 15 | `next-steps` | [NextStepsSlide.tsx](app/admin/projects/[id]/deck/slides/NextStepsSlide.tsx) | ✅ seed | Static 4 steps | — |
| 16 | `closing-slide` | [ClosingSlide.tsx](app/admin/projects/[id]/deck/slides/ClosingSlide.tsx) | ✅ seed, locked last | Static | — |
| 17 | `visual-inspiration` | [VisualInspirationSlide.tsx](app/admin/projects/[id]/deck/slides/VisualInspirationSlide.tsx) | ✅ backfill | Photos | — |
| 18 | `client-testimonials` | [ClientTestimonialsSlide.tsx](app/admin/projects/[id]/deck/slides/ClientTestimonialsSlide.tsx) | ✅ backfill | `Testimonial[]` | — |
| 19 | `addition-overview` | [AdditionOverviewSlide.tsx](app/admin/projects/[id]/deck/slides/AdditionOverviewSlide.tsx) | ❓ manual add | CAD bounding box | **Renders on no-addition projects (bug #6)** |

### Auto-layout / copy sizing

- Slide containers: fixed `w-full h-full`, `overflow: hidden`.
- Text containers: **no `line-clamp`, `truncate`, `maxLength`, or `.slice()`** found in deck slides.
- Font scaling: per-slide multipliers (`headlineEm`, `supportingEm`, `bulletsEm`) — manual, not responsive.
- **Result:** long AI-generated copy silently clips at the slide boundary with no visual indication.

---

## 2. Gap Analysis: Current → Target

| Current slide | Target mapping | Disposition | Notes |
|---|---|---|---|
| cover | #1 Cover | **KEEP** | Hero photo behavior solid |
| objective | #2 Executive Summary | **REDESIGN** | Must return 1 sentence + 3 pillars (not 3-paragraph prose) |
| scope-overview | #3 Scope Deep-Dive | **REDESIGN** | Target = per-primary-room with categorized sub-scopes (Demo/Systems/Cabinetry/Surfaces/Lighting) |
| before-after (auto-sync) | #4 Before & After | **KEEP** | Already auto-synced per room; layout may need tightening |
| scope-breakdown | #5 Secondary rooms | **REDESIGN** | Target = compact card list; also fix COPE leak (bug #7) |
| why-us | #8 Why HHI | **REDESIGN** | Target = **only 2 pillars** (ZERO Change Orders, ZERO Material Markup). Currently 3–4+ |
| risk-brief | — | **CUT** → optional library | Trust/company content duplicated elsewhere |
| design-build-advantage | — | **CUT** → optional library | Half-built; has the "New Pillar" bug |
| process | — | **CUT** → optional library | Client wants "Our Process" optional |
| core-values | — | **CUT** → optional library | "Built on Values" optional |
| project-timeline | #9 Project Timeline | **REDESIGN** | Target = 3-phase (Architectural, Pre-Con, Construction). Current uses 5 `TimelinePhase[]` rows |
| cope-page | #6 Systems & Site Management | **MERGE** | Combine COPE content with HVAC/Electrical. Fix "Add a hero image" placeholder |
| investment | #10 Projected Investment | **KEEP** | Hide empty rows (bug #5) |
| design-retainer | #11 Design Retainer | **KEEP** | Big dollar display; fix "Think" leak (bug #1) |
| next-steps | #12 Next Steps | **KEEP** | 4-step horizontal already matches |
| closing-slide | #13 Back cover | **KEEP** | Locked last, correct |
| visual-inspiration | #7 Visual Inspiration | **KEEP** (conditional) | ON by default for kitchen/luxury, OFF for bath |
| client-testimonials | — | **CUT** → optional library | Currently backfilled; move out |
| addition-overview | — | **CUT** → optional library (conditional) | Currently manual-add only; gate on project having addition scope |

**Target default deck = 11 slides** (excluding visual-inspiration when OFF): Cover, Exec Summary, Scope Deep-Dive, Before/After, Secondary Rooms, Systems/Site, (Visual Inspiration), Why HHI, Timeline, Investment, Design Retainer, Next Steps, Back Cover.

**Optional library** = 6 slides: HHI Difference, Stress-Free Remodel, Our Process, Built on Values, Design-Build Advantage, Client Testimonials, Addition Overview.

---

## 3. Before/After Integration

### What exists (complete pipeline — nothing needs building)

- **Media tab:** [app/admin/projects/[id]/media/media-tab.tsx](app/admin/projects/[id]/media/media-tab.tsx), actions at [media/actions.ts](app/admin/projects/[id]/media/actions.ts).
- **Gemini render:** `generateRoomRendering()` in [app/lib/gemini.ts](app/lib/gemini.ts). Uses `gemini-2.5-flash-image`. Returns base64 → R2 upload → Media record.
- **BeforeAfterSlide component:** [BeforeAfterSlide.tsx](app/admin/projects/[id]/deck/slides/BeforeAfterSlide.tsx). Two layouts (`side-by-side`, `after-emphasis`).
- **Auto-sync:** `syncBeforeAfterSlides()` in `db.ts` already creates one slide per room at order 300+10×i.

### Data model answers

| Question | Answer |
|---|---|
| Dedicated `BeforeAfterPair` model? | **NO.** Implicit via two `Media` rows |
| How are pairs linked? | `Media.sourceMediaId` FK + shared `Media.roomId` |
| Rendered images tied to a section? | **YES.** `Media.roomId` FK, plus `Room.selectedRenderMediaId` for the canonical pick |
| Multiple pairs per section? | **YES.** Many source + render rows; one selected render |
| Existing paired UI? | **YES.** `BeforeAfterSlide` + inspector dropdowns already work |

### Media model (condensed, `prisma/schema.prisma:259–304`)

```
Media { id, projectId, roomId?, kind (COVER|BEFORE|AFTER|INSPIRATION|PLAN|TEAM|OTHER),
        type (HERO|EXISTING|RENDERING), url, fileKey, sourceMediaId?, parentMediaId?,
        renderStatus (QUEUED|RENDERING|DONE|FAILED), renderProvider, renderModel,
        promptVersion, placement, stylePresetId?, tags[], sortOrder, ... }
Room  { ..., selectedRenderMediaId? }
```

### What a `BeforeAfterSlide` needs (already has)

`BeforeAfterContent` ([types.ts:1513–1585](app/lib/deck/types.ts:1513)) has: `roomId`, `roomName`, `beforeMediaId`, `afterMediaId`, `beforeImageUrl`, `afterImageUrl`, `caption`, plus 70+ layout/typography fields.

**Conclusion:** No new Prisma model needed. No new media pipeline needed. The refactor only needs to (a) tighten the layout and (b) add a scope-bullet strip underneath the photo pair. Scope bullets can be pulled from `Room.scopeNarrative` with an optional AI-summarize step or direct category pick.

---

## 4. Auto-Layout & Copy

### Prompt inventory

| Prompt file | Function | Slide | Output shape |
|---|---|---|---|
| [app/lib/ai/objective-content.ts](app/lib/ai/objective-content.ts) | `generateLuxuryObjectiveParagraph()` | `objective` | Prose — 3–4 paragraphs, 180–280 words |
| [app/lib/ai/scope-overview.ts](app/lib/ai/scope-overview.ts) (inferred) | `generateScopeOverviewNarrative()` | `scope-overview` | Prose, max 200 words |
| [app/lib/deck/gemini-slide-prompts.ts](app/lib/deck/gemini-slide-prompts.ts) | Various | (backgrounds) | Imagen generation, not text |

**All other slides are static templates or data-bound.** No AI copy generation for Why HHI, Process, Core Values, Next Steps, etc.

### The Objective slide prompt — verbatim key instruction

From [objective-content.ts:266–272](app/lib/ai/objective-content.ts:266):

```
LENGTH AND STRUCTURE (for the objective only):
- 3 to 4 substantial paragraphs
- Each paragraph 3 to 5 sentences
- No bullet points in the objective — this is narrative prose
- No headers — flowing paragraphs only
- Total length: 180 to 280 words
```

**This is the root cause of the 10+ line wall.** The prompt asks for freeform prose. It does **not** ask for `{ objective: string, pillars: [3 items] }`. To match NotebookLM's format, this prompt must be rewritten to return structured output (1 sentence + 3 pillar objects with title+description).

### Render-side enforcement — none

No `line-clamp`, `truncate`, `maxLength`, `.slice()`, `shrink-to-fit` anywhere in slide components. Containers clip via `overflow: hidden` on the outer slide but text inside can render beyond the 720px vertical bound without visual indication until export.

### "Additional Areas" / COPE bug origin

`ScopeBreakdownSlide` headline falls back to `slide.headline` which, during a backfill pass, may carry the COPE title "Cost of Project Execution" into the Additional Areas section. Secondary factor: the room list it iterates is not filtered against a `isProjectLevel` or similar flag — COPE is modeled as a `CopeLineItem[]` on the project, not as a `Room`, but the `ScopeBreakdownSlide` headline logic + display data appear to conflate them. The **correct fix** is in two places: (a) title resolution in `ScopeBreakdownSlide.tsx` lines ~39, (b) data selector in `db.ts` sync function that feeds `content.rooms[]`.

---

## 5. Placeholder Bugs

| # | Issue | File | Line | Root cause | Difficulty |
|---|---|---|---|---|---|
| 1 | "Think" leaks into Design Retainer row | [InspectorPanel.tsx](app/admin/projects/[id]/deck/InspectorPanel.tsx) | 1921 | HTML `placeholder="Think of this as an insurance policy..."` on a TextInput. If this value is ever copied into the field value (default text on create, or a bad backfill) the placeholder word leaks. Verify whether `content.retainerNote` is receiving the placeholder string on seed. | **Trivial** once source is confirmed |
| 2 | "Add a hero image" on COPE slide | [CopePageSlide.tsx:523](app/admin/projects/[id]/deck/slides/CopePageSlide.tsx:523) | 523 | Empty-state fallback `<p>Add a hero image</p>` renders unconditionally when `heroImageUrl` is falsy. Should either render nothing or only in editor mode. | **Trivial** |
| 3 | "New Pillar" orphan on Design-Build Advantage | [InspectorPanel.tsx](app/admin/projects/[id]/deck/InspectorPanel.tsx) | 6571 | Hard-coded `title: "New Pillar"` in the "Add Pillar" handler. If user clicks + then never edits, the literal "New Pillar" is saved. Slide has no empty-title hiding. **Design-Build Advantage is a half-built feature** (uses `pillars[]`, `guarantees[]`, `diagramNodes[]`, `supportColumns[]` with no migration path to populate them). | **Moderate** (touches cut candidate — likely redundant once slide moves to optional library) |
| 4 | Duplicate "A transparent 5-Stage process" on Your Design Experience | — | — | **Could not locate string in codebase.** May live in DB seed data, a markdown import, or a slide content JSON stored at runtime. Needs live DB inspection. | **Moderate** (requires DB query before fix) |
| 5 | "—" on empty Alternates / Allowances rows | [InvestmentSlide.tsx:30,39](app/admin/projects/[id]/deck/slides/InvestmentSlide.tsx:30) | 30, 39 | `formatRange()` helper: `if (!low && !high) return "—"`. Helper returns dash; row renders anyway. Fix = caller-side filter: skip rendering the row when bucket is empty, not pad with em-dash. | **Trivial** |
| 6 | Addition Overview on no-addition projects | [AdditionOverviewSlide.tsx](app/admin/projects/[id]/deck/slides/AdditionOverviewSlide.tsx) + orchestrator | — | Inconsistency: slide is NOT in the `seedDefaultSlides()` list, but appears in live decks. Likely added via backfill or auto-sync without a `project.hasAddition` gate. Grep for `addition-overview` in `db.ts` to locate insertion site. | **Architectural** (needs conditional logic + project flag) |
| 7 | "Cost of Project Execution" in Additional Areas list | [db.ts:261](app/lib/deck/db.ts:261), [db.ts:868](app/lib/deck/db.ts:868), [ScopeBreakdownSlide.tsx](app/admin/projects/[id]/deck/slides/ScopeBreakdownSlide.tsx) | multiple | Title-resolution fallback in ScopeBreakdownSlide + possible data leak where COPE data joins the rooms array. Both must be audited. | **Moderate** |

---

## 6. Default Deck Generation & Optional Slide Library — UX Proposal

### "Generate Default Deck" button

- **Placement:** Toolbar, insert as the third button between **⚡ Before/After** and **Save** in `DeckEditorClient.tsx:815–852`.
- **Visual:** Secondary style (light gray bg, dark text) — not the brand accent. Primary action remains Save.
- **Idempotency:**
  - If deck is empty → seed and select first slide silently.
  - If deck has any user-modified slides (`source="manual"` or `isUserModified=true`) → **confirm modal**: "Replace all auto-generated slides? Your manual edits will be preserved." Two options: [Replace auto only] / [Replace all] / [Cancel].
  - If deck has only auto slides → regenerate without confirmation (toast on completion).
- **Preconditions** (show button as disabled with tooltip if missing):
  - Project has ≥1 `Room` (Sections tab populated)
  - Project has `title`, `client1First/Last`
  - At least one of: room has scope narrative, project has cover hero image
  - Note: investment/media not required — the slides will render empty states

### Conditional slide decisions

Recommend a small rules engine in the generator:

| Slide | Gate |
|---|---|
| Visual Inspiration | `project.projectType ∈ {KITCHEN, WHOLE_HOME, LUXURY}` OR `project.roomCount ≥ 4` |
| Addition Overview | `project.hasAddition === true` (new flag needed on Project) |
| Secondary Rooms | `project.rooms.length ≥ 2` |
| Before/After | Only for rooms that have both a BEFORE and DONE render (`syncBeforeAfterSlides` already does this) |

Encode these as a single `buildDefaultDeckSpec(project)` that returns an ordered array of slide specs — called both on manual Generate and on first-load seeding. This removes the divergence between `seedDefaultSlides` and the button.

### Optional slide library UX

**Smallest change that uses existing patterns:** extend the existing "+ Add Slide ▾" dropdown.

- Current dropdown lists 16 slide types as flat items (one-at-a-time). Keep as-is.
- Add **separator** + **"Browse slide library…"** link at the bottom of the dropdown.
- Click opens a modal (pattern: `createPortal` modal like `SendEmailModal`) showing the 6 optional slides as a thumbnail grid with checkboxes and multi-select → **[Add selected]**.
- Insertion position: before the Investment slide by default; allow the modal to present a one-click "Insert after current slide" toggle.

Rationale: no new top-level button; reuses the dropdown affordance users already know; modal scales cleanly if the library grows.

---

## 7. Proposed Phase Split

### Phase 8A — Data & Generator refactor (backend + orchestration)
1. Build `buildDefaultDeckSpec(project)` as the single source of truth for default deck composition.
2. Refactor `seedDefaultSlides()` and the backfill paths to call it.
3. Fix the 7 placeholder bugs (Section 5).
4. Rewrite the `generateLuxuryObjectiveParagraph()` prompt to return structured `{ objective: string, pillars: [{title, body}] × 3 }` and update the ObjectiveSlide component to render it.
5. Gate Addition Overview behind `project.hasAddition` (new Boolean field, migration).
6. Fix Scope Breakdown / COPE-leak bug (bug #7).
7. Mark `risk-brief`, `process`, `core-values`, `design-build-advantage`, `client-testimonials` as optional (remove from default spec).

**Shippable on its own.** Existing decks keep working; new decks use the tightened default spec.

### Phase 8B — UI for generation + library
1. Add "Generate Default Deck" button to toolbar with confirmation modal.
2. Extend "+ Add Slide ▾" with "Browse slide library…" entry.
3. Build `SlideLibraryModal` component (parallel to `SendEmailModal`).
4. Wire multi-select insert into existing `addSlide` server action.

**Shippable on its own** after 8A lands.

### Phase 8C — Layout & auto-sizing (optional, defer)
1. Introduce shrink-to-fit or max-lines enforcement for AI copy containers.
2. Redesign Scope Deep-Dive slide layout to categorized sub-scopes (Demo/Systems/Cabinetry/Surfaces/Lighting).
3. Redesign Before/After slide with scope-bullet strip below the pair.
4. Collapse Why HHI to 2-pillar layout.

**Can ship slide-by-slide** as small PRs.

---

## 8. Open Questions for Steve

1. **Objective structure** — does NotebookLM output exactly 1 sentence + 3 pillars, or 1 paragraph + 3 pillars? Need the exact target shape so the prompt rewrite is correct.
2. **"Why HHI" pillar content** — you said ZERO Change Orders + ZERO Markup on Materials. Is the body text for each fixed copy you'll provide, or should it stay editable per-project?
3. **Addition flag** — is `project.hasAddition` already captured somewhere (scope narrative? room type?) or does this need a new Project field + UI toggle?
4. **Visual Inspiration default** — you said "on by default for kitchens/luxury." Is there a `projectType` enum we should use, or should we trigger it off a different signal (room count, investment total, etc.)?
5. **Design-Build Advantage** — is this feature considered abandoned, or does moving to the optional library mean we also need to finish the half-built pillar editor? If it's truly dead code, we can delete it in 8A.
6. **Process slide** — 3 phases (Architectural Design, Pre-Construction, Construction) in the target is different from the current 3-stage (Discovery, Plan, Build). Do we rename the existing slide or create a new `project-timeline` variant and deprecate the old `process` slide?

---

## 9. Risks & Flags

- **Rendr integration in progress (Phase 7 still active).** Files [rendr-floor-plan.tsx](app/admin/projects/[id]/rendr/rendr-floor-plan.tsx) and [rendr-floor-plan-interactive.tsx](app/admin/projects/[id]/rendr/rendr-floor-plan-interactive.tsx) show modified/untracked in `git status`. **Do not touch** rendr-tab, rendr-shell, or any `app/api/rendr/**` route during Phase 8. The deck refactor only reads from the existing Media pipeline — Rendr's output flows through `Media.type=RENDERING` just like Gemini's, so no Rendr code changes are needed.
- **`InspectorPanel.tsx` is ~6,500 lines.** Any Phase 8B work that touches it should be surgical. Consider splitting by slide type in a future cleanup pass — do not bundle that into 8A/8B.
- **Backfill behavior runs on every page load.** If we remove slides from the default spec (e.g., `process`, `core-values`), the backfill path will *re-add them* to existing decks on next load unless we also update the backfill list. **Must update both seed and backfill in lockstep.**
- **Slide ordering is gap-based but the gaps are tight.** With the current spacing (100, 200, 300+10i, 400, 500, 550, 555, 560, 570, 575, 580, 600, 700, 900), inserting a new slide type between 550 and 555 requires a renumber. Recommend adding more headroom when we touch `seedDefaultSlides`.
- **Published/snapshotted decks** (Preview & Publish tab) may reference now-deleted slide types. Confirm with Steve whether the publish pipeline deep-copies slide content or references live `DeckSlide` rows. If deep-copy, we're safe. If live reference, cutting slides from default breaks old proposals.
- **Bug #4 (duplicate sentence) could not be found in source.** It's likely stored as DB content on an existing project's slide. Needs a one-off query (or inspection of a live deck) before we can fix it. Flagging so Steve can decide whether to ship the fix or leave it.
- **Assumption the prompt gave us may be wrong:** the prompt says "our current decks carry 4–5 redundant trust/company slides." The codebase seeds 5 such slides (risk-brief, design-build-advantage, process, core-values, why-us) plus 2 backfilled (client-testimonials, visual-inspiration). That's 5 in default + 2 optional-ish. Count matches.
- **Assumption the prompt gave us may be wrong:** the prompt says "Auto-populate trigger: Manual button." Today there is *no* manual button — decks auto-seed on first page view of the Deck tab. The refactor needs to both add the button AND change the first-view behavior to NOT auto-seed (or the button is meaningless). Flag for Steve.
