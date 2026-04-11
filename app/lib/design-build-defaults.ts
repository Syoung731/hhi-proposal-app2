import type {
  DesignBuildPillar,
  DesignBuildGuarantee,
  DesignBuildDiagramNode,
  DesignBuildSupportColumn,
  DesignBuildAdvantageLayoutKey,
} from "./deck/types";

export const DEFAULT_PILLARS: DesignBuildPillar[] = [
  {
    id: "single-source",
    icon: "Users",
    title: "Single-Source Accountability",
    description:
      "One team manages design and construction from start to finish. No finger-pointing, no miscommunication between trades.",
  },
  {
    id: "budget-first",
    icon: "DollarSign",
    title: "Budget-First Design",
    description:
      "Your budget is established before design begins, so every decision is made with cost certainty built in.",
  },
  {
    id: "fixed-price",
    icon: "Shield",
    title: "Fixed-Price Build Contract",
    description:
      "You receive a locked contract before construction starts. No surprises, no change-order chaos.",
  },
];

export const DEFAULT_GUARANTEES: DesignBuildGuarantee[] = [
  {
    id: "price-guarantee",
    title: "Price Certainty",
    description:
      "Your build contract is fixed before construction begins. The price you approve is the price you pay \u2014 period.",
  },
  {
    id: "timeline-guarantee",
    title: "Timeline Commitment",
    description:
      "We publish a detailed construction schedule and hold ourselves accountable to every milestone date.",
  },
];

export const DEFAULT_DIAGRAM_NODES: DesignBuildDiagramNode[] = [
  { id: "design", label: "Design" },
  { id: "permit", label: "Permit" },
  { id: "procurement", label: "Procurement" },
  { id: "build", label: "Build" },
];

export const DEFAULT_SUPPORT_COLUMNS: DesignBuildSupportColumn[] = [
  {
    id: "col-1",
    title: "Unified Vision",
    description:
      "Design and construction teams collaborate from day one, eliminating the costly gaps between separate firms.",
  },
  {
    id: "col-2",
    title: "Budget Control",
    description:
      "Real-time cost tracking against your fixed contract ensures no surprises at any stage of the project.",
  },
  {
    id: "col-3",
    title: "Faster Delivery",
    description:
      "Overlapping design and procurement phases compress your timeline without sacrificing quality.",
  },
];

export interface GlobalDesignBuildSettings {
  defaultLayout: DesignBuildAdvantageLayoutKey;
  defaultHeadline: string;
  defaultPillars: DesignBuildPillar[];
  defaultGuarantees: DesignBuildGuarantee[];
  defaultDiagramNodes: DesignBuildDiagramNode[];
  defaultSupportColumns: DesignBuildSupportColumn[];
}

export const HHI_DESIGN_BUILD_DEFAULTS: GlobalDesignBuildSettings = {
  defaultLayout: "icon-cards",
  defaultHeadline: "The Design-Build Advantage",
  defaultPillars: DEFAULT_PILLARS,
  defaultGuarantees: DEFAULT_GUARANTEES,
  defaultDiagramNodes: DEFAULT_DIAGRAM_NODES,
  defaultSupportColumns: DEFAULT_SUPPORT_COLUMNS,
};
