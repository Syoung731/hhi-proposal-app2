/**
 * Aggregate multiple Rendr room takeoffs into a single combined takeoff.
 * Used when multiple Rendr rooms map to one app section (e.g., "Primary Bathroom"
 * + "Toilet Room" in Rendr → single "Primary Bath" section).
 */

import type { ImperialRoomTakeoff } from "./types";

// Rendr returns measurements at 0.1 precision; summing as raw floats produces
// IEEE-754 drift (e.g. 30.4 + 28.0 → 58.400000000000006). Round summed
// continuous values back to 1 decimal so downstream display/math stays clean.
// Applied to single-takeoff path too — guards against any drift originating
// from Rendr's API itself.
function sumField(arr: ImperialRoomTakeoff[], fn: (t: ImperialRoomTakeoff) => number): number {
  const total = arr.reduce((acc, item) => acc + (fn(item) || 0), 0);
  return Math.round(total * 10) / 10;
}

export function aggregateRendrTakeoffs(
  takeoffs: ImperialRoomTakeoff[],
): ImperialRoomTakeoff {
  if (takeoffs.length === 0) {
    throw new Error("Cannot aggregate zero takeoffs");
  }

  return {
    // Area measurements: SUM (rounded to 0.1 precision via sumField)
    floorSF: sumField(takeoffs, (t) => t.floorSF),
    wallsSF: sumField(takeoffs, (t) => t.wallsSF),
    ceilingSF: sumField(takeoffs, (t) => t.ceilingSF),
    paintableSF: sumField(takeoffs, (t) => t.paintableSF),
    windowsSF: sumField(takeoffs, (t) => t.windowsSF),
    doorsSF: sumField(takeoffs, (t) => t.doorsSF),
    openingsSF: sumField(takeoffs, (t) => t.openingsSF),
    exteriorSF: sumField(takeoffs, (t) => t.exteriorSF),
    countertopsSF: sumField(takeoffs, (t) => t.countertopsSF),
    backsplashSF: sumField(takeoffs, (t) => t.backsplashSF),

    // Linear measurements: SUM (rounded to 0.1 precision via sumField)
    perimeterLF: sumField(takeoffs, (t) => t.perimeterLF),
    exteriorPerimeterLF: sumField(takeoffs, (t) => t.exteriorPerimeterLF),
    baseCabinetsLF: sumField(takeoffs, (t) => t.baseCabinetsLF),
    wallCabinetsLF: sumField(takeoffs, (t) => t.wallCabinetsLF),
    countertopsLF: sumField(takeoffs, (t) => t.countertopsLF),
    backsplashLF: sumField(takeoffs, (t) => t.backsplashLF),
    storageObjectsLF: sumField(takeoffs, (t) => t.storageObjectsLF),

    // Counts: SUM
    numberOfWindows: sumField(takeoffs, (t) => t.numberOfWindows),
    numberOfDoors: sumField(takeoffs, (t) => t.numberOfDoors),
    numberOfOpenings: sumField(takeoffs, (t) => t.numberOfOpenings),
    numberOfWalls: sumField(takeoffs, (t) => t.numberOfWalls),
    numberOfRooms: sumField(takeoffs, (t) => t.numberOfRooms),
    numberOfSinks: sumField(takeoffs, (t) => t.numberOfSinks),
    numberOfToilets: sumField(takeoffs, (t) => t.numberOfToilets),
    numberOfBathtubs: sumField(takeoffs, (t) => t.numberOfBathtubs),
    numberOfBaseCabinets: sumField(takeoffs, (t) => t.numberOfBaseCabinets),
    numberOfWallCabinets: sumField(takeoffs, (t) => t.numberOfWallCabinets),
    numberOfCountertops: sumField(takeoffs, (t) => t.numberOfCountertops),
    numberOfFirePlaces: sumField(takeoffs, (t) => t.numberOfFirePlaces),
    numberOfStairs: sumField(takeoffs, (t) => t.numberOfStairs),
    // Appliances & furniture
    numberOfOvens: sumField(takeoffs, (t) => t.numberOfOvens),
    numberOfStoves: sumField(takeoffs, (t) => t.numberOfStoves),
    numberOfRefrigerators: sumField(takeoffs, (t) => t.numberOfRefrigerators),
    numberOfDishwashers: sumField(takeoffs, (t) => t.numberOfDishwashers),
    numberOfWasherDryer: sumField(takeoffs, (t) => t.numberOfWasherDryer),
    numberOfBeds: sumField(takeoffs, (t) => t.numberOfBeds),
    numberOfSofas: sumField(takeoffs, (t) => t.numberOfSofas),
    numberOfChairs: sumField(takeoffs, (t) => t.numberOfChairs),
    numberOfTables: sumField(takeoffs, (t) => t.numberOfTables),
    numberOfTelevisions: sumField(takeoffs, (t) => t.numberOfTelevisions),
    numberOfStorageObjects: sumField(takeoffs, (t) => t.numberOfStorageObjects),
    numberOfObjects: sumField(takeoffs, (t) => t.numberOfObjects),

    description: takeoffs.map((t) => t.description).filter(Boolean).join(" + "),
  };
}
