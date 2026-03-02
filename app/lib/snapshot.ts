/**
 * Shape of the JSON stored in PublishedSnapshot. Must be serializable and sufficient
 * to render the public proposal page without touching the database.
 */
export type SnapshotData = {
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
};
