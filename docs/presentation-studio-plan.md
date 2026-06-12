# Presentation Studio — Plan

---

## ⏱️ SESSION HANDOFF / CURRENT STATE (read this first after a compaction)

### ▶▶▶ LATEST SESSION (2026‑06‑12 — SHIPPED TO PRODUCTION; most authoritative, read first)

**EVERYTHING IS COMMITTED, PUSHED, AND LIVE on app.hhi-builders.com.** Branch `presentation-studio` = `main` = production. Local `main` is stale (harmless). `tsc` clean. Test project `cmoj1xg4t00t9747kq2py2iug`. Steve reviews on localhost (NEVER spin up preview servers). Working loop unchanged: refs → build → he screenshots → iterate.

#### DONE since the 06‑11 block (all approved + deployed):

**1. Floor Plan Map — full Rendr pipeline.**
- **Import plan from Rendr**: inspector button fetches the linked space's PDF via existing authed proxy `/api/rendr/spaces/{id}/floorplan`, rasterizes IN BROWSER with `pdfjs-dist` v6 (worker via `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` — works on prod), saves PNG via `saveFloorPlanImageAction` → R2 `deck/floor-plans/`. **PDF page picker (p.1‑4)** + **floor picker** when multiple Rendr spaces linked.
- **✦ Auto‑crop to plan (AI)**: `autoCropFloorPlanAction` — Gemini VISION (gemini‑2.5‑flash) returns the drawing-area bbox as %, **sharp extracts exact pixels** (no generative redraw). Refuses implausible boxes.
- **✦ Remove dimensions & labels (AI)**: `cleanFloorPlanImageAction` — gemini‑2.5‑flash‑image edit pass (erase chips/logo/address/legend, keep linework). Generative → user inspects; re-import = undo (new R2 object each time).
- **Manual Trim** sliders (Top/Bottom/Left/Right) — crop window stored as planCropX/Y/W/H; PlanArt renders with UNIFORM scale `s=min(100/cw,100/ch)` + centering (first version distorted/panned — fixed).
- **Zone Room dropdown**: per-zone select of Sections rooms; pick → fills label/SF (lengthFt×widthFt)/description. `fetchFloorPlanRoomDataAction` returns rooms+descriptions+`spaces` (LinkedSpace[]).
- **AI zone blurbs**: `composeZoneDescriptionsAction` — ONE Claude call → ≤110‑char one-sentence blurbs per room; loaded on inspector mount (module-level `floorPlanBlurbCache` per project), merged into dropdown data; "Pull rooms & SF" refreshes + OVERWRITES zone descriptions. Deterministic fallback = first sentence ≤120 chars word-boundary. Cards line-clamp 3.

