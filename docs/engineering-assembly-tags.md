# Engineering Assembly — Controlled Tag Vocabulary

Source of truth for the trigger keywords ("tags") on every entry in the engineering
assembly knowledge base. The deterministic retrieval step matches a room's scope
narrative against these tags (array overlap), so the tags MUST be consistent across
every project import or the matcher silently misses. Built from the first two
imports (20 Chaplin = 30 entries, 38 Heath = 19 new/changed = 49 total).

## How tags are used (why consistency matters)

When the AI estimates a structural room/section, retrieval normalizes the scope text
and intersects it with each assembly's tags. More shared tags = higher relevance =
the assembly gets injected as vetted method+spec. So:

- **Primary tags (match scope language):** System, Element, Context, Load/Intent,
  Hardware-type — these are the plain words an estimator/AI uses in a scope
  narrative ("frame the new porch", "hurricane straps", "footings"). These do the
  matching.
- **Secondary index (NOT primary matchers):** specific connector model numbers
  (`simpson-h2.5a`, `elco-panel-mate`). Stored on a separate line for dedup and
  exact reference; a scope narrative rarely names a model number.

Assign the tags that **genuinely apply** — typically **5–10** per assembly, drawn
ONLY from the vocabulary below, plus any model numbers on a separate Hardware-models
line. Always include **≥1 System and ≥1 Element** tag; add Context/Load/Hardware tags
only when they truly apply (don't pad). **A primary tag never contains a digit or a
manufacturer name** — those belong ONLY on the Hardware-models line. Do not invent
synonyms — use the collapse rules.

---

## The controlled vocabulary (6 facets)

### Facet 1 — SYSTEM (pick 1–2; the coarse domain)
`foundation` · `wall-framing` · `floor-framing` · `roof-framing` ·
`connectors-strapping` · `openings` · `structural-steel` · `masonry` ·
`deck-porch` · `stairs` · `plumbing-coordination`

### Facet 2 — ELEMENT (the physical thing; pick all that apply)
`footing` · `pad-footing` · `stem-wall` · `grade-beam` · `slab` · `mat-slab` ·
`pier` · `pile` · `pile-cap` · `post` · `column` · `column-base` · `beam` ·
`header` · `lintel` · `rafter` · `joist` · `ceiling-joist` · `stud` · `wall` ·
`retaining-wall` · `pool-wall` · `sheathing` · `eave` · `gable` · `dormer` ·
`knee-wall` · `outrigger` · `over-framing` · `chimney` · `parapet` · `ledger`

### Facet 3 — WORK CONTEXT / TRIGGER (use ONLY when the assembly is specific to it)
`addition` · `new-to-existing` · `exterior-wall` · `interior-wall` ·
`bearing-wall` · `non-bearing-wall` · `tall-wall` · `second-story` · `garage` ·
`porch` · `deck` · `coastal` · `flood-zone` · `below-dfe`

> Discipline: don't spray `addition` on every footing — the room-level retrieval
> gate already knows the project is an addition. Reserve context tags for details
> that are genuinely specific to that context (e.g. `new-to-existing` for tie-in
> details, `garage` for the garage holdown, `porch`/`deck` for porch/deck items).

### Facet 4 — LOAD / INTENT (why the assembly exists; pick all that apply)
`wind-uplift` · `lateral-bracing` · `shear` · `continuous-load-path` ·
`crack-control` · `gravity-bearing` · `impact-protection` · `flood` · `scour` ·
`buoyancy` · `breakaway`

### Facet 5 — HARDWARE TYPE (generic, plain-language; pick all that apply)
`hurricane-strap` · `holdown` · `anchor-bolt` · `epoxy-anchor` · `threaded-rod` ·
`post-cap` · `post-base` · `joist-hanger` · `twist-strap` · `coil-strap` ·
`through-bolt` · `structural-screw` · `powder-driven-fastener` ·
`welded-connection` · `nailing-pattern` · `storm-panel` · `flood-vent` ·
`galvanized` · `rebar`

### Facet 6 — HARDWARE MODELS (secondary index; verbatim, separate line)
Format `<manufacturer>-<model>`, lowercased (e.g. `simpson-`, `elco-`, `smartvent-`).
Observed so far:
`simpson-h2.5a` · `simpson-h3` · `simpson-lttp2` · `simpson-hd3b` · `simpson-hdu4` ·
`simpson-htt5` · `simpson-hts20` · `simpson-cs18` · `simpson-cs20` · `simpson-mts16` ·
`simpson-ts12` · `simpson-pc6z` · `simpson-pa28` · `simpson-rsrs-01` ·
`elco-panel-mate`

> **Coastal note:** elevated/flood-zone work (piles, grade beams, breakaway walls,
> flood vents, scour) and pools/retaining walls are pre-seeded above so the first
> such imports don't each invent conflicting tags. `galvanized` flags HDG/ZMAX/SS
> coastal-corrosion-class hardware (a real cost driver on the coast).

---

## Normalization / collapse rules

Map every loose phrase to its canonical tag(s):

| If the drawing/keyword says… | Use canonical tag(s) |
|---|---|
| strap, straps, strapping, hurricane clip, uplift strap, tie-down strap | `hurricane-strap` + `wind-uplift` (add `coil-strap`/`twist-strap` if that specific type) |
| hold down, hold-down, holddown | `holdown` |
| anchor bolt(s), AB | `anchor-bolt` |
| epoxy anchor, epoxy bolt, epoxy dowel, epoxied anchor | `epoxy-anchor` |
| thru bolt, through bolt, machine bolt | `through-bolt` |
| structural screw, SDS, ¼"×… screw | `structural-screw` |
| powder-driven / powder-actuated fastener | `powder-driven-fastener` |
| HDG, ZMAX, hot-dip galvanized, stainless connector | `galvanized` |
| footing, footings, continuous footing, spread footing | `footing` (add `pad-footing` if isolated/spot/pad; `stem-wall` if tall/stem) |
| pile, timber/concrete/driven pile | `pile` (+ `pile-cap` if a cap; + `grade-beam` if pile-tie beam) |
| flood vent, flood opening, automatic flood opening | `flood-vent` + `flood` |
| breakaway wall (designed to fail below DFE) | `breakaway` + `non-bearing-wall` + `flood` |
| thickened slab, depressed slab, thickened edge | `slab` + `footing` |
| control joint, construction joint, saw cut, keyway | `slab` + `crack-control` |
| shear wall, shear panel, plywood/OSB nailing, edge/field nailing, gun nails | `sheathing` + `nailing-pattern` + `shear` |
| header, lintel, beam over opening | `header` (+ `lintel`) + `openings` |
| LVL, multi-ply beam, built-up beam, ganged beam | `beam` |
| over-framing, over-frame, overbuild | `over-framing` + `roof-framing` |
| knee wall, kneewall | `knee-wall` |
| storm panel, impact panel, flying-debris panel, hurricane panel | `storm-panel` + `impact-protection` + `openings` |
| CMU, masonry pier, block, grout | `masonry` |
| ledger, deck band, deck attachment | `ledger` + `deck` |
| any specific model (H2.5A, LTTP2, HD3B, Smart Vent, etc.) | `<manufacturer>-<model>` on the Hardware-models line ONLY |

## Governance — adding a new tag

The vocabulary will grow as new project types appear (steel-heavy jobs, pools, etc.).
When a future import genuinely needs a concept not listed here: add it under the
correct facet, keep the kebab-case style, and flag it in that import's EXTRACTION
NOTES as **NEW TAG: `x` (facet N)** so it can be reviewed and folded in here. Never
silently coin a one-off synonym for an existing concept — that's the drift we're
preventing.

---

## Per-assembly tag assignments (49 entries)

Tags below supersede the looser "Trigger keywords" lines in the two import files.
`models:` is the secondary Hardware-models line.

### 20 Chaplin (firm standard library)

1. **Exterior Wall Framing Schedule** — `wall-framing` `stud` `wall` `exterior-wall` `interior-wall` `tall-wall`
2. **Header / Lintel Schedule** — `openings` `header` `lintel` `stud` `wall-framing`
3. **Multiple LVL Attachment Schedule** — `openings` `beam` `header` `through-bolt` `structural-screw` `nailing-pattern`
4. **Typical Step Footing** — `foundation` `footing` `rebar`
5. **Typ. Slab Joint'g Details** — `foundation` `slab` `crack-control` `rebar`
6. **Typ. Re-Entrant Corner** — `foundation` `slab` `crack-control` `rebar`
7. **Tall Footing** — `foundation` `footing` `stem-wall` `wall-framing` `exterior-wall` `bearing-wall` `anchor-bolt` `hurricane-strap` `holdown` `wind-uplift` `rebar` · models: `simpson-lttp2` `simpson-hd3b` `simpson-hdu4`
8. **Footing at Steps** — `foundation` `footing` `stem-wall` `rebar`
9. **Detail at Steps (concrete stairs)** — `stairs` `slab` `rebar`
10. **Depressed Slab** — `foundation` `slab` `footing` `interior-wall` `bearing-wall` `epoxy-anchor` `hurricane-strap` `wind-uplift` `rebar` · models: `simpson-lttp2`
11. **Raised Beam** — `roof-framing` `beam` `ceiling-joist` `coil-strap` `wind-uplift` `continuous-load-path` · models: `simpson-cs18`
12. **Typ. Wall Strapping** — `connectors-strapping` `openings` `header` `stud` `exterior-wall` `bearing-wall` `hurricane-strap` `wind-uplift` `continuous-load-path` · models: `simpson-cs18` `simpson-lttp2`
13. **Plywood Nailing Pattern** — `wall-framing` `sheathing` `nailing-pattern` `shear` `exterior-wall`
14. **Typ. Eave** — `roof-framing` `eave` `rafter` `sheathing` `nailing-pattern` `hurricane-strap` `coil-strap` `wind-uplift` · models: `simpson-h2.5a` `simpson-cs20` `simpson-rsrs-01`
15. **Typ. Over-Framing** — `roof-framing` `rafter` `over-framing` `gable` `dormer` `twist-strap` `wind-uplift` · models: `simpson-ts12`
16. **Gable End Framing (outriggers)** — `roof-framing` `gable` `outrigger` `lateral-bracing` `coil-strap` · models: `simpson-cs18` `simpson-cs20`
17. **Control Joint Termination** — `foundation` `slab` `masonry` `crack-control`
18. **Dormer Framing** — `roof-framing` `dormer` `rafter` `gable` `hurricane-strap` `twist-strap` `wind-uplift` · models: `simpson-h2.5a` `simpson-ts12`
19. **Window Flying Debris Protection** — `openings` `storm-panel` `impact-protection` `sheathing` · models: `elco-panel-mate`
20. **Window Panel Fastening (by cladding)** — `openings` `storm-panel` `impact-protection` · models: `elco-panel-mate`
21. **Beam / Truss Hold Down** — `connectors-strapping` `beam` `holdown` `threaded-rod` `wind-uplift` · models: `simpson-hd3b`
22. **Interior Wall with Roof Loads** — `connectors-strapping` `interior-wall` `bearing-wall` `stud` `second-story` `coil-strap` `wind-uplift` `continuous-load-path` · models: `simpson-cs20`
23. **Beam Strapping — Beam on Post** — `connectors-strapping` `beam` `post` `post-base` `hurricane-strap` `coil-strap` `wind-uplift` `continuous-load-path` · models: `simpson-cs18` `simpson-lttp2`
24. **Beam Strapping — At Corner** — `connectors-strapping` `beam` `post` `hurricane-strap` `coil-strap` `wind-uplift` `continuous-load-path` · models: `simpson-cs18` `simpson-hts20`
25. **Gable End Bracing** — `roof-framing` `gable` `lateral-bracing` `coil-strap` `sheathing`
26. **Rafter Splices at Knee Wall** — `roof-framing` `knee-wall` `rafter` `stud` `hurricane-strap` `coil-strap` `wind-uplift` `continuous-load-path` · models: `simpson-h3` `simpson-cs20` `simpson-mts16`
27. **Eave Blocking (A/B/C)** — `roof-framing` `eave` `sheathing` `lateral-bracing` `rafter`
28. **Footing Intersection (corner & tee)** — `foundation` `footing` `rebar`
29. **Plumbing Through Interior Footing** — `foundation` `footing` `plumbing-coordination` `interior-wall`
30. **Plumbing Drain Line Through Footing** — `foundation` `footing` `plumbing-coordination` `rebar`

### 38 Heath (addition / porch / deck / steel / chimney — new & changed)

31. **Footing Schedule (pad/spot)** — `foundation` `pad-footing` `footing` `post` `column` `rebar`
32. **Edge Beam at Post** — `deck-porch` `beam` `post` `porch` `deck` `through-bolt` `gravity-bearing`
33. **Alt. Edge Beam at Post** — `deck-porch` `beam` `post` `porch` `post-cap` · models: `simpson-pc6z`
34. **Wall Footing** *(variant of Tall Footing)* — `foundation` `footing` `stem-wall` `wall-framing` `exterior-wall` `bearing-wall` `anchor-bolt` `hurricane-strap` `holdown` `wind-uplift` `rebar` · models: `simpson-lttp2` `simpson-hd3b` `simpson-hdu4`
35. **Int. Wall No Roof Loads** — `foundation` `footing` `slab` `interior-wall` `non-bearing-wall` `powder-driven-fastener` `rebar`
36. **Int. Wall w/ Roof Loads** — `foundation` `footing` `slab` `interior-wall` `bearing-wall` `epoxy-anchor` `hurricane-strap` `coil-strap` `wind-uplift` `continuous-load-path` `rebar` · models: `simpson-lttp2` `simpson-cs20`
37. **12×12 CMU Pier** — `foundation` `masonry` `pier` `gravity-bearing` `rebar`
38. **Post Footing (steel column base)** — `foundation` `structural-steel` `pad-footing` `column` `column-base` `anchor-bolt` `epoxy-anchor`
39. **Beam/Column Connection (steel)** — `structural-steel` `beam` `column` `through-bolt` `welded-connection`
40. **Joist Support (face-mount hangers)** — `roof-framing` `joist` `rafter` `beam` `joist-hanger` `through-bolt` `gravity-bearing`
41. **Typ. Embedded Post** — `foundation` `deck-porch` `post` `pier` `deck` `rebar`
42. **Typ. Porch Col.** — `deck-porch` `connectors-strapping` `post` `column` `porch` `threaded-rod` `epoxy-anchor` `post-base` `post-cap` `wind-uplift`
43. **Porch Col. at Pavers** — `deck-porch` `connectors-strapping` `post` `column` `porch` `threaded-rod` `epoxy-anchor` `wind-uplift`
44. **Deck Attachment (ledger to footing)** — `deck-porch` `connectors-strapping` `deck` `ledger` `joist` `joist-hanger` `epoxy-anchor` `new-to-existing` `gravity-bearing`
45. **Porch Eave** — `roof-framing` `deck-porch` `eave` `rafter` `sheathing` `nailing-pattern` `porch` `hurricane-strap` `threaded-rod` `wind-uplift` · models: `simpson-h2.5a` `simpson-rsrs-01`
46. **Chimney Strapping** — `connectors-strapping` `chimney` `rafter` `coil-strap` `lateral-bracing` · models: `simpson-cs18`
47. **Chimney Framing Elevation** — `roof-framing` `chimney` `rafter` `header` `coil-strap` `nailing-pattern` · models: `simpson-cs20`
48. **Porch Ceiling Sheathing** — `roof-framing` `deck-porch` `sheathing` `porch` `lateral-bracing` `new-to-existing`
49. **Garage Hold Down (Opt 1 & 2)** — `connectors-strapping` `garage` `stud` `holdown` `anchor-bolt` `hurricane-strap` `wind-uplift` · models: `simpson-pa28` `simpson-hd3b` `simpson-hdu4` `simpson-htt5`

---

## Claude.ai prompt addendum (paste with the extraction prompt going forward)

Append this to the extraction prompt so every future import — and a re-tag of the
two existing files — produces consistent tags:

```
TAGGING — use a CONTROLLED VOCABULARY (do not invent synonyms):
Replace the "Trigger keywords" line for each assembly with TWO lines:
  **Tags:** 4–8 tags, each drawn ONLY from the controlled vocabulary below,
    spanning these facets: System, Element, Context (only if the assembly is
    specific to it), Load/Intent, Hardware-type.
  **Hardware models:** the specific connector model numbers, lowercased as
    simpson-<model> / elco-<model> (e.g. simpson-h2.5a). Omit the line if none.

CONTROLLED VOCABULARY:
- System: foundation, wall-framing, floor-framing, roof-framing,
  connectors-strapping, openings, structural-steel, masonry, deck-porch, stairs,
  plumbing-coordination
- Element: footing, pad-footing, stem-wall, slab, pier, post, column, column-base,
  beam, header, lintel, rafter, joist, ceiling-joist, stud, wall, sheathing, eave,
  gable, dormer, knee-wall, outrigger, over-framing, chimney, ledger
- Context (only when specific): addition, new-to-existing, exterior-wall,
  interior-wall, bearing-wall, non-bearing-wall, tall-wall, second-story, garage,
  porch, deck
- Load/Intent: wind-uplift, lateral-bracing, shear, continuous-load-path,
  crack-control, gravity-bearing, impact-protection, flood
- Hardware type: hurricane-strap, holdown, anchor-bolt, epoxy-anchor, threaded-rod,
  post-cap, post-base, joist-hanger, twist-strap, coil-strap, through-bolt,
  structural-screw, powder-driven-fastener, welded-connection, nailing-pattern,
  storm-panel, rebar

COLLAPSE synonyms to the canonical tag (e.g. "strap/strapping/hurricane clip" ->
hurricane-strap + wind-uplift; "hold down/HD3B-as-concept" -> holdown; "epoxy
bolt/dowel" -> epoxy-anchor; any shear-wall/OSB-nailing -> sheathing + nailing-
pattern + shear). Do NOT put model numbers in Tags — they go on Hardware models.
If you genuinely need a concept that's missing, add it under the right facet and
flag it in EXTRACTION NOTES as "NEW TAG: <tag> (facet)".
```

---

> **Feeds the build:** this vocabulary becomes the `KNOWN_ASSEMBLY_TAGS` constant
> the admin form offers as chips and the retrieval normalizer matches against; the
> per-assembly assignments above seed the first KB rows. Keep this file in sync when
> the vocabulary grows. See [[project-engineering-assembly-kb]].
