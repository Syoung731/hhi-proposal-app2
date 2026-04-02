import type { ProposalPageConfig } from "./page-model";

/**
 * Mock page configuration for view-v2.
 * TODO: Replace with real config from admin page-builder (e.g. proposal.publicLayoutConfig.pages or dedicated proposal_pages table).
 */
export function getMockProposalPages(): ProposalPageConfig {
  return [
    {
      id: "page-cover",
      type: "cover",
      layoutKey: "hero-image",
      order: 0,
      isEnabled: true,
      title: null,
      dataSource: "snapshot",
      overrides: null,
    },
    {
      id: "page-objective",
      type: "objective",
      layoutKey: "statement-left",
      order: 1,
      isEnabled: true,
      title: null,
      dataSource: "snapshot",
      overrides: null,
    },
    {
      id: "page-scope",
      type: "scope",
      layoutKey: "room-cards",
      order: 2,
      isEnabled: true,
      title: "Scope",
      dataSource: "snapshot",
      overrides: null,
    },
    {
      id: "page-timeline",
      type: "timeline",
      layoutKey: "horizontal-steps",
      order: 3,
      isEnabled: true,
      title: null,
      dataSource: "snapshot",
      overrides: null,
    },
    {
      id: "page-investment",
      type: "investment",
      layoutKey: "table-callout",
      order: 4,
      isEnabled: true,
      title: null,
      dataSource: "snapshot",
      overrides: null,
    },
    {
      id: "page-closing",
      type: "closing",
      layoutKey: "image-driven",
      order: 5,
      isEnabled: true,
      title: null,
      dataSource: "snapshot",
      overrides: null,
    },
  ];
}
