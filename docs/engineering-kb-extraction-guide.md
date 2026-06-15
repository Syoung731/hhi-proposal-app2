# HHI Engineering KB — Extraction Guide

**Upload this file to your Claude.ai Project as knowledge.** It is the standing
reference for turning a structural engineering set (PDF) into a clean Markdown
import for HHI's AI estimating tool. Self-contained — everything needed (template,
controlled tag vocabulary, rules) is in this one file.

> Tag vocabulary here is kept **in sync** with `docs/engineering-assembly-tags.md`
> in the app repo (the build's source of truth). Synced as of 2026-06-15 — they are
> identical. If you ever edit one, edit the other.

---

## 1. Why this exists (read first — it shapes every choice)

This data feeds an AI estimating tool. On a **sales call**, HHI's Project Director
describes work **conversationally**, e.g.:

> "We're doing an 18×20 addition, pour a concrete footer, and connect back into
> the existing slab."

The tool must (1) recognize which engineering applies, (2) pull the vetted method,
and (3) **compute quantities and cost** — e.g. LF of footing, stud count, number of
Simpson ties, rebar, sheets of OSB — then build Material + Install line items.

So your extraction must capture, for each assembly:
- the **method** (how it's built),
- the **spec** (members, sizes, grades, connector model numbers), and
- the **per-unit QUANTITY RULES** (studs @ 16" o.c., 1 strap per rafter, anchor
  bolts @ 48" o.c., rebar continuous + lap) — **the RULE, not a project total.**
  The tool multiplies these rules by the stated dimensions to estimate quantities.

**Never include prices.** Pricing flows through the app's catalog/rates separately.
The KB supplies *what and how much-per-unit*; the catalog supplies *what it costs*.

---

## 2. How this project works (dedup is built in)

This firm (and most) reproduces its standard library details **verbatim** across
jobs. So:

1. Keep every prior import (`*_Structural_KB_Import.md`) in this project's
   knowledge.
2. On each new set, **diff against all prior imports.** If a standard
   detail/schedule is **identical** to one already captured, DO NOT repeat it —
   list it under "Verified identical — skipped" in the Extraction Notes. Output only
   **new or changed** content, plus this project's Provenance + Design Criteria +
   Extraction Notes (those four sections appear every run; the Tie-In and Assembly
   sections may be empty on a pure-duplicate set — say so).
3. **After each run, add the new output file back into the project knowledge** so
   the next extraction dedups against it too. The library compounds over time.

**What "identical" means** (the dedup test — define it the same way every time):
same title, same members/sizes/grades, same connector model numbers, same
spacing/quantity rules, same code basis. Ignore cosmetic CAD differences (line
weight, view angle, sheet position). **When unsure, treat it as CHANGED and capture
it** — a false "changed" is harmless (you can merge later); a wrong "skip" silently
loses engineering data. Because you read drawings **visually**, never assert
"identical" based on fine print you cannot clearly resolve — if you can't read it
clearly enough to compare, capture it.

> **Retrieval caveat:** dedup only works against prior imports that are actually
> loaded into context. Keep each import file concise (the templates here are terse
> on purpose) so the growing library stays comparable. If the library gets large,
> tell the user which prior imports you were able to compare against.

---

## 3. What to extract — and what to skip

**EXTRACT:**
- Every **named detail** on the detail sheets (e.g. "Typ. Wall Strapping Detail,"
  "Gable End Framing," "Timber Pile to Girder Connection," "Tall Footing Detail").
- Every **schedule** (Header/Lintel, Wall Framing, Connector, LVL Attachment,
  Footing/Pile Schedule, Flood Vent Schedule).
- The project **Design Criteria / load basis** from the general-notes sheet.
- **Tie-in / existing-structure methods** — even when they're plan callouts rather
  than titled details (see §5). Central to HHI's addition/remodel work.

**SKIP:**
- Project-specific plan sheets (Foundation Plan, Framing Plans) — but DO capture any
  reusable detail blocks drawn on those sheets.
- Title blocks, revision clouds, legal/terms boilerplate.
- Standard trade-note boilerplate (General/Concrete/Masonry/Steel notes) — except
  pull the load basis into Design Criteria.

> **The schedule/totals rule (critical):** A schedule defines the available **types**
> and their per-unit specs — it is a *menu*, not a count. It does NOT tell you how
> many of each are used; that comes from the **plan sheets, which you SKIP.** Never
> transcribe or infer a project quantity ("12 P1 piles," "76 LF of footing") from a
> schedule or a plan. Capture only the per-unit rule.

---

## 4. Output file — structure & naming

Name the file `<JobName>_Structural_KB_Import.md` (e.g.
`20_Chaplin_Structural_KB_Import.md`).

Section order (every run includes 1, 2, 5; sections 3 and 4 may be empty):
1. **Provenance block**
2. **Design Criteria**
3. **Tie-In / Existing-Structure Context** (§5 — include only if present)
4. **Assemblies / Schedules** (§6 — new/changed only)
5. **Extraction Notes** (§9 checklist)

### Provenance block template
```
---
# Engineering Knowledge Base Import — <Job Name>
**Source firm:** <firm name, office, cert #>
**Project / set:** <project name / address>  **Drawing date:** <date>
**Status:** <Preliminary — NOT FOR CONSTRUCTION | For Construction | Working set>
> <one line: full library import, or diff-addendum against which prior imports?>
---
```

### Design Criteria template
```
## DESIGN CRITERIA
**Wind speed / exposure:** <e.g. 142 mph, Exposure C, end-zone "a" = 4 ft>
**Seismic:** <Sds / Sd1, Site Class, SDC, base shear, force-resisting system>
**Flood:** <zone (VE/AE/Coastal-A); ASCE 24 class; BFE/DFE + freeboard; LHSM elev — else Not specified>
**Other loads / code basis:** <IRC year; floor/roof/deck/stair LL+DL; ground snow>
**Deltas vs prior import(s):** <what changed vs the firm's last set, or "first import">
```

---

## 5. Tie-In / Existing-Structure Context (HHI-critical for additions/remodels)

Additions/remodels are HHI's core work, and "connect back into the existing
structure" methods are usually **plan callouts, not titled details** — but the
estimating tool needs them. **Include this section only when such callouts appear**
(for ground-up new construction, omit it or write "None — new construction").

```
## TIE-IN / EXISTING-STRUCTURE CONTEXT
Recurring new-to-existing methods seen on the plan sheets (reusable for estimating):
- **Slab/footing tie-in:** <e.g. drill-and-epoxy #4 dowels × 1'-6" each side @ 24"
  o.c. staggered, mid-height of existing slab, min 6" embed>
- **Slab demo for new footings:** <e.g. saw-cut & remove existing slab as req'd>
- **Existing framing tie-in:** <e.g. cut back existing rafters/joists and hang from
  new beam; 2x nailer to underside of existing rafters with (2) #10 screws each>
- **Field verification:** <e.g. field-verify size/condition of existing framing>
Tag each with: new-to-existing + the relevant element/system tags.
```

---

## 6. Entry templates

### 6a. Assembly (a titled detail) — one entry per detail
```
## ASSEMBLY: <use the detail's own title>
**Category:** <Foundation | Wall Framing | Floor Framing | Roof Framing |
  Connectors & Strapping | Openings | Structural Steel | Masonry | Deck/Porch |
  Stairs | Other>
**Source ref:** <sheet#/detail# — list ALL sheets if the detail spans more than one,
  e.g. "S301/4 + S302/2">
**When to use it:** <the condition that triggers this assembly, 1–2 sentences>
**Method summary:** <how it's built, in order — actionable for an estimator>
**Members & materials:**
| Item | Size / grade / spec | Qty rule / unit | Notes |
|---|---|---|---|
| <e.g. Wall stud> | <2x6 SPF #2> | <16" o.c. / per LF> | <...> |
**Connectors & fasteners:**
| Connector / fastener | Model # | Spacing / pattern | Qty rule | Notes |
|---|---|---|---|---|
| <e.g. Hurricane strap> | <Simpson H2.5A> | <each rafter> | <1 per rafter> | <HDG for coastal> |
**Code / load basis:** <wind uplift, references — or Not specified>
**How quantity is determined:** <per stud / per rafter / per LF / per opening /
  field-determined>
**Caveats / notes:** <conditional logic, options, or None>
**Tags:** <space-separated, backtick-wrapped, from §7 — e.g. `roof-framing` `rafter`>
**Hardware models:** <`simpson-h2.5a` ... — write `(none)` if there are none>
```

### 6b. Schedule (a table of types) — one entry per schedule
A schedule is NOT a materials list — it is a menu of types with per-unit specs and
sometimes a governing condition. Use this fixed minimum column set; you MAY append
extra columns after "Governing condition," never insert them in the middle:
```
## SCHEDULE: <the schedule's own title>
**Category:** <as above>
**Source ref:** <sheet#/detail# — list all if it spans sheets>
**When to use it:** <what you select from this schedule and by what input>
**Schedule:**
| Mark / row | Type | Size / spec | Governing condition | Notes |
|---|---|---|---|---|
| <P1> | <timber pile> | <8" tip, SYP marine CCA> | <min 16' embed; 16k/8k cap> | <...> |
**Per-unit quantity rule:** <how a count is derived PER UNIT — e.g. "per pile mark
  on plan"; never a project total>
**Caveats / notes:** <conditional rows, options, multi-value cells, or None>
**Tags:** <from §7>
**Hardware models:** <... or `(none)`>
```

### Changed variants
If a detail/schedule is a **changed** version of one already captured: emit the
FULL entry (titled e.g. "Wall Footing *(variant of Tall Footing)*" with the delta in
Caveats) AND add a one-line pointer under "Changed-but-related" in Extraction Notes.
Do both — the full entry feeds retrieval, the note tells the human what moved.

---

## 7. Controlled tag vocabulary (use ONLY these — do not invent synonyms)

Assign the tags that **genuinely apply** — typically **5–10** per entry. **Always at
least one System and one Element tag.** Add Context / Load / Hardware tags only when
they truly apply; don't pad. (The seed corpus runs 5–11 tags across facets — match
that density.) **A primary Tag never contains a digit or a manufacturer name** —
those go ONLY on the Hardware models line. Plain-language tags do the matching
against the sales-call scope; model numbers are a secondary index (a scope says
"hurricane straps," never "CS20").

**System** (1–2): `foundation` `wall-framing` `floor-framing` `roof-framing`
`connectors-strapping` `openings` `structural-steel` `masonry` `deck-porch`
`stairs` `plumbing-coordination`

**Element**: `footing` `pad-footing` `stem-wall` `grade-beam` `slab` `mat-slab`
`pier` `pile` `pile-cap` `post` `column` `column-base` `beam` `header` `lintel`
`rafter` `joist` `ceiling-joist` `stud` `wall` `retaining-wall` `pool-wall`
`sheathing` `eave` `gable` `dormer` `knee-wall` `outrigger` `over-framing`
`chimney` `parapet` `ledger`

**Context** (only when the assembly is specific to it): `addition` `new-to-existing`
`exterior-wall` `interior-wall` `bearing-wall` `non-bearing-wall` `tall-wall`
`second-story` `garage` `porch` `deck` `coastal` `flood-zone` `below-dfe`

**Load / Intent**: `wind-uplift` `lateral-bracing` `shear` `continuous-load-path`
`crack-control` `gravity-bearing` `impact-protection` `flood` `scour` `buoyancy`
`breakaway`

**Hardware type**: `hurricane-strap` `holdown` `anchor-bolt` `epoxy-anchor`
`threaded-rod` `post-cap` `post-base` `joist-hanger` `twist-strap` `coil-strap`
`through-bolt` `structural-screw` `powder-driven-fastener` `welded-connection`
`nailing-pattern` `storm-panel` `flood-vent` `galvanized` `rebar`

**Hardware models** (separate line; verbatim; `<manufacturer>-<model>`, lowercased):
e.g. `simpson-h2.5a`, `simpson-lttp2`, `elco-panel-mate`, `smartvent-1540-510`.
Write `(none)` if there are none.

### Collapse synonyms to the canonical tag
| Drawing/keyword says… | Use |
|---|---|
| strap, straps, strapping, hurricane clip, uplift strap, tie-down strap | `hurricane-strap` + `wind-uplift` (+ `coil-strap`/`twist-strap` if that type) |
| hold down, hold-down, holddown | `holdown` |
| anchor bolt(s), AB | `anchor-bolt` |
| epoxy anchor, epoxy bolt, epoxy dowel, epoxied anchor | `epoxy-anchor` |
| thru/through/machine bolt | `through-bolt` |
| structural screw, SDS, ¼"×… screw | `structural-screw` |
| powder-driven / powder-actuated fastener | `powder-driven-fastener` |
| HDG, ZMAX, hot-dip galvanized, stainless connector (coastal corrosion class) | `galvanized` |
| footing(s), continuous/spread footing | `footing` (+ `pad-footing` if isolated/spot; + `stem-wall` if tall/stem) |
| pile, timber/concrete pile, driven pile | `pile` (+ `pile-cap` if a cap; + `grade-beam` if tied with a beam) |
| thickened/depressed slab, thickened edge | `slab` + `footing` |
| control/construction joint, saw cut, keyway | `slab` + `crack-control` |
| shear wall/panel, OSB/ply nailing, edge/field nailing, gun nails | `sheathing` + `nailing-pattern` + `shear` |
| header/lintel, beam over opening | `header` (+ `lintel`) + `openings` |
| LVL, multi-ply / built-up / ganged beam | `beam` |
| over-framing, over-frame, overbuild | `over-framing` + `roof-framing` |
| knee wall, kneewall | `knee-wall` |
| storm/impact/flying-debris/hurricane panel | `storm-panel` + `impact-protection` + `openings` |
| flood vent, flood opening, automatic flood opening | `flood-vent` + `flood` |
| breakaway wall (designed to fail below DFE) | `breakaway` + `non-bearing-wall` + `flood` |
| CMU, masonry pier, block, grout | `masonry` |
| ledger, deck band/attachment | `ledger` + `deck` |
| any specific model (H2.5A, LTTP2, HD3B…) | `<mfr>-<model>` on Hardware models line ONLY |

### New tags
If a set genuinely needs a concept not listed: add it under the correct facet,
kebab-case, and flag it in Extraction Notes as **NEW TAG: `x` (facet)** so it can be
reviewed and folded into both this guide and the repo source-of-truth. Never coin a
one-off synonym for an existing concept.

---

## 8. Quality & fidelity rules (non-negotiable)

- **Transcribe verbatim.** Model numbers, sizes, grades, spacings, nailing patterns
  exactly as drawn. Two sentinels, used consistently: `[illegible]` (can't read it)
  and `Not specified` (not shown on the drawing) — both unquoted, exactly so.
- **Never invent or infer a spec.** No prices, ever. No project totals — rules only.
- **Flag CAD-font misreads, don't silently fix.** Some fonts render letters as
  digits. Transcribe as drawn, then note the probable correct model in Extraction
  Notes. Known examples from prior sets:
  - "LTTPE" → almost certainly **LTTP2** (used elsewhere in the set).
  - "2.5A" → same as **H2.5A**.
  - "H03B, HOU4" → **HD3B, HDU4** (the "D" renders like "0/O").
- **Capture the set's status** (Preliminary vs For Construction). Preliminary specs
  must be re-verified before they drive real pricing — say so.
- **Capture conditional logic.** SDC-dependent branches (e.g. Eave Blocking),
  story-dependent widths, flood-zone-dependent rules, option A/B/C — keep all
  branches even if only one governs this job, so the entry is reusable.

---

## 9. Extraction Notes checklist (always include this section)

Report:
- [ ] **Set status** (Preliminary / For Construction) and any re-verify warning.
- [ ] **Verified identical — skipped:** standard details/schedules matching a prior
      import (so the reader knows they're covered, not missed). Name which prior
      imports you compared against.
- [ ] **Present in prior import but NOT in this set** (informational).
- [ ] **Changed-but-related** items, with the delta spelled out (one line each).
- [ ] **Connector model-number renderings** you transcribed-as-drawn + probable fix.
- [ ] **NEW TAGS** introduced (tag + facet).
- [ ] **Blank/reserved detail cells**, ambiguous slope/ratio markers, multi-value
      schedule cells, duplicated callouts — anything you interpreted.
- [ ] **Firm info changes** (address/office) — same firm, note for the record.

---

## 10. After producing the file

Give a 3–5 line summary: what's new/changed vs prior imports, and the 2–3 Extraction
Notes items worth the human's eye before this drives pricing. Then remind: **add this
output file to the project knowledge** so the next set dedups against it.
