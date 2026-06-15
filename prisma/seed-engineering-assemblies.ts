// Standalone, idempotent seed for the engineer-vetted structural assembly KB.
//
// Run:
//   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs prisma/seed-engineering-assemblies.ts
//
// Source data: parsed engineering-drawing KB markdown for 20 Chaplin, 38 Heath,
// 6 Genoa, 6 Sycamore, 87 Mooring Buoy, and the 40 Planters Wood revision letter
// (all Southern Consulting & Engineering, Inc.). One CANONICAL assembly per detail
// "family"; recurring details across projects are folded into ONE row, with each
// project's drift recorded in its EngineeringAssemblySource.deltaNotes. Genuinely
// different conditions (CMU vs wood-stem footing, steel vs porch column base) are
// separate families disambiguated by slug + discriminator.
//
// Mirrors prisma/seed.ts conventions: dotenv (.env then .env.local override),
// PrismaPg adapter on DIRECT_URL (fallback DATABASE_URL), main()/catch/finally.
import dotenv from "dotenv";
import { PrismaClient } from "@/app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const seedConnectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!seedConnectionString) {
  throw new Error(
    "Neither DIRECT_URL nor DATABASE_URL is set. " +
      "Add DIRECT_URL (non-pooler Neon URL) to .env or .env.local.",
  );
}

const adapter = new PrismaPg({ connectionString: seedConnectionString });
const prisma = new PrismaClient({ adapter });

// ─── Types for the in-file canonical definitions ─────────────────────────────
type ComponentSeed = {
  kind: "MEMBER" | "CONNECTOR";
  name: string;
  spec?: string;
  model?: string;
  qtyRule?: string;
  unit?: string;
  isConditional?: boolean;
  notes?: string;
};

type SourceSeed = {
  projectName: string;
  sourceFirm?: string;
  engineerName?: string;
  engineerLicense?: string;
  certNumber?: string;
  drawingDate?: string;
  status?: string;
  sourceRef?: string;
  designCriteria?: string;
  deltaNotes?: string;
  rawMarkdown?: string;
};

type AssemblySeed = {
  slug: string;
  name: string;
  category:
    | "Foundation"
    | "Wall Framing"
    | "Floor Framing"
    | "Roof Framing"
    | "Connectors & Strapping"
    | "Openings"
    | "Structural Steel"
    | "Masonry"
    | "Deck/Porch"
    | "Stairs"
    | "Other";
  discriminator?: string;
  whenToUse?: string;
  methodSummary?: string;
  codeBasis?: string;
  quantityBasis?: string;
  caveats?: string;
  unitOfAssembly?: string;
  triggerKeywords: string[];
  tags: string[];
  sourceFirm?: string;
  engineerName?: string;
  engineerLicense?: string;
  sourceRef?: string;
  components: ComponentSeed[];
  sources: SourceSeed[];
};

const FIRM = "Southern Consulting & Engineering, Inc.";

// Shared design-criteria one-liners per project source (wind / SDC / flood).
const DC = {
  chaplin:
    "141 mph, Exp C; SDC C; Sds 0.429 / Sd1 0.229; base shear 7,500 lbs; no flood basis stated.",
  heath:
    "142 mph, Exp C; SDC D; Sds 0.42 / Sd1 0.22; base shear 12,000 lbs; ASCE 24-14 flood basis.",
  genoa:
    "140 mph, Exp C; SDC D; Sds 0.39 / Sd1 0.21; base shear 29,000 lbs; ASCE 24-14 flood basis; C&C corner suction -47.",
  sycamore:
    "141 mph, Exp C; SDC C; Sds 0.461 / Sd1 0.245; base shear 3,000 lbs; ASCE 24-14 flood basis.",
  mooring:
    "142 mph, Exp C; SDC C; Sds 0.427 / Sd1 0.228; base shear 2,000 lbs (lowest in library); ASCE 24-14 flood basis; distinct C&C table (+35/+30).",
  planters:
    "Not specified — one-page revision letter, no general-notes/criteria block.",
} as const;

