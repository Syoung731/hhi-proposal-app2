# Presentation Studio — Plan

---

## ⏱️ SESSION HANDOFF / CURRENT STATE (read this first after a compaction)

**Where we are:** Building the Presentation Studio on branch **`presentation-studio`**
(off `proposal-v2`), all pushed to origin (Vercel builds a preview per push).
The whole Studio is gated behind `NEXT_PUBLIC_STUDIO_ENABLED` so the live app is
untouched. Steve tests on **localhost** (his local working tree IS this branch —
edits land on disk immediately; he restarts/HMR to test).

**Standing permissions (granted by Steve):**
- I COMMIT directly (Conventional Commits + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer).
- I PUSH directly. The `git push` deny rule was removed from `.claude/settings.json`
  (commit e59e922). Push feature branches freely; **call out any push to
  `proposal-v2` (production / app.hhi-builders.com) before doing it.**

**Built & committed on `presentation-studio` (newest last):**
- Phase 0 scaffold (flag + `/admin/projects/[id]/studio` route + nav tab)
- Phase 1 media wizard (per-room photo collection + hero) — `studio/studio-tab.tsx`, `studio/actions.ts`
- Phase 2 scope-aware before/after: `gemini.ts` `detectPhotoFixtures`, `lib/media/render-scope-reconcile.ts`
- Phase 2b background render: `lib/media/studio-render-job.ts`, `api/jobs/studio-render/route.ts`, `lib/gemini/render-room-core.ts` (extracted, shared with `startRoomRenderAction`); falls back to SYNC render if QStash unavailable
- Phase 3 AI copy composer: `lib/deck/compose-copy.ts` (scope-overview + cover tagline)
- Phase 2c render-panel rework: `studio/RoomRenderPanel.tsx` (multi-photo select, render new/update/set-as-main/delete; reuses media render actions)
- Deck reset: "Delete entire deck — start over" in the deck editor's regenerate modal (`deck/actions.ts` `deleteProjectDeckAction`, `DeckEditorClient.tsx`)
- Phase 4A FONT FIX: `slide-constants.ts` SLIDE_FONTS now use `var(--font-*)` (the serif was silently falling back — biggest plain-look cause)
- Phase 4C start: warm linen default bg behind no-background slides (`SlideCard.tsx`)

**Already on `proposal-v2` (live, earlier this session):** sales-stage scope-review
questions (`ai-review` prompts → `lib/ai/review-prompts.ts`), phone/QR upload
(`PhotoUploadToken` model + `/api/phone-upload/*` + `/m/[token]`), Google Drive
import (`DriveImportModal` + `/api/drive-import`), thumbnail + rollup-timeout fixes.

**▶ DONE since the pilot (newest area last):**
- **Scope slide (DONE):** structured `scopeItems` {title,detail,icon,iconImageUrl},
  7 layouts (editorial-split, blueprint-icons, photo-numbered, photo-checklist,
  gallery-grid, split-panel, image-row), per-item icon dropdown, **content toggle
  (bullets vs paragraph)** `contentMode`, item-text-size + icon-size sliders,
  **AI Edit box** (changeCopy/changeLayout). Icons: built-in 35 SVGs
  (`scope-icon-keys.ts` + `slides/shared/ScopeIcons.tsx`) + **self-growing
  BrandIcon library** (`lib/deck/scope-icon-resolver.ts` — match-or-generate,
  monochrome line-art via `generateBrandIconPngAction({monochrome:true})`).
- **Deck Theme system (DONE):** `lib/deck/themes.ts` (Blueprint + Editorial
  tokens) + `lib/deck/theme-context.tsx` (`useDeckTheme`), resolved in
  `SlideRenderer` from `branding.deckTheme`. `ProposalDeck.deckTheme` column
  (migration `add_deck_theme`) + theme picker in deck toolbar + snapshot.
  Scope + Objective consume tokens.
- **Objective slide (DONE):** retired Statement layout; default **Hub & Spoke**
  (`HubSpokeLayout` — central home illustration + accent arrows fanning to 3–5
  zones; full-circle default placement for 4+) + **Pillars** grid alternate.
  `ObjectivePillar` {title,body,icon,imageUrl,scene,posX,posY}; AI drafts
  creative headline + mission (`**bold**`) + zones + per-zone `scene` +
  `hubScene`. Full manual controls: per-zone Position X/Y + reset, Hub size/X/Y,
  Illustration size, Zone-text size, Arrow thickness/length. Headline+objective
  styling now wired into hub-spoke. Pillars-only inspector controls hidden in
  hub-spoke. Removed Project Highlights bullets.
