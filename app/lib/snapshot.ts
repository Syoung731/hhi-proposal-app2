/**
 * Shape of the JSON stored in PublishedSnapshot. Must be serializable and sufficient
 * to render the public proposal page without touching the database.
 *
 * Schema discriminator:
 *   - "v1-legacy" — original page-by-page shape (project + rooms + media + timeline + investment).
 *     Old snapshot rows in the DB may lack the `schema` field entirely; readers should treat
 *     `undefined` as "v1-legacy" for backward compatibility.
 *   - "v2-deck"   — same legacy fields PLUS a serialized `deck` payload of DeckSlide rows,
 *     written by the post-Cleanup C publish flow.
 */
export type SnapshotData = {
  schema: "v1-legacy" | "v2-deck";
  version: number;
  project: {
    title: string;
    subtitle: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    client1First?: string | null;
    client1Last?: string | null;
    client2First?: string | null;
    client2Last?: string | null;
    /** @deprecated use addressLine1 etc.; kept for reading old snapshots */
    address?: string | null;
    /** @deprecated use client1First etc.; kept for reading old snapshots */
    clientNames?: string | null;
    coverHeroImageId: string | null;
    objective: string | null;
  };
  rooms: Array<{
    id: string;
    name: string;
    scopeNarrative: string;
    sortOrder: number;
  }>;
  media: Array<{
    id: string;
    roomId: string | null;
    kind: string;
    type?: string;
    url: string;
    caption: string | null;
    tags: string[];
    sortOrder: number;
  }>;
  timelinePhases: Array<{
    id: string;
    phase: string;
    durationText: string;
    sortOrder: number;
  }>;
  investmentLineItems: Array<{
    id: string;
    label: string;
    rangeLow: number | null;
    rangeTarget?: number | null;
    rangeHigh: number | null;
    notes: string | null;
    sortOrder: number;
    includeInTotals?: boolean;
  }>;
  /** Present iff schema === "v2-deck". Snapshot of the project's ProposalDeck at publish time. */
  deck?: SerializedDeck;
};

/**
 * Snapshot-frozen copy of a ProposalDeck. The renderer reads project.title etc. from the
 * outer SnapshotData.project — no need to repeat it here.
 */
export type SerializedDeck = {
  id: string;
  slides: SerializedDeckSlide[];
};

/**
 * Snapshot-frozen copy of a DeckSlide. Mirrors the DeckSlide DB columns 1:1, omitting:
 *   - deckId    (implicit from parent)
 *   - createdAt (irrelevant in snapshot)
 *   - updatedAt (irrelevant in snapshot)
 *
 * Note: aiBackground lives inside `content` JSON, not as a top-level column — see
 * app/lib/deck/db.ts for the convention.
 */
export type SerializedDeckSlide = {
  id: string;
  type: string;
  layoutKey: string;
  order: number;
  isEnabled: boolean;
  isUserHidden: boolean;
  isUserModified: boolean;
  source: string;
  sectionId: string | null;
  headline: string | null;
  subheadline: string | null;
  body: string | null;
  content: Record<string, unknown> | null;
  isLocked: boolean;
  lockPosition: string | null;
  backgroundId: string | null;
  textZone: Record<string, unknown> | null;
};
