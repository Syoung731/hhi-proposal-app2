/**
 * Shape of the JSON stored in PublishedSnapshot. Must be serializable and sufficient
 * to render the public proposal page without touching the database.
 */
export type SnapshotData = {
  version: number;
  project: {
    title: string;
    subtitle: string | null;
    address: string | null;
    clientNames: string | null;
    coverHeroImageId: string | null;
    objective: string | null;
  };
  rooms: Array<{
    id: string;
    roomType: string;
    roomLabel: string | null;
    scopeNarrative: string;
    sortOrder: number;
  }>;
  media: Array<{
    id: string;
    roomId: string | null;
    kind: string;
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
    rangeHigh: number | null;
    notes: string | null;
    sortOrder: number;
  }>;
};
