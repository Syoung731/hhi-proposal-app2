import type { CraftsmanshipItem } from "./deck/types";

/** HHI's standard build-quality proofs. Photos are picked per project from
 *  the media library — the copy ships ready to present. */
export const HHI_DEFAULT_CRAFTSMANSHIP_ITEMS: CraftsmanshipItem[] = [
  {
    id: "dovetail-joinery",
    title: "Dovetail Drawer Joinery",
    description:
      "Solid-wood drawer boxes with hand-fit dovetail joints and full-extension, soft-close hardware — no staples, no shortcuts.",
    column: "a",
  },
  {
    id: "stone-fabrication",
    title: "Full-Slab Stone Fabrication",
    description:
      "Mitered edges, book-matched seams placed out of sightlines, and templated cutouts verified on site before fabrication.",
    column: "a",
  },
  {
    id: "waterproofing",
    title: "Waterproofing Membrane Systems",
    description:
      "Every wet area gets a continuous bonded membrane and flood-tested pan — protection you'll never see and never need to think about.",
    column: "a",
  },
  {
    id: "finish-carpentry",
    title: "Precision Finish Carpentry",
    description:
      "Scribed-to-wall casework, consistent reveals, and back-beveled miters that stay tight through seasonal movement.",
    column: "b",
  },
  {
    id: "level-finishes",
    title: "Level-5 Paint & Finish Standards",
    description:
      "Skim-coated surfaces, sprayed cabinetry-grade finishes, and raking-light inspections before we call anything done.",
    column: "b",
  },
  {
    id: "lighting-detail",
    title: "Layered LED Detailing",
    description:
      "Under-cabinet, toe-kick, and cove lighting integrated into the millwork with hidden drivers and uniform color temperature.",
    column: "b",
  },
];

export const CRAFTSMANSHIP_DEFAULTS = {
  sectionLabel: "BUILT TO LAST",
  headline: "Material & Assembly Standards",
  introText:
    "The details below are standard on every HHI build — not upgrades.",
  columnATitle: "Structural & Preparation",
  columnBTitle: "Finish & Function",
} as const;
