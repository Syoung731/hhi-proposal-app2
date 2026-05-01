import { config } from "dotenv";
config({ path: ".env.local" });

import { KNOWN_SLIDE_TYPES, SLIDE_TYPE_LABELS } from "../app/lib/deck/types";

/**
 * Cluster C.6-B regression smoke for the runtime registry that
 * `backfillMissingDefaults()` now consults before creating a slot.
 *
 * Asserts:
 *   1. `KNOWN_SLIDE_TYPES` contains every key of `SLIDE_TYPE_LABELS`
 *      (TS Record<SlideType,...> guarantees this at compile time, but a
 *      runtime sanity check is cheap).
 *   2. Every member of the `SlideType` union (sampled via the labels
 *      object) is recognized — confirms no current type would be
 *      accidentally rejected by backfill.
 *   3. Every previously-deleted legacy type string is rejected by the
 *      registry — confirms backfill would now skip-and-warn instead of
 *      silently creating a row if a future rename leaves an unknown type
 *      in `buildDefaultDeckSpec()`.
 *
 * No DB writes; no server-only imports. Safe to run anywhere.
 */
const LEGACY_TYPES = [
  "cope-page",
  "visual-inspiration",
  "project-timeline",
  "investment",
  "design-retainer",
  "closing-slide",
] as const;

function main() {
  let failed = 0;

  // Assertion 1: registry contains every label key.
  for (const key of Object.keys(SLIDE_TYPE_LABELS)) {
    if (!KNOWN_SLIDE_TYPES.has(key)) {
      console.error(`FAIL: KNOWN_SLIDE_TYPES missing label key '${key}'`);
      failed++;
    }
  }

  // Assertion 2: every current type recognized.
  const currentTypes = Object.keys(SLIDE_TYPE_LABELS);
  console.log(`Registry contains ${KNOWN_SLIDE_TYPES.size} types.`);
  console.log(`Current types verified: ${currentTypes.join(", ")}`);

  // Assertion 3: legacy types rejected.
  for (const legacy of LEGACY_TYPES) {
    if (KNOWN_SLIDE_TYPES.has(legacy)) {
      console.error(`FAIL: legacy type '${legacy}' unexpectedly in registry`);
      failed++;
    } else {
      console.log(`  rejected legacy type: ${legacy}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nPASS: registry consistent with SlideType + rejects all known legacy strings.");
}

main();
