# Reference Deck Review — 2026-06-11 (ultra-review)

**Question:** do we have every slide the reference decks have, and is ours as
good or better than the NotebookLM output?

**Verdict: parity or better on ~90% of the reference material — the standout
slide of nearly every reference deck now exists as a dedicated app layout —
with 11 verified gaps, 2 of them HIGH.** Every gap below survived an
adversarial verification pass that re-read the cited reference page image AND
the app's actual slide code; 15 raw claims went in, 0 were refuted, and
duplicates across the two analysis lenses were merged.

**Method:** 26 agents. One cataloger per reference deck read every page
(71 rendered PNGs + the Song Sparrow PDF, whose page renders are now also in
`_render/`). One agent inventoried the app (slide types, ~70 layouts, themes,
known backlog). Two independent gap analyses (coverage lens, quality lens)
worked over the combined evidence, and every claimed gap got its own
adversarial verifier.

Reference decks: `C:\Users\syoun\Desktop\reference-decks\` — 13 Telford Lane,
15 Heather Lane, 19 Oyster Bay, 60 Leamington Lane, 6 Fairway Winds,
79 Dolphin Head, 94 Coggins Point, Song Sparrow Road. All eight carry a
NotebookLM watermark on every page.

---

## Verified gaps (build backlog)

### HIGH

**1. Floor-plan / zone-map slide** — *94-coggins p03, song-sparrow p02*
The two strongest reference decks anchor their pitch on the client's actual
floor plan: translucent orange zone fills, numbered pins, and per-zone
square-footage callout cards on leader lines. The app has nothing that places
scope onto the client's architecture (cover cad-overlay and addition-overview
are photo composites, not annotated plans). Doubly important because our
pricing pipeline is SF-driven — this slide visually substantiates the
Investment numbers we already compute. Status: **greenlit 2026-06-11.**

**2. Craftsmanship / Materials & Assembly Standards slide** — *60-leamington
p07, 19-oyster p05*
Both luxury-styled references dedicate a slide to *showing* build quality —
macro photos of dovetail joinery, brass hardware, stone edges, waterproofing —
with annotation callouts pointing at the details. The app has no
evidence-of-quality slide type; Why Us is promise-led, not proof-led.
Status: **greenlit 2026-06-11.**

### MEDIUM

**3. Per-room scope deep-dive slide** — *60-leamington p04–p06, 94-coggins
p04–p05, song-sparrow p03–p04, 79-dolphin p03*
The dominant scope pattern in 6 of 8 references: one full slide per priced
space (hero photo + dimensions + spec bullets), so every investment line item
gets its own visual chapter. We have one project-level scope overview plus
8-per-slide breakdown grids; no slide binds to a single Room's data.

**4. Leader-line annotation device** — *19-oyster p05/p07, song-sparrow
p02/p05, 94-coggins p03*
Callout cards/pins physically tied to a photo, plan, or diagram detail — the
references' signature "engineering evidence" move. Exists nowhere in the app
(COPE's annotated layout is a detached side panel). One shared component
would serve gaps 1–3.

**5. Structured SF/dimension fields on scope items** — *song-sparrow p02/p04,
94-coggins p04, 15-heather p05*
Room dimensions drive our pricing but reach slides only if the AI happens to
write them into prose — unbound numbers that can drift from the DB. ScopeItem
has no SF field.

**6. Target-figure anchoring on investment layouts** — *song-sparrow p05*
"Total Target Investment: $167,000" huge, with the range demoted to a
sub-line — the best-engineered money slide in the reference set. We compute
`rangeTarget` and already snapshot it onto slide content; no layout renders
it. Cheapest win on this list.

### LOW

7. **Why Us stacked-list + side-photo layout** (13-telford p03, 15-heather p03).
8. **Founder quote + values band dark composite** (19-oyster p02).
9. **Deck-wide footer band** (address + page number) — SlideCard has no footer
   chrome layer; both references hand-botched theirs (drifting page numbers),
   so an automated one would beat them outright.
10. **Design-phase rationale layout** — funnel of four work streams converging
    on "The Fixed-Price Construction Contract" + a planning-vs-construction
    proportional bar (song-sparrow p07–p08, 6-fairway p04).
11. **"Blueprint vs Reality" before/after variant** — plan linework left,
    finished photo right, mirrored caption cards (19-oyster p03).

---

## Where the app already beats the references

- **Best-slide parity:** Dolphin's 3D money stack → Stacked Blocks; its wave →
  Horizon Wave; ghost numerals → Large Number Hero; Coggins' hub-spoke,
  honeycomb, segmented bar, insurance-policy, and blueprint-split closing;
  Telford's range bars + guarantee badge; Oyster's staircase; Leamington's
  guarantee grid; Fairway's retainer CTA — all native layouts now.
- **Data integrity the references can't match:** investment and timeline
  slides sync from the live pricing/timeline pipeline with AI barred from
  dollars. The references show the exact failure modes this prevents:
  restated totals that disagree (6-fairway p06 vs p08), page numbers out of
  order (60-leamington), duplicated phase text (15-heather p07).
- **Copy safety:** three of eight reference decks shipped client-facing typos
  at display size ("instaled", "from contract to completion to completion",
  "impossible impossible") — and every page of all eight carries a NotebookLM
  watermark. Our compose → human inspector → AI-Edit-with-undo loop ships
  neither.
- **Before/After is a category they don't have:** auto-synced per-room real
  "before" vs AI render with six layouts including the interactive reveal
  slider.
- **Theme range:** five themes (Blueprint, Editorial, Gallery, Coastal,
  Palmetto) span the references' entire stylistic spread from one content
  model; each reference is locked to a single look.
- **Closing discipline:** contact + 30-day validity structured on a locked
  final slide; two references end with no contact info at all.

---

## Appendix — per-deck catalogs

### 13-telford-lane-presentation (8 pages)

A tight two-color system: deep navy and brand orange on white, geometric
sans, bold uppercase navy headlines, thin orange accent rules; blueprint
watermarks behind data slides; footer band with address + page number.

- **p01 · cover** — full-bleed aerial of the client's house, navy scrims, logo card top-center, three-tier title stack.
- **p02 · process** — 4-column "Design Journey" stepper: icons, arrow line with numbered nodes, titles + body.
- **p03 · why-us** — 60/40 text/photo split; four benefit blocks each with orange rule + subhead + body. The benchmark why-us.
- **p04 · process** — five orange chevrons "Deep Dive: Design Experience" (redundant with p02, cramped).
- **p05 · scope** — three-photo band (detail/wide/detail) over a 2×2 scope grid with bulleted specs.
- **p06 · investment** — horizontal range bars + orange TOTAL bar + circular "Zero Mark-up" badge + COPE footnote.
- **p07 · timeline** — vertical spine, alternating shadow cards with range durations + ARB caveat.
- **p08 · next-steps** — full-bleed kitchen photo, navy panel right with retainer figure $14,000.

### 15-heather-lane (8 pages)

High-contrast black/white/orange; heavy grotesque sans; charcoal textured
darks alternating with white; energetic contractor feel rather than luxury.

- **p01 · cover** — client's brick home full-bleed, gradient scrim, "Prepared specifically for…" card.
- **p02 · process** — five orange chevrons on dark ("The Design Experience").
- **p03 · why-us** — photo left / white panel right, stacked benefits, last on orange band.
- **p04 · process** — "Initiating the Blueprint": 01–04 numeral rail + ladder rule.
- **p05 · scope** — screened porch: giant headline, ~20'×15.5' footprint spec, photo right.
- **p06 · investment** — bordered 3-row range table on dark; "Cost of Project Execution" left unexplained (jargon).
- **p07 · timeline** — vertical orange spine, black phase bars staggered; duplicated phase text bug.
- **p08 · closing** — photo left / dark panel right, retainer $15,000; no contact info anywhere.

### 19-oyster-bay-presentation (11 pages)

Navy + white "architectural blueprint" system; editorial serif headlines;
graph-paper grids, double-line drafting frames, leader-line annotations,
exploded isometric diagram. Engineering-credibility feel.

- **p01 · cover** — 50/50: drafted white panel (serif wordmark, title) | photo.
- **p02 · why-us (quote/values)** — dark: big company quote + 4-column values band.
- **p03 · before-after** — "The Blueprint: / The Reality:" plan linework vs finished photo.
- **p04 · scope** — dark sidebar list + photo field.
- **p05 · craftsmanship** — headline-free annotated collage; leader lines to dovetails/LED/seams. Their most distinctive device.
- **p06 · why-us (comparison)** — "Traditional Contractor Chaos vs HHI Streamlined Certainty" two-column versus.
- **p07 · anatomy** — exploded isometric "Anatomy of a Remodel" with callouts.
- **p08 · timeline** — horizontal bar, four dots dropping to cards.
- **p09 · investment** — minimal 4-row range table.
- **p10 · testimonial** — single quote ("instaled" typo at display size).
- **p11 · next-steps** — ascending stair-step cards O1/O2/O3 ("Let's build your vision.").

### 60-leamington-lane-presentation (15 pages)

Warm luxury: Cormorant/Playfair-style serif titles, terracotta accent, linen
backgrounds, half-page photo panels, footer band with address + page number
(numbers drift out of order). Closest cousin to our Editorial theme.

- p01 cover (aerial + cream title band) · p02 objective (photo | mission + zone list)
- p03 why-us (3-column advantage w/ terracotta icons) · **p04–p06 scope: one slide per space** (Kitchen / Primary Bath / Living + Guest Bath — photo + bold-lead-in spec bullets)
- **p07 "Built to Last: Material & Assembly Standards"** — standards columns + 2×3 macro craftsmanship collage. The most premium-feeling page.
- p08 investment (5-row range table + total band) · p09 guarantee (dark 2×2 grid) · p10 process (5 stage pills)
- p11 timeline (vertical milestones) · p12 testimonials (3 quote cards) · p13 core values (stacked list)
- p14 next-steps (photo + numbered 01–04) · p15 closing ("Ready to Transform Your Home?" dark centered — our Dark Centered ref).

### 6-fairway-winds-presentation (8 pages)

Navy + orange corporate, geometric sans only, grid-paper textures, drone
photography; competent but generic template feel; inconsistent margins.

- p01 cover (drone roofline + title bands) · p02 process (4 white cards on grid paper)
- p03 why-us (dark 2×2 value grid) · p04 feasibility rigor (jobsite photo + numbered list)
- p05 scope (photo | numbered scope list) · p06 investment (7-row bordered table; total restated inconsistently vs p08)
- p07 timeline (orange rail + diamond nodes over washed photo) · p08 next-steps/closing (wood background + white card + orange edge — our Retainer CTA ref).

### 79-dolphin-head (9 pages)

Photography-forward warm linen + charcoal; serif/sans mix; orange accent
rules everywhere; the deck our Stacked Blocks / Horizon Wave / ghost-numeral
Path Forward / COPE columns layouts came from.

- p01 cover (shiplap entry photo + logo) · p02 objective (3 pillar cards)
- p03 scope (great-room photo + inset + detail blocks) · p04 scope (5 bordered room cards)
- p05 COPE (5 classical columns) · p06 why-us (comparison table; "impossible impossible" typo)
- p07 timeline (sinusoidal wave + orange nodes) · p08 investment (3D stacked tower + brace + total)
- p09 next-steps (4 columns, ghost numerals, "The Path Forward").

### 94-coggins-project-range (12 pages)

The most architecturally disciplined deck: graph-paper grids, compass roses,
registration ticks, isometric line art, heavy geometric sans, single orange
accent. Its spine: three "Zones" defined early and reused on the plan map,
detail slides, and investment bar — every number traces to a toured zone.

- p01 cover (porch photo | drafted white panel) · p02 objective (hub-and-spoke, isometric house center)
- **p03 "Mapping the Project Footprint"** — the client's real plan, translucent orange zone fills, numbered pins, SF callout cards. The HIGH-gap evidence.
- p04 Zone 1 detail (photo | 168 SF stat + icon ledger) · p05 Zones 2 & 3 (dark blueprint two-column)
- p06 COPE honeycomb · p07 why-us comparison (3-col matrix w/ orange checks)
- p08 design experience (4 ring-icon steps) · p09 timeline (3 interlocking chevrons)
- p10 "The Design Retainer as an Insurance Policy" (our Insurance Policy ref) · p11 investment segmented bar (retainer lead segment — unlabeled, which our Blueprint Breakdown fixes)
- p12 closing "Securing Your Project Schedule" (ghosted plan + logo | CTA + contact box — our Blueprint Split ref).

### song-sparrow-road-range (9 pages, from PDF; renders now in _render/)

Classic NotebookLM: charcoal-navy serif headlines with trailing periods,
white/linen/photo alternation, orange numerals and zone fills, beige callout
cards with leader lines; one idea per slide.

- p01 cover (home photo + white card) · **p02 zone plan** — measured floor plan, three orange zone fills, beige SF callout cards (Kitchen 88 SF / Hall Bath 48 SF / Middle Bath 64 SF). HIGH-gap evidence.
- p03 kitchen deep-dive (photo | 2×2 icon grid) · p04 baths deep-dive (twin photo cards w/ real dims 4'8"×10'3")
- **p05 investment** — "Total Target Investment: $167,000" hero + demoted range + segmented bar w/ leader lines. Best money slide in the set.
- p06 why-us (3×2 evaluation matrix) · p07 **funnel** ("Why meticulous planning takes 10 to 14 weeks." → Fixed-Price Contract)
- p08 timeline (60/40 planning-vs-construction pill; "completion to completion" typo) · p09 next-steps ("Initiating the design phase." 01–04 + photo).

---

*Generated by the 2026-06-11 ultra-review workflow (26 agents; every gap
adversarially verified against both the reference image and the app code).
Build status of each gap is tracked in `docs/presentation-studio-plan.md`.*
