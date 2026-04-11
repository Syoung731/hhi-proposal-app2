import type { ProposalDeck } from "./types";

/**
 * Mock deck used while real DB-backed deck config doesn't exist yet.
 * Replace with a real `getDeckForProposal(proposalId)` call in Phase 2.
 */
export function getMockDeck(
  overrides?: Partial<ProposalDeck>
): ProposalDeck {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return {
    id: "mock-deck-1",
    proposalId: "mock",
    projectTitle: "34 Sussex Lane — Multiple Bathroom + Laundry Updates",
    clientName: "Dan Milligan",
    address: "34 Sussex Lane, Hilton Head, SC 29926",
    slides: [
      {
        id: "slide-cover",
        type: "cover",
        layoutKey: "right-panel-overlay",
        order: 0,
        isEnabled: true,
        isLocked: true,
        lockPosition: "first" as const,
        headline: "34 Sussex Lane",
        subheadline: "Multiple Bathroom + Laundry Updates",
        content: {
          heroImageUrl: null,
          preparedFor: "Dan Milligan",
          date: today,
        },
      },
      {
        id: "slide-objective",
        type: "objective",
        layoutKey: "light-statement",
        order: 1,
        isEnabled: true,
        headline: "Project Objective",
        subheadline: "Refined Modernization",
        content: {
          statementText:
            "Our objective is to deliver a high-quality, cohesive remodel that modernizes your bathrooms and laundry while minimizing disruption to your daily life.",
          supportingText:
            "We will manage permitting, site protection, debris removal, and professional cleaning so the project proceeds smoothly and your home stays safe and clean.",
          bullets: [],
        },
      },
      {
        id: "slide-investment",
        type: "investment",
        layoutKey: "table-callout",
        order: 3,
        isEnabled: true,
        headline: "Projected Investment",
        content: {
          lineItems: [
            {
              id: "li-1",
              label: "Primary Bathroom",
              rangeLow: 20000,
              rangeHigh: 25000,
            },
            {
              id: "li-2",
              label: "Hall Bathroom",
              rangeLow: 12000,
              rangeHigh: 16000,
            },
            {
              id: "li-3",
              label: "Laundry Room",
              rangeLow: 8000,
              rangeHigh: 12000,
            },
            {
              id: "li-4",
              label: "Cost of Project Execution",
              rangeLow: 15000,
              rangeHigh: 20000,
              isCope: true,
            },
          ],
          retainerLabel: "Design / Feasibility Retainer",
          retainerAmount: 10000,
          disclaimer:
            "This is an initial project budget range based on the scope provided.",
          address: "34 Sussex Lane, Hilton Head, South Carolina 29926",
        },
      },
      // ── Scope Overview ──────────────────────────────────────────────────
      {
        id: "slide-scope-overview",
        type: "scope-overview" as const,
        layoutKey: "split-panel" as const,
        order: 2,
        isEnabled: true,
        headline: "What We're Building",
        content: {
          description:
            "This project covers a full modernization of three bathrooms and the laundry room. We will coordinate all trades, manage permitting, and protect the home throughout construction. Every detail is planned before a single wall is touched—so the schedule and budget stay exactly where we said they would.",
          selectedPhotos: [],
        },
      },
      // ── Why Us ──────────────────────────────────────────────────────────
      {
        id: "slide-why-us",
        type: "why-us" as const,
        layoutKey: "pillars-grid" as const,
        order: 4,
        isEnabled: true,
        headline: "The HHI Difference",
        content: {
          // Pillars are empty here — page.tsx injects them from the DB at load time
          sectionTitle: null,
          pillars: [],
          selectedPillarIds: [],
        },
      },
    ],
    ...overrides,
  };
}
