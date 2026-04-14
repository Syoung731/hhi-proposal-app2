/**
 * TypeScript types for Rendr API v3 responses.
 * Server-side only — never import from client components.
 */

// ---------------------------------------------------------------------------
// Raw Rendr API types (metric values)
// ---------------------------------------------------------------------------

export interface RendrRoomTakeoff {
  areaInSqMeters: number;
  wallsAreaInSqMeters: number;
  ceilingAreaInSqMeters: number;
  perimeterInMeters: number;
  totalPaintableSurfaceAreaInSqMeters: number;
  numberOfWindows: number;
  windowsAreaInSqMeters: number;
  numberOfDoors: number;
  doorsAreaInSqMeters: number;
  numberOfSinks: number;
  numberOfToilets: number;
  numberOfBathtubs: number;
  numberOfBaseCabinets: number;
  baseCabinetsLengthInMeters: number;
  numberOfWallCabinets: number;
  wallCabinetsLengthInMeters: number;
  countertopsLengthInMeters: number;
  countertopsAreaInSqMeters: number;
  backsplashAreaInSqMeters: number;
  backsplashLengthInMeters: number;
  numberOfFirePlaces: number;
  numberOfStairs: number;
  description: string;
}

export interface RendrRoom {
  label: string;
  roomTakeoff: RendrRoomTakeoff;
}

export interface RendrTakeoffData {
  flex_file_uuid: string;
  flex_file_version: number;
  space: {
    spaceTakeoff: RendrRoomTakeoff;
    rooms: RendrRoom[];
  };
}

export interface RendrSpace {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface RendrProject {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  spaces?: RendrSpace[];
}

export interface RendrPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type RendrProjectsResponse = RendrPaginatedResponse<RendrProject>;
export type RendrSpacesResponse = RendrPaginatedResponse<RendrSpace>;

// ---------------------------------------------------------------------------
// Converted imperial types (returned to frontend)
// ---------------------------------------------------------------------------

export interface ImperialRoomTakeoff {
  floorSF: number;
  wallsSF: number;
  ceilingSF: number;
  perimeterLF: number;
  paintableSF: number;
  windowsSF: number;
  doorsSF: number;
  baseCabinetsLF: number;
  wallCabinetsLF: number;
  countertopsLF: number;
  countertopsSF: number;
  backsplashSF: number;
  backsplashLF: number;
  // Count fields pass through unchanged
  numberOfWindows: number;
  numberOfDoors: number;
  numberOfSinks: number;
  numberOfToilets: number;
  numberOfBathtubs: number;
  numberOfBaseCabinets: number;
  numberOfWallCabinets: number;
  numberOfFirePlaces: number;
  numberOfStairs: number;
  description: string;
}

export interface ImperialRoom {
  label: string;
  takeoff: ImperialRoomTakeoff;
}

export interface ImperialTakeoffData {
  flexFileUuid: string;
  flexFileVersion: number;
  spaceTakeoff: ImperialRoomTakeoff;
  rooms: ImperialRoom[];
}
