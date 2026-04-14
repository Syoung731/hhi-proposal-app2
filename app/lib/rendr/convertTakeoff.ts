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

function convertRoomTakeoff(raw: RendrRoomTakeoff): ImperialRoomTakeoff {
  return {
    floorSF: sqmToSqft(raw.areaInSqMeters),
    wallsSF: sqmToSqft(raw.wallsAreaInSqMeters),
    ceilingSF: sqmToSqft(raw.ceilingAreaInSqMeters),
    perimeterLF: metersToLF(raw.perimeterInMeters),
    paintableSF: sqmToSqft(raw.totalPaintableSurfaceAreaInSqMeters),
    windowsSF: sqmToSqft(raw.windowsAreaInSqMeters),
    doorsSF: sqmToSqft(raw.doorsAreaInSqMeters),
    baseCabinetsLF: metersToLF(raw.baseCabinetsLengthInMeters),
    wallCabinetsLF: metersToLF(raw.wallCabinetsLengthInMeters),
    countertopsLF: metersToLF(raw.countertopsLengthInMeters),
    countertopsSF: sqmToSqft(raw.countertopsAreaInSqMeters),
    backsplashSF: sqmToSqft(raw.backsplashAreaInSqMeters),
    backsplashLF: metersToLF(raw.backsplashLengthInMeters),
    // Counts pass through
    numberOfWindows: raw.numberOfWindows,
    numberOfDoors: raw.numberOfDoors,
    numberOfSinks: raw.numberOfSinks,
    numberOfToilets: raw.numberOfToilets,
    numberOfBathtubs: raw.numberOfBathtubs,
    numberOfBaseCabinets: raw.numberOfBaseCabinets,
    numberOfWallCabinets: raw.numberOfWallCabinets,
    numberOfFirePlaces: raw.numberOfFirePlaces,
    numberOfStairs: raw.numberOfStairs,
    description: raw.description,
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
