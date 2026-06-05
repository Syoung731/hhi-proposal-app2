# HHI Deck System — Canonical Spec

> Status: **approved direction** (theme-tokenized, spec-first). This is the
> blueprint every proposal slide is built/retrofit against, and the foundation
> for the future "AI decides which slides to build" layer.
>
> Derived from analysis of all 7 NotebookLM reference decks in
> `C:\Users\syoun\Desktop\reference-decks` (13 Telford, 15 Heather, 19 Oyster
> Bay, 6 Fairway Winds, 60 Leamington, 79 Dolphin Head, 94 Coggins).

---

## 1. Why this exists

The reference decks are extremely consistent in **two ways**: a fixed slide
**sequence**, and a small set of reusable **layout grammars**. They differ only
in **visual theme** (two of them). Our app drifted to 19 slide types with
overlaps ("random slides"). This spec locks the canonical set + a shared layout
language + a two-theme token system so every slide reads as one designed system.

---

## 2. Canonical slide arc

Every reference deck follows this spine. This is the composer's default order
and the menu of "known" slide types.

1. **Cover**
2. **Objective / Vision** — *why* before *what*
3. **Process** — "The Design Journey" (numbered step rail)
4. **Design-Build Advantage** — differentiators (quad / triptych)
5. **HHI vs Traditional** — comparison table
6. **Scope** — one or more (per room / grouped / additional-rooms rollup)
7. **Before / After** — *HHI-only differentiator; not in references, we add it*
8. **Timeline** — phased rail with durations
9. **Investment** — range table by space + COPE + retainer
10. **Retainer Rationale** — "insurance policy / credited" framing (optional)
11. **Testimonials** *(optional, when content exists)*
12. **Core Values** *(optional)*
13. **Closing / Next Steps** — CTA + retainer price + contact + "valid 30 days"

**Optional / project-specific inserts** seen in references: Materials & Standards,
Craftsmanship Details, Annotated Floor-Plan Footprint (additions), Mission/Quote.

---

## 3. Current 19 slide types → canonical mapping

| Current `SlideType` | Verdict | Notes |
|---|---|---|
| `cover` | **Keep** | Core. |
| `objective` | **Keep + standardize** | → 1-sentence mission + **3 pillars** form (see §6). |
| `our-process` | **Keep** | Universal "Design Journey" step rail. |
| `design-build` | **Keep** | The "Advantage" quad/triptych. |
| `risk-brief` | **Keep** | The "HHI vs Traditional" comparison table. |
| `why-us` | **Retire** | Redundant with `design-build` + `risk-brief`. (Pre-launch, DB wiped — no migration needed.) |
| `scope-overview` | **Keep** ✅ done | Photo-left/list-right + structured items, 7 layouts, AI Edit, icons. The pilot. |
| `scope-breakdown` | **Keep** | "Additional Rooms" rollup for photo-less rooms. |
| `before-after` | **Keep** | HHI-only differentiator (real render pairs). |
| `timeline` | **Keep** | Phased rail. |
| `investment-by-space` | **Keep (primary investment)** | Range table by room/space. |
| `overall-investment` | **Keep / fold** | Grand-total + retainer; consider merging into `investment-by-space` as a final block. |
| `cope` | **Keep / fold** | COPE explainer; references fold COPE into the investment table + a footnote. Keep as optional explainer. |
| `next-steps` | **Keep** | Numbered steps (01–04). |
| `closing` | **Keep** | CTA + contact + validity. May pair with or absorb `next-steps`. |
| `testimonials` | **Keep (optional)** | Quote cards. |
| `core-values` | **Keep (optional)** | Stacked list. |
| `inspiration` | **Keep (optional)** | Maps to Materials/Craftsmanship detail slides. |
| `addition-overview` | **Keep (project-specific)** | Annotated floor-plan footprint for additions (Coggins). |

**Net:** retire `why-us`; consider folding `overall-investment`/`cope` into the
investment family; everything else maps cleanly.

---

## 4. The two themes

Selectable per project (stored on `ProposalDeck.deckTheme`, snapshotted at
publish). Every slide must render correctly in **both** — no hardcoded colors.

### Theme A — **Blueprint / Sans** (engineering)
*Refs: 94 Coggins, 6 Fairway Winds, 13 Telford, 15 Heather Lane*
- **Fonts:** bold humanist/geometric **sans** for titles (Jost/Inter), sans body.
- **Surface:** white / very light, optional **graph-paper grid** underlay.
- **Ink:** navy `#1A2332`. **Accent:** orange `#F47216`.
- **Panel (dark variant):** slate `#27323B`, white text.
- **Devices:** line-art icons, dimension/registration marks, infographic
  metaphors (honeycomb, chevrons, stacked budget bar), rail-with-nodes.
- **Title:** bold, top-left, **no** underline rule (accent lives in body/icons).

### Theme B — **Editorial / Serif** (luxury linen)
*Refs: 60 Leamington, 19 Oyster Bay*
- **Fonts:** **Cormorant Garamond** serif titles + numerals, Jost/sans body.
- **Surface:** warm **linen/cream** (radial gradient), white panels.
- **Ink:** charcoal `#1A2332`. **Accent:** orange `#F47216` + optional bronze.
- **Panel (dark variant):** charcoal near-black, white serif.
- **Devices:** big serif numerals, oversized quote glyphs, hairline dividers,
  photo-left/serif-bullets-right, soft-shadow white cards.
