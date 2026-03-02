/**
 * Parse and format room dimensions (feet & inches).
 * Safe for client and server. Accepts multiple input formats; outputs standard "X' Y"".
 */

export type ParseResult = { inches: number | null; error?: string };

/**
 * Parse user input to total inches.
 * Accepts: 12' 6", 12'6", 12-6, 12 6, 150", 12 (feet), blank -> null.
 * Rules: no negatives; inches part 0–11 when using ft/in.
 */
export function parseFeetInchesToInches(input: string): ParseResult {
  const raw = (input ?? "").trim();
  if (!raw) return { inches: null };

  // Inches-only: e.g. 150" (quote required so bare "150" is treated as feet)
  const inchesOnlyMatch = raw.match(/^\s*(\d+)\s*[""]\s*$/);
  if (inchesOnlyMatch) {
    const inches = parseInt(inchesOnlyMatch[1]!, 10);
    if (Number.isNaN(inches) || inches < 0) return { inches: null, error: "Invalid value." };
    return { inches };
  }

  // Ft and optional inches: 12' 6", 12'6", 12', etc.
  const ftInMatch = raw.match(/^\s*(\d+)\s*['′]\s*(\d{0,2})\s*[""]?\s*$/);
  if (ftInMatch) {
    const feet = parseInt(ftInMatch[1]!, 10);
    const inPart = (ftInMatch[2] ?? "").trim();
    const inchesPart = inPart === "" ? 0 : parseInt(inPart, 10);
    if (Number.isNaN(feet) || feet < 0) return { inches: null, error: "Invalid feet." };
    if (Number.isNaN(inchesPart) || inchesPart < 0 || inchesPart > 11) return { inches: null, error: "Inches must be 0–11." };
    return { inches: feet * 12 + inchesPart };
  }

  // Alternative: 12-6 or 12 6 (no quote)
  const dashSpaceMatch = raw.match(/^\s*(\d+)\s*[- ]\s*(\d{1,2})\s*$/);
  if (dashSpaceMatch) {
    const feet = parseInt(dashSpaceMatch[1]!, 10);
    const inchesPart = parseInt(dashSpaceMatch[2]!, 10);
    if (Number.isNaN(feet) || feet < 0) return { inches: null, error: "Invalid feet." };
    if (inchesPart < 0 || inchesPart > 11) return { inches: null, error: "Inches must be 0–11." };
    return { inches: feet * 12 + inchesPart };
  }

  // Single number: treat as feet
  const feetOnlyMatch = raw.match(/^\s*(\d+)\s*$/);
  if (feetOnlyMatch) {
    const feet = parseInt(feetOnlyMatch[1]!, 10);
    if (Number.isNaN(feet) || feet < 0) return { inches: null, error: "Invalid value." };
    return { inches: feet * 12 };
  }

  return { inches: null, error: "Invalid format. Use e.g. 12' 6\" or 150\"." };
}

/** Normalize dimension string from AI (e.g. "12 ft 6 in", "12ft", "150 in") to form parseFeetInchesToInches accepts. */
function normalizeDimString(s: string): string {
  const raw = s.trim().replace(/\s+/g, " ").trim();
  if (!raw) return raw;
  // "12 ft 6 in" or "12ft 6 in" -> "12' 6""
  const ftIn = raw.match(/^(\d+)\s*ft\s*(\d+)\s*in$/i);
  if (ftIn) return `${ftIn[1]}' ${ftIn[2]}"`;
  // "12 ft" or "12ft" -> "12'"
  const ftOnly = raw.match(/^(\d+)\s*ft$/i);
  if (ftOnly) return `${ftOnly[1]}'`;
  // "150 in" or "150in" -> "150""
  const inOnly = raw.match(/^(\d+)\s*in$/i);
  if (inOnly) return `${inOnly[1]}"`;
  return raw;
}

/**
 * Parse a dimension value from AI (number or string) to total inches.
 * - number: treated as inches if > 0 and < 2000.
 * - string: "12' 6\"", "12'6\"", "12 ft 6 in", "12ft", "150 in", "9'" etc. converted to inches.
 * Returns null if cannot parse.
 */
export function parseDimToInches(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (Number.isNaN(value) || value <= 0 || value >= 2000) return null;
    return Math.round(value);
  }
  if (typeof value === "string") {
    const normalized = normalizeDimString(value);
    const result = parseFeetInchesToInches(normalized || value);
    return result.error == null && result.inches != null ? result.inches : null;
  }
  return null;
}

/**
 * Format total inches as "X' Y"" (e.g. 150 -> "12' 6\"").
 * Returns "" if inches is not finite or <= 0.
 */
export function formatInchesToFeetInches(inches: number | null): string {
  if (inches == null || typeof inches !== "number" || !Number.isFinite(inches) || inches <= 0) return "";
  const feet = Math.floor(inches / 12);
  const remainder = inches % 12;
  if (remainder === 0) return `${feet}'`;
  return `${feet}' ${remainder}"`;
}