- **Bespoke illustrations:** `generateBrandIconPngAction` gained `mode:
  "illustration"` (scene-filling line-art vs centered icon). Objective draws
  hub + zone illustrations; scope draws per-item icons.
- **Generate Deck UX (DONE):** unified **"Generate Deck" modal** on the Deck tab
  (`GenerateDeckModal` in DeckEditorClient) = Structure (generate/replace/delete)
  + AI Fill (Draft slide copy, Generate illustrations) + checkboxes "also draft
  copy" / "also generate illustrations" (one-click full build). The two AI
  buttons were REMOVED from Build Presentation (now pure media wizard). Two-step
  by design: `composeDeckCopy` = fast text only; `generateDeckVisuals` = the slow
  image step (objective hub/zone illustrations from stored scenes + scope items/
  photo/icons, creating scope items if missing even on user-modified slides).

**▶ ACTIVE BLOCKER (debugging — pick up HERE):** On a fresh **Generate Deck →
Replace everything + both AI checkboxes**, the **Objective and Scope slides came
out generic** (objective = settings pillars w/ no icons/scenes via hydration;
scope = description sentences + star fallback). DB diag showed both slides
`source:"manual"` with **no AI content**, while the **cover tagline DID update** —
so composeDeckCopy ran but the **scope + objective drafts didn't write**.
Confirmed the **raw Claude JSON call works standalone** (valid JSON parsed), so
it's NOT the model/parser — it's a **silent failure during the bulk run**
(draftObjective→null and/or the scope branch throwing on an un-caught call so the
whole slide write aborted). NOTE: `compose-copy.ts` has `import "server-only"` so
it CANNOT be run from a tsx script — diagnose via the running dev server only.

Just shipped instrumentation (commit `ecda381`): scope branch now wraps
`draftScopeItems`+`findScopeHeroPhoto` in `.catch` (so one failure no longer
aborts the write); server `console.warn` logs per-slide outcomes/throws
(`[composeDeckCopy] …`); the Generate Deck chain shows a **result summary**
(`copy: N updated · N skipped · N err | visuals: …`) and waits 8s before reload
instead of hiding failures.

**→ EXACT NEXT STEP:** Have Steve restart dev, run **Deck → Generate Deck → both
boxes → Replace everything**, and report **(a)** the on-screen summary line and
**(b)** the `[composeDeckCopy]`/`[GenerateDeck]` dev-terminal lines. Those reveal
whether scope/objective are skipped (draft empty) or threw (which call) — then
fix that one call. Test project id: `cmoj1xg4t00t9747kq2py2iug`.

**Process agreement (to stop circling):** test only via a FRESH Generate Deck
(not hand-edited slides — those become `isUserModified` and Draft skips them);
build each slide type to a "done" bar then leave it. Only Scope + Objective are
AI-built so far; Cover gets a tagline; everything else is default content.

**▶ FUTURE PHASE (Steve's vision, recorded for later):** NotebookLM doesn't just
edit slides — it *decides which slides to build*. Steve wants: a few fixed/core
slides + the ability for the AI to **propose & build its own slide types** for a
personalized deck (e.g. invent a "Zone tour" or "Material palette" slide when the
project calls for it). That's a deck-composition layer above the per-slide editor:
AI returns a slide PLAN (types + order + which to invent), then composes each.
Build AFTER the per-slide AI Edit + structured layouts prove out.

**Remaining roadmap:** 4B theme picker/storage (`deckTheme` on `ProposalDeck` +
snapshot + picker), 4C full background palette per theme, 4D hero-slide layout
upgrades (Cover/Objective/Investment/Closing — replace hardcoded colors with
theme tokens), 2c-2 deck "main + 2-up overflow page" for multiple before/afters,
Phase 5 cutover (flip `NEXT_PUBLIC_STUDIO_ENABLED=true` in prod — Steve's call).

**Key gotchas:** fonts load as CSS vars in `app/layout.tsx`, `globals.css` only
maps `--font-sans/mono`; deck render chokepoint is `lib/deck/SlideCard.tsx` →
`SlideRenderer.tsx`; before/after slide builds from `Room.selectedRenderMediaId`
via `syncBeforeAfterSlides` in `lib/deck/db.ts`; the `(node:...) SSL mode` console
line is a benign pg deprecation warning, not an error. Migration
`add_photo_upload_token` is applied to dev DB; runs in prod on deploy via
`vercel-build`. NEVER run `prisma db pull`. Run `npx tsc --noEmit` after changes.

---


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
