/**
 * Client-safe line classification + allowance policy for the JobTread budget push.
 *
 * This module is intentionally NOT `server-only`: the push modal (a client
 * component) needs the allowance constant + the Material/Install/Sub classifier
 * to seed and toggle per-line allowance switches, and the server-side merge /
 * estimate code needs the exact same rules. Keeping them here (one source of
 * truth) avoids the modal duplicating the "costAndFee" literal or re-deriving
 * "is this a material?" differently from the server.
 *
 * `CostTypeHint` is imported type-only from `./types` (which IS `server-only`);
 * a type-only import is fully erased at build time, so it never pulls the
 * server-only runtime guard into a client bundle.
 */

import type { CostTypeHint } from "./types";

/**
 * JobTread cost-item `allowanceType` value used to flag a line as an allowance.
 * Live-confirmed valid enum values are "costAndFee" and "price"; HHI's existing
 * items overwhelmingly use "costAndFee", so that's our allowance default.
 */
export const JOBTREAD_ALLOWANCE_TYPE = "costAndFee";

/**
 * Canonical Material / Install (labor) / Sub classifier for a line, from its
 * name (primary signal — HHI names lines "[PREFIX] Item - Material" /
 * " - Install") and, when available, a structured cost-type name. Returns null
 * when nothing identifies the line (caller decides the ambiguous default).
 *
 * This is the single source of truth the modal, the merge allowance default,
 * and the estimate margin policy all share so they never disagree on what
 * counts as a "material".
 */
export function classifyLine(
  name: string,
  costTypeName?: string | null,
): CostTypeHint {
  const lower = name.toLowerCase();

  // Explicit " - Material" / " - Install" / " - Sub" suffix wins.
  if (/-\s*materials?\b/.test(lower)) return "Material";
  if (/-\s*install\b/.test(lower) || /-\s*labor\b/.test(lower)) return "Install";
  if (/-\s*sub(contract)?\b/.test(lower)) return "Sub";

  // Structured cost type next.
  const ct = (costTypeName ?? "").toLowerCase();
  if (ct.includes("sub")) return "Sub";
  if (ct.includes("labor")) return "Install";
  if (ct.includes("material")) return "Material";

  // Looser "contains" fallback on the name.
  if (lower.includes("material")) return "Material";
  if (lower.includes("install") || lower.includes("labor")) return "Install";
  if (lower.includes("sub")) return "Sub";

  return null;
}

/** True when a line classifies as a material (drives the allowance default). */
export function isMaterialLine(
  name: string,
  costTypeName?: string | null,
): boolean {
  return classifyLine(name, costTypeName) === "Material";
}

/**
 * The `allowanceType` a pushed line should default to: an allowance when the
 * source estimate line is in the HHI ALLOWANCE bucket OR the line is a material
 * (materials are client-selected finishes pushed at cost, tracked as JobTread
 * allowances). Null otherwise. The push modal can still flip any line.
 */
export function defaultAllowanceType(
  name: string,
  costTypeName: string | null,
  source: string,
): string | null {
  return source === "ALLOWANCE" || isMaterialLine(name, costTypeName)
    ? JOBTREAD_ALLOWANCE_TYPE
    : null;
}
