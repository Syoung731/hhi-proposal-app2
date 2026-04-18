/**
 * Build a human-readable Rendr measurement context string for AI prompts.
 * Used by scope rewrite, scope review, and estimate prompt builders.
 */

interface RendrContextRoom {
  measurementSource?: string | null;
  areaSqFt?: number | null;
  wallsSF?: number | null;
  ceilingSF?: number | null;
  perimeterLF?: number | null;
  paintableSF?: number | null;
  windowCount?: number | null;
  windowsSF?: number | null;
  doorCount?: number | null;
  doorsSF?: number | null;
  roomDetail?: unknown;
}

/**
 * Returns a multi-line string describing Rendr measurements for a room,
 * or null if the room has no Rendr data.
 */
export function buildRendrContextString(room: RendrContextRoom): string | null {
  if (room.measurementSource !== "rendr") return null;

  const lines: string[] = [];

  // Core measurements
  const coreItems: string[] = [];
  if (room.areaSqFt) coreItems.push(`Floor: ${room.areaSqFt} SF`);
  if (room.wallsSF) coreItems.push(`Walls: ${room.wallsSF} SF`);
  if (room.ceilingSF) coreItems.push(`Ceiling: ${room.ceilingSF} SF`);
  if (coreItems.length) lines.push(coreItems.join(", "));

  const linearItems: string[] = [];
  if (room.perimeterLF) linearItems.push(`Perimeter: ${room.perimeterLF} LF`);
  if (room.paintableSF) linearItems.push(`Paintable: ${room.paintableSF} SF`);
  if (linearItems.length) lines.push(linearItems.join(", "));

  // Derived ceiling
  if (room.wallsSF && room.perimeterLF && room.perimeterLF > 0) {
    const derivedCeiling = room.wallsSF / room.perimeterLF;
    lines.push(`Derived Ceiling Height: ${derivedCeiling.toFixed(1)} ft`);
  }

  // Openings
  const openings: string[] = [];
  if (room.windowCount) openings.push(`Windows: ${room.windowCount}${room.windowsSF ? ` (${room.windowsSF} SF)` : ""}`);
  if (room.doorCount) openings.push(`Doors: ${room.doorCount}${room.doorsSF ? ` (${room.doorsSF} SF)` : ""}`);
  if (openings.length) lines.push(openings.join(", "));

  // Fixture data from roomDetail
  const detail = room.roomDetail as Record<string, unknown> | null;
  if (detail) {
    const fixtures: string[] = [];
    if (detail.baseCabinetCountExisting) fixtures.push(`Base Cabinets: ${detail.baseCabinetCountExisting}${detail.baseCabinetLfExisting ? ` (${detail.baseCabinetLfExisting} LF)` : ""}`);
    if (detail.wallCabinetCountExisting) fixtures.push(`Wall Cabinets: ${detail.wallCabinetCountExisting}${detail.wallCabinetLfExisting ? ` (${detail.wallCabinetLfExisting} LF)` : ""}`);
    if (detail.vanityCabinetCountExisting) fixtures.push(`Vanity: ${detail.vanityCabinetCountExisting}${detail.vanityCabinetLfExisting ? ` (${detail.vanityCabinetLfExisting} LF)` : ""}`);
    if (detail.countertopSfExisting) fixtures.push(`Countertop: ${detail.countertopSfExisting} SF`);
    if (detail.backsplashSfExisting) fixtures.push(`Backsplash: ${detail.backsplashSfExisting} SF`);
    if (detail.sinkCountExisting) fixtures.push(`Sinks: ${detail.sinkCountExisting}`);
    if (detail.toiletCountExisting) fixtures.push(`Toilets: ${detail.toiletCountExisting}`);

    const appliances: string[] = [];
    if (detail.hasStoveExisting === true) appliances.push("stove");
    if (detail.hasOvenExisting === true) appliances.push("oven");
    if (detail.hasFridgeExisting === true) appliances.push("fridge");
    if (detail.hasDishwasherExisting === true) appliances.push("dishwasher");
    if (detail.hasTubExisting === true) appliances.push("tub");
    if (detail.hasShowerExisting === true) appliances.push("shower");
    if (appliances.length) fixtures.push(`Appliances/Fixtures: ${appliances.join(", ")}`);

    if (fixtures.length) lines.push(fixtures.join(", "));
  }

  if (lines.length === 0) return null;

  return `RENDR MEASUREMENTS FOR THIS SECTION:\n${lines.join("\n")}`;
}