// ─── Canonical assemblies ────────────────────────────────────────────────────
// Each row is ONE detail family; `sources` lists every project the firm drew it
// in, with per-source deltaNotes capturing spec drift. The canonical spec is the
// most-complete / most-recent observation.
const ASSEMBLIES: AssemblySeed[] = [
  // ===================== FOUNDATION =====================
  {
    slug: "wall-footing-wood-stem",
    name: "Wall Footing (Wood-Stem Continuous Footing)",
    category: "Foundation",
    discriminator: "wood-stem",
    whenToUse:
      "Continuous exterior/bearing wall footing with wood wall framing bearing on top of a short concrete stem (the firm's standard continuous wall footing on wood-framed projects).",
    methodSummary:
      "1'-4\" wide footing (1 story) / 1'-8\" wide (2 story) with 3-#4 OR 2-#5 continuous bottom bars; concrete stem above with #4 verticals @ 16\" o.c. and #3 ties @ 10\" o.c. ONLY where footing height > 28\". Maintain 8\" min above grade and 12\" min embedment; total footing/stem height 1'-8\" min to 4'-0\" max. Set a treated 2x bottom plate with 5/8\"x12\" anchor bolts @ 48\" o.c. Provide Simpson LTTP2 plate ties at corners and each side of openings (and at alternate anchor bolts between) on roof-bearing walls; HD3B or HDU4 holdowns each side of garage doors and openings >= 7 ft.",
    codeBasis: "Wind uplift / lateral, ASCE-7/16.",
    quantityBasis:
      "Footing + bottom bars per LF; anchor bolts per LF at 48\"; LTTP2 per corner/opening; holdowns per garage/wide opening (each side).",
    caveats:
      "Stem verticals (#4 @ 16\") and ties (#3 @ 10\") apply only where footing height > 28\". Canonical width is the 1-story/2-story split (1'-4\"/1'-8\"); Chaplin's original 'Tall Footing' drew a fixed 1'-4\".",
    triggerKeywords: [
      "foundation",
      "footing",
      "stem-wall",
      "wall-framing",
      "exterior-wall",
      "bearing-wall",
      "anchor-bolt",
      "hurricane-strap",
      "holdown",
      "wind-uplift",
      "rebar",
    ],
    tags: ["simpson-lttp2", "simpson-hd3b", "simpson-hdu4"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 1 (Heath); S201 / Detail 1 (Chaplin 'Tall Footing')",
    components: [
      { kind: "MEMBER", name: "Footing width", spec: "1'-4\" cont. (1 story) / 1'-8\" cont. (2 story)", qtyRule: "per LF", notes: "total footing/stem height 1'-8\" min to 4'-0\" max" },
      { kind: "MEMBER", name: "Bottom bars (continuous)", spec: "3 #4's OR 2 #5's", qtyRule: "continuous", unit: "LF" },
      { kind: "MEMBER", name: "Stem vertical bars", spec: "#4's at 16\" o.c.", qtyRule: "per LF", isConditional: true, notes: "only where footing height > 28\"" },
      { kind: "MEMBER", name: "Stem ties", spec: "#3's at 10\" o.c.", qtyRule: "per LF", isConditional: true, notes: "only where footing height > 28\"" },
      { kind: "MEMBER", name: "Above grade / embedment", spec: "8\" min above grade; 12\" min below", notes: "grade line" },
      { kind: "MEMBER", name: "Bottom plate", spec: "TD2X (treated 2x), continuous", qtyRule: "continuous" },
      { kind: "MEMBER", name: "Wall sheathing", spec: "7/16\" OSB", notes: ".113 gun nails per Plywood Nailing Pattern" },
      { kind: "CONNECTOR", name: "Anchor bolts", spec: "5/8\" x 12\"", qtyRule: "48\" o.c. / per LF" },
      { kind: "CONNECTOR", name: "Plate tie / tension strap", model: "Simpson LTTP2", qtyRule: "ea. corner, ea. side of openings > 40\" wide, alternate ABs between", notes: "for roof-load-bearing walls" },
      { kind: "CONNECTOR", name: "Holdowns", model: "Simpson HD3B or HDU4", qtyRule: "each side of garage doors & openings >= 7 ft", notes: "per opening (x each side)" },
    ],
    sources: [
      {
        projectName: "20 Chaplin",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "October 1, 2025",
        status: "Preliminary — NOT FOR CONSTRUCTION",
        sourceRef: "S201 / Detail 1 (Tall Footing Detail)",
        designCriteria: DC.chaplin,
        deltaNotes:
          "Drawn as 'Tall Footing Detail' with a FIXED 1'-4\" footing width (no 1-story/2-story split). Otherwise identical to canonical. Preliminary set — re-verify before pricing.",
      },
      {
        projectName: "38 Heath",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "March 12, 2026",
        status: "Working set",
        sourceRef: "S201 / Detail 1 (Wall Footing Detail)",
        designCriteria: DC.heath,
        deltaNotes:
          "Canonical source: footing width called out as 1'-4\" cont. (1 story) / 1'-8\" cont. (2 story) — the only change vs Chaplin's fixed 1'-4\".",
      },
    ],
  },
  {
    slug: "wall-footing-cmu-stem",
    name: "Wall Footing (CMU Stem Wall on Spread Footing)",
    category: "Foundation",
    discriminator: "cmu-stem",
    whenToUse:
      "The firm's standard continuous CMU bearing/stem wall on a spread footing — used on masonry-foundation projects in place of the wood-stem wall footing.",
    methodSummary:
      "8\" CMU wall with #4 verticals @ 32\" o.c. and 3/16\" Dur-O-Wall joint reinforcement @ 16\" o.c.; grout all reinforced cells (and all cells below slab) solid with 3000 psi pea-gravel concrete. Bear the wall on a 2'-0\" wide x 1'-0\" deep continuous footing with 3-#4 continuous bottom bars. Maintain 8\" min above grade and 3\" clear typ. to reinforcing. Corner/intersection/opening bar counts per Typ. CMU Details.",
    codeBasis: "Gravity bearing; lateral per Design Criteria. ASCE-7/16.",
    quantityBasis:
      "Per LF of wall footing — footing 2'-0\"x1'-0\" with 3-#4 per LF; CMU verticals #4 @ 32\" per LF; joint reinf per LF @ 16\".",
    caveats:
      "Framing-to-wall anchorage is on the Typ. Edge Framing / Detail at Raised Slab details, not this section. Fundamentally different element from the wood-stem wall footing.",
    triggerKeywords: [
      "foundation",
      "masonry",
      "footing",
      "stem-wall",
      "rebar",
      "gravity-bearing",
    ],
    tags: ["dur-o-wall"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 1 (Genoa)",
    components: [
      { kind: "MEMBER", name: "CMU wall", spec: "8\" CMU", qtyRule: "per LF", notes: "grout reinforced cells + all cells below slab w/ 3000 psi pea-gravel conc." },
      { kind: "MEMBER", name: "Vertical reinforcing", spec: "#4's at 32\" o.c.", qtyRule: "per LF", notes: "corner/intersection/opening counts per Typ. CMU Details" },
      { kind: "MEMBER", name: "Joint reinforcing", spec: "3/16\" Dur-O-Wall at 16\" o.c.", qtyRule: "per LF", notes: "horizontal" },
      { kind: "MEMBER", name: "Footing", spec: "2'-0\" wide x 1'-0\" deep, continuous", qtyRule: "per LF" },
      { kind: "MEMBER", name: "Footing bottom bars", spec: "3 - #4's continuous", qtyRule: "continuous" },
      { kind: "MEMBER", name: "Above grade / cover", spec: "8\" min above grade; 3\" clr typ.", notes: "to reinforcing" },
    ],
    sources: [
      {
        projectName: "6 Genoa",
        sourceFirm: FIRM,
        engineerName: "Adam W. Austin",
        engineerLicense: "SC PE No. 34907",
        certNumber: "C03355",
        drawingDate: "April 21, 2026",
        status: "Signed & sealed (revised working set)",
        sourceRef: "S201 / Detail 1 (Typ. Wall Footing Detail)",
        designCriteria: DC.genoa,
        deltaNotes:
          "Canonical source — the firm's CMU stem-wall foundation. NEW vs wood-stem sets (Chaplin/Heath).",
      },
    ],
  },
  {
    slug: "interior-footing-non-bearing",
    name: "Interior Wall Footing — No Roof Loads (Non-Bearing)",
    category: "Foundation",
    discriminator: "non-bearing",
    whenToUse:
      "Interior wall footing (thickened slab) where the wall does NOT support roof loads.",
    methodSummary:
      "Thickened-slab (trapezoidal) footing, 1'-4\" wide (1 story) / 1'-8\" wide (2 story), 1'-0\" deep, with 3-#4 or 2-#5 continuous bottom bars. Because there is no roof/uplift load, the treated 2x plate is fastened with .131 x 2-3/4\" powder-driven fasteners @ 16\" o.c. (min 3/4\" embed) — no anchor bolts, no LTTP2.",
    codeBasis: "Gravity, non-roof-bearing (not specified on detail).",
    quantityBasis: "Per LF of interior non-bearing wall.",
    caveats:
      "Contrast with the roof-bearing interior footing (epoxy anchors + LTTP2 + uplift straps).",
    triggerKeywords: [
      "foundation",
      "footing",
      "slab",
      "interior-wall",
      "non-bearing-wall",
      "powder-driven-fastener",
      "rebar",
    ],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 2 (Heath)",
    components: [
      { kind: "MEMBER", name: "Footing width", spec: "1'-4\" cont. (1 story) / 1'-8\" cont. (2 story); 1'-0\" deep", notes: "thickened slab" },
      { kind: "MEMBER", name: "Bottom bars (continuous)", spec: "3 #4's OR 2 #5's", qtyRule: "continuous" },
      { kind: "MEMBER", name: "Studs", spec: "2x's at 16\" o.c.", qtyRule: "per LF", notes: "unless req'd otherwise" },
      { kind: "MEMBER", name: "Bottom plate", spec: "TD 2x plate, continuous", qtyRule: "continuous", notes: "treated" },
      { kind: "CONNECTOR", name: "Powder-driven fasteners", spec: ".131 x 2-3/4\" powder driven fasteners", qtyRule: "16\" o.c., min 3/4\" embed / per LF", notes: "plate-to-slab; no anchor bolts / no LTTP2 (non-bearing)" },
    ],
    sources: [
      {
        projectName: "38 Heath",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "March 12, 2026",
        status: "Working set",
        sourceRef: "S201 / Detail 2 (Int. Wall No Roof Loads)",
        designCriteria: DC.heath,
        deltaNotes: "Canonical source.",
      },
    ],
  },
  {
    slug: "interior-footing-roof-bearing",
    name: "Interior Wall Footing — With Roof Loads (Bearing + Uplift Straps)",
    category: "Foundation",
    discriminator: "roof-bearing",
    whenToUse:
      "Interior bearing wall footing where the wall supports roof loads, with continuous-load-path uplift strapping shown together with the footing.",
    methodSummary:
      "Thickened-slab (trapezoidal) footing, 1'-4\" wide (1 story) / 1'-8\" wide (2 story), 1'-0\" deep, with 3-#4 or 2-#5 continuous bottom bars. Set a treated continuous 2x plate with 5/8\"x10\" epoxy anchors @ 48\" o.c. and a Simpson LTTP2 at EACH anchor bolt. Provide the continuous uplift load path: floor-to-floor strap CS20x48\" @ 48\" o.c., and a top-of-wall CS20x30\" wrapped & centered on the top plate @ 48\" o.c.",
    codeBasis: "Wind uplift / continuous load path, ASCE-7/16.",
    quantityBasis:
      "Footing per LF; epoxy anchors + LTTP2 per anchor at 48\"; CS20 straps per 48\" of wall (floor-to-floor and top-of-wall).",
    caveats:
      "Merges Chaplin's 'Depressed Slab Detail' footing with the 'Interior Wall with Roof Loads' strapping; LTTP2 is at EACH anchor (Chaplin's Depressed Slab placed it at alternate anchors).",
    triggerKeywords: [
      "foundation",
      "footing",
      "slab",
      "interior-wall",
      "bearing-wall",
      "epoxy-anchor",
      "hurricane-strap",
      "coil-strap",
      "wind-uplift",
      "continuous-load-path",
      "rebar",
    ],
    tags: ["simpson-lttp2", "simpson-cs20"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 6 (Heath)",
    components: [
      { kind: "MEMBER", name: "Footing width", spec: "1'-4\" cont. (1 story) / 1'-8\" cont. (2 story); 1'-0\" deep", notes: "thickened slab" },
      { kind: "MEMBER", name: "Bottom bars (continuous)", spec: "3 #4's OR 2 #5's", qtyRule: "continuous" },
      { kind: "MEMBER", name: "Studs", spec: "2x's at 16\" o.c.", qtyRule: "per LF", notes: "unless req'd otherwise" },
      { kind: "MEMBER", name: "Bottom plate", spec: "TD 2x plate, continuous", qtyRule: "continuous", notes: "treated" },
      { kind: "CONNECTOR", name: "Epoxy anchors", spec: "5/8\" x 10\" epoxy anchors", qtyRule: "48\" o.c. / per LF", notes: "plate to slab" },
      { kind: "CONNECTOR", name: "Plate tie", model: "Simpson LTTP2", qtyRule: "at EACH anchor bolt / per anchor" },
      { kind: "CONNECTOR", name: "Floor-to-floor strap", model: "Simpson CS20 x 48\"", qtyRule: "48\" o.c. / per 48\"", notes: "strap floor to floor above" },
      { kind: "CONNECTOR", name: "Top-of-wall strap", model: "Simpson CS20 x 30\"", qtyRule: "48\" o.c. / per 48\"", notes: "wrapped & centered on top plate" },
    ],
    sources: [
      {
        projectName: "20 Chaplin",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "October 1, 2025",
        status: "Preliminary — NOT FOR CONSTRUCTION",
        sourceRef: "S201 / Detail 4 (Depressed Slab Detail) + S301 (Interior Wall with Roof Loads)",
        designCriteria: DC.chaplin,
        deltaNotes:
          "Drawn as two separate details: 'Depressed Slab Detail' (thickened slab edge, 1'-4\" 1-story / 1'-8\" 2-story, LTTP2 at ALTERNATE anchors) and a stand-alone 'Interior Wall with Roof Loads' through-floor CS20 @ 48\" iso.",
      },
      {
        projectName: "38 Heath",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "March 12, 2026",
        status: "Working set",
        sourceRef: "S201 / Detail 6 (Int. Wall w/ Roof Loads)",
        designCriteria: DC.heath,
        deltaNotes:
          "Canonical source: combines footing + strapping into one detail, LTTP2 at EACH anchor, with explicit CS20x48\" (floor-to-floor) and CS20x30\" (top-of-wall) callouts.",
      },
    ],
  },
  {
    slug: "pad-footing-schedule",
    name: "Footing Schedule (Spot / Pad Footings)",
    category: "Foundation",
    discriminator: "pad-schedule",
    whenToUse:
      "Selecting an isolated spot/pad footing under a post, column, or pier by the plan callout (diamond) mark.",
    methodSummary:
      "Square pad footings, 12\" thick, with two-way bottom mat reinforcement (#4's @ 10\" o.c. each way in the bottom). Footing marks keyed to diamond symbols on the plan. Available marks: A = 2'-0\" sq, B = 3'-6\" sq.",
    codeBasis: "Not specified.",
    quantityBasis: "Per footing mark on plan (each pad). Count comes from the plan (skipped).",
    caveats:
      "This is a menu of available pad types, not a project count. Genoa's 'Footing Key' carries a single mark A = 3'-6\" sq (same as Heath's mark B); Heath listed both A (2'-0\") and B (3'-6\").",
    triggerKeywords: [
      "foundation",
      "pad-footing",
      "footing",
      "post",
      "column",
      "rebar",
      "gravity-bearing",
    ],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S101 Footing Schedule (Heath); S101 Footing Key (Genoa)",
    unitOfAssembly: "per pad",
    components: [
      { kind: "MEMBER", name: "Pad footing — Mark A", spec: "2'-0\" sq. x 12\" thk; #4's @ 10\" o.c. each way in bottom", qtyRule: "per pad mark" },
      { kind: "MEMBER", name: "Pad footing — Mark B", spec: "3'-6\" sq. x 12\" thk; #4's @ 10\" o.c. each way in bottom", qtyRule: "per pad mark" },
    ],
    sources: [
      {
        projectName: "38 Heath",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "March 12, 2026",
        status: "Working set",
        sourceRef: "S101 (Footing Schedule)",
        designCriteria: DC.heath,
        deltaNotes: "Canonical source: two marks A (2'-0\" sq) and B (3'-6\" sq).",
      },
      {
        projectName: "6 Genoa",
        sourceFirm: FIRM,
        engineerName: "Adam W. Austin",
        engineerLicense: "SC PE No. 34907",
        certNumber: "C03355",
        drawingDate: "April 21, 2026",
        status: "Signed & sealed (revised working set)",
        sourceRef: "S101 (Footing Key)",
        designCriteria: DC.genoa,
        deltaNotes:
          "Single mark A = 3'-6\" sq x 12\" (#4 @ 10\" each way bottom) — same as Heath's mark B; no 2'-0\" mark on this set.",
      },
    ],
  },
  {
    slug: "step-footing-typical",
    name: "Typical Step Footing",
    category: "Foundation",
    discriminator: "standard",
    whenToUse:
      "Where a continuous (non-tall) footing changes elevation (stepping down a grade or to a lower bearing).",
    methodSummary:
      "Step the footing in a sloped/stepped transition with a vertical step <= 24\" and a min horizontal run of 1'-6\" between steps. Continue the footing reinforcement bent to follow the step; step/diagonal bars match the footing's main bar quantity.",
    codeBasis: "Not specified.",
    quantityBasis: "Per stepped location; number of steps ≈ total elevation change ÷ 24\" max per step.",
    caveats:
      "Sloped transition annotated '2 / 1' (orientation of the 2:1 marker ambiguous as drawn). For TALL footings see the Footing-at-Steps variant of the wood-stem wall footing.",
    triggerKeywords: ["foundation", "footing", "rebar"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S101 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Continuous footing rebar", spec: "per footing schedule/plan", qtyRule: "bars to match footing quantity", notes: "step/diagonal bars = same qty as continuous footing bars" },
      { kind: "MEMBER", name: "Vertical step (max)", spec: "24\" maximum", qtyRule: "per step" },
      { kind: "MEMBER", name: "Horizontal run (min)", spec: "1'-6\" minimum", qtyRule: "per step" },
    ],
    sources: [
      {
        projectName: "20 Chaplin",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "October 1, 2025",
        status: "Preliminary — NOT FOR CONSTRUCTION",
        sourceRef: "S101 (Typical Step Footing Detail)",
        designCriteria: DC.chaplin,
        deltaNotes: "Canonical source.",
      },
    ],
  },
  {
    slug: "slab-jointing",
    name: "Slab Jointing (Control & Construction Joints)",
    category: "Foundation",
    discriminator: "slab-joints",
    whenToUse: "Detailing control joints and construction joints in slabs-on-grade.",
    methodSummary:
      "Control joint = saw-cut to 1/4 of slab thickness, seal promptly; reinforcement CONTINUOUS across the joint. Construction joint = metal key form (removed before second pour); reinforcement DISCONTINUOUS each side. Space control joints <= 15'-0\" o.c. so no segment's long side exceeds 1.5x the short side. Cut as soon as the slab can be cut without dislodging aggregate (same day). Where a joint meets a masonry foundation wall, continue it down the wall face and mirror it up into a masonry-wall control joint if a wall is supported above.",
    codeBasis: "Not specified (crack control).",
    quantityBasis: "Per LF of joint; control-joint layout <= 15'-0\" o.c., segment aspect ratio <= 1.5:1.",
    caveats: "Includes the Control Joint Termination condition at a masonry foundation wall.",
    triggerKeywords: ["foundation", "slab", "masonry", "crack-control", "rebar"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S101 + S301 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Slab reinforcement", spec: "per plan", qtyRule: "cont. at control joints; discont. at construction joints" },
      { kind: "MEMBER", name: "Saw-cut depth (control joint)", spec: "1/4 of slab thickness", qtyRule: "per joint", notes: "apply sealant promptly" },
      { kind: "MEMBER", name: "Keyway form (construction joint)", spec: "metal key form", qtyRule: "per joint", notes: "remove before second pour" },
      { kind: "MEMBER", name: "Masonry wall control joint", spec: "mirror of slab joint (if wall above)", qtyRule: "per joint", isConditional: true, notes: "align up into masonry wall" },
    ],
    sources: [
      {
        projectName: "20 Chaplin",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "October 1, 2025",
        status: "Preliminary — NOT FOR CONSTRUCTION",
        sourceRef: "S101 (Typ. Slab Joint'g Details) + S301 (Control Joint Termination)",
        designCriteria: DC.chaplin,
        deltaNotes: "Canonical source (verified identical on Heath, Genoa, Mooring Buoy).",
      },
      { projectName: "38 Heath", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 12, 2026", status: "Working set", sourceRef: "S101", designCriteria: DC.heath, deltaNotes: "Verified identical to canonical." },
      { projectName: "6 Genoa", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S101", designCriteria: DC.genoa, deltaNotes: "Slab jointing verified identical; Control Joint Termination not on this set." },
      { projectName: "87 Mooring Buoy", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "January 14, 2026", status: "Signed & sealed", sourceRef: "S101 + S301", designCriteria: DC.mooring, deltaNotes: "Verified identical to canonical." },
    ],
  },
  {
    slug: "slab-re-entrant-corner",
    name: "Re-Entrant Corner Bar (Slab)",
    category: "Foundation",
    discriminator: "re-entrant",
    whenToUse: "At any and all re-entrant (inside) corners in a slab.",
    methodSummary:
      "Place one diagonal #4 bar, 5'-0\" long, across the re-entrant corner at mid-depth of the slab, 3\" off the corner, oriented to bisect it — controls cracking that initiates at inside corners.",
    codeBasis: "Not specified.",
    quantityBasis: "1 bar per re-entrant corner.",
    triggerKeywords: ["foundation", "slab", "crack-control", "rebar"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S101 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Diagonal corner bar", spec: "#4 x 5'-0\" long", qtyRule: "1 per re-entrant corner", notes: "mid-depth of slab, 3\" from corner, diagonal" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S101 (Typ. Re-Entrant Corner Detail)", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
      { projectName: "6 Genoa", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S101", designCriteria: DC.genoa, deltaNotes: "Verified identical to canonical." },
    ],
  },
  {
    slug: "footing-intersection",
    name: "Footing Intersection (Corner & Tee)",
    category: "Foundation",
    discriminator: "intersection",
    whenToUse: "Reinforcement continuity at footing corners and side (tee) intersections.",
    methodSummary:
      "Run the continuous footing rebar through per plan; terminate the intersecting (perpendicular) footing's bars with 90-degree hooks having 30\" legs lapped into the continuing footing. Same hook rule at both the corner and the side/tee condition.",
    codeBasis: "Not specified.",
    quantityBasis: "Per corner / per side (tee) intersection; hooked legs per intersecting bar.",
    triggerKeywords: ["foundation", "footing", "rebar"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S302 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Continuous footing rebar", spec: "per plan", qtyRule: "continuous through corner/intersection" },
      { kind: "MEMBER", name: "Intersecting bars", spec: "terminate w/ 90° hooks, 30\" legs", qtyRule: "per intersecting bar", notes: "both corner and side/tee conditions" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S302 (Footing Intersection Details)", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
    ],
  },
  {
    slug: "plumbing-under-footing",
    name: "Plumbing Through / Under Footing",
    category: "Foundation",
    discriminator: "plumbing-coordination",
    whenToUse:
      "Where a plumbing line passes beneath an interior footing (horizontal crossing) or penetrates vertically THROUGH a footing.",
    methodSummary:
      "Horizontal crossing under a footing: thicken the footing so there is >= 6\" of concrete below the line, extending the thickened portion >= 16\" each side (1'-0\" min footing depth). Vertical penetration THROUGH a footing: sleeve the line with an oversized PVC sleeve and fill the void with foam/barrier; maintain continuous footing reinforcing and add 2 additional #4 bars each way above the line and 2 each way below, each extending 18\" beyond each way.",
    codeBasis: "Not specified.",
    quantityBasis: "Per crossing / per penetration.",
    triggerKeywords: ["foundation", "footing", "plumbing-coordination", "interior-wall", "rebar"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S302 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Concrete below pipe (horizontal crossing)", spec: "6\" min", notes: "thicken footing to provide; extend >= 16\" each side of line" },
      { kind: "MEMBER", name: "Sleeve (vertical penetration)", spec: "over-sized PVC sleeve", qtyRule: "per penetration", notes: "fill void with foam / barrier material" },
      { kind: "MEMBER", name: "Added bars above line", spec: "2 additional #4's each way", qtyRule: "per penetration", notes: "extend 18\" beyond each way" },
      { kind: "MEMBER", name: "Added bars below line", spec: "2 additional #4's each way", qtyRule: "per penetration", notes: "extend 18\" beyond each way" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S302 (Plumbing Through Interior Footing + Plumbing Drain Line Through Footing)", designCriteria: DC.chaplin, deltaNotes: "Canonical source — both the horizontal-crossing and vertical-penetration conditions." },
    ],
  },
  {
    slug: "cmu-pier",
    name: "CMU Pier",
    category: "Foundation",
    discriminator: "cmu-pier",
    whenToUse:
      "A square CMU pier supporting a concentrated load (e.g. porch/girder/interior pier support) on a spread footing.",
    methodSummary:
      "Build a 16\" square CMU pier with 1 #5 in each cell, rotating each course 90° from the course below; grout all cells solid with 3000 psi pea-gravel concrete. Bear on a footing (size & reinforcing per plan; 1'-0\" min deep) over 3000 psi #57 crushed-granite coarse aggregate. (12\" square variant: #5 vertical in each corner = 4 total.)",
    codeBasis: "Not specified.",
    quantityBasis: "Per pier; footing per plan.",
    caveats:
      "Canonical is the 16\" sq pier (1 #5 per cell, courses rotated 90°) from Genoa — the more recent/complete reinforcement scheme. Heath's 12\" sq pier used 1 #5 per corner (4 total).",
    triggerKeywords: ["foundation", "masonry", "pier", "footing", "rebar", "gravity-bearing"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 3 (Genoa)",
    components: [
      { kind: "MEMBER", name: "CMU pier", spec: "16\" square CMU", notes: "grout solid w/ 3000 psi pea-gravel conc." },
      { kind: "MEMBER", name: "Vertical reinforcement", spec: "#5", qtyRule: "1 in each cell; rotate each course 90°", notes: "grouted solid" },
      { kind: "MEMBER", name: "Footing", spec: "size & reinforcing per plan (1'-0\" min deep)", notes: "see Footing Key / plan" },
      { kind: "MEMBER", name: "Aggregate base", spec: "3000 psi #57 stone, crushed granite", notes: "coarse aggregate" },
    ],
    sources: [
      {
        projectName: "38 Heath",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "March 12, 2026",
        status: "Working set",
        sourceRef: "S201 / Detail 4 (12x12 CMU Pier)",
        designCriteria: DC.heath,
        deltaNotes:
          "12\" square pier; reinforcement = #5 vertical in EACH CORNER (4 total). Footing size & reinforcing per plan.",
      },
      {
        projectName: "6 Genoa",
        sourceFirm: FIRM,
        engineerName: "Adam W. Austin",
        engineerLicense: "SC PE No. 34907",
        certNumber: "C03355",
        drawingDate: "April 21, 2026",
        status: "Signed & sealed (revised working set)",
        sourceRef: "S201 / Detail 3 (16x16 CMU Pier)",
        designCriteria: DC.genoa,
        deltaNotes:
          "Canonical source: 16\" square pier; reinforcement = 1 #5 in EACH CELL with courses rotated 90° (vs Heath's 4-corner scheme at 12\").",
      },
    ],
  },
  {
    slug: "embedded-post-pier",
    name: "Embedded Post in Poured Pier Footing",
    category: "Foundation",
    discriminator: "embedded-post",
    whenToUse:
      "A wood post embedded directly in a poured concrete pier footing (e.g. deck/porch post in ground).",
    methodSummary:
      "Pour a 16\" diameter x 24\" deep footing around the post; reinforce with a double hoop of WWM (welded wire mesh). Post size per plan; post treated for ground contact.",
    codeBasis: "Not specified.",
    quantityBasis: "One 16\"Ø x 24\" deep pier per embedded post.",
    triggerKeywords: ["foundation", "deck-porch", "post", "pier", "deck", "rebar"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 9 (Heath)",
    components: [
      { kind: "MEMBER", name: "Post", spec: "per plan; treated for ground contact", notes: "embedded" },
      { kind: "MEMBER", name: "Pier footing", spec: "16\" dia x 24\" deep, poured around post", qtyRule: "1 per post" },
      { kind: "MEMBER", name: "Reinforcement", spec: "double hoop of WWM (welded wire mesh)", qtyRule: "per pier" },
    ],
    sources: [
      { projectName: "38 Heath", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 12, 2026", status: "Working set", sourceRef: "S201 / Detail 9 (Typ. Embeded Post Detail)", designCriteria: DC.heath, deltaNotes: "Canonical source." },
      { projectName: "6 Genoa", sourceFirm: FIRM, engineerName: "Adam W. Austin", engineerLicense: "SC PE No. 34907", certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S201 / Detail 4", designCriteria: DC.genoa, deltaNotes: "Verified identical to Heath canonical (16\"Ø x 24\", double-hoop WWM, treated post)." },
    ],
  },
  {
    slug: "steel-column-base-pad",
    name: "Steel Column Base on Pad Footing",
    category: "Foundation",
    discriminator: "steel-column-base",
    whenToUse: "Base of a steel column/post on a spread (pad) footing.",
    methodSummary:
      "Set the steel column on a 3/4\" thick base plate over 1-1/2\" non-shrink grout, anchored with (2) 3/4\" dia x 10\" Grade 36 epoxied anchor bolts into a pad footing (size & reinforcing per plan). Maintain 1-1/2\" min edge distance typ.",
    codeBasis: "Not specified (structural steel — AISC notes on S100).",
    quantityBasis: "Per steel column base (2 anchor bolts each); footing per plan.",
    caveats:
      "Two base-plate layouts shown (Top / Alt Top View). NOTE: shares the title 'Post Footing Detail' with Mooring Buoy's porch-box-column-on-CMU detail — different assembly, disambiguated by slug + discriminator.",
    triggerKeywords: [
      "foundation",
      "structural-steel",
      "pad-footing",
      "column",
      "column-base",
      "anchor-bolt",
      "epoxy-anchor",
    ],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 5 (Heath)",
    components: [
      { kind: "MEMBER", name: "Column", spec: "per plan", notes: "steel column" },
      { kind: "MEMBER", name: "Base plate", spec: "3/4\" thk B.P.", qtyRule: "1 per column" },
      { kind: "MEMBER", name: "Grout", spec: "1-1/2\" non-shrink grout", notes: "under base plate" },
      { kind: "MEMBER", name: "Footing", spec: "size & reinforcement per plan", notes: "see Footing Schedule / plan" },
      { kind: "CONNECTOR", name: "Anchor bolts", spec: "(2) 3/4\" dia x 10\" Gr. 36 epoxied anchor bolts", qtyRule: "2 per column", notes: "1.5\" min edge distance typ." },
    ],
    sources: [
      { projectName: "38 Heath", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 12, 2026", status: "Working set", sourceRef: "S201 / Detail 5 (Post Footing Detail — steel column base)", designCriteria: DC.heath, deltaNotes: "Canonical source." },
    ],
  },
  {
    slug: "porch-column-base-cmu-stem",
    name: "Porch Column Base on CMU Stem Wall + Footing",
    category: "Deck/Porch",
    discriminator: "porch-column-on-cmu",
    whenToUse:
      "Anchoring a porch hollow box column down through a CMU stem wall to a continuous footing — porch column bearing on a CMU foundation wall with a continuous uplift tie from column through wall.",
    methodSummary:
      "Set a TD hollow box column (min axial capacity 8000 lbs) on the CMU stem wall. Run a Quick Tie QTG through the center of the column OR a 1/2\" dia threaded rod anchored below by a 5/8\"x12\" epoxy bolt with nut + coupler nut. Build an 8\" CMU stem wall (48\" max height) with #4 verticals @ 32\" o.c. (bent bar), grout all cells solid with 3000 psi pea-gravel conc., 3/16\" Dur-O-Wall @ 16\" o.c. Top with an 8\" CMU bond beam (2 #4's), placed & grouted prior to backfill. Bear on a continuous footing 24\" wide x 10\" deep with 3-#4 OR 2-#5 continuous in the bottom. Brace CMU laterally during backfill/compaction.",
    codeBasis: "Wind uplift / continuous load path; column min axial 8000 lbs, ASCE-7/16.",
    quantityBasis:
      "Per porch column (box column + uplift tie + epoxy bolt); CMU stem wall & footing per LF.",
    caveats:
      "TITLE COLLISION: drawn as 'Post Footing Detail' but is unrelated to Heath's STEEL column base on a pad. Quick Tie 'QTG' transcribed as drawn — confirm exact product with engineer.",
    triggerKeywords: [
      "deck-porch",
      "foundation",
      "masonry",
      "post",
      "column",
      "stem-wall",
      "footing",
      "rebar",
      "wind-uplift",
      "threaded-rod",
      "epoxy-anchor",
    ],
    tags: ["quick-tie-qtg", "dur-o-wall"],
    sourceFirm: FIRM,
    engineerName: "Anthony M. Austin",
    engineerLicense: "SC PE No. ~13542",
    sourceRef: "S201 / Detail 7 (Mooring Buoy)",
    components: [
      { kind: "MEMBER", name: "Box column", spec: "TD hollow box column, min axial capacity 8000 lbs", qtyRule: "per column" },
      { kind: "MEMBER", name: "CMU stem wall", spec: "8\" CMU, 48\" max height", qtyRule: "per LF", notes: "grout all cells solid w/ 3000 psi pea-gravel conc." },
      { kind: "MEMBER", name: "Wall vertical reinforcing", spec: "#4's @ 32\" o.c. (bent bar)", qtyRule: "per LF" },
      { kind: "MEMBER", name: "Joint reinforcing", spec: "3/16\" Dur-O-Wall @ 16\" o.c.", qtyRule: "per LF" },
      { kind: "MEMBER", name: "Bond beam (top of wall)", spec: "8\" CMU bond beam, (2) #4's", qtyRule: "continuous", notes: "place & grout prior to backfill" },
      { kind: "MEMBER", name: "Continuous footing", spec: "24\" wide x 10\" deep", qtyRule: "per LF" },
      { kind: "MEMBER", name: "Footing bottom bars", spec: "3 - #4's OR 2 - #5's, continuous", qtyRule: "continuous" },
      { kind: "CONNECTOR", name: "Column uplift tie", model: "Quick Tie QTG (or 1/2\" dia threaded rod)", qtyRule: "thru center of column / 1 per column", notes: "QTG transcribed as drawn — confirm product" },
      { kind: "CONNECTOR", name: "Threaded-rod anchor", spec: "5/8\" x 12\" epoxy bolt w/ nut and coupler nut", qtyRule: "per column", notes: "continues uplift tie into wall/footing" },
    ],
    sources: [
      {
        projectName: "87 Mooring Buoy",
        sourceFirm: FIRM,
        engineerName: "Anthony M. Austin",
        engineerLicense: "SC Reg. PE No. ~13542 (leading digit obscured; trailing 3542)",
        certNumber: "C03355",
        drawingDate: "January 14, 2026",
        status: "Signed & sealed (working set)",
        sourceRef: "S201 / Detail 7",
        designCriteria: DC.mooring,
        deltaNotes:
          "Canonical & only source. Drawn-title 'Post Footing Detail' collides with Heath's steel column base. EOR name/number differs from Genoa's Adam W. Austin / 34907 — flagged for reconciliation.",
      },
    ],
  },
  {
    slug: "new-cmu-wall-at-existing",
    name: "New CMU Wall at Existing (Backfill Support + Slab Tie-In)",
    category: "Foundation",
    discriminator: "cmu-retaining-at-existing",
    whenToUse:
      "A new CMU foundation wall installed adjacent to an existing foundation wall to retain/support backfill & compaction on an addition, with the new slab tied into the existing slab. New-to-existing (existing foundation remains).",
    methodSummary:
      "Install a new CMU wall adjacent to the existing foundation. Reinforce with #4 verticals @ 32\" o.c. (bent bar) plus #4's @ 24\" o.c. as drawn; grout all cells solid with 3000 psi pea-gravel conc.; 3/16\" Dur-O-Wall @ 16\" o.c. Drill-and-epoxy wall verticals 6\" into the new footing below. Bear on a new continuous footing 1'-0\" wide x 1'-0\" deep with 2-#4 continuous. Tie the new slab into the existing slab with #4's x 1'-0\" @ 48\" o.c., drill-and-epoxied 4\" into the existing slab at mid-depth. Flashing/waterproofing per arch (min 2 layers ice & water shield, 12\" laps). Brace CMU laterally during backfill/compaction.",
    codeBasis: "Retaining/backfill support + new-to-existing; lateral per Design Criteria.",
    quantityBasis:
      "Per LF of wall/footing; slab dowels per 48\" of slab tie-in edge.",
    caveats:
      "NEW. Footing here (1'-0\" x 1'-0\", 2-#4) is narrower than the standard CMU Typ. Wall Footing (2'-0\" x 1'-0\", 3-#4) because it is an adjacent retaining/backfill wall, not the main bearing wall. CMU width per Typ. CMU Details.",
    triggerKeywords: [
      "foundation",
      "masonry",
      "wall",
      "retaining-wall",
      "footing",
      "slab",
      "rebar",
      "new-to-existing",
      "epoxy-anchor",
    ],
    tags: ["dur-o-wall"],
    sourceFirm: FIRM,
    engineerName: "Anthony M. Austin",
    engineerLicense: "SC PE No. ~13542",
    sourceRef: "S201 / Detail 2 (Mooring Buoy)",
    components: [
      { kind: "MEMBER", name: "CMU wall", spec: "CMU (width per Typ. CMU Details)", qtyRule: "per LF", notes: "grout all cells solid w/ 3000 psi pea-gravel conc." },
      { kind: "MEMBER", name: "Vertical reinforcing", spec: "#4's @ 32\" o.c. (bent bar)", qtyRule: "per LF", notes: "drill-and-epoxy 6\" into footing" },
      { kind: "MEMBER", name: "Add'l vertical reinforcing", spec: "#4's @ 24\" o.c.", qtyRule: "per LF" },
      { kind: "MEMBER", name: "Joint reinforcing", spec: "3/16\" Dur-O-Wall @ 16\" o.c.", qtyRule: "per LF" },
      { kind: "MEMBER", name: "New continuous footing", spec: "1'-0\" wide x 1'-0\" deep", qtyRule: "per LF", notes: "typ. at wall footings" },
      { kind: "MEMBER", name: "Footing bottom bars", spec: "2 - #4's continuous", qtyRule: "continuous" },
      { kind: "MEMBER", name: "Flashing / waterproofing", spec: "min. 2 layers ice & water shield w/ 12\" laps", qtyRule: "per LF", notes: "per arch'l" },
      { kind: "CONNECTOR", name: "Wall vertical-to-footing", spec: "#4 drill-and-epoxy", qtyRule: "6\" embed into footing / per vertical bar" },
      { kind: "CONNECTOR", name: "Slab tie-in dowel", spec: "#4 x 1'-0\"", qtyRule: "48\" o.c. / per 48\" of slab tie-in", notes: "drill-and-epoxy 4\" into existing slab at mid-depth; new-to-existing" },
    ],
    sources: [
      {
        projectName: "87 Mooring Buoy",
        sourceFirm: FIRM,
        engineerName: "Anthony M. Austin",
        engineerLicense: "SC Reg. PE No. ~13542 (leading digit obscured; trailing 3542)",
        certNumber: "C03355",
        drawingDate: "January 14, 2026",
        status: "Signed & sealed (working set)",
        sourceRef: "S201 / Detail 2",
        designCriteria: DC.mooring,
        deltaNotes: "Canonical & only source. NEW — not in any prior import.",
      },
    ],
  },
  {
    slug: "six-by-six-post-at-existing",
    name: "6x6 Post at Existing (Alternative to CMU Pier)",
    category: "Foundation",
    discriminator: "wood-post-retrofit",
    whenToUse:
      "Alternative point/foundation support in lieu of a CMU pier — a treated wood post carrying a point load (under stud columns / supporting an existing beam) down to a footing, in a retrofit/existing-structure condition.",
    methodSummary:
      "Verify or install a 6x6 post below the stud columns above, and verify or install squash blocking in the floor system. Set the 6x6 (TD, treated for ground contact) on a Simpson ABU66 post base. Attach the top of the post to the existing beam with (2) Simpson MTS12. Bear the post on the existing footing (to remain — field-verify size/extent, notify engineer). Where NO existing footing is found, install a new 2'-6\" sq. x 12\" thk footing with (3) #4's each way in the bottom.",
    codeBasis: "Gravity point-load support (parent set's load basis not in the project).",
    quantityBasis:
      "Per post support location — 1 post + 1 ABU66 + (2) MTS12 each; squash blocking per location; the 2'-6\" sq footing is FIELD-DETERMINED (only where no existing footing is found).",
    caveats:
      "Offered as an OPTION ('may be used in lieu of the previously spec'd CMU pier'). Footing is conditional: reuse existing if found; pour new only where none found. Coastal corrosion class of ABU66/MTS12 not specified — confirm HDG/ZMAX/SS with engineer.",
    triggerKeywords: [
      "foundation",
      "connectors-strapping",
      "post",
      "footing",
      "pad-footing",
      "beam",
      "new-to-existing",
      "gravity-bearing",
      "continuous-load-path",
      "post-base",
      "twist-strap",
    ],
    tags: ["simpson-abu66", "simpson-mts12"],
    sourceFirm: FIRM,
    engineerName: "Anthony M. Austin",
    engineerLicense: "SC PE No. 13542",
    sourceRef: "Revision letter, Job No. 251031-0",
    components: [
      { kind: "MEMBER", name: "Post", spec: "6x6, TD (treated) for ground contact", qtyRule: "1 per support location", notes: "placed below stud columns above" },
      { kind: "MEMBER", name: "Squash blocking", spec: "size per floor system", qtyRule: "per support location", notes: "verify or install in floor system" },
      { kind: "MEMBER", name: "Existing footing (typical)", spec: "existing to remain", notes: "field-verify size & extent; notify engineer" },
      { kind: "MEMBER", name: "New footing (only where no existing found)", spec: "2'-6\" sq. x 12\" thk; (3) #4's each way in bottom", qtyRule: "1 per post (field-determined)", isConditional: true },
      { kind: "CONNECTOR", name: "Post base", model: "Simpson ABU66", qtyRule: "1 per post", notes: "post TD for ground contact" },
      { kind: "CONNECTOR", name: "Post-to-existing-beam strap", model: "Simpson MTS12", qtyRule: "(2) per post", notes: "attaches post top to existing beam" },
    ],
    sources: [
      {
        projectName: "40 Planters Wood",
        sourceFirm: "Southern Consulting and Engineering, Inc.",
        engineerName: "Anthony M. Austin (co-signed Bill Metts, PE)",
        engineerLicense: "SC PE No. 13542",
        certNumber: "C02110",
        drawingDate: "May 5, 2026 (seal 05/04/2026)",
        status: "Signed & sealed revision/clarification letter (1 page)",
        sourceRef: "Revision letter, Job No. 251031-0 (6X6 POST DETAIL)",
        designCriteria: DC.planters,
        deltaNotes:
          "Canonical & only source. FLAG: Cert. of Authorization No. C02110 here vs C03355 on all four prior SCE imports; EOR Anthony M. Austin / 13542 vs Genoa's Adam W. Austin / 34907. Drawn-text typos 'EXISITNG' and doubled 'SIMPSON' transcribed verbatim.",
      },
    ],
  },

  // ===================== WALL FRAMING =====================
  {
    slug: "exterior-wall-framing-schedule",
    name: "Exterior Wall Framing Schedule",
    category: "Wall Framing",
    discriminator: "stud-schedule",
    whenToUse:
      "Sizing/spacing exterior (and interior, per the schedule) wall studs by wall plate height; baseline for any new wall or addition framing.",
    methodSummary:
      "Select stud size & spacing from the table by wall plate height and proximity to corners. Values are minimums — use what is shown OR larger studs / tighter spacing if the architectural drawings require it. < 9'-1\": 2x4 @ 16\". 9'-10\" plate: 2x4 @ 16\" (>4' from corners) / 2x4 @ 12\" (<4' from corners). 9'-11\" to 12'-0\": 2x6 @ 16\". 12'-1\" to 14'-0\": 2x6 @ 12\" OR 2x8 @ 16\". 14'-1\" to 17'-0\": (2)2x6 @ 16\" OR 2x8 @ 12\". 17'-1\" to 20'-0\": (2)2x6 @ 12\" OR (2)2x8 @ 16\".",
    codeBasis: "Prescriptive by height (not specified).",
    quantityBasis: "Per LF of wall at the given spacing; stud count = wall length ÷ spacing + corners/openings.",
    caveats: "Sizes are minimums; arch'l drawings govern if larger.",
    triggerKeywords: ["wall-framing", "stud", "wall", "exterior-wall", "interior-wall", "tall-wall"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S101 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Studs < 9'-1\"", spec: "2x4's at 16\" o.c.", qtyRule: "per LF", notes: "interior & corners" },
      { kind: "MEMBER", name: "Studs 9'-10\" plate (>4' from corners)", spec: "2x4's at 16\" o.c.", qtyRule: "per LF" },
      { kind: "MEMBER", name: "Studs 9'-10\" plate (<4' from corners)", spec: "2x4's at 12\" o.c.", qtyRule: "per LF" },
      { kind: "MEMBER", name: "Studs 9'-11\" to 12'-0\"", spec: "2x6's at 16\" o.c.", qtyRule: "per LF" },
      { kind: "MEMBER", name: "Studs 12'-1\" to 14'-0\"", spec: "2x6's at 12\" o.c. OR 2x8's at 16\" o.c.", qtyRule: "per LF", notes: "two options" },
      { kind: "MEMBER", name: "Studs 14'-1\" to 17'-0\"", spec: "(2)2x6's at 16\" o.c. OR 2x8's at 12\" o.c.", qtyRule: "per LF", notes: "two options" },
      { kind: "MEMBER", name: "Studs 17'-1\" to 20'-0\"", spec: "(2)2x6's at 12\" o.c. OR (2)2x8's at 16\" o.c.", qtyRule: "per LF", notes: "two options" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S101", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
      { projectName: "38 Heath", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 12, 2026", status: "Working set", sourceRef: "S101", designCriteria: DC.heath, deltaNotes: "Verified identical to canonical." },
      { projectName: "6 Genoa", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S101", designCriteria: DC.genoa, deltaNotes: "Verified identical to canonical." },
      { projectName: "6 Sycamore", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 23, 2026", status: "Signed & sealed (working set)", sourceRef: "S101", designCriteria: DC.sycamore, deltaNotes: "Verified identical to canonical." },
      { projectName: "87 Mooring Buoy", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "January 14, 2026", status: "Signed & sealed", sourceRef: "S101", designCriteria: DC.mooring, deltaNotes: "Verified identical to canonical." },
    ],
  },
  {
    slug: "plywood-nailing-pattern",
    name: "Plywood Nailing Pattern (Shear Wall Sheathing)",
    category: "Wall Framing",
    discriminator: "wall-sheathing",
    whenToUse: "Shear-wall / exterior wall sheathing nailing schedule (panel edges, field, plates).",
    methodSummary:
      "Sheathe walls with 7/16\" OSB (interchangeable with 1/2\" plywood). Fasten with .113 gun nails: 4\" o.c. at panel edges and to top & bottom plates; 6\" o.c. to interior/field supporting studs. Continue plywood to within 3/4\" of the top of the top plate. Nail length >= 2.375\".",
    codeBasis: "Shear/lateral (shear panels per Design Criteria seismic system).",
    quantityBasis: "Per SF of sheathing / per LF of edge & field nailing.",
    triggerKeywords: ["wall-framing", "sheathing", "nailing-pattern", "shear", "exterior-wall"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 12 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Wall sheathing", spec: "7/16\" OSB (= 1/2\" plywood)", qtyRule: "per SF" },
      { kind: "CONNECTOR", name: "Gun nails — panel edges", spec: ".113 gun nails", qtyRule: "4\" o.c. / per LF of edge" },
      { kind: "CONNECTOR", name: "Gun nails — top & bottom plates", spec: ".113 gun nails", qtyRule: "4\" o.c. / per LF", notes: "continue plywood to within 3/4\" of top of top plate" },
      { kind: "CONNECTOR", name: "Gun nails — field / interior studs", spec: ".113 gun nails", qtyRule: "6\" o.c. / per LF" },
      { kind: "CONNECTOR", name: "Nail length", spec: ">= 2.375\" long" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S201 / Detail 12", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
      { projectName: "6 Genoa", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S201 / Detail 12", designCriteria: DC.genoa, deltaNotes: "Verified identical to canonical." },
      { projectName: "6 Sycamore", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 23, 2026", status: "Signed & sealed (working set)", sourceRef: "S201 / Detail 12", designCriteria: DC.sycamore, deltaNotes: "Verified identical to canonical." },
    ],
  },
  {
    slug: "edge-framing-on-cmu",
    name: "Edge Framing on CMU Bond Beam",
    category: "Wall Framing",
    discriminator: "framing-on-cmu",
    whenToUse: "Where new wood floor/wall framing bears on top of a CMU wall (perimeter edge-beam condition).",
    methodSummary:
      "Top the CMU wall with a continuous 8\" bond beam reinforced with 2-#4 continuous, keeping wall reinforcing to within 1\" of top (do not use solid load-bearing CMU). Set a continuous TD 2x8 plate anchored with 5/8\" dia anchor bolts @ 48\" o.c., placed for proper strap alignment; Simpson LTTP2 at alternate anchor bolts. Bear the continuous edge beam/blocking on the plate; sheathe with 1/2\" plywood (.113 gun nails per Plywood Nailing Pattern).",
    codeBasis: "Wind uplift, ASCE-7/16.",
    quantityBasis: "Per LF of wall; anchor bolts per LF @ 48\"; LTTP2 at alternate ABs.",
    caveats: "Do not use solid load-bearing CMU units.",
    triggerKeywords: [
      "masonry",
      "wall-framing",
      "connectors-strapping",
      "wall",
      "beam",
      "anchor-bolt",
      "wind-uplift",
      "exterior-wall",
    ],
    tags: ["simpson-lttp2"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 6 (Genoa)",
    components: [
      { kind: "MEMBER", name: "Bond beam (top of wall)", spec: "8\" bond beam, 2-#4 cont.", qtyRule: "continuous", notes: "reinf. to within 1\" of top of CMU" },
      { kind: "MEMBER", name: "Bottom plate", spec: "TD 2x8, continuous", qtyRule: "continuous", notes: "treated" },
      { kind: "MEMBER", name: "Edge beam / blocking", spec: "continuous", qtyRule: "continuous", notes: "bears on plate" },
      { kind: "MEMBER", name: "Wall sheathing", spec: "1/2\" plywood (= 7/16\" OSB)", qtyRule: "per SF", notes: ".113 gun nails per Plywood Nailing Pattern" },
      { kind: "CONNECTOR", name: "Anchor bolts", spec: "5/8\" dia", qtyRule: "48\" o.c. / per LF", notes: "place for strap alignment" },
      { kind: "CONNECTOR", name: "Plate tie / tension strap", model: "Simpson LTTP2", qtyRule: "at alternate anchor bolts" },
    ],
    sources: [
      { projectName: "6 Genoa", sourceFirm: FIRM, engineerName: "Adam W. Austin", engineerLicense: "SC PE No. 34907", certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed (revised working set)", sourceRef: "S201 / Detail 6", designCriteria: DC.genoa, deltaNotes: "Canonical & only source. NEW (CMU-wall edge framing)." },
    ],
  },
  {
    slug: "raised-slab-framing-on-cmu",
    name: "Raised Floor Framing on CMU Wall",
    category: "Wall Framing",
    discriminator: "raised-floor-on-cmu",
    whenToUse:
      "Where a raised floor/slab framing bears on a CMU wall and the floor framing is offset (raised) relative to the bond beam — supported on a side nailer plus the top plate.",
    methodSummary:
      "Top the CMU wall with an 8\" bond beam (2-#4 cont., reinf. within 1\" of top; no solid load-bearing CMU). Set a continuous TD 2x8 plate with 5/8\" dia anchor bolts @ 48\" o.c. and a Simpson LTTP2 at alternate anchor bolts. Also attach a continuous TD 2x nailer to the CMU face with 5/8\"x8\" epoxy bolts @ 32\" o.c., 2 rows staggered, to carry the raised framing. Sheathe with 1/2\" plywood (.113 gun nails per Plywood Nailing Pattern).",
    codeBasis: "Wind uplift / continuous load path, ASCE-7/16.",
    quantityBasis: "Per LF of wall; top-plate AB per LF @ 48\" (+ LTTP2 alt); nailer epoxy bolts per LF (2 rows @ 32\").",
    triggerKeywords: [
      "foundation",
      "masonry",
      "slab",
      "wall",
      "ledger",
      "anchor-bolt",
      "epoxy-anchor",
      "wind-uplift",
    ],
    tags: ["simpson-lttp2"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 8 (Genoa)",
    components: [
      { kind: "MEMBER", name: "Bond beam (top of wall)", spec: "8\" bond beam, 2-#4 cont.", qtyRule: "continuous", notes: "reinf. to within 1\" of top of CMU" },
      { kind: "MEMBER", name: "Top plate", spec: "TD 2x8, continuous", qtyRule: "continuous", notes: "treated" },
      { kind: "MEMBER", name: "Side nailer", spec: "TD 2x nailer, continuous", qtyRule: "continuous", notes: "to CMU face" },
      { kind: "MEMBER", name: "Wall sheathing", spec: "1/2\" plywood (= 7/16\" OSB)", qtyRule: "per SF", notes: ".113 gun nails per Plywood Nailing Pattern" },
      { kind: "CONNECTOR", name: "Anchor bolts (top plate)", spec: "5/8\" dia", qtyRule: "48\" o.c. / per LF", notes: "place for strap alignment" },
      { kind: "CONNECTOR", name: "Plate tie / tension strap", model: "Simpson LTTP2", qtyRule: "at alternate anchor bolts" },
      { kind: "CONNECTOR", name: "Nailer epoxy bolts", spec: "5/8\" x 8\" epoxy bolts", qtyRule: "32\" o.c., 2 rows staggered / per LF", notes: "nailer to CMU face" },
    ],
    sources: [
      { projectName: "6 Genoa", sourceFirm: FIRM, engineerName: "Adam W. Austin", engineerLicense: "SC PE No. 34907", certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed (revised working set)", sourceRef: "S201 / Detail 8", designCriteria: DC.genoa, deltaNotes: "Canonical & only source. NEW (raised floor on CMU via top plate + side nailer)." },
    ],
  },

  // ===================== OPENINGS =====================
  {
    slug: "header-lintel-schedule",
    name: "Header / Lintel Schedule",
    category: "Openings",
    discriminator: "header-schedule",
    whenToUse:
      "Sizing wood/LVL headers and lintels over wall openings plus their jack- and king-stud counts. Two tables: single-story/second-floor walls, and first-floor walls with a floor above.",
    methodSummary:
      "Pick the header by clear span and condition. Lintels bear on >= double cut jack studs; jack studs nail to supporting double king studs with 2 rows of 16d nails @ 12\" o.c. staggered. For 2x6 walls, add an additional ply of lintel material. Multi-ply headers assume plywood/OSB between plies. If header width < wall framing thickness, shift header to outside face. SINGLE STORY / SECOND FLOOR: 0'-3'2\" = 2-2x8 / 3.5x6 LVL (1 jack, 1 king); 3'3\"-6'2\" = 2-2x8 / 3.5x7.25 LVL (1,2); 6'3\"-8'0\" = 2-2x10 / 3.5x9.25 LVL (1,2); 8'1\"-10'0\" = (2)1.75x10 LVL (2,3). FIRST FLOOR W/ FLOOR ABOVE: 0'-3'2\" = 2-2x8 (1,1); 3'3\"-6'2\" = 2-2x10 (2,2); 6'3\"-8'0\" = 2-2x12 (2,2); 8'1\"-10'0\" = (2)1.75x12 LVL (2,3).",
    codeBasis: "Headers for openings supporting ONE floor and roof loads only.",
    quantityBasis: "Per opening — one header + tabulated jack/king studs at each end.",
    caveats:
      "Plan-shown header sizes supersede this table. No allowance for point/beam loads over the header. Consult engineer for two floors and/or roof, or point/beam loading. For 2x6 walls add a ply. See Wall Strapping for uplift around openings.",
    triggerKeywords: ["openings", "header", "lintel", "stud", "wall-framing"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S301 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Header 0'-3'2\" (single/2nd floor)", spec: "2-2x8's / 3.5x6 LVL/PSL; 1 jack, 1 king", qtyRule: "per opening" },
      { kind: "MEMBER", name: "Header 3'3\"-6'2\" (single/2nd floor)", spec: "2-2x8's / 3.5x7.25 LVL/PSL; 1 jack, 2 king", qtyRule: "per opening" },
      { kind: "MEMBER", name: "Header 6'3\"-8'0\" (single/2nd floor)", spec: "2-2x10's / 3.5x9.25 LVL/PSL; 1 jack, 2 king", qtyRule: "per opening" },
      { kind: "MEMBER", name: "Header 8'1\"-10'0\" (single/2nd floor)", spec: "(2)1.75x10 LVL; 2 jack, 3 king", qtyRule: "per opening" },
      { kind: "MEMBER", name: "Header 0'-3'2\" (first floor w/ floor above)", spec: "2-2x8's; 1 jack, 1 king", qtyRule: "per opening" },
      { kind: "MEMBER", name: "Header 3'3\"-6'2\" (first floor w/ floor above)", spec: "2-2x10's; 2 jack, 2 king", qtyRule: "per opening" },
      { kind: "MEMBER", name: "Header 6'3\"-8'0\" (first floor w/ floor above)", spec: "2-2x12's; 2 jack, 2 king", qtyRule: "per opening" },
      { kind: "MEMBER", name: "Header 8'1\"-10'0\" (first floor w/ floor above)", spec: "(2)1.75x12 LVL; 2 jack, 3 king", qtyRule: "per opening" },
      { kind: "CONNECTOR", name: "Jack-to-king nails", spec: "16d nails", qtyRule: "2 rows at 12\" o.c., staggered / per stud pair" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S301", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
      { projectName: "38 Heath", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 12, 2026", status: "Working set", sourceRef: "S301", designCriteria: DC.heath, deltaNotes: "Verified identical to canonical." },
      { projectName: "6 Genoa", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S301", designCriteria: DC.genoa, deltaNotes: "Verified identical to canonical." },
      { projectName: "87 Mooring Buoy", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "January 14, 2026", status: "Signed & sealed", sourceRef: "S301", designCriteria: DC.mooring, deltaNotes: "Verified identical to canonical (both tables + footnote)." },
    ],
  },
  {
    slug: "multiple-lvl-attachment-schedule",
    name: "Multiple LVL Attachment Schedule",
    category: "Openings",
    discriminator: "lvl-fastening",
    whenToUse: "Fastening multi-ply (2-5 ply) LVL beams/headers together.",
    methodSummary:
      "Choose a fastener (16d nails, 1/4\"x3.5\" screws, 1/2\" dia thru bolts, or 1/4\"x7\" screws) and apply the tabulated rows/spacing by ply count. Stagger all rows. 2-ply: 16d 3 rows 12\" o.c. / 1/4x3.5 screws 3 rows 16\" o.c. / 1/2 thru bolts 2 rows 24\" o.c. 3-ply: 16d 3 rows 12\" each side / screws 3 rows 16\" each side / thru bolts 2 rows 24\". 4-ply: 1/4x3.5 screws 3 rows 16\" each side & each ply / 1/2 thru bolts 2 rows 16\" staggered / 1/4x7 screws 3 rows 24\" each side staggered. 5-ply: 1/2 thru bolts 2 rows 16\" staggered / 1/4x7 screws 3 rows 16\" each side staggered.",
    codeBasis: "Not specified.",
    quantityBasis: "Per LF of multi-ply beam at the selected fastener spacing (x rows / sides).",
    caveats:
      "Stagger rows. For LVL >= 17\" deep add a row. Where multiple LVL supports a perpendicular beam, add (2) 1/2\" thru bolts within 8\" each side of the perpendicular beam. 4-/5-ply beams are TOP LOADED ONLY.",
    triggerKeywords: ["openings", "beam", "header", "through-bolt", "structural-screw", "nailing-pattern"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S301 (Chaplin)",
    components: [
      { kind: "CONNECTOR", name: "16d nails", spec: "2-ply: 3 rows 12\" o.c.; 3-ply: 3 rows 12\" each side", qtyRule: "per LF" },
      { kind: "CONNECTOR", name: "1/4\"x3.5\" screws", spec: "2-ply: 3 rows 16\"; 3-ply: 3 rows 16\" each side; 4-ply: 3 rows 16\" each side & each ply", qtyRule: "per LF" },
      { kind: "CONNECTOR", name: "1/2\" dia thru bolts", spec: "2-ply: 2 rows 24\"; 3-ply: 2 rows 24\"; 4-/5-ply: 2 rows 16\" staggered", qtyRule: "per LF" },
      { kind: "CONNECTOR", name: "1/4\"x7\" screws", spec: "4-ply: 3 rows 24\" each side staggered; 5-ply: 3 rows 16\" each side staggered", qtyRule: "per LF" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S301", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
      { projectName: "87 Mooring Buoy", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "January 14, 2026", status: "Signed & sealed", sourceRef: "S301", designCriteria: DC.mooring, deltaNotes: "Verified identical to canonical (all rows + footnotes)." },
    ],
  },
  {
    slug: "window-flying-debris-protection",
    name: "Window Flying Debris Protection (Storm Panels)",
    category: "Openings",
    discriminator: "storm-panels",
    whenToUse: "Removable wind-borne-debris storm panels over windows where impact protection is required.",
    methodSummary:
      "Cover the opening with 7/16\" OSB 24/16 span-rated plywood panels, strength axis vertical, 8'-0\" max span (stack for taller openings). Fasten with 1/4\"-20 x 1\" combo sidewalk bolts at 16\" max o.c. into ELCO female 'panel mate' SS internal-drive anchors embedded in the wall. Anchor length by cladding: Stucco & Cementitious/Vinyl 1/4\"x4-1/2\"; Stone 1/4\"x5-1/2\"; Brick 1/4\"x7-3/8\". Install female connector flush with outside face of finish material.",
    codeBasis: "Wind-borne debris / C&C wind (see Design Criteria glazing table).",
    quantityBasis: "Panels per opening (8' max span); bolts/anchors at 16\" max o.c. around panel.",
    triggerKeywords: ["openings", "storm-panel", "impact-protection", "sheathing"],
    tags: ["elco-panel-mate"],
    sourceFirm: FIRM,
    sourceRef: "S301 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Storm panel", spec: "7/16\" OSB, 24/16 span rated plywood", qtyRule: "per opening", notes: "strength axis vertical; 8' max span" },
      { kind: "CONNECTOR", name: "Panel bolts", spec: "1/4\"-20 x 1\" combo sidewalk bolts", qtyRule: "16\" max o.c. / per panel perimeter", notes: "thread into ELCO female anchors" },
      { kind: "CONNECTOR", name: "Wall anchor — Stucco / Cementitious / Vinyl", model: "ELCO 1/4\" x 4-1/2\" female panel mate SS internal drive anchor", qtyRule: "at each bolt" },
      { kind: "CONNECTOR", name: "Wall anchor — Stone", model: "ELCO 1/4\" x 5-1/2\" female panel mate SS internal drive anchor", qtyRule: "at each bolt" },
      { kind: "CONNECTOR", name: "Wall anchor — Brick", model: "ELCO 1/4\" x 7-3/8\" female panel mate SS internal drive anchor", qtyRule: "at each bolt" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S301 (Window Flying Debris Protection + Window Panel Fastening Details)", designCriteria: DC.chaplin, deltaNotes: "Canonical source (panel + cladding anchor schedule)." },
      { projectName: "6 Genoa", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S301", designCriteria: DC.genoa, deltaNotes: "Verified identical to canonical." },
      { projectName: "6 Sycamore", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 23, 2026", status: "Signed & sealed (working set)", sourceRef: "S101", designCriteria: DC.sycamore, deltaNotes: "Verified identical to canonical." },
    ],
  },
  {
    slug: "wall-strapping-at-openings",
    name: "Wall Strapping at Openings (Uplift + King-Stud Schedule)",
    category: "Connectors & Strapping",
    discriminator: "opening-strapping",
    whenToUse:
      "Uplift strapping at window/door openings (and the king-stud schedule by opening width) in walls that support roof loads.",
    methodSummary:
      "Provide king studs by opening width: single up to 36\"; double >36\" to 60\"; triple >60\" to 84\". Strap king studs and tie the header for uplift. CS18x16\" coil straps at king studs at each end of openings > 48\"; on roof-bearing interior walls also at 48\" o.c. aligned with the CS or LTT below. At each end of each opening > 48\" wide (in line with king studs): canonical uses Simpson CS18x48\" coil strap (interior bearing walls attach through the subfloor to the beam below). Strap length/qty adjusted to uplift loads.",
    codeBasis: "Wind uplift, ASCE-7/16.",
    quantityBasis: "Per opening end (2 ends/opening); CS18x16 also per 48\" of interior roof-bearing wall.",
    caveats:
      "Canonical (Genoa) uses a CS18x48\" coil strap at opening ends, routed through subfloor to the beam below. Chaplin/Sycamore used a Simpson LTTP2 plate tie there 'and at each girder truss.' King-stud schedule and CS18x16 callout are unchanged across all sources.",
    triggerKeywords: [
      "connectors-strapping",
      "openings",
      "header",
      "stud",
      "exterior-wall",
      "bearing-wall",
      "hurricane-strap",
      "coil-strap",
      "wind-uplift",
      "continuous-load-path",
    ],
    tags: ["simpson-cs18", "simpson-lttp2"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 11 (Genoa)",
    components: [
      { kind: "MEMBER", name: "King studs — up to 36\"", spec: "single king stud", qtyRule: "per opening end" },
      { kind: "MEMBER", name: "King studs — >36\" to 60\"", spec: "double king stud", qtyRule: "per opening end" },
      { kind: "MEMBER", name: "King studs — >60\" to 84\"", spec: "triple king stud", qtyRule: "per opening end" },
      { kind: "MEMBER", name: "Jack studs / header", spec: "per Header/Lintel Schedule", qtyRule: "per opening" },
      { kind: "CONNECTOR", name: "Coil strap at king studs", model: "Simpson CS18 x 16\"", qtyRule: "each end of opening > 48\"; interior roof-bearing walls @ 48\" o.c.", notes: "align w/ CS or LTT below" },
      { kind: "CONNECTOR", name: "Coil strap at opening ends (canonical)", model: "Simpson CS18 x 48\"", qtyRule: "each end of each opening > 48\" wide, in line w/ king studs", notes: "interior bearing walls: attach through subfloor to beam below" },
    ],
    sources: [
      {
        projectName: "20 Chaplin",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "October 1, 2025",
        status: "Preliminary — NOT FOR CONSTRUCTION",
        sourceRef: "S201 / Detail 11 (Typ. Wall Strapping Detail)",
        designCriteria: DC.chaplin,
        deltaNotes:
          "Opening-end connector was a Simpson LTTP2 plate tie (in line with king studs) + 'at each girder truss' — NOT the CS18x48\" coil strap. CS18x16 at king studs and king-stud schedule identical.",
      },
      {
        projectName: "6 Genoa",
        sourceFirm: FIRM,
        engineerName: "Adam W. Austin",
        engineerLicense: "SC PE No. 34907",
        certNumber: "C03355",
        drawingDate: "April 21, 2026",
        status: "Signed & sealed (revised working set)",
        sourceRef: "S201 / Detail 11 (Wall Opening Strapping Detail)",
        designCriteria: DC.genoa,
        deltaNotes:
          "Canonical source: opening-end connector is Simpson CS18x48\" coil strap; bottom routing 'through subfloor to beam below' (vs Chaplin's LTTP2 / girder-truss).",
      },
      {
        projectName: "6 Sycamore",
        sourceFirm: FIRM,
        certNumber: "C03355",
        drawingDate: "March 23, 2026",
        status: "Signed & sealed (working set)",
        sourceRef: "S201 / Detail 11",
        designCriteria: DC.sycamore,
        deltaNotes:
          "Matches Chaplin's version (CS18x16 / LTTP2; same king-stud schedule; repeats the 'girder stuss' typo).",
      },
    ],
  },

  // ===================== FLOOR FRAMING =====================
  {
    slug: "flitch-beam",
    name: "Flitch Beam (Wood/Steel Built-Up)",
    category: "Floor Framing",
    discriminator: "wood-steel-flitch",
    whenToUse:
      "A built-up 'flitch' beam where called out on plan (carrying floor/point loads where a wood-only built-up section is insufficient).",
    methodSummary:
      "Build from three 2x10's with two center 3/8\"x9\" steel flitch plates between the plies. Bolt all together with two rows of 5/8\" dia through-bolts @ 32\" o.c., staggered (alternating top/bottom row, ~16\" apart along the beam).",
    codeBasis: "Not specified.",
    quantityBasis: "Per LF of flitch beam; through-bolts per row @ 32\" o.c. (x2 rows, staggered).",
    caveats: "Only the 'A' variant appears in the source set. Use only where designated 'Flitch Beam A' on plan.",
    triggerKeywords: ["floor-framing", "structural-steel", "beam", "through-bolt", "gravity-bearing"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S102 (Genoa)",
    components: [
      { kind: "MEMBER", name: "Wood plies", spec: "3 - 2x10", qtyRule: "per LF", notes: "outer/center plies" },
      { kind: "MEMBER", name: "Steel flitch plates", spec: "(2) 3/8\" x 9\" steel plates", qtyRule: "per LF", notes: "center plates between plies" },
      { kind: "CONNECTOR", name: "Through-bolts", spec: "5/8\" dia through bolts", qtyRule: "2 rows at 32\" o.c., staggered / per 32\" per row", notes: "bolt all plies + plates together" },
    ],
    sources: [
      { projectName: "6 Genoa", sourceFirm: FIRM, engineerName: "Adam W. Austin", engineerLicense: "SC PE No. 34907", certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed (revised working set)", sourceRef: "S102 (Flitch Beam — A)", designCriteria: DC.genoa, deltaNotes: "Canonical & only source." },
    ],
  },
  {
    slug: "joist-support-face-mount-hanger",
    name: "Joist Support — Face-Mount Hangers off Built-Up Beam",
    category: "Floor Framing",
    discriminator: "hanger-off-wood-beam",
    whenToUse: "Where rafters/joists frame into the face of a (multi-ply) wood beam and are supported on hangers.",
    methodSummary:
      "Provide continuous web blocking in the beam, attached with 2 rows of 5/8\" dia bolts @ 32\" o.c. staggered. Hang each rafter/joist with a face-mount hanger; slope/skew the hanger seat as required.",
    codeBasis: "Not specified (gravity).",
    quantityBasis: "Web-blocking bolts per LF of beam; one hanger per rafter/joist.",
    caveats: "Hanger model/size per plan; 'slope seat as req'd' for pitched rafters.",
    triggerKeywords: ["floor-framing", "roof-framing", "joist", "rafter", "beam", "joist-hanger", "through-bolt", "gravity-bearing"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 8 (Heath)",
    components: [
      { kind: "MEMBER", name: "Beam", spec: "per plan (multi-ply)" },
      { kind: "MEMBER", name: "Web blocking", spec: "continuous web blocking", qtyRule: "continuous" },
      { kind: "MEMBER", name: "Rafters / joists", spec: "per plan" },
      { kind: "CONNECTOR", name: "Web-blocking bolts", spec: "5/8\" dia bolts", qtyRule: "2 rows at 32\" o.c., staggered / per LF" },
      { kind: "CONNECTOR", name: "Hangers", model: "face-mount hangers (Simpson, size per plan)", qtyRule: "1 per rafter/joist", notes: "slope seat as req'd" },
    ],
    sources: [
      { projectName: "38 Heath", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 12, 2026", status: "Working set", sourceRef: "S201 / Detail 8", designCriteria: DC.heath, deltaNotes: "Canonical & only source." },
    ],
  },
  {
    slug: "joist-bearing-on-cmu",
    name: "Joist Bearing on CMU Wall (Ledger/Nailer)",
    category: "Floor Framing",
    discriminator: "joists-on-cmu",
    whenToUse: "Where new floor/ceiling joists bear on a CMU wall via a ledger and nailer.",
    methodSummary:
      "Attach a continuous TD 2x nailer to the CMU with (2) rows of 5/8\" epoxy bolts @ 32\" o.c., staggered, min 6\" embed (engage grouted cells — knock out block, dam cell below, re-grout where req'd). Attach a 2x ledger to the nailer with .131x3\" gun nails @ 12\" o.c., 2 rows staggered (6\" c-c), in addition to the epoxy bolts. Toenail each joist to the ledger/nailer with min (6) .131x3\" gun nails. Keep untreated framing/sheathing off the CMU (flashing/waterproofing per arch).",
    codeBasis: "Not specified (gravity).",
    quantityBasis: "Nailer epoxy bolts per LF (2 rows @ 32\"); ledger nails per LF; (6) toenails per joist.",
    caveats: "NEW (CMU joist bearing); distinct from the face-mount-hanger-off-wood-beam joist support.",
    triggerKeywords: ["floor-framing", "masonry", "joist", "ledger", "epoxy-anchor", "nailing-pattern", "gravity-bearing"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 9 (Genoa)",
    components: [
      { kind: "MEMBER", name: "Nailer", spec: "TD 2x nailer, continuous", qtyRule: "continuous", notes: "to CMU" },
      { kind: "MEMBER", name: "Ledger", spec: "2x ledger, continuous", qtyRule: "continuous", notes: "to nailer" },
      { kind: "MEMBER", name: "Joists", spec: "per plan", notes: "toenail to ledger/nailer" },
      { kind: "CONNECTOR", name: "Nailer epoxy bolts", spec: "5/8\" epoxy bolts", qtyRule: "(2) rows at 32\" o.c., staggered, min 6\" embed / per LF", notes: "engage grouted cells" },
      { kind: "CONNECTOR", name: "Ledger-to-nailer nails", spec: ".131 x 3\" gun nails", qtyRule: "12\" o.c., 2 rows staggered (6\" c-c) / per LF", notes: "in addition to epoxy bolts" },
      { kind: "CONNECTOR", name: "Joist toenails", spec: ".131 x 3\" gun nails", qtyRule: "min (6) per joist", notes: "joist to ledger/nailer" },
    ],
    sources: [
      { projectName: "6 Genoa", sourceFirm: FIRM, engineerName: "Adam W. Austin", engineerLicense: "SC PE No. 34907", certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed (revised working set)", sourceRef: "S201 / Detail 9", designCriteria: DC.genoa, deltaNotes: "Canonical & only source. NEW (CMU joist bearing)." },
    ],
  },
  {
    slug: "beam-bearing-hgum-on-cmu",
    name: "Beam Hung from CMU (HGUM Hanger)",
    category: "Floor Framing",
    discriminator: "beam-off-cmu",
    whenToUse:
      "Where a new beam (e.g. new LVL beams greater than (2)10\" LVL) is hung directly from the face of a grouted/reinforced CMU wall.",
    methodSummary:
      "Hang the beam from a Simpson HGUM hanger face-mounted to a grouted CMU cell per manufacturer (discontinue any nailer as req'd; knock out block, dam cell below, re-grout so the hanger attaches to a grouted cell). Attach the hanger to the beam with (4) SD screws each side. Keep untreated framing/sheathing off the CMU.",
    codeBasis: "Not specified (gravity).",
    quantityBasis: "One HGUM hanger per beam bearing on CMU.",
    caveats: "Referenced on plan as 'hang beam directly from face of grouted and reinforced CMU with Simpson HGUM hanger.' Hanger size per plan (HGUM family) — confirm exact model with engineer.",
    triggerKeywords: ["floor-framing", "masonry", "connectors-strapping", "beam", "joist-hanger", "gravity-bearing", "new-to-existing"],
    tags: ["simpson-hgum"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 10 (Genoa)",
    components: [
      { kind: "MEMBER", name: "Beam", spec: "per plan", notes: "new LVL beams > (2)10\" LVL per plan callout" },
      { kind: "MEMBER", name: "Grouted CMU cell", spec: "grout solid", qtyRule: "per hanger", notes: "knock out / dam / re-grout as req'd" },
      { kind: "CONNECTOR", name: "Beam hanger", model: "Simpson HGUM", qtyRule: "1 per beam end", notes: "attach to grouted CMU cell per mfr." },
      { kind: "CONNECTOR", name: "Hanger-to-beam screws", spec: "(4) SD screws ea. side", qtyRule: "4 per side", notes: "Simpson connector screws" },
    ],
    sources: [
      { projectName: "6 Genoa", sourceFirm: FIRM, engineerName: "Adam W. Austin", engineerLicense: "SC PE No. 34907", certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed (revised working set)", sourceRef: "S201 / Detail 10", designCriteria: DC.genoa, deltaNotes: "Canonical & only source. NEW. Referenced by plan callouts 'see 10/S201'." },
    ],
  },

  // ===================== MASONRY =====================
  {
    slug: "cmu-reinforcement-details",
    name: "Typical CMU Details (Reinforcement at Corners / Intersections / Terminations)",
    category: "Masonry",
    discriminator: "cmu-rebar-layout",
    whenToUse:
      "Locating vertical reinforcing in CMU walls at corners, intersections, openings, and wall ends; and laying out CMU wall control joints.",
    methodSummary:
      "Place grouted vertical bars in the CMU cells: 4 bars at all wall intersections, 3 bars at each corner, 2 bars at each end of each door/window opening or wall termination. Provide CMU control joints <= 30'-0\" o.c., located >= 24\" clear of any opening.",
    codeBasis: "Not specified (masonry detailing).",
    quantityBasis: "Per corner / per intersection / per opening end; control joints per LF of CMU wall (<= 30'-0\" o.c.).",
    caveats: "Vertical bar SIZE is not given here — use the size from the governing CMU wall section (#4 @ 32\" in Typ. Wall Footing, #5 @ 24\" in Parapet Wall).",
    triggerKeywords: ["masonry", "foundation", "wall", "rebar", "crack-control"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S101 (Genoa)",
    components: [
      { kind: "MEMBER", name: "Vert. bars at intersections", spec: "bar size per wall detail", qtyRule: "4 bars per intersection", notes: "grouted cells" },
      { kind: "MEMBER", name: "Vert. bars at corners", spec: "bar size per wall detail", qtyRule: "3 bars per corner", notes: "grouted cells" },
      { kind: "MEMBER", name: "Vert. bars at openings / terminations", spec: "bar size per wall detail", qtyRule: "2 bars per opening end / termination", notes: "grouted cells" },
      { kind: "MEMBER", name: "CMU control joints", spec: "<= 30'-0\" o.c.; >= 24\" clear of openings", qtyRule: "per CMU wall" },
    ],
    sources: [
      { projectName: "6 Genoa", sourceFirm: FIRM, engineerName: "Adam W. Austin", engineerLicense: "SC PE No. 34907", certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed (revised working set)", sourceRef: "S101", designCriteria: DC.genoa, deltaNotes: "Canonical source. NEW (not in Chaplin/Heath)." },
      { projectName: "87 Mooring Buoy", sourceFirm: FIRM, engineerName: "Anthony M. Austin", engineerLicense: "SC Reg. PE No. ~13542", certNumber: "C03355", drawingDate: "January 14, 2026", status: "Signed & sealed", sourceRef: "S101", designCriteria: DC.mooring, deltaNotes: "Verified identical to Genoa canonical." },
    ],
  },
  {
    slug: "cmu-parapet-wall",
    name: "CMU Parapet Wall (Extending Existing CMU)",
    category: "Masonry",
    discriminator: "parapet-at-existing",
    whenToUse: "A CMU parapet wall (top of wall above the roof), typically extending an existing CMU wall upward.",
    methodSummary:
      "Build the 8\" CMU parapet with #5 verticals @ 24\" o.c. and 3/16\" joint reinforcing @ 16\" o.c.; provide a bond beam at the top with #5 continuous; keep top of wall <= 32\" above the roof. Drill-and-epoxy the vertical rebar min 26\" into the existing CMU wall and grout solid. Make the last rafter TD and attach to the CMU with (2) rows of 5/8\" epoxy bolts @ 32\" o.c., staggered, min 6\" embed; block between the (3) nearest rafter bays min 32\" o.c. Where the parapet extends >32\" laterally beyond the eave, add bond beams at ridge & eave heights; beyond 5'-0\", add bond beams max 24\" o.c.",
    codeBasis: "Wind / lateral on parapet, ASCE-7/16.",
    quantityBasis: "Per LF of parapet; last-rafter epoxy bolts per LF.",
    caveats: "NEW. New-to-existing element (verticals epoxied 26\" into existing CMU). Investigate existing CMU grout spacing, notify engineer, anticipate changes.",
    triggerKeywords: ["masonry", "roof-framing", "wall", "parapet", "new-to-existing", "epoxy-anchor", "rebar", "wind-uplift"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 13 (Genoa)",
    components: [
      { kind: "MEMBER", name: "CMU parapet", spec: "8\" CMU", qtyRule: "per LF", notes: "grout solid" },
      { kind: "MEMBER", name: "Vertical reinforcing", spec: "#5's at 24\" o.c.", qtyRule: "per LF", notes: "epoxy min 26\" into existing CMU" },
      { kind: "MEMBER", name: "Joint reinforcing", spec: "3/16\" joint reinforcing at 16\" o.c.", qtyRule: "per LF", notes: "horizontal" },
      { kind: "MEMBER", name: "Top bond beam", spec: "#5 continuous", qtyRule: "continuous", notes: "top of wall <= 32\" above roof" },
      { kind: "MEMBER", name: "Add'l bond beams", spec: "as required", qtyRule: "per condition", isConditional: true, notes: ">32\" lateral beyond eave; max 24\" o.c. beyond 5'-0\"" },
      { kind: "CONNECTOR", name: "Vertical rebar into existing", spec: "#5 drill-and-epoxy", qtyRule: "min 26\" embed into existing CMU / per bar", notes: "grout solid" },
      { kind: "CONNECTOR", name: "Last-rafter epoxy bolts", spec: "5/8\" epoxy bolts", qtyRule: "(2) rows at 32\" o.c., staggered, min 6\" embed / per LF", notes: "block between (3) nearest rafter bays min 32\" o.c." },
    ],
    sources: [
      { projectName: "6 Genoa", sourceFirm: FIRM, engineerName: "Adam W. Austin", engineerLicense: "SC PE No. 34907", certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed (revised working set)", sourceRef: "S201 / Detail 13", designCriteria: DC.genoa, deltaNotes: "Canonical & only source. NEW. NEW TAG 'parapet' introduced on this set." },
    ],
  },

  // ===================== ROOF FRAMING =====================
  {
    slug: "eave-typical",
    name: "Typical Eave (Rafter-to-Wall Bearing)",
    category: "Roof Framing",
    discriminator: "typical-eave",
    whenToUse: "Typical eave/rafter-to-wall bearing condition (roof sheathing fastening, rafter tie-down, soffit).",
    methodSummary:
      "Roof sheathing 19/32\" OSB fastened with 8d common or Simpson RSRS-01 nails (2.375\" long, 1.5\" serrated shank, .113 dia) @ 6\" o.c. field and 4\" o.c. within 48\" of eaves, rakes, valleys, ridges. Wall sheathing (7/16\") with .113x3\" serrated gun nails @ 6\" o.c., extending to the top plate. Connect each rafter at its bearing with a Simpson H2.5A; inside, install a Simpson CS20x16\" strap attaching the top plate to the studs at <= 6 ft o.c. Plywood soffit with 2.5x.131\" gun nails @ 6\" o.c.; interior nailing strip required for vinyl soffit span > 12\".",
    codeBasis: "Wind uplift, ASCE-7/16.",
    quantityBasis: "Sheathing per SF; H2.5A per rafter; CS20x16\" strap per 6 ft inside; soffit nails per LF.",
    caveats: "Genoa drew the rafter connector as an Uplift-Reaction → Connector table ('stick framed roof = H2.5A'); connectors otherwise unchanged. Sycamore drew it at a window-head condition.",
    triggerKeywords: ["roof-framing", "eave", "rafter", "sheathing", "nailing-pattern", "hurricane-strap", "coil-strap", "wind-uplift"],
    tags: ["simpson-h2.5a", "simpson-cs20", "simpson-rsrs-01"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Details 13 & 14 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Roof sheathing", spec: "19/32\" OSB", qtyRule: "per SF" },
      { kind: "MEMBER", name: "Wall sheathing", spec: "7/16\" plywood/OSB", qtyRule: "per SF", notes: "extend to top plate" },
      { kind: "MEMBER", name: "Rafters", spec: "per plan" },
      { kind: "CONNECTOR", name: "Roof sheathing fastener", model: "8d common nails OR Simpson RSRS-01 (2.375\", 1.5\" serrated shank, .113 dia)", qtyRule: "6\" o.c. field; 4\" o.c. within 48\" of eaves/rakes/valleys/ridges" },
      { kind: "CONNECTOR", name: "Wall sheathing nails", spec: ".113 x 3\" serrated gun nails", qtyRule: "6\" o.c. / per LF", notes: "extend to top plate" },
      { kind: "CONNECTOR", name: "Rafter-to-wall connector", model: "Simpson H2.5A", qtyRule: "1 per rafter", notes: "bearing end of each rafter" },
      { kind: "CONNECTOR", name: "Inside top-plate strap", model: "Simpson CS20 x 16\"", qtyRule: "<= 6 ft o.c. / per 6 ft", notes: "top plate to studs (inside)" },
      { kind: "CONNECTOR", name: "Plywood soffit nails", spec: "2.5 x .131\" gun nails", qtyRule: "6\" o.c. / per LF", notes: "vinyl soffit per mfr." },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S201 / Details 13 & 14", designCriteria: DC.chaplin, deltaNotes: "Canonical source. Connector labeled '2.5A' (= H2.5A)." },
      { projectName: "6 Genoa", sourceFirm: FIRM, engineerName: "Adam W. Austin", engineerLicense: "SC PE No. 34907", certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S201 / Detail 14", designCriteria: DC.genoa, deltaNotes: "Drawn for the cont.-edge-beam condition; rafter connector as Uplift-Reaction→Connector table (stick framed = H2.5A). Roof-sheathing thickness not called out (per timber notes)." },
      { projectName: "6 Sycamore", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 23, 2026", status: "Signed & sealed (working set)", sourceRef: "S201 / Detail 14", designCriteria: DC.sycamore, deltaNotes: "Drawn at a window-head condition; does not separately annotate wall-sheathing/soffit nailing. Connectors/sheathing/spacings identical to canonical." },
    ],
  },
  {
    slug: "raised-beam-ceiling-joist-tie",
    name: "Raised Beam (Ceiling Joists Tied Over Flush Beam)",
    category: "Roof Framing",
    discriminator: "raised-beam",
    whenToUse: "Where ceiling joists frame over/across a flush-top ('raised') LVL beam and must be tied across it.",
    methodSummary:
      "Set the LVL beam (size per plan). Drape a Simpson CS18 coil strap over the top of the beam and nail it down to the ceiling joists on each side AND to the top of the beam, at <= 32\" o.c., tying the joists together across the beam.",
    codeBasis: "Uplift / continuity across beam.",
    quantityBasis: "Straps per LF of beam at <= 32\" o.c.",
    caveats: "One side may be 'existing ceiling joists to remain'.",
    triggerKeywords: ["roof-framing", "beam", "ceiling-joist", "coil-strap", "wind-uplift", "continuous-load-path"],
    tags: ["simpson-cs18"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 10 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Raised beam", spec: "LVL per plan", notes: "flush-top" },
      { kind: "MEMBER", name: "Ceiling joists", spec: "per plan (one side may be existing to remain)" },
      { kind: "CONNECTOR", name: "Coil strap over beam", model: "Simpson CS18", qtyRule: "<= 32\" o.c. / per 32\" of beam", notes: "nail to ceiling joists each side and to top of beam" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S201 / Detail 10", designCriteria: DC.chaplin, deltaNotes: "Canonical & only source." },
    ],
  },
  {
    slug: "over-framing",
    name: "Over-Framing (Roof Framed Over Lower Roof)",
    category: "Roof Framing",
    discriminator: "over-framing",
    whenToUse: "Where a roof is over-framed on top of a lower/existing framed roof (gables, dormers, chimneys, or other element over a lower framed area).",
    methodSummary:
      "Frame the over-framed rafters for the intersecting gable over the lower roof and attach each over-framed rafter to the structure below with a Simpson TS12 twist strap.",
    codeBasis: "Uplift / connection of over-framing.",
    quantityBasis: "One TS12 per over-framed rafter.",
    caveats: "Concept applies to all over-framed gables, dormers, chimneys, or other element over a lower framed area.",
    triggerKeywords: ["roof-framing", "rafter", "over-framing", "gable", "dormer", "twist-strap", "wind-uplift"],
    tags: ["simpson-ts12"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 15 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Over-framed rafters", spec: "per plan", notes: "rafters over-framed for intersecting gables" },
      { kind: "CONNECTOR", name: "Twist strap", model: "Simpson TS12", qtyRule: "1 per over-framed rafter", notes: "at each rafter" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S201 / Detail 15", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
      { projectName: "6 Genoa", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S201 / Detail 15", designCriteria: DC.genoa, deltaNotes: "Verified identical to canonical." },
      { projectName: "87 Mooring Buoy", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "January 14, 2026", status: "Signed & sealed", sourceRef: "S201 / Detail 15", designCriteria: DC.mooring, deltaNotes: "Verified identical to canonical." },
    ],
  },
  {
    slug: "gable-end-framing-overhang",
    name: "Gable End Framing (Outriggers / Overhang)",
    category: "Roof Framing",
    discriminator: "gable-overhang",
    whenToUse: "Framing and bracing the gable-end overhang (outriggers, blocking, lateral brace) at a gable.",
    methodSummary:
      "Frame the overhang with 2x4 outriggers @ 48\" o.c.; provide 2x blocking in the outer 2 framed bays @ 48\" o.c. and 2x blocking adjacent to each outrigger. Install a 2x6 'L' lateral member fastened with (2) 16d nails per stud, and a diagonal 2x6 'T' brace at <= 10 ft o.c. with (4) .131x3\" nails at its gusset. Provide 2x ceiling-depth blocking in the outer three bays. Strap with Simpson CS20x16\" each side of each brace, and Simpson CS18x48\" where plywood is spliced within 8\" of ceiling level.",
    codeBasis: "Wind/lateral on gable overhang.",
    quantityBasis: "Outriggers/blocking per LF @ 48\"; diagonal brace per <= 10 ft; straps per brace / per splice.",
    triggerKeywords: ["roof-framing", "gable", "outrigger", "lateral-bracing", "coil-strap", "nailing-pattern"],
    tags: ["simpson-cs18", "simpson-cs20"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 16 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Outriggers", spec: "2x4", qtyRule: "48\" o.c.", notes: "gable overhang lookouts" },
      { kind: "MEMBER", name: "Blocking (outer 2 bays)", spec: "2x", qtyRule: "48\" o.c." },
      { kind: "MEMBER", name: "Blocking at outriggers", spec: "2x", qtyRule: "adjacent to each outrigger" },
      { kind: "MEMBER", name: "Lateral member", spec: "2x6 'L'", notes: "(2) 16d nails per stud" },
      { kind: "MEMBER", name: "Diagonal brace", spec: "2x6 'T'", qtyRule: "<= 10 ft o.c.", notes: "(4) .131x3\" nails at gusset" },
      { kind: "MEMBER", name: "Ceiling-depth blocking", spec: "2x to match ceiling depth", qtyRule: "outer three framing bays" },
      { kind: "CONNECTOR", name: "Coil strap at braces", model: "Simpson CS20 x 16\"", qtyRule: "each side of each brace" },
      { kind: "CONNECTOR", name: "Coil strap at ply splice", model: "Simpson CS18 x 48\"", qtyRule: "where plywood is spliced within 8\" of ceiling level / per splice", isConditional: true },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S201 / Detail 16", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
      { projectName: "6 Genoa", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S201 / Detail 16", designCriteria: DC.genoa, deltaNotes: "Members/connectors identical; adds applicability line 'stick-framed gable bracing only req'd for stud height > 10 ft' (cosmetic)." },
    ],
  },
  {
    slug: "gable-end-bracing-truss",
    name: "Gable End Bracing (Height-Based Lateral Bracing)",
    category: "Roof Framing",
    discriminator: "gable-lateral-bracing",
    whenToUse: "Lateral bracing of stick-framed and truss gable ends that exceed allowable height limits.",
    methodSummary:
      "Brace by height. STICK-FRAMED: no lateral bracing within wall-framing-schedule limits; brace only elements exceeding allowable height. TRUSS-ROOF: <5' = none; 5'-8' = strengthening studs per Elevation A; >8' = bracing per Elevations B/C; >12' = two rows of horizontal bracing; >18' = consult engineer. Bracing members: a 2x6 over the brace length nailed to truss verticals with .131x3\" @ 12\" o.c.; a diagonal 2x6 'T' brace; a 2x4 on top of truss bottom chords extending >= 6' at <= 6'-0\" spacing; 2x blocking between bottom chords in the outer 3 bays; sheathing nailed to blocking @ 6\" o.c. all 4 sides.",
    codeBasis: "Wind/lateral; seismic per ASCE-7/16.",
    quantityBasis: "By gable element height (thresholds) and per LF of braced gable; blocking in outer 3 bays.",
    triggerKeywords: ["roof-framing", "gable", "lateral-bracing", "sheathing", "nailing-pattern", "stud"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S302 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Length brace", spec: "2x6 over length of brace", qtyRule: "per braced element", notes: "nailed to truss vertical elements" },
      { kind: "MEMBER", name: "Diagonal brace", spec: "2x6 'T'", notes: "top 2x6 'T'-nailed to lower 2x6" },
      { kind: "MEMBER", name: "Bottom-chord lateral", spec: "2x4 on top of truss bottom chords", qtyRule: "extend >= 6'; space <= 6'-0\"" },
      { kind: "MEMBER", name: "Bottom-chord blocking", spec: "2x blocking between bottom chords", qtyRule: "outer 3 bays, in line with 2x4" },
      { kind: "MEMBER", name: "Strengthening studs (5'-8')", spec: "per Elevation A", qtyRule: "per element", isConditional: true },
      { kind: "CONNECTOR", name: "Nails — 2x6 to truss verticals", spec: ".131\" x 3\"", qtyRule: "12\" o.c. / per LF" },
      { kind: "CONNECTOR", name: "Sheathing-to-blocking nails", spec: "per plan", qtyRule: "6\" o.c. all 4 sides / per panel" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S302", designCriteria: DC.chaplin, deltaNotes: "Canonical & only source." },
    ],
  },
  {
    slug: "dormer-framing",
    name: "Dormer Framing (Gable & Shed Dormer)",
    category: "Roof Framing",
    discriminator: "dormer",
    whenToUse: "Framing gable dormers and shed dormers over a lower roof.",
    methodSummary:
      "Frame dormer rafters as 2x8 or 2x10 @ 16\" o.c.; gable dormer uses a 2x10 ridge plate. Connect the end of each rafter with a Simpson H2.5A. The 2x dormer wall below attaches to supporting rafters per the over-framing detail OR with Simpson TS12 at each corner and then 48\" o.c.",
    codeBasis: "Wind uplift.",
    quantityBasis: "Rafters per LF; H2.5A per rafter; TS12 per corner and per 48\".",
    triggerKeywords: ["roof-framing", "dormer", "rafter", "gable", "hurricane-strap", "twist-strap", "wind-uplift"],
    tags: ["simpson-h2.5a", "simpson-ts12"],
    sourceFirm: FIRM,
    sourceRef: "S301 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Dormer rafters", spec: "2x8 or 2x10 at 16\" o.c.", qtyRule: "per LF", notes: "both gable and shed dormer" },
      { kind: "MEMBER", name: "Ridge plate (gable dormer)", spec: "2x10" },
      { kind: "MEMBER", name: "Dormer wall below", spec: "2x wall", notes: "attaches to supporting rafters" },
      { kind: "CONNECTOR", name: "Rafter uplift connector", model: "Simpson H2.5A", qtyRule: "1 per rafter", notes: "at end of each rafter" },
      { kind: "CONNECTOR", name: "Dormer-wall-to-rafter", model: "Simpson TS12", qtyRule: "at each corner and then 48\" o.c.", notes: "alt. to over-framing detail" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S301", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
      { projectName: "87 Mooring Buoy", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "January 14, 2026", status: "Signed & sealed", sourceRef: "S301", designCriteria: DC.mooring, deltaNotes: "Verified identical to canonical (Gable End + Shed Dormer)." },
    ],
  },
  {
    slug: "eave-blocking",
    name: "Eave Blocking (Options A / B / C, by Heel Height & SDC)",
    category: "Roof Framing",
    discriminator: "eave-blocking",
    whenToUse: "Providing eave blocking and/or continuous sheathing at the heel of trusses/rafters, selected by heel height 'H' and Seismic Design Category.",
    methodSummary:
      "Select by SDC and heel height H. SDC A/B/C: H <= 9-1/4\" no blocking; 9-1/4\" < H < 15-1/4\" sheathing per Option A or B; H > 15-1/4\" sheathing + blocking per Option C. SDC D0/D1/D2: H <= 15-1/4\" blocking or sheathing/blocking per A or C; H > 15-1/4\" blocking + sheathing per C. Option A = 2x or LVL blocking between each truss (2\" max sheathing-to-blocking). Option B = extend wall sheathing onto the heel, min (3) .131x2.5\" nails (not in SDC D). Option C = blocked panel (horizontal 2x top/bottom + vertical 2x adjacent to each truss; sheathing nailed all 4 sides).",
    codeBasis: "Seismic (ASCE-7/16) — keyed to SDC.",
    quantityBasis: "By SDC + heel height H; blocking per bay; heel sheathing per LF.",
    triggerKeywords: ["roof-framing", "eave", "sheathing", "lateral-bracing", "rafter", "nailing-pattern"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S302 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Blocking (Option A)", spec: "2x or LVL, between each truss", qtyRule: "per bay", notes: "2\" max sheathing-to-blocking" },
      { kind: "MEMBER", name: "Heel sheathing (Option B)", spec: "wall sheathing extended onto heel", qtyRule: "per LF", isConditional: true, notes: "only where soffit allows continuous sheathing; not in SDC D" },
      { kind: "MEMBER", name: "Option C horizontal members", spec: "2x top and bottom", qtyRule: "per bay" },
      { kind: "MEMBER", name: "Option C vertical members", spec: "2x adjacent to each truss", qtyRule: "per truss" },
      { kind: "CONNECTOR", name: "Heel sheathing nails (Option B)", spec: ".131 x 2.5\"", qtyRule: "min (3) per heel / per truss heel" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S302", designCriteria: DC.chaplin, deltaNotes: "Canonical & only source. Project is SDC C, so the A/B/C branch governs; SDC D branch kept for reuse." },
    ],
  },
  {
    slug: "rafter-splices-knee-wall",
    name: "Rafter Splices at Knee Wall",
    category: "Roof Framing",
    discriminator: "rafter-lap-over-knee-wall",
    whenToUse: "Where rafters splice/lap over a knee wall.",
    methodSummary:
      "Lap rafters >= 12\" each side of the knee wall. Knee wall studs are 2x4 or 2x6 @ 16\" o.c. Connect with Simpson H3 at each stud plus Simpson CS20x12\" at alternate studs. Carry uplift to the knee-wall base: Option A uses a Simpson CS20x48\" aligned with the CS20 above; Option B uses a Simpson MTS16 aligned with the CS20 above and a Simpson MTS16 aligned with uplift hardware below.",
    codeBasis: "Wind uplift / continuity at knee wall.",
    quantityBasis: "H3 per stud; CS20x12\" at alternate studs; base connectors per stud line per chosen option.",
    caveats: "Two options (A & B); select per condition. Distinct from 'New Roof at Existing' (which sisters NEW rafters to EXISTING using H2.5A + CS20x12 + CS20x24).",
    triggerKeywords: ["roof-framing", "knee-wall", "rafter", "stud", "hurricane-strap", "coil-strap", "wind-uplift", "continuous-load-path"],
    tags: ["simpson-h3", "simpson-cs20", "simpson-mts16"],
    sourceFirm: FIRM,
    sourceRef: "S302 (Chaplin)",
    components: [
      { kind: "MEMBER", name: "Knee wall studs", spec: "2x4's or 2x6's at 16\" o.c.", qtyRule: "per LF" },
      { kind: "MEMBER", name: "Rafter lap", spec: "12\" min each side of knee wall", qtyRule: "per splice" },
      { kind: "CONNECTOR", name: "Rafter/stud connector", model: "Simpson H3", qtyRule: "1 per stud", notes: "both options" },
      { kind: "CONNECTOR", name: "Strap at alt. studs", model: "Simpson CS20 x 12\"", qtyRule: "at alternate studs / per alternate stud" },
      { kind: "CONNECTOR", name: "Knee-wall base (Option A)", model: "Simpson CS20 x 48\"", qtyRule: "per stud line", notes: "aligned with CS20 above" },
      { kind: "CONNECTOR", name: "Knee-wall base (Option B)", model: "Simpson MTS16", qtyRule: "per stud line", notes: "one aligned w/ CS20 above; one aligned w/ uplift hardware below" },
    ],
    sources: [
      { projectName: "20 Chaplin", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "October 1, 2025", status: "Preliminary — NOT FOR CONSTRUCTION", sourceRef: "S302", designCriteria: DC.chaplin, deltaNotes: "Canonical source." },
      { projectName: "87 Mooring Buoy", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "January 14, 2026", status: "Signed & sealed", sourceRef: "S301", designCriteria: DC.mooring, deltaNotes: "Verified identical to canonical (Options A & B); on S301 here (sheet position cosmetic)." },
    ],
  },
  {
    slug: "new-roof-at-existing",
    name: "New Roof at Existing (Sister New Rafters to Existing)",
    category: "Roof Framing",
    discriminator: "roof-tie-in",
    whenToUse:
      "Tying a new roof into an existing roof on an addition/remodel — new rafters sistered to existing rafters and extended to bear on an existing knee wall (existing roof & knee wall remain).",
    methodSummary:
      "Sister each new rafter to the existing rafter with (2) rows of 16d nails @ 4\" o.c. staggered, and extend the new rafters to bear on the existing knee wall. At the knee-wall bearing, connect each stud with a Simpson H2.5A; add a Simpson CS20x12\" at alternate studs; and run a Simpson CS20x24\" from the stud to the beam below at alternate studs, aligned with the CS20 above — completing a continuous uplift load path down through the existing knee wall.",
    codeBasis: "Wind uplift / continuous load path, ASCE-7/16.",
    quantityBasis: "Sister nailing per LF of sistered rafter; H2.5A per stud; CS20x12\" & CS20x24\" per alternate stud.",
    caveats: "New-to-existing tie-in. Distinct from 'Rafter Splices at Knee Wall' (laps rafters; H3 + CS20x12 + CS20x48/MTS16 base).",
    triggerKeywords: ["roof-framing", "connectors-strapping", "rafter", "knee-wall", "new-to-existing", "addition", "wind-uplift", "continuous-load-path", "hurricane-strap", "coil-strap"],
    tags: ["simpson-h2.5a", "simpson-cs20"],
    sourceFirm: FIRM,
    sourceRef: "S201 / Detail 8 (Sycamore)",
    components: [
      { kind: "MEMBER", name: "New rafters", spec: "per plan", notes: "sistered to existing; extended to bear on existing knee wall" },
      { kind: "MEMBER", name: "Existing rafters", spec: "existing to remain", notes: "new rafters sister to these" },
      { kind: "MEMBER", name: "Existing knee wall", spec: "existing to remain", notes: "new rafters bear on it" },
      { kind: "CONNECTOR", name: "Sister nails (new-to-existing rafter)", spec: "16d nails", qtyRule: "(2) rows at 4\" o.c., staggered / per LF of sistered rafter" },
      { kind: "CONNECTOR", name: "Rafter / stud connector", model: "Simpson H2.5A", qtyRule: "1 per stud", notes: "at the knee-wall bearing" },
      { kind: "CONNECTOR", name: "Strap at alt. studs", model: "Simpson CS20 x 12\"", qtyRule: "at alternate studs / per alternate stud" },
      { kind: "CONNECTOR", name: "Stud-to-beam-below strap", model: "Simpson CS20 x 24\"", qtyRule: "at alternate studs / per alternate stud", notes: "align with CS20 above; continues uplift load path" },
    ],
    sources: [
      { projectName: "6 Sycamore", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 23, 2026", status: "Signed & sealed (working set)", sourceRef: "S201 / Detail 8", designCriteria: DC.sycamore, deltaNotes: "Canonical & only source. New-to-existing roof tie-in." },
    ],
  },
  {
    slug: "chimney-framing-strapping",
    name: "Chimney Framing & Strapping",
    category: "Roof Framing",
    discriminator: "chimney",
    whenToUse: "Framing a chimney chase through the roof/ceiling/floor framing and laterally strapping it.",
    methodSummary:
      "Install double rafters and double 2x headers around the chimney boundary; nail to the chimney with 2 rows of .131x3\" nails @ 8\" o.c. staggered. Strap the chimney framing to the framing below with Simpson CS20x24\". Chimney framing is balloon-framed from the lowest possible level below. For lateral bracing, strap each side of the chimney at eave height with a Simpson CS18, extending 8 ft onto the side of a double rafter each side.",
    codeBasis: "Wind/lateral on chimney chase; gravity at chase openings.",
    quantityBasis: "Boundary framing per perimeter; nailing per LF; CS20x24\" straps per framing level; one CS18 each side at eave height.",
    triggerKeywords: ["roof-framing", "connectors-strapping", "chimney", "rafter", "header", "coil-strap", "lateral-bracing", "nailing-pattern"],
    tags: ["simpson-cs18", "simpson-cs20"],
    sourceFirm: FIRM,
    sourceRef: "S301 (Heath)",
    components: [
      { kind: "MEMBER", name: "Boundary framing", spec: "double rafters + double 2x headers around chimney", qtyRule: "per boundary" },
      { kind: "MEMBER", name: "Chimney framing", spec: "balloon framing", notes: "from lowest possible level below" },
      { kind: "MEMBER", name: "Double rafter (strap target)", spec: "(2) rafters each side of chimney" },
      { kind: "CONNECTOR", name: "Boundary nailing", spec: ".131 x 3\" nails", qtyRule: "2 rows at 8\" o.c., staggered / per LF", notes: "double rafters/headers nailed to chimney" },
      { kind: "CONNECTOR", name: "Strap to framing below", model: "Simpson CS20 x 24\"", qtyRule: "per framing-level connection" },
      { kind: "CONNECTOR", name: "Eave-height lateral strap", model: "Simpson CS18", qtyRule: "each side of chimney at eave height", notes: "extend 8 ft onto side of double rafter" },
    ],
    sources: [
      { projectName: "38 Heath", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 12, 2026", status: "Working set", sourceRef: "S301 (Chimney Framing Elevation + Chimney Strapping)", designCriteria: DC.heath, deltaNotes: "Canonical & only source (both paired details)." },
    ],
  },
  {
    slug: "porch-ceiling-sheathing-tie-in",
    name: "Porch Ceiling Sheathing (Porch-to-House Tie-In)",
    category: "Roof Framing",
    discriminator: "porch-roof-tie-in",
    whenToUse: "Where a porch roof ties into the main structure (maintaining diaphragm/shear continuity at the porch-to-house interface).",
    methodSummary:
      "Where the porch roof ties into the main structure, extend the main roof sheathing and wall sheathing to the eave as shown. If the roof or wall sheathing does NOT continue to the eave, install a min 3/8\" bead board to the underside of the porch ceiling, attached with .113x3-3/8\" nails @ 8\" o.c.",
    codeBasis: "Lateral / diaphragm continuity.",
    quantityBasis: "Per LF of porch-to-main tie-in (sheathing extension), or per SF of porch ceiling (bead-board alternative).",
    triggerKeywords: ["roof-framing", "deck-porch", "sheathing", "porch", "lateral-bracing", "new-to-existing", "nailing-pattern"],
    tags: [],
    sourceFirm: FIRM,
    sourceRef: "S302 (Heath)",
    components: [
      { kind: "MEMBER", name: "Main roof + wall sheathing", spec: "extend to eave as shown", qtyRule: "per SF / per LF", notes: "preferred condition" },
      { kind: "MEMBER", name: "Bead board (alternative)", spec: "min 3/8\" bead board to underside of porch ceiling", qtyRule: "per SF", isConditional: true, notes: "only where sheathing does not continue to eave" },
      { kind: "CONNECTOR", name: "Bead-board nails", spec: ".113 x 3-3/8\" nails", qtyRule: "8\" o.c. / per LF", notes: "for the bead-board alternative" },
    ],
    sources: [
      { projectName: "38 Heath", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "March 12, 2026", status: "Working set", sourceRef: "S302", designCriteria: DC.heath, deltaNotes: "Canonical source." },
      { projectName: "6 Genoa", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "April 21, 2026", status: "Signed & sealed", sourceRef: "S301", designCriteria: DC.genoa, deltaNotes: "Verified identical to canonical." },
      { projectName: "87 Mooring Buoy", sourceFirm: FIRM, certNumber: "C03355", drawingDate: "January 14, 2026", status: "Signed & sealed", sourceRef: "S301", designCriteria: DC.mooring, deltaNotes: "Verified identical to canonical." },
    ],
  },

];

async function main() {
  let assemblies = 0;
  let components = 0;
  let sources = 0;

  for (let i = 0; i < ASSEMBLIES.length; i++) {
    const a = ASSEMBLIES[i];
    const canonical = {
      name: a.name,
      category: a.category,
      discriminator: a.discriminator ?? null,
      reviewStatus: "APPROVED" as const,
      isActive: true,
      whenToUse: a.whenToUse ?? null,
      methodSummary: a.methodSummary ?? null,
      codeBasis: a.codeBasis ?? null,
      quantityBasis: a.quantityBasis ?? null,
      caveats: a.caveats ?? null,
      unitOfAssembly: a.unitOfAssembly ?? null,
      triggerKeywords: a.triggerKeywords,
      tags: a.tags,
      sourceFirm: a.sourceFirm ?? null,
      engineerName: a.engineerName ?? null,
      engineerLicense: a.engineerLicense ?? null,
      sourceRef: a.sourceRef ?? null,
      sortOrder: i,
    };
    const saved = await prisma.engineeringAssembly.upsert({
      where: { slug: a.slug },
      update: canonical,
      create: { slug: a.slug, ...canonical },
    });
    assemblies++;

    // Idempotent children: clear + recreate so re-runs stay clean.
    await prisma.engineeringAssemblyComponent.deleteMany({ where: { assemblyId: saved.id } });
    if (a.components.length) {
      await prisma.engineeringAssemblyComponent.createMany({
        data: a.components.map((c, idx) => ({
          assemblyId: saved.id,
          kind: c.kind,
          name: c.name,
          spec: c.spec ?? null,
          model: c.model ?? null,
          qtyRule: c.qtyRule ?? null,
          unit: c.unit ?? null,
          isConditional: c.isConditional ?? false,
          notes: c.notes ?? null,
          sortOrder: idx,
        })),
      });
      components += a.components.length;
    }

    await prisma.engineeringAssemblySource.deleteMany({ where: { assemblyId: saved.id } });
    if (a.sources.length) {
      await prisma.engineeringAssemblySource.createMany({
        data: a.sources.map((s) => ({
          assemblyId: saved.id,
          projectName: s.projectName,
          sourceFirm: s.sourceFirm ?? null,
          engineerName: s.engineerName ?? null,
          engineerLicense: s.engineerLicense ?? null,
          certNumber: s.certNumber ?? null,
          drawingDate: s.drawingDate ?? null,
          status: s.status ?? null,
          sourceRef: s.sourceRef ?? null,
          designCriteria: s.designCriteria ?? null,
          deltaNotes: s.deltaNotes ?? null,
          rawMarkdown: s.rawMarkdown ?? null,
        })),
      });
      sources += a.sources.length;
    }
  }

  console.log(
    `Engineering assemblies seeded: ${assemblies} assemblies, ${components} components, ${sources} sources.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