**2. Craftsmanship — AI builds from PROJECT MATERIALS.**
- Shared `gatherProjectMaterials()` in deck/actions.ts: latest AIEstimate per non‑COPE room → `/material/i` line items priciest-first + style preset names/prompt snippet.
- **Annotated Photo**: `generateCraftsmanshipPhotoAction(projectId, style)` — Claude curates 4‑6 materials + writes imagePrompt + matching callout items; Gemini renders ONE hero. **Build Style select** (persisted `content.heroPhotoStyle`): `vignette` (photoreal close-up) / `technical` (exploded isometric, navy #1A2332 + orange linework — Anatomy-of-a-Remodel look) / `collage` (3‑4 overlapping panels over ghosted plan). NO text baked in — live callout cards do labels. Items replaced on build; Reset → HHI defaults.
- **Standards Grid**: `generateCraftsmanshipCollageAction` — Claude picks 6 materials w/ column assignment (a=Structural/b=Finish) + per-material photoPrompt; Gemini renders 6 SQUARE macros IN PARALLEL → collagePhotos + items together (~30‑45s). Grid polish: serif column titles 0.95em + orange rule, items 0.72/0.6em, no-photos width 78%.

**3. PRODUCTION DEPLOY (the cutover) — and the Vercel facts learned:**
- 7 commits shipped (5-scope batch + maxDuration fix + cutover empty-commit). `export const maxDuration = 300` added to deck/page.tsx (AI builds 20‑45s vs 60s default).
- **Vercel Production Branch WAS `proposal-v2`** → Steve changed to `main` via dashboard Settings → **Environments → Production → Branch Tracking**. Deploy trigger = push to main (`git push origin presentation-studio:main` fast-forward trick — avoids local checkout entirely).
- **Preview env is EMPTY of app secrets** (only 3 Google NEXT_PUBLIC vars) → every branch-push Preview fails in 10s at `prisma generate` (prisma.config.ts hard-throws on missing DIRECT_URL). PRE-EXISTING for 6+ days; NOT a code problem. Fix later: add envs to Preview (previews would share live DB) or harden prisma.config.ts.
- **`NEXT_PUBLIC_STUDIO_ENABLED=true` added to Production env** (was the designed Phase 5 cutover) → Build Presentation tab + /studio live. Flag now permanent-on; REMOVE the gate from ProjectTabNav.tsx + studio/page.tsx as cleanup.
- Vercel CLI is authed (`syoung731`) — use `npx vercel ls / inspect <url> --logs / inspect --wait` to watch deploys.
- **Windows git lessons**: STOP `npm run dev` before any checkout (file locks caused y/n loops + a half-checkout that deleted 28 files — recovered via `git restore .`); `core.editor` now set to notepad.

**4. Multi-space Rendr RESTORED (was never lost — never merged).**
- Feature `5e3d01b feat(rendr): support linking multiple spaces (floors) per project` was built Jun 5 in a PARALLEL session on worktree branch `claude/agitated-cartwright-6e9dd7` and never merged; production never had it. Merged cleanly (merge commit fbd145b + ugly-but-harmless message).
- Schema: `Project.rendrSpaceId Int?` → `rendrSpaces Json?` ([{spaceId,label}]); helpers in `app/lib/rendr/linkedSpaces.ts` (parseLinkedSpaces etc.). **Migration `20260605120000_rendr_multi_space` was AMENDED before first apply to CONVERT existing links** (`jsonb_build_array(jsonb_build_object('spaceId', rendrSpaceId, 'label', 'Main'))`) instead of dropping them. Applied to live Neon (123 migrations, status clean).
- Floor-plan import adapted: action returns `spaces`, inspector floor picker, `importSpaceId` state.

#### ▶ NEXT UP (Steve directs; do NOT start unbidden):
1. **Master training program (Steve's current focus)**: Steve is recording a Loom walkthrough (create project end-to-end); he'll provide the transcript. Combine transcript + ALL `docs/training/*.md` modules into a complete training (format TBD — possibly ordered curriculum doc; pptx/docx skills available if he wants a deliverable file).
2. **Training Mode overlay — RESEARCH DONE 2026-06-12; BUILD DECISION PARKED until after the Loom session** (Steve: "Decide after Loom session" — the master-training outline will drive which tours get built, then he picks the engine). Findings (full report delivered in chat 06-12): **recommendation = custom engine** (~600 lines, zero deps; 4-div spotlight w/ pointer-events hole, brand tooltip cards; KEY: advance-on-real-click is OUR code in EVERY library, and custom enables state-gated steps — e.g. don't advance until a room actually exists). Alternatives: **NextStep (nextstepjs v2.2, MIT, active)** = fastest v1 (<1 day; built-in App Router multi-page via router.push + MutationObserver; real target clickable by default; needs `motion` dep; no React 19/Next 16 certification); **react-joyride v3** (Mar 2026 rewrite fixed React 19; multi-page = documented DIY controlled mode); AVOID onborda (dormant), intro.js/shepherd (AGPL+commercial). Integration map: provider mounts in `AdminLayoutChrome.tsx` (copy `EstimateJobProvider` localStorage pattern, keys `hhi:training:*`); toggle = admin-header "Training" button + tour dropdown (per-browser, NOT CompanySettings); add `data-tour` attrs to key controls (none exist today); tour content converts ~1:1 from the "In the app:" click-paths in docs/training/*.md (master "create your first proposal" tour spanning Projects→New→Sections→Investment→Deck + per-slide-type mini-tours); LANDMINE: portal modals at z-9999 — tour overlay must auto-pause when an unrelated modal opens. Build phases when greenlit: T1 engine (~1d) → T2 data-tour attrs + master multi-page tour (~1d) → T3 header menu + mini-tours (~0.5d) → T4 polish (~0.5d).
3. Housekeeping queue: Preview envs OR prisma.config.ts hardening; delete `proposal-v2` + `claude/agitated-cartwright-6e9dd7` branches (merged); remove studio flag gates; verified gap backlog MED/LOW (per-room scope deep-dive, SF fields on scope items, target-figure anchoring = cheapest win, leader-line on more slides, footer band, funnel layout, Blueprint-vs-Reality); our-process/design-build retirement decision.

#### Standing conventions: unchanged from below (tsc after every change; commit-on-demand, NEVER push; no `git add -A`; JobTread read-only; never `prisma db pull`; pre-launch = delete legacy outright; training docs same commit; AI never touches dollars; sync write-scope registry; one writer per slide type).

---

### ▶▶ PREVIOUS SESSION (2026‑06‑11 — superseded where it conflicts with above)

**Branch `presentation-studio`. EVERYTHING uncommitted on disk (Steve batches commits — batch is now VERY large; commit pass overdue).**
**`tsc --noEmit` CLEAN as of this writing. Test project `cmoj1xg4t00t9747kq2py2iug`; Steve reviews on localhost (never spin up preview servers). Working loop: Steve pastes NotebookLM reference screenshots → build → he screenshots our render → iterate until "looks good".**

#### DONE & APPROVED this session (in order):

**1. WHY US — finished completely.**
- 3 comparison layouts polished to reference quality: `comparison-table` (floating bordered row-label column — no blank corner cell; gray vs white columns; 4px orange top stripe on HHI header; big bare orange ✓ right; per-cell crisp borders), `comparison-columns` (full-bleed gray/white split + navy center rule + double-framed recessed/navy-framed cards — the "Chaos vs Certainty" ref), `comparison-cards` (header bars + paired gray/orange-edged cards). Controls: `comparisonHeaderSize/TitleSize/BodySize` sliders, editable bottom line (`comparisonBottom`, empty hides), row CRUD, Reset. Inspector Section Title consolidated into Content area (dup "Text" block removed).
- **Retired** `pillars-grid`/`editorial-cards`/`stacked-list` → **NEW `guarantee-grid` (DEFAULT)** (warm-charcoal #262524 2×2 of Value Pillars, `FirstWordAccent` orange keyword titles, **continuous orange cross divider** + thickness slider, Icon/Title/Description size sliders) + **`advantage-grid`** (2×2 over background photo w/ navy scrim, orange titles).
- **Dark isometric icon pipeline:** `generateBrandIconPngAction({ isometricDark:true })` (orange #F47216 + warm grey #CFC9BF + cream #EFE9DD ONLY — no navy/black/white); `resolveDuotoneIconImages(titles,{dark:true})` caches under **`isod-`** BrandIcon namespace; `generateWhyUsPillarIconsAction` in deck/actions.ts. **COMMITTED DEFAULTS** in `public/why-us-icons/` (change-order, markup, design-freedom, real-world) via `scripts/prep-why-us-icons.ts`; matcher `app/lib/deck/why-us-default-icons.ts` (`whyUsDefaultIcon(title)` keyword regex). Guarantee grid renders `iconImageUrl ?? whyUsDefaultIcon(title)` UN-masked (multi-tone survives); legacy `iconUrl` mask-tinted. Inspector: "Use default icons" primary button + "Generate with AI instead" link. `WhyUsPillarItem.iconImageUrl` added.
- Why Us AI-Edit descriptor (rows/headers/bottom/sizes/layout/background; copy-guard intact). Training doc `deck-why-us-slide.md`.

**2. TIMELINE — finished completely.**
- New layouts: **`week-axis` (DEFAULT for new decks)** — axis totals project weeks via `parseWeeksRange()` (timeline-phases.ts; sizes by UPPER bound, e.g. 0/8/13/29 ticks), **dashed milestone lead-in** (LEAD=18%, navy diamond markers, milestones = phases w/o duration), alternating boxes (white, colored top stripe, desc below box), stems; **`chevron-phases`** (slim light #E7E4DC milestone lead chevrons → orange/orange/navy phase chevrons, desc row below); **`horizon-wave`** (all 5 entries on smooth S-curve SVG, accent dots, labels alternate); **`roadmap-cards`** (navy top line, milestone lead cards w/ pen/home line icons + "Phase 1/2/3" cards w/ compass/sheet/hardhat icons). Kept `vertical-dot`; **retired** `vertical-alternating` + `stepped-hierarchy` (+ `ProjectPhase.note*` fields deleted).
- Per-phase **Placement (Auto/Above/Below)** + **Nudge** (`side`, `offsetX` em; CRITICAL: base position clamped FIRST, then nudge applied raw 1:1 — two rounds of fixes; edge entries must never swallow the nudge).
- Fixed pre-existing addSlide bug (timeline got before-after layout/headline). AI-Edit descriptor — **deliberately NO phase text** (syncProjectTimelineSlide overwrites name/duration/description from Timeline tab UNCONDITIONALLY every load; wording edits belong on the Timeline tab; same trap documented in training doc `deck-timeline-slide.md`).

**3. INVESTMENT BY SPACE — finished completely (hybrid money-anchor architecture).**
- Kept `table-callout` (DEFAULT) + 3 new layouts: **`range-bars`** (chunky two-tone bars: solid `barColor ?? theme.panel` to LOW, `lightenHex(+0.3)` tail to HIGH; continuous gridline layer; rooms sorted desc + COPE LAST; full $ text in/beside bars; circular guarantee badge w/ text+size; bottom note band default COPE explainer; **Bar Color picker**; sliders barLabel/barValue/barNote/badge), **`stacked-blocks`** (isometric tower: COPE orange cap top → rooms ascending down; flat unit-scaled heights ~2.2:1; masonry face lines; skew side/top faces EDGE=1.05em; **retainer foundation plinth** #3A3F45 112% wide w/ caption; **curly-brace SVG anchor** + total; sliders blockText/towerWidth/anchorText/retainerText + **braceOffsetX/Y**), **`blueprint-breakdown`** (orange retainer lead segment min-12% + "The Immediate Step" callout + stem; `DimArrow` full-span + construction-only + boundary ticks; BP_SHADES greyscale segments desc-sorted; zones list w/ color swatches; **two-line navy totals box** [white construction + orange "Total Projected Investment"]; CompassRose + corner brackets; sliders zone/anchor/retainer text).
- **Money-anchor rules (Steve-corrected, important):** `constructionSubtotal()` = sum of EVERY displayed line (rooms + COPE). **COPE is NEVER the total** (it's permits/dumpsters/supervision — the non-room bucket). Label defaults: "Projected Construction Investment"; when the retainer element shows (stacked/blueprint) it adds the retainer and defaults to **"Total Projected Investment"**. `showConstructionTotal` (default true) + `constructionTotalLabel`.
- **Retainer snapshot** synced by `syncInvestmentSlide` (sole writer per SYNC_WRITE_SCOPES — do NOT add investment writes elsewhere): `retainerAmount` (number, `computeRetainer`), `retainerEnabled`, `designHourlyRate` on InvestmentBySpaceContent. **Retainer toggle auto-runs Re-sync** when `retainerAmount == null`. Re-sync clears isUserModified + refreshes line items.
- Inspector gating fixed: Table Header / Includes Text / Table Style sections **table-only** (was Steve's dead "Table Style slider" complaint). AI-Edit descriptor (NO money/line items — financial guardrail). Training doc `deck-investment-by-space-slide.md`.

**4. OVERALL INVESTMENT — finished completely (kept as separate slide; it's the retainer story + close).**
- Kept `three-band-summary` (DEFAULT); NEW **`insurance-policy`** (1.9em statement w/ auto-accent amount + "Zero Change Order Guarantee" [composed JSX when `insuranceStatement` null]; BIG umbrella-canopy/shield/blueprint-scroll SVG w/ seams + floor plan + dim ticks; 0.95em orange-dot benefit rows; brackets + compass + crosshair; sliders statement/bullet/graphic) + **`retainer-cta`** (white card, orange top stripe, accent subtitle, 2×2 benefits deliverables grid, framed "Design Retainer: $X" + auto-composed "(Credited as part of your total project investment of $X–$Y)" note, CTA + thanks lines, `ctaTextSize`; set a background photo for the wood look).
- `useOiMoney()` resolves rounded retainer/construction/totals. **Benefits list shared** across all 3 layouts (one editor). Inspector fully gated (three-band-only sections hidden on new layouts). **Headline is shared — retitle per layout** (e.g. "The Design Retainer as an Insurance Policy"). AI-Edit descriptor (benefits rewritable w/ style preserve; dollars off-limits). Training doc `deck-overall-investment-slide.md`.

**5. NEXT STEPS — layouts finished (training doc still TODO).**
- NEW **`staircase-cards`** (#3 ref: ascending 3D slate cards CW 31/35%, 50% climb, hard offset shadows `0.55em 0.7em 0`, serif numerals/titles, hairline frame, **navy footer band** w/ `footerTagline` default "Let's build your vision."; NO headline by design).
- **`numbered-photo` refreshed** (#4 ref: photo LEFT 40%, serif navy padded "01" numerals ×0.85, serif navy titles 1.1em, desc 0.72em; no-photo → list centered at 78% width).
- **`large-number-hero` REBUILT** to the ghost-numeral "Path Forward" look (Steve's OLD-deck reference — the app never had it): ghost = `numberSize×3.8` ≈11.4em at `rgba(26,35,50,0.095)`, text overlaps the numeral's lower half (`paddingTop = ghost×0.5`, linked to Number Size slider), 4 columns centered, **footer slogan line** default "Turning Ideas into Ideal Spaces. Design - Build - Remodel." (trim-to-hide; `footerTagline` shared w/ staircase via gated "Footer Band/Line" inspector section). `column-grid` + `two-by-two` polished (centered, white cards, serif titles, +50% type).
- **CONTACT INFO FULLY REMOVED from Next Steps** (Steve: "Why would they be on this slide when they are on the Closing"): ContactFooter component deleted; `contactEmail/contactPhone/showAddress` + 7 contact style fields deleted from NextStepsContent; inspector inputs/toggle/styling section removed; db.ts seed lines removed; `GlobalNextStepsSettings` contact fields removed (type + HHI defaults + server loader + Settings→Next Steps page UI). **Closing is the single contact home** (falls back to `branding.email/phone` from CompanySettings).

#### ✔ DONE LATER THIS SESSION (2026‑06‑11 continued):
- **Staircase Cards overlap controls** — `stairCardWidth`/`stairClimb`/`stairFrontFirst` on NextStepsContent + gated "Staircase Layout" inspector section (width ≈0.80× w/ 4 steps removes overlap; front-first flips z-order so text is never covered). Steve approved.
- **Next Steps training doc** `deck-next-steps-slide.md` + README row; README AI-Edit footnote fixed (now lists IBS/Overall-Investment/Closing).
- **CLOSING SLIDE finished & approved.** NEW **`blueprint-split` (DEFAULT for new decks)** — left: committed AI-generated grayscale floor-plan sheet `public/deck-art/closing-blueprint.png` (winner of 4 candidates from `scripts/gen-closing-blueprint.ts`; legible labels, no gibberish) rendered washed w/ radial-glow + full-color logo CUSTOM-rendered absolutely centered (LogoOverlay `centered` mode is in-flow and gets painted over by positioned siblings — do NOT use it for overlay-on-art; explicit zIndex 1/2/3 wash/glow/logo); right: bold Jost 2.5em headline + CTA paragraph (`ctaParagraph`, default sign-the-contract close) + validity + orange-topped contact box (`contactBoxTitle` "Turning Ideas into Ideal Spaces." + email | phone + address). Inspector: gated CTA/Contact-Box/Blueprint-Image sections (swap client's real plan; "Use default sheet"), tagline/subheadline hidden on split, per-layout truthful slider defaults. **Dark Centered polished to ref:** order headline→tagline(trim-to-hide)→subhead→LOGO→contact lockup (bold company / address / "phone | email")→fine print; default bg now warm charcoal `#262524`; sizes 2.1/0.8/0.85/0.55/0.45. Seeds: default-spec/db.ts (headline "Securing Your Project Schedule")/addSlide. **AI Edit on closing** (contact info protected; descriptor in ai-edit.ts; AI_EDIT_SUPPORTED_TYPES += closing). Training doc `deck-closing-slide.md`.
- **THEME-PROPAGATION SWEEP DONE.** Shared `slides/shared/BlueprintUnderlay.tsx` extracted (DesignExperience now imports it). Converted to `useDeckTheme()` surfaces (+ grid underlay + theme headline-font defaults): Timeline vertical-dot, Next Steps ColumnGrid/2×2/LargeNumberHero (+ header fonts on all 5), Overall Investment three-band (labels→fonts.headline, amounts→fonts.numeral), Testimonials ×3, Core Values ×4, Design-Build ×4 (solidBg → panel/surface), COPE ×4 roots + CopeHeader. Closing light-logo (surface+grid) + photo-card (NAVY fallback → theme.panel) — closing layout-specific FONT defaults intentionally kept (just-approved ref looks). Dead `const LINEN` deleted from 8 slide files (ScopeBreakdown's LINEN kept — it's a used cream TEXT color). **Cover intentionally NOT converted** (photo-hero; serif concept title = signature; no blank-surface state). Why Us comparison/guarantee palettes intentionally kept (approved design identity). In-card decorative serif numerals (NextSteps cards, quote serif, COPE column capitals, CycleDiagram SVG labels) intentionally kept.

#### ✔ ULTRA-REVIEW (2026‑06‑11) — 8 reference decks audited page-by-page vs app; every gap below survived adversarial verification (image + code re-checked). THEMES: 3 new themes shipped (gallery/coastal/palmetto; DECK_THEMES-driven picker; training doc deck-themes.md). VERIFIED GAP BACKLOG (build order TBD by Steve):
- **HIGH — Floor-plan / zone-map slide**: ✔ BUILT 2026-06-11 — new optional type `floor-plan` ("Floor Plan Map"), layouts `callout-map` (default; cards both sides + leader lines + pins + highlight boxes + total band) / `side-ledger`. Zones seed from rooms at addSlide; inspector "Pull rooms & SF" calls `fetchFloorPlanRoomDataAction` (SF = lengthFt×widthFt). Shared `slides/shared/LeaderAnnotations.tsx` (LeaderOverlay + NumberPin). Plan image defaults to /deck-art/closing-blueprint.png until the client's plan is picked. **RENDR IMPORT (2026-06-11):** inspector "Import plan from Rendr" — fetches the linked space's PDF via existing authed proxy `/api/rendr/spaces/{id}/floorplan` (Project.rendrSpaceId), rasterizes page 1 IN THE BROWSER with pdfjs-dist v6 (new dep; worker via `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` — verify under Turbopack on first click), persists PNG via `saveFloorPlanImageAction` → uploadBuffer R2 `deck/floor-plans/`; ~2200px long edge stays under the 5mb action body cap. AI-Edit: labels/desc only — sqft/pins/boxes protected. Training doc deck-floor-plan-slide.md. AWAITING Steve's visual pass.
- **HIGH — Craftsmanship slide**: ✔ BUILT 2026-06-11 — new optional type `craftsmanship`, layouts `standards-grid` (default; 2 titled columns + ≤6 macro collage; works instantly via committed defaults in app/lib/craftsmanship-defaults.ts) / `annotated-photo` (hero + leader-line callout cards + pins). AI-Edit: copy only, photos/pins protected. Training doc deck-craftsmanship-slide.md. AWAITING Steve's visual pass.
- **MED — Per-room scope deep-dive slide type**: one slide per priced space (hero photo + dims + spec bullets) bound to Room data; dominant beat in 6/8 references (leamington p04-06, coggins p04-05, song-sparrow p03-04).
- **MED — Leader-line annotation device**: callout cards/pins physically tied to photo/plan details; exists nowhere (COPE annotated = side panel only). Reusable shared component.
- **MED — Structured SF/dimension fields on scope items**: ScopeItem has no SF field; room dims live in DB but reach slides only via AI prose (drift risk). Bind them.
- **MED — Target-figure anchoring on investment layouts**: `rangeTarget` is computed AND already snapshotted on slide content but NO layout renders it; song-sparrow p05 hero-target + demoted range is the best money slide in the reference set. Cheap win.
- **LOW**: why-us stacked-list+photo layout (telford/heather p03); founder-quote+values dark composite (oyster p02); deck-wide footer band w/ address+page# (SlideCard chrome — references hand-botched theirs, automated beats them); design-experience funnel/convergence layout + planning-vs-construction bar (song-sparrow p07-08); before-after "Blueprint vs Reality" variant (oyster p03).
- **Strengths confirmed**: app already reproduces the best slide of nearly every reference as a dedicated layout; live money/timeline sync prevents the references' observed errors (typos, drifting totals/page numbers, NotebookLM watermarks on all 8); before/after + reveal slider is a category references lack; 5 themes span their whole stylistic spread.

#### ▶ NEXT UP (priority order — do NOT start until Steve directs):
1. **COMMIT PASS** — huge uncommitted batch (Why Us, Timeline, both Investments, Next Steps incl. staircase controls, Closing + blueprint asset + gen script, theme sweep, 8 training docs, public/why-us-icons/, prep scripts, settings changes). Suggest logical-scope splits per CLAUDE.md.
2. Decide retirement of `our-process` + `design-build` (superseded by design-experience; still optional types; design-build WAS theme-converted anyway).
3. Update `docs/reference-deck-analysis.md` backlog; consider AI-Edit for remaining types (core-values, testimonials, addition-overview, next-steps).
4. Steve to eyeball the theme sweep on localhost in BOTH themes (Blueprint = white+grid+Jost headers now actually propagate; Editorial = linen+serif unchanged).

#### Standing conventions (unchanged): tsc --noEmit after every change (zero errors); commit-on-demand (never auto-commit; never push); no `git add -A`; JobTread read-only; never `prisma db pull`; pre-launch = delete legacy fields outright (no back-compat shims); training doc in same commit as feature; AI never touches dollar amounts; per-slide-type layout keys live in types.ts unions + *_LAYOUTS lists + getLayoutsForType; AI-Edit = descriptor in ai-edit.ts + AI_EDIT_SUPPORTED_TYPES; sync write-scope registry enforces one writer per slide type.

---

### ▶▶ PREVIOUS SESSION (2026‑06‑09 CONTINUED — superseded where it conflicts with above)

**Branch `presentation-studio`. Everything below is UNCOMMITTED on disk (Steve batches commits).**
**`tsc --noEmit` is CLEAN as of this writing. Test project `cmoj1xg4t00t9747kq2py2iug`; Steve reviews on localhost.**

**DONE & approved this continuation:**
- **COPE slide** — rebuilt **Columns** (real classical entablature beam + capital/base overhang + fluted stone shaft; stone palette consts) and **Hexagon** (flattened pointy‑top filled honeycomb, exact %‑nested 3‑over‑2, aspect 2.1428; icons centered+larger). COPE inspector: built‑in **vector icon picker** (COPE_BUILTIN_ICONS + renderCopeIcon, exported from CopeSlide.tsx), **bullets gated** to Columns/IconColumns, **icons gated** to Hexagon/IconColumns; Columns description‑size now honored (source‑aware line styling).
- **Inspiration slide RETIRED** (type removed everywhere, like a clean delete).
- **Design Experience = NEW default slide type** (`design-experience`, replaces our‑process/design‑build as THE journey slide; seeded at order 850 before Timeline). Files: `app/admin/projects/[id]/deck/slides/DesignExperienceSlide.tsx`, `app/lib/deck/design-experience-defaults.ts`. **5 layouts:** Stepped Circles, Chevron Flow, Serpentine Cards, Steps+Photo, Ladder+Photo (dark). Full inspector (`DesignExperienceInspector`), AI‑Edit descriptor (`design-experience` in ai-edit.ts + AI_EDIT_SUPPORTED_TYPES), theme‑aware (Blueprint white/sans/grid+corner‑brackets via `BlueprintUnderlay`; Editorial linen/serif). Controls: **Circle/Stage/Card Size** (`content.circleSize`, layout‑gated label), **Step Label Size** (`content.stepLabelSize`, scales the "Stage N:" prefix). Steve APPROVED this slide.
- **DUOTONE / ISOMETRIC ICON PIPELINE (the big icon win):**
  - Hand‑authored duotone vector set `app/admin/projects/[id]/deck/slides/shared/DuotoneIcons.tsx` (`DUOTONE_ICONS` + `DuotoneIcon`, navy+orange).
  - **Committed isometric PNG icons** in **`public/deck-icons/`** (measure, feasibility, documentation, selections, contract) — these are the **DEFAULT** Design Experience stage icons (`iconUrl: /deck-icons/X.png`), so they show with **zero AI/clicks**. Render UN‑masked (`StageGlyph` renders iconImageUrl/iconUrl as `<img>`; mask‑tint would flatten the duotone).
  - **In‑app generation recipe (locked):** `generateBrandIconPngAction({ isometric:true })` in `app/admin/settings/actions.ts` (isometric prompt: navy `#1A2332` linework + orange `#F47216` accents, NO text, no other colors, white bg). Model = **gemini‑2.5‑flash‑image** (the lab winner). `resolveDuotoneIconImages()` in `scope-icon-resolver.ts` caches under **`iso-` slug** namespace. `BRAND_ICON_NORMALIZED_SIZE` bumped 256→512.
  - **Tooling (gitignored output):** `scripts/icon-lab.ts` (generate candidate matrix → `scripts/icon-lab-out/`), `scripts/prep-deck-icons.ts` (white‑key+trim → `public/deck-icons/`). `scripts/icon-lab-out/` is in `.gitignore`.
  - LESSON: AI image gen is UNRELIABLE at icon scale (faint/tiny/inconsistent). Curated committed PNGs + hand vectors are the reliable default; AI is the optional fallback.
- **Risk Brief slide RETIRED** (clean removal across ~12 files; content preserved → folded into Why Us comparison defaults).
- **Theme propagation (PARKED, partial):** `SlideRenderer` derives a dark‑bg‑aware theme; `OurProcessSlide` + `InvestmentBySpaceSlide` converted to theme tokens. The rest still hardcode — the big cross‑cutting NEXT.
- **Training:** added `docs/training/deck-design-experience-slide.md` + README index/AI‑Edit note.

**IN PROGRESS — Why Us redo (needs real visual work):**
- Added **3 comparison layouts** to Why Us: `comparison-table` (#1 matrix w/ row labels + ✓), `comparison-columns` (#2), `comparison-cards` (#4). Data: `WhyUsComparisonRow` + `comparison*` fields on WhyUsContent; defaults in `app/lib/deck/why-us-comparison-defaults.ts` (seeded from the matrix ref + Risk Brief). Inspector "Comparison" editor (headers, row‑labels toggle, per‑row Traditional/HHI‑lead/HHI‑detail, reset). Theme‑aware. tsc clean.
- ⚠️ **Steve's verdict: "Not even close to NotebookLM — they have to POP off the screen."** Current versions are too thin / low‑contrast / small. **MUST POLISH:** solid filled header bars (gray "Traditional" vs orange‑topped "HHI"), much bigger/bolder type, stronger contrast, bigger ✓, card shadows/depth, fill the slide. Reference screenshots: matrix #1 (gray header bar + orange‑accent HHI header, bold lead‑ins, big orange ✓), two‑col #2 (orange vertical divider, bold), cards #4 (gray vs navy bordered cards). Dig hard on these.
- **Pillar picker still shows on comparison layouts** (cosmetic no‑op) — gate `!isComparison` if desired.
- **Why Us AI‑Edit:** not added yet (dual content model: pillars vs comparison) — later.
- **Why Us training doc:** not written yet.

**▶ NEXT (priority):**
1. **Polish the 3 Why Us comparison layouts to "pop"** (Steve's active ask — biggest item).
2. **Refresh 2 legacy pillar layouts** → dark **Guarantee grid (#3)** (orange icon+title+desc 2×2) and **Advantage grid (#5)** (2×2 over photo). (Agreed: "Both.")
3. **Theme‑propagation sweep** across all remaining slides (Blueprint/Editorial everywhere).
4. Why Us training doc; reconcile design‑build merge (now superseded by design‑experience — design‑build still exists as optional, consider retiring).
5. Update `docs/reference-deck-analysis.md` backlog (mark comparison/Design‑Experience/Inspiration/Risk‑Brief done).

**Roster now:** added `design-experience` (default). Retired `inspiration`, `risk-brief`. `our-process` + `design-build` still exist as OPTIONAL types (design-experience supersedes them; not yet removed).

---

### ▶▶ EARLIER THIS SESSION (2026‑06, authoritative — newest below supersedes older notes)

**Branch `presentation-studio`. Last commit `69d3ac3` (Clerk UserButton hydration fix).**
**Everything since is UNCOMMITTED on disk (~26 files) by Steve's choice — he commits in
batches at the end.** Compaction does NOT lose these (they're on disk). When committing,
split by logical scope (slide work, ai-edit engine, dead-control fixes, docs).

**Two fixes already COMMITTED this session:**
- Autosave race fix — `DeckEditorClient` `suppressSaveRef` stops the debounced autosave
  from overwriting AI content during Generate Deck (root cause of "objective/scope come
  out generic"). 
- Clerk `<UserButton>` gated behind a `mounted` flag (hydration mismatch).

**Universal AI Edit engine (NEW, uncommitted) — the core of this session:**
- `app/lib/deck/ai-edit.ts` — generic `aiEditSlide({slideId,prompt})` + per‑slide‑type
  **capability descriptors**. One Claude call → a plan (copy / style / layout / icons /
  illustrations / background / photo) executed within the descriptor's allowlist.
- `app/admin/projects/[id]/deck/AiEditBox.tsx` — the reusable ✦ smart box (one prompt,
  no checkboxes) rendered centrally in `InspectorPanel` for supported types.
- **Multi‑step Undo** per slide in `DeckEditorClient` (`aiUndoRef` snapshot stack →
  `pushAiSnapshot`/`undoAiEdit`, passed to InspectorPanel → AiEditBox).
- `aiEditSlideAction` in `deck/actions.ts`. Supported types in `types.ts`
  `AI_EDIT_SUPPORTED_TYPES` = **cover, objective, scope-overview, before-after,
  scope-breakdown, cope** (add each type's descriptor + this list entry "on first edit").
- **Copy‑protection guard** (critical): if the prompt is art/layout/color‑only (no copy
  words), the engine discards any text the model returns → an "illustrate the rooms"
  request can NEVER overwrite descriptions. Items also merge by index preserving
  id/isIncluded. Descriptor item knobs: `titleField`, `preserveFields`, `supportsIconPng`
  (per‑item icon via `regenerateIcons`), `illustrationField` + `illustrationStyle`
  ("isometric" for scope‑breakdown blueprint) via `regenerateIllustrations`.
- Generic engine also handles top‑level `subheadline` (cover's BIG title is `subheadline`;
  `headline` is the small label — inverted vs other slides).

**Per‑slide status this session (all uncommitted, all `tsc` clean):**
- **Cover — polished:** AI drafts a CONCEPT title into `subheadline` (`draftCoverCopy`);
  prepared‑for / address / date now render on all layouts.
- **Objective — done:** added **pillars‑photo** layout (hero photo + pillars, Leamington
  style) → 3‑way Layout toggle (Hub & Spoke / Pillars / Photo + Pillars); AI can redraw
  hub + zone illustrations.
- **Scope Overview — done:** removed Split Panel + Image Row (now 5 layouts); Editorial
  panel bg/text colors; Blueprint **separate** icon‑color + item‑title‑color + marker
  (Icons/Check marks/Off); title B/I/U fixed; inspector decluttered.
- **Before/After — done (our differentiator):** 6 layouts — **Reveal Slider** (drag wipe,
  labels fade at edges), Side by Side, After Emphasis, **Cards**, **Offset**, **Diagonal**;
  `transformationStat` chip; AI Edit; **always‑suggested** in `db.ts` sync (any room with a
  render + before photo). Compact `ChangeList` (bullets, scaled by `captionSize`).
- **Scope Breakdown — done:** 4 layouts — Text Grid, Dark Table, **Utility Grid** (bordered
  icon cells + hairline under name + icon‑size‑responsive column), **Blueprint** (dark
  graph‑paper + ISOMETRIC line‑art per room). Per‑room `illustrationSize` slider + **"Lock
  sections together"** checkbox; AI generates bespoke icons/illustrations.
- **COPE — done:** 4 layouts — **Columns** (classical architectural), **Hexagon**
  (honeycomb), Icon Columns, Annotated Diagram (removed Quad Photos); `CopeGlyph` bespoke
  icons; AI Edit.
- **Dead‑control audit + fixes** across inspectors: removed/gated dead Card Style
  (testimonials, our‑process, design‑build→icon‑cards only), dead Show Overlay now honored
  in renderers (testimonials, design‑build, closing), removed dead overlay section
  (inspiration) + dead Footer Note block (next‑steps).

**Durable analysis doc:** `docs/reference-deck-analysis.md` — page‑by‑page breakdown of all
7 NotebookLM reference decks, our‑slides‑vs‑theirs map, the canonical slide arc, and the
**action backlog**. Reference PNGs were rendered to `C:\Users\syoun\Desktop\reference-decks\_render\`
(PyMuPDF; regen command in the doc — poppler/pdftoppm is NOT installed).

**Training:** 6 modules in `docs/training/` (cover, objective, scope, before‑after,
scope‑breakdown, cope) + README index. Per CLAUDE.md, ship a training update with each
user‑facing slide change.

**Roster decisions (made, NOT yet built):** retire `risk-brief` (fold its message into
`why-us`); merge `design-build` into `our-process` as layouts; add a **Technology /
JobTread transparency** slide (client login, real‑time budget/schedule — neither we nor
the refs have it).

**▶ NEXT (in priority order):**
1. **Theme propagation** — the agreed next big item. Blueprint/Editorial theme is delivered
   via `useDeckTheme()` context but MOST slide renderers still hardcode colors/fonts
   (only scope‑overview/objective/parts consume tokens). Make every slide read
   `theme.color.*` / `theme.fonts.*`. Cross‑cutting refactor across the slide set.
2. **Why‑Us comparison layout** ("Traditional vs HHI" — appears in 3 ref decks; absorbs the
   retired Risk Brief).
3. **Technology / JobTread slide.**
4. Retire risk‑brief; merge design‑build → our‑process.

**Test project:** `cmoj1xg4t00t9747kq2py2iug`. Steve tests on localhost; he runs previews.

---

### (Earlier in this session / pre‑pilot — historical context)

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
