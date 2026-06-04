# Presentation Studio — Plan

> Status: **approved**, in progress on branch `presentation-studio`, gated behind
> `NEXT_PUBLIC_STUDIO_ENABLED`. Nothing here ships to the live app until the flag
> is turned on in production.

## Goal

The intake → scope → AI-pricing flow works well. The pain is **assembling the
presentation** (loading media, building before/after, ordering slides). Replace
that with a guided, AI-driven **Presentation Studio**: load the data, answer a
short series of questions, and the AI builds an editable, NotebookLM-style slide
deck — with **better visuals** and **before/after slides** (which NotebookLM
can't do) — rendered as live web pages you can tweak in the editor and
present/export.

## Key finding (why this is an evolution, not a rebuild)

~65% already exists:
- **Slide engine** — 19 slide types stored as editable JSON, an auto-sync engine
  with `isUserModified`/`isUserHidden` flags and bullet-merge that preserves
  manual edits, fractional ordering. Adding slides/layouts needs **no schema
  change**. (`app/lib/deck/db.ts`, `app/lib/deck/types.ts`, slide components.)
- **Before/after AI render** — Gemini (`app/lib/gemini.ts`) turns a before photo
  into an after, with anti-hallucination guardrails, driven by a scope checklist
  (`RoomRenderCheck`).
- **Before/after + scope-breakdown slides already auto-build** from room media;
  scope-breakdown already rolls up un-rendered rooms onto paginated slides.
- **Display + output** — client viewer (`/proposals/...`), present mode, Chromium
  PDF, all freezing a `PublishedSnapshot`.

## The real gaps to build

1. No guided "Build Presentation" media flow (manual today).
2. Render checklist reads scope **text**, not the **photo** — can't yet ask
   "I don't see a tub here — render anyway?".
3. No AI "deck composer" that auto-drafts all slide copy from project data +
   reference decks.
4. Rendering is synchronous (times out on batches); deck only re-syncs on reload.

## Design decisions (locked)

- **Build on the existing slide engine** (`DeckSlide` + sync). Studio is an
  orchestration layer, not a parallel slide store. No schema churn.
- **Reuse the snapshot/viewer/PDF** for display + output.
- **Photo-less rooms → "Additional Rooms"** rolled up onto 1–2 `scope-breakdown`
  slides (the existing un-rendered-room behavior). Rooms WITH photos →
  before/after slides.
- **Isolation:** branch `presentation-studio` + new `/admin/projects/[id]/studio`
  section behind `NEXT_PUBLIC_STUDIO_ENABLED`, deployed to a Vercel preview URL.

## Phases

- **Phase 0 — Isolation scaffold** *(done first)*: branch, flag, `/studio` route
  stub + nav entry. Zero risk to live.
- **Phase 1 — Build-Presentation media wizard**: post-pricing button → room-driven
  Q&A ("hero? kitchen photos? bath photos?") reusing the Local/Phone/Drive
  importers; assigns photos per room + sets cover hero; rooms without photos roll
  into "Additional Rooms" scope-breakdown slides.
- **Phase 2 — Photo-aware before/after**: Gemini vision pass detects what's in the
  photo, reconciles with scope, asks "render the shower/vanity?" only for
  visible+in-scope items; move rendering to a background job (QStash) and
  auto-re-sync the deck on completion.
- **Phase 3 — AI deck composer**: auto-draft all slide copy from project data,
  using the NotebookLM reference PDFs as tone/structure inspiration; respects
  manual edits.
- **Phase 4 — Better visuals / templates** *(depends on reference-deck analysis)*:
  richer layouts on the existing engine.
- **Phase 5 — Cutover**: flip the flag on; `/studio` becomes primary; keep the
  deck editor for fine edits.

## Reference-deck analysis — decisions (locked)

Analyzed all 7 decks at `C:\Users\syoun\Desktop\reference-decks\`. Findings +
owner decisions:

- **Two themes, selectable per project:** "Editorial Linen" (Cormorant serif +
  linen + bronze/terracotta; matches brand spec) and "Navy/Sans" (bold sans +
  navy + bright orange). Build both over one shared component library.
- **Clean CSS-native layouts first.** Defer bespoke "metaphor" art (3D investment
  tower, Greek columns, honeycomb, umbrella, wave-arc connectors) to optional
  pre-rendered SVG/image "skins" later. v1 defaults: segmented investment bar,
  rail/node timeline, room-split scope, 2×2 value grid, big serif numerals,
  floor-plan-with-pins, comparison table.
- **Optional slides ON by default when content exists:** Testimonials, Core
  Values, HHI-vs-Traditional comparison, COPE explainer.
- **Investment presented BY ROOM/SPACE**, not BASE/ALTERNATE/ALLOWANCE buckets
  (no deck shows buckets). Always low–high ranges, COPE broken out, Design/
  Feasibility Retainer separated + "insurance policy / credited" framing, one
  bold orange **Total Project Investment** range. Bracket with "Prepared
  exclusively for [client]" + "valid 30 days". (Existing `investment-by-space`
  slide already groups by room — reuse it.)
- **No reference deck uses literal before/after pairs** — confirms photo-less
  rooms are normal (→ Additional Rooms) and real-photo before/after is net-new.
- Suppress the NotebookLM watermark (these were NotebookLM exports).

Canonical slide arc (the composer's default order): Cover → Objective → Process/
Design Experience → Design-Build Advantage (Zero Change Order / Zero Mark-Up /
Freedom / Designs That Work) → Scope by room → HHI-vs-Traditional → Timeline →
Design Retainer → Investment (range) → Testimonials → Core Values → Closing/CTA.

## Backlog / follow-ups from testing

- **Phase 2c — multiple before/after renders per room.** Today `prepareRoomRender`
  uses only the FIRST before photo, and one render per room. Requested:
  1. When a room has multiple photos, show a selector to pick which photo(s) to
     render (multi-select); generate a before/after for each selected photo.
  2. Support multiple before/after renders per room (the render cap is already 3).
  3. On the deck: choose which before/after is the room's MAIN-page slide; the
     rest go on a secondary page. Requires extending `syncBeforeAfterSlides`
     (currently one slide per room via `selectedRenderMediaId`) to emit a
     primary + overflow slide(s) per room, plus a "set as main" control.
- **Render execution:** `queueStudioRender` falls back to a synchronous inline
  render when QStash isn't configured/reachable (local dev), and uses the
  background worker when it is. (Fixed during testing.)
