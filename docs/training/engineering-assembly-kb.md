# Engineering Assembly Knowledge Base (Admin)

**Who this is for:** admins / estimators who curate HHI's engineer-vetted structural
assemblies so the AI estimate uses *our engineer's* method and quantities instead of
guessing on work that doesn't exist yet (addition framing, hurricane straps, footings,
CMU walls).

## What it does, in one line

When the AI builds a room/section estimate and the scope includes structural work, it
quietly looks up matching **vetted assemblies** from this library, follows their method,
and scales their per-unit rules (studs @ 16" o.c., one strap per rafter, anchor bolts
per LF) to the room's dimensions. **It never sets prices** — your catalog still prices
every line. The library supplies *what and how much*; the catalog supplies *what it costs*.

## The two-step workflow

**1. Parse a drawing → markdown (in your Claude.ai project).**
Upload an engineering set to the Claude.ai project (see `docs/engineering-kb-extraction-guide.md`).
It returns a structured markdown import. That data is what seeds this library.

**2. Curate in the app.**
In the app: **Settings → Engineering Assemblies.**
- Each row is one **assembly family** (e.g. "Wall Footing — CMU stem", "Typical Eave").
- Edit the canonical spec: method, members & connectors (with model numbers), per-unit
  quantity rules, code basis, trigger keywords (tags), and an optional source-drawing image.
- **Sources panel** shows every project the detail came from, with how each one differed
  (the reconcile view). The library keeps ONE engineer-vetted spec per family; the sources
  are history/traceability.
- **Approve** flips an assembly to APPROVED — and only APPROVED assemblies are used by the
  AI estimate. (DRAFT and ARCHIVED are ignored by retrieval.) This is the vetting gate.

**Tip:** the tags are how the AI finds an assembly. Use the controlled vocabulary in
`docs/engineering-assembly-tags.md` (e.g. `hurricane-strap`, `wall-footing`, `addition`,
`new-to-existing`) — consistent tags = reliable matches.

**Heads-up:** retrieval **fails closed**. If a scope doesn't confidently match any
approved assembly, nothing is injected and the estimate behaves exactly as before — so a
missing or mistagged assembly never produces a *wrong* number, just no boost.

## How the AI uses it (so you can sanity-check)

On a structural scope ("18×20 addition, pour a footer, tie into the existing slab"), the
estimate prompt gains a "Vetted Engineering Assemblies" section listing the matched
assemblies. The AI is instructed to follow those methods, scale the per-unit rules to the
room size, build the Material/Install line items, and cite the assembly in the line notes.
Everything is then priced through the normal catalog/allowance machinery.
