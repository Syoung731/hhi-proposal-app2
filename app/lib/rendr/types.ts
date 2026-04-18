/**
 * TypeScript types for Rendr API v3 responses.
 * Server-side only — never import from client components.
 */

// ---------------------------------------------------------------------------
// Raw Rendr API types (metric values)
// ---------------------------------------------------------------------------

/**
 * Full TakeOff schema from Rendr API v3.
 * All area fields in square meters, all linear fields in meters.
 * See docs/rendr-api-reference.md for complete field listing.
 */
export interface RendrRoomTakeoff {
  // Area measurements (sq meters)
  areaInSqMeters: number;
  wallsAreaInSqMeters: number;
  ceilingAreaInSqMeters: number;
  totalPaintableSurfaceAreaInSqMeters: number;
  windowsAreaInSqMeters: number;
  doorsAreaInSqMeters: number;
  openingsAreaInSqMeters: number;
  exteriorAreaInSqMeters: number;
  countertopsAreaInSqMeters: number;
  backsplashAreaInSqMeters: number;
  // Linear measurements (meters)
  perimeterInMeters: number;
  exteriorPerimeterInMeters: number;
  baseCabinetsLengthInMeters: number;
  wallCabinetsLengthInMeters: number;
  countertopsLengthInMeters: number;
  backsplashLengthInMeters: number;
  storageObjectsLengthInMeters: number;
  // Counts — construction-relevant
  numberOfWindows: number;
  numberOfDoors: number;
  numberOfOpenings: number;
  numberOfWalls: number;
  numberOfRooms: number;
  numberOfSinks: number;
  numberOfToilets: number;
  numberOfBathtubs: number;
  numberOfBaseCabinets: number;
  numberOfWallCabinets: number;
  numberOfCountertops: number;
  numberOfFirePlaces: number;
  numberOfStairs: number;
  // Counts — appliances & furniture
  numberOfOvens: number;
  numberOfStoves: number;
  numberOfRefrigerators: number;
  numberOfDishwashers: number;
  numberOfWasherDryer: number;
  numberOfBeds: number;
  numberOfSofas: number;
  numberOfChairs: number;
  numberOfTables: number;
  numberOfTelevisions: number;
  numberOfStorageObjects: number;
  numberOfObjects: number;
  // Other
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

export interface RendrPhoto {
  id: string;
  created: string;
  modified: string;
  space_id: string;
  space_photo_url: string;
  space_photo_thumbnail_url: string;
  photo_annotation_data_url: string;
  photo_annotation_thumbnail_url: string;
  file_limit_reached: boolean;
}

export interface RendrSpace {
  id: number;
  title: string;
  created: string;
  modified: string;
  flex_file_uuid: string | null;
  flex_file_version: number;
  notes: string;
  deleted: boolean;
}

/** Full space detail response (includes photos, file URLs, etc.) */
export interface RendrSpaceDetail extends RendrSpace {
  space_external_id: string;
  file_id: string;
  file_version: string;
  saved_date: string;
  field_notes: string | null;
  field_notes_updated: string | null;
  space_file_url: string | null;
  invite_id: string | null;
  user_external_id: string;
  photos: RendrPhoto[];
}

export interface RendrProject {
  id: string;
  name: string;
  description: string;
  created: string;
  owner: string;
  spaces?: RendrSpace[];
}

export interface RendrPagination {
  total_records: number;
  per_page: number;
  current_page: number;
  prev_page: number | null;
  next_page: number | null;
  total_pages: number;
}

export interface RendrPaginatedResponse<T> {
  items: T[];
  pagination: RendrPagination;
}

export type RendrProjectsResponse = RendrPaginatedResponse<RendrProject>;
export type RendrSpacesResponse = RendrPaginatedResponse<RendrSpace>;

// ---------------------------------------------------------------------------
// Converted imperial types (returned to frontend)
// ---------------------------------------------------------------------------

export interface ImperialRoomTakeoff {
  // Area measurements (SF)
  floorSF: number;
  wallsSF: number;
  ceilingSF: number;
  paintableSF: number;
  windowsSF: number;
  doorsSF: number;
  openingsSF: number;
  exteriorSF: number;
  countertopsSF: number;
  backsplashSF: number;
  // Linear measurements (LF)
  perimeterLF: number;
  exteriorPerimeterLF: number;
  baseCabinetsLF: number;
  wallCabinetsLF: number;
  countertopsLF: number;
  backsplashLF: number;
  storageObjectsLF: number;
  // Counts — construction-relevant
  numberOfWindows: number;
  numberOfDoors: number;
  numberOfOpenings: number;
  numberOfWalls: number;
  numberOfRooms: number;
  numberOfSinks: number;
  numberOfToilets: number;
  numberOfBathtubs: number;
  numberOfBaseCabinets: number;
  numberOfWallCabinets: number;
  numberOfCountertops: number;
  numberOfFirePlaces: number;
  numberOfStairs: number;
  // Counts — appliances & furniture
  numberOfOvens: number;
  numberOfStoves: number;
  numberOfRefrigerators: number;
  numberOfDishwashers: number;
  numberOfWasherDryer: number;
  numberOfBeds: number;
  numberOfSofas: number;
  numberOfChairs: number;
  numberOfTables: number;
  numberOfTelevisions: number;
  numberOfStorageObjects: number;
  numberOfObjects: number;
  // Other
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
