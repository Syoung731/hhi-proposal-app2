# Reference Deck Analysis — NotebookLM Proposal Decks

**Purpose:** Catalog HHI's 7 existing NotebookLM-generated proposal decks page-by-page,
map every page type to the slide types our app produces, surface gaps in both
directions, and lock in the strategic finding that **before/after is our
differentiator**. This file is the durable source of truth for the deck program —
re-read it after any compaction.

**Source PDFs:** `C:\Users\syoun\Desktop\reference-decks\` (7 files).
**Rendered to PNG for review** with PyMuPDF (poppler/`pdftoppm` is NOT installed):

```bash
cd "C:/Users/syoun/Desktop/reference-decks" && python -c "
import fitz, glob, os, re
out='_render'; os.makedirs(out, exist_ok=True)
for f in sorted(glob.glob('*.pdf')):
    slug=re.sub(r'[^a-z0-9]+','-', os.path.splitext(f)[0].lower()).strip('-')
    d=fitz.open(f); n=d.page_count
    for i in range(n):
        d.load_page(i).get_pixmap(matrix=fitz.Matrix(1.4,1.4)).save(os.path.join(out,f'{slug}__p{i+1:02d}.png'))
    d.close()
"
```

PNGs live in `reference-decks/_render/` (71 images, `<slug>__pNN.png`). Safe to delete; regenerate with the command above.

---

## 1. Our current slide types (19)

From `app/lib/deck/types.ts` → `SLIDE_TYPE_LABELS`:

`cover` · `objective` · `investment-by-space` · `why-us` · `scope-overview` ·
`before-after` · `scope-breakdown` · `risk-brief` · `our-process` · `core-values` ·
`timeline` · `cope` · `overall-investment` · `next-steps` · `closing` ·
`inspiration` · `testimonials` · `design-build` · `addition-overview`

---

## 2. Per-deck page-by-page breakdown

### 13 Telford Lane (8pp) — single-scope (kitchen), light theme
| # | Title | Page type | Maps to |
|---|-------|-----------|---------|
|1|13 Telford Lane|Cover, hero + bottom bar|`cover`|
|2|The Design Journey|4 icon steps + arrow|`our-process`|
|3|Why Partner With HHI Builders?|4 value props + photo|`why-us`|
|4|The Deep Dive: Your Design Experience|5 chevron stages|`our-process` / `design-build`|
|5|Scope Alignment: The Vision|3 photos + 4 items|`scope-overview` (gallery-grid)|
|6|Financial Clarity & Investment Range|bar ranges + Total + badge|`overall-investment`|
|7|Project Timeline|3-phase timeline|`timeline`|
|8|Next Steps|photo + retainer $14k CTA|`next-steps`/`closing`|

### 15 Heather Lane (8pp) — single-scope (screened porch), dark theme
| # | Title | Page type | Maps to |
|---|-------|-----------|---------|
|1|15 Heather Lane|Cover, dark overlay|`cover`|
|2|The Design Experience|5 chevron stages|`our-process`|
|3|Why Partner With HHI Builders?|photo + 4 props|`why-us`|
|4|Initiating the Blueprint|4 numbered steps + photo|`our-process`|
|5|Scope Alignment: Your Screened Porch|5 checkmarks + photo|`scope-overview` (photo-checklist)|
|6|Projected Investment Range|table + total|`overall-investment`|
|7|Project Timeline Overview|4-phase stepped|`timeline`|
|8|Securing Your Project|retainer $15k + quote|`closing`/`next-steps`|

### 19 Oyster Bay (11pp) — premium editorial, single-scope (kitchen)
| # | Title | Page type | Maps to |
|---|-------|-----------|---------|
|1|HHI Builders / From Vision to Reality|Cover, editorial split|`cover` (split-editorial)|
|2|"Anything it takes" quote + 4 values|Core values grid + quote|`core-values`|
|3|The Blueprint / The Reality|CAD plan ↔ finished photo compare|**before/after-adjacent**|
|4|The Scope|dark panel items + showcase card|`scope-overview` (editorial-split)|
|5|(craftsmanship detail)|3 annotated photos w/ callouts|`inspiration` (detail callouts)|
|6|Contractor Chaos vs HHI Certainty|2-col comparison|`why-us` (**comparison variant**)|
|7|The Anatomy of a Remodel|exploded 3D layer diagram|`design-build`|
|8|The Project Roadmap|4-phase icons|`timeline`/`our-process`|
|9|Projected Investment|table + retainer|`overall-investment`|
|10|(testimonial)|single quote|`testimonials`|
|11|(closing)|3 numbered steps + CTA|`next-steps`/`closing`|

### 6 Fairway Winds (8pp) — single-scope (porch+misc), navy theme
| # | Title | Page type | Maps to |
|---|-------|-----------|---------|
|1|2026 Renovation Concept|Cover, bottom-card|`cover`|
|2|The Path to Your Perfect Home|4-step design journey|`our-process`|
|3|The Design-Build Advantage|4 value props|`why-us`|
|4|Beneath the Surface: Feasibility Rigor|4 numbered + photo|`our-process`|
|5|Scope of Work Alignment|photo + 5 numbered items|`scope-overview` (photo-numbered)|
|6|Transparent Investment Breakdown|line-item table + COPE + total|`investment-by-space`|
|7|Projected Project Timeline|4-phase zigzag|`timeline`|
|8|The Next Step|retainer $20k + checklist CTA|`next-steps`|

### 60 Leamington Lane (15pp) — **most complete**, multi-room luxury, serif
| # | Title | Page type | Maps to |
|---|-------|-----------|---------|
|1|Project Investment & Design Concept|Cover|`cover`|
|2|Project Objective: A Luxury Grade Remodel|photo + statement + 3 pillars|`objective` (pillars)|
|3|The Integrated Design-Build Advantage|3-col icons|`why-us` / `design-build`|
|4|Scope of Work: The Kitchen|photo + items|`scope-breakdown`|
|5|Scope of Work: Primary Bathroom|photo + items|`scope-breakdown`|
|6|Living Room & Guest Bath|photo + items (2 rooms)|`scope-breakdown`|
|7|Built to Last: Material & Assembly Standards|2-col text + swatch photos|**(we lack — materials)**|
|8|Projected Investment|table by space + retainer|`investment-by-space`|
|9|The HHI Builders Guarantee|4 props (dark)|`why-us`|
|10|Your Design Experience|5 oval stages|`our-process`|
|11|Estimated Timeline|3-phase|`timeline`|
|12|What Our Clients Say|3 testimonial cards|`testimonials`|
|13|Our Core Values|5-item list|`core-values`|
|14|Next Steps to Begin|photo + 4 numbered|`next-steps`|
|15|Ready to Transform Your Home?|contact closing|`closing`|

### 79 Dolphin Head (9pp) — multi-room, editorial serif
| # | Title | Page type | Maps to |
|---|-------|-----------|---------|
|1|79 Dolphin Head: A Complete Reimagining|Cover, interior hero|`cover`|
|2|Reclaiming the Home's True Potential|statement + 3 pillars (Space/Flow/Craft)|`objective` (pillars)|
|3|The Heart of the Home|photos + 2 room sections|`scope-breakdown`|
|4|Purposeful Living & Utility Spaces|6-space icon grid|`scope-breakdown` / `addition-overview`|
|5|The Invisible Craft: Project Execution|5 classical columns|`cope`|
|6|A Radically Transparent Approach|2-col comparison|`why-us` (**comparison**)|
|7|The Project Horizon|wavy 5-phase timeline|`timeline`|
|8|A Transparent Breakdown of Your Investment|stacked-layer graphic + total|`investment-by-space`|
|9|The Path Forward|4 numbered steps + contact|`next-steps`/`closing`|

### 94 Coggins Project Range (12pp) — **hub-spoke objective reference**, blueprint theme
| # | Title | Page type | Maps to |
|---|-------|-----------|---------|
|1|Enhanced Livability for 94 Coggins Point|Cover, photo+text, graph bg|`cover`|
|2|The 'Living Outward' Objective|**hub-spoke** center home + 3 zones + arrows|`objective` (hub-spoke) ✅ ref|
|3|Mapping the Project Footprint|floor plan + numbered callout pins|**(we lack — floorplan map)**|
|4|Zone 1: The Poolside Retreat|photo + 4 icon items + stat|`scope-overview` (blueprint-icons) ✅ ref|
|5|Zone 2 & 3: Optimizing Capacity & Utility|2 line-art houses + items|`scope-breakdown` (illustrated)|
|6|The Project Execution Framework|hexagon honeycomb of 5|`cope`|
|7|The HHI Standard vs. Traditional Builders|comparison table + checkmarks|`why-us` (**comparison**)|
|8|Your 4-Step Design Experience|4 stops on a line|`our-process`|
|9|The Project Timeline|3 chevron phases|`timeline`|
|10|The Design Retainer as an Insurance Policy|umbrella graphic + $23k + 4 pts|`next-steps`/`closing`|
|11|Projected Investment Breakdown|horizontal stacked bar + zones|`investment-by-space`/`overall-investment`|
|12|Securing Your Project Schedule|floorplan + CTA|`closing`|

---

## 3. Master page-type taxonomy (frequency across 7 decks)

| Page type | Decks | Our slide | Status |
|-----------|:-----:|-----------|--------|
| Cover | 7/7 | `cover` | ✅ full (hero, overlay, split variants) |
| Why-Us / Advantage / Guarantee | **7/7** | `why-us` | ✅ prop-grid; ⚠️ **missing comparison variant** |
| Investment (range or by-space) | 7/7 | `investment-by-space` + `overall-investment` | ✅ |
| Timeline | 7/7 | `timeline` | ✅ |
| Process / Design Experience | 7/7 (often ×2) | `our-process` + `design-build` | ✅ |
| Next Steps / Retainer / Closing | 7/7 | `next-steps` + `closing` | ✅ |
| Scope (single hero) | 5/7 | `scope-overview` | ✅ all layouts present |
| Scope Breakdown (per-room) | 3/7 (multi-room) | `scope-breakdown` | ✅ |
| Objective | 4/7 | `objective` | ✅ pillars + hub-spoke |
| COPE / Execution Framework | 3/7 | `cope` | ✅ |
| Core Values | 2/7 | `core-values` | ✅ |
| Testimonials | 2/7 | `testimonials` | ✅ |
| Detail callouts / craftsmanship | 1/7 | `inspiration` | ◑ partial |
| Anatomy / exploded diagram | 1/7 | `design-build` | ◑ partial |
| **Materials & Assembly Standards** | 1/7 | — | ❌ **we lack** |
| **Floorplan / Footprint mapping** (CAD + pins) | 2/7 | — (only `cover` CAD overlay) | ❌ **we lack** |
| **Before / After** | **0/7** | `before-after` | 🟢 **OUR DIFFERENTIATOR** |

---

## 4. Outliers

### Page types THEY use that WE lack / under-serve
1. **Why-Us comparison ("Traditional vs HHI")** — appears in 3 decks (Oyster, Dolphin, Coggins) as a 2-column or table-with-checkmarks "chaos vs certainty." Very persuasive. We only have a value-prop grid. → **Add a `comparison` layout to `why-us`.** (Highest-value gap.)
2. **Materials & Assembly Standards** — Leamington "Built to Last" (2-col text + material swatch photos). Reassures luxury buyers. → New layout on `design-build`, or a small new type.
3. **Floorplan / Footprint mapping** — Coggins "Mapping the Project Footprint" + Oyster "Blueprint/Reality" (CAD plan with numbered callout pins). We have a CAD *cover* overlay but no callout-map slide. → Candidate new type or `scope-overview` layout.

### Page types WE have that THEY rarely/never use
- **`before-after`** — 0/7 decks. See §5.
- **`risk-brief`** — none have a standalone risk page; risk is folded into Why-Us ("Zero Change Order Guarantee"). Consider whether `risk-brief` earns its place or should merge into `why-us`.
- **`addition-overview`** — specific to additions; fine as-is.

### Myth-busted
- The hypothesis "**none of these has a Why-Us page**" is the opposite of reality: **all 7 have one** — it's the most universal page after Cover. Our job is to make ours best-in-class (incl. the comparison variant), not to question whether it belongs.

---

## 5. The differentiator: Before / After (strategic)

**None of the 7 NotebookLM decks contains a true before→after.** The closest is
Oyster Bay's "The Blueprint / The Reality" (CAD plan vs finished photo) — a
*compare*, not a before-photo → AI-rendered-after.

We already have the pipeline NotebookLM can't touch:
- **Rendr / AI render** producing photoreal "after" images from the client's own
  "before" photos (Studio tab → before/after candidates).
- A `before-after` slide type with side-by-side and after-emphasis layouts.

**Implication for the sales program:** lead with before/after. It is the single
page no competitor's NotebookLM deck can produce, and it makes the proposal feel
custom and real. Recommended placement in the arc: right after Scope, before
Investment — "here's exactly what your space becomes."

---

## 6. Recommended canonical slide arc (synthesized)

A best-in-class HHI deck, ordered (skip types that don't apply per project):

1. **Cover**
2. **Objective** (hub-spoke for multi-zone; pillars for simpler)
3. **Why Us** (lead with the comparison variant when added)
4. **Scope Overview** (single scope) — or **Scope Breakdown** ×N (multi-room)
5. **Before / After** ← differentiator
6. **Investment** (by-space for multi-room; range for single)
7. **COPE** (project-execution framework)
8. **Our Process / Design Experience** (the "journey")
9. **Timeline**
10. **Testimonials** + **Core Values** (trust block)
11. **Next Steps / Retainer** → **Closing**

Optional/contextual: Materials Standards, Floorplan map, Inspiration/details,
Design-Build anatomy, Addition Overview, Risk Brief.

---

## 7. Action backlog (from this analysis)

**Roster decisions (made 2026-06-07):**
- ✅ DECIDED: **Retire `risk-brief`** — fold the risk message into `why-us` (esp. the
  comparison layout). All 7 decks handle risk inside Why-Us; a standalone risk page
  reads as defensive. Pre-launch DB wipe → safe to remove the type.
- ✅ DECIDED: **Merge `design-build` into `our-process`** as additional layouts
  (journey / detailed stages / anatomy diagram), so there's ONE "Process" type.
- ✅ NEW: **Add a "Technology / Transparency" slide** — HHI's JobTread system as a
  differentiator: clients get a JobTread login to see budget, schedule, daily
  updates in real time. Short blurb + JobTread screenshots. Neither we nor the
  reference decks have this today; it reinforces the same "radical transparency"
  theme as Why-Us. Candidate type name: `technology` (or `transparency`).

**Build queue:**
- [x] **Cover polish + AI concept title** — ✅ done 2026-06-08 (concept title → `subheadline`; prepared‑for/address/date on all layouts).
- [x] Make **before/after** a first-class, always-suggested slide. ✅ done 2026-06-09 — 6 layouts incl. reveal slider, stat chip, AI Edit; sync creates it for any room with a render + before photo.
- [x] Add **Objective photo-pillars** layout. ✅ done 2026-06-08.
- [x] **Scope Breakdown** rework. ✅ done 2026-06-10 — 4 layouts (Text Grid, Dark Table, Utility Grid, Blueprint isometric), per-room icons/illustrations, art-size + lock, AI Edit.
- [x] **COPE** rework. ✅ done 2026-06-11 — 4 layouts (Columns, Hexagon, Icon Columns, Annotated), bespoke icons, AI Edit; removed Quad Photos.
- [ ] **Theme propagation** — make Blueprint/Editorial drive EVERY slide (most renderers hardcode colors/fonts today). ← NEXT, big.
- [ ] Add **comparison layout** to `why-us` ("Traditional vs HHI", 2-col / checkmark table). *(high value; absorbs Risk Brief)*
- [ ] Build the **Technology / JobTread transparency** slide (see above).
- [ ] Retire `risk-brief`; merge `design-build` → `our-process` layouts.
- [ ] Consider **Materials & Assembly Standards** layout (`our-process`/`design-build` variant).
- [ ] Consider **Floorplan / Footprint** callout-map slide (CAD plan + numbered pins).
- [ ] As each slide type is opened for polish, add its **AI-Edit descriptor** (`ai-edit.ts` + `AI_EDIT_SUPPORTED_TYPES`).

---

*Generated from a page-by-page review of all 7 reference decks on 2026-06-06.*
