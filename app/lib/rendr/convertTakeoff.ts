/**
 * Convert raw Rendr metric takeoff data to imperial units.
 */

import { sqmToSqft, metersToLF } from "./conversions";
import type {
  RendrRoomTakeoff,
  RendrTakeoffData,
  ImperialRoomTakeoff,
  ImperialRoom,
  ImperialTakeoffData,
} from "./types";

/** Safely read a numeric field that may be undefined in older scans. */
const n = (v: number | undefined | null): number => v ?? 0;

function convertRoomTakeoff(raw: RendrRoomTakeoff): ImperialRoomTakeoff {
  return {
    // Area conversions
    floorSF: sqmToSqft(n(raw.areaInSqMeters)),
    wallsSF: sqmToSqft(n(raw.wallsAreaInSqMeters)),
    ceilingSF: sqmToSqft(n(raw.ceilingAreaInSqMeters)),
    paintableSF: sqmToSqft(n(raw.totalPaintableSurfaceAreaInSqMeters)),
    windowsSF: sqmToSqft(n(raw.windowsAreaInSqMeters)),
    doorsSF: sqmToSqft(n(raw.doorsAreaInSqMeters)),
    openingsSF: sqmToSqft(n(raw.openingsAreaInSqMeters)),
    exteriorSF: sqmToSqft(n(raw.exteriorAreaInSqMeters)),
    countertopsSF: sqmToSqft(n(raw.countertopsAreaInSqMeters)),
    backsplashSF: sqmToSqft(n(raw.backsplashAreaInSqMeters)),
    // Linear conversions
    perimeterLF: metersToLF(n(raw.perimeterInMeters)),
    exteriorPerimeterLF: metersToLF(n(raw.exteriorPerimeterInMeters)),
    baseCabinetsLF: metersToLF(n(raw.baseCabinetsLengthInMeters)),
    wallCabinetsLF: metersToLF(n(raw.wallCabinetsLengthInMeters)),
    countertopsLF: metersToLF(n(raw.countertopsLengthInMeters)),
    backsplashLF: metersToLF(n(raw.backsplashLengthInMeters)),
    storageObjectsLF: metersToLF(n(raw.storageObjectsLengthInMeters)),
    // Counts — construction-relevant
    numberOfWindows: n(raw.numberOfWindows),
    numberOfDoors: n(raw.numberOfDoors),
    numberOfOpenings: n(raw.numberOfOpenings),
    numberOfWalls: n(raw.numberOfWalls),
    numberOfRooms: n(raw.numberOfRooms),
    numberOfSinks: n(raw.numberOfSinks),
    numberOfToilets: n(raw.numberOfToilets),
    numberOfBathtubs: n(raw.numberOfBathtubs),
    numberOfBaseCabinets: n(raw.numberOfBaseCabinets),
    numberOfWallCabinets: n(raw.numberOfWallCabinets),
    numberOfCountertops: n(raw.numberOfCountertops),
    numberOfFirePlaces: n(raw.numberOfFirePlaces),
    numberOfStairs: n(raw.numberOfStairs),
    // Counts — appliances & furniture
    numberOfOvens: n(raw.numberOfOvens),
    numberOfStoves: n(raw.numberOfStoves),
    numberOfRefrigerators: n(raw.numberOfRefrigerators),
    numberOfDishwashers: n(raw.numberOfDishwashers),
    numberOfWasherDryer: n(raw.numberOfWasherDryer),
    numberOfBeds: n(raw.numberOfBeds),
    numberOfSofas: n(raw.numberOfSofas),
    numberOfChairs: n(raw.numberOfChairs),
    numberOfTables: n(raw.numberOfTables),
    numberOfTelevisions: n(raw.numberOfTelevisions),
    numberOfStorageObjects: n(raw.numberOfStorageObjects),
    numberOfObjects: n(raw.numberOfObjects),
    // Other
    description: raw.description ?? "",
  };
}

export function convertTakeoffData(raw: RendrTakeoffData): ImperialTakeoffData {
  return {
    flexFileUuid: raw.flex_file_uuid,
    flexFileVersion: raw.flex_file_version,
    spaceTakeoff: convertRoomTakeoff(raw.space.spaceTakeoff),
    rooms: raw.space.rooms.map((r) => ({
      label: r.label,
      takeoff: convertRoomTakeoff(r.roomTakeoff),
    })),
  };
}