- **Title:** serif, top-left, **orange underline accent rule** (house style).

---

## 5. Theme token model (the contract every slide consumes)

Slides must NOT hardcode colors/fonts. They read a resolved `DeckTheme` object.
Proposed shape (to live in `app/lib/deck/themes.ts`):

```ts
interface DeckTheme {
  key: "blueprint" | "editorial";
  fonts: {
    headline: string;   // CSS var ref, e.g. "var(--font-cormorant), serif"
    body: string;
    label: string;
    numeral: string;    // serif numerals for editorial, sans for blueprint
  };
  color: {
    ink: string;        // primary text on light surface
    muted: string;      // secondary text
    accent: string;     // #F47216
    accentSoft: string; // accent @ low alpha (chips, fills)
    surface: string;    // slide background base
    panel: string;      // dark/alt panel background
    panelInk: string;   // text on panel
    panelMuted: string; // secondary text on panel
    line: string;       // dividers / grid lines
  };
  surface: {
    page: "linen" | "white";          // default background treatment
    grid: boolean;                     // graph-paper underlay default
  };
  title: {
    underlineRule: boolean;            // orange rule under titles (editorial=true)
    transform: "none" | "uppercase";
  };
  numeralStyle: "serif" | "sans";
}
```

- Resolved once per deck render (from `ProposalDeck.deckTheme`) and passed into
  `SlideCard` → each slide component alongside existing `branding`.
- `branding.accentColor` / `branding.textColor` still win when a user overrides
  per-slide (existing per-field controls remain).
- **Migration note:** add `deckTheme` to `ProposalDeck` (default `"blueprint"`),
  include it in the published snapshot. ⚠️ schema change.

### Retrofit rule
When building or touching a slide: replace literal `#1A2332` / `#27323B` /
`#FAFAF8` / font literals with `theme.color.*` / `theme.fonts.*`. The
`scope-overview` layouts are the first to retrofit (they currently hardcode
slate/white).

---

## 6. The reusable layout grammars

Each canonical section maps to one of these. Build each ONCE, theme-tokenized.

1. **Hero/Bookend** (Cover, Closing): full-bleed photo + floating panel, OR
   split photo/text. Closing mirrors Cover.
2. **Statement + 3 pillars** (Objective): headline + 1-sentence mission (inline
   bold) + 3 pillars (icon + bold label + one line). Optional "hub-and-spoke"
   variant (center subject icon + 3 accent arrows → labeled zones, à la Coggins).
3. **Step rail** (Process, Timeline, Next Steps): nodes/cards/chevrons on an
   accent connector; numbered; durations baked into headers for Timeline.
   Variants: horizontal rail, vertical rail, serpentine/wave, chevrons.
4. **Quad / triptych** (Design-Build Advantage, Core Values): 2×2 or 3-up
   icon+heading+body, accent headings, divider lines.
5. **Comparison table** (HHI vs Traditional): two columns, muted "loser" column,
   accent checks/header on the "win" column, row dividers.
6. **Photo + list** (Scope): photo-left / list-right; list styles = bullets /
   checkmarks / numbered / icon-rows. ✅ built.
7. **Range table / budget graphic** (Investment): low–high ranges always; COPE
   broken out; retainer as highlighted row; bold accent grand total. Optional
   infographic variants (segmented budget bar, stacked "building" blocks).
8. **Quote cards** (Testimonials): white cards + oversized accent quote glyphs.
9. **Annotated plan** (Addition Overview / Footprint): floor plan + numbered
   accent map-pins + leader-line caption cards.

---

## 7. Universal rules (from every reference deck)

- **Investment is always a low–high RANGE**, never a single number.
- **Investment is presented BY ROOM/SPACE**, not by BASE/ALT/ALLOWANCE bucket.
- **COPE** is broken out as its own line with a footnote.
- **Design/Feasibility Retainer** is separated and framed as "insurance policy /
  credited," with its own emphasized row or rationale slide.
- **Grand total** is the visual climax (bold accent or high-contrast box).
- Closing carries **"Prepared exclusively for [client]"** + **"valid 30 days"** +
  contact.
- One accent (orange) only; everything else is ink/muted/surface.
- Suppress the "Made with NotebookLM" watermark (refs are NotebookLM exports).

---

## 8. Build order (proposed)

1. **Theme plumbing** — `themes.ts` + resolve from `ProposalDeck.deckTheme` +
   pass into `SlideCard`/slides + theme picker in the deck editor. (Schema: add
   `deckTheme`.)
2. **Retrofit `scope-overview`** to consume theme tokens (proves the contract).
3. **Standardize `objective`** to the Statement + 3-pillars grammar (both themes).
4. **Retire `why-us`**; confirm `design-build` + `risk-brief` cover differentiators.
5. Work down the canonical arc, one grammar at a time, each with its
   `docs/training/` module (per the standing convention in CLAUDE.md).
6. Later: the **AI deck-composition layer** — AI returns a slide PLAN (which
   canonical types, order, which optional inserts) then composes each. This spec
   is its rulebook.

---

*Companion docs: `docs/presentation-studio-plan.md` (Studio build plan),
`docs/training/` (end-user guides).*
