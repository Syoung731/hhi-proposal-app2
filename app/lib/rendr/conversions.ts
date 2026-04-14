/**
 * Metric → Imperial conversion utilities for Rendr LiDAR data.
 * All Rendr measurements arrive in meters / square meters.
 */

const SQ_METERS_TO_SQ_FEET = 10.7639;
const METERS_TO_FEET = 3.28084;

/** Square meters → square feet, rounded to 1 decimal place. */
export function sqmToSqft(sqm: number): number {
  return Math.round(sqm * SQ_METERS_TO_SQ_FEET * 10) / 10;
}

/** Meters → feet, rounded to 1 decimal place. */
export function metersToFeet(m: number): number {
  return Math.round(m * METERS_TO_FEET * 10) / 10;
}

/** Meters → linear feet, rounded to 1 decimal place. */
export function metersToLF(m: number): number {
  return Math.round(m * METERS_TO_FEET * 10) / 10;
}
