import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Cluster C.6-A — DELETE the legacy `DeckSlide` rows whose `type` strings
 * predate commit 5e82145 ("refactor(deck): align slide-type slugs/types/files
 * with UI labels"). The rename touched code but not data, so existing decks
 * carry both old-named rows AND new-named rows that backfillMissingDefaults()
 * created when admins reopened the deck. Old-named rows render as "Unknown
 * slide type" in the published PDF — see WEB_READINESS_PASS_1_C6_PDF_RENDER.md.
 *
 * Per Cluster C.6-A: dry-run by default, requires `--confirm` to actually delete.
 *
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/cleanup-legacy-deck-slides.ts
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/cleanup-legacy-deck-slides.ts --confirm
 *
 * The 6 legacy types are not present anywhere in the current codebase
 * (verified via grep on app/lib/deck and app/admin/projects/[id]/deck/slides).
 * Deleting these rows is therefore non-destructive — no current code path
 * reads or writes them.
 */
const LEGACY_SLIDE_TYPES = [
  "cope-page",
  "visual-inspiration",
  "project-timeline",
  "investment",
  "design-retainer",
  "closing-slide",
] as const;

/**
 * Heuristic for "user has clearly edited this content beyond the seed
 * defaults." We don't have a single source of truth for what each slide
 * type's default content is, so this is a coarse signal: any non-empty
 * `headline` / `subheadline` / `body`, or a `content` object with more
 * than a couple of keys, gets flagged for the operator's eyes-on review.
 *
 * False positives are fine — Steve just inspects them before approving.
 * False negatives (we miss user content) are the failure mode to avoid.
 */
function looksUserEdited(slide: {
  headline: string | null;
  subheadline: string | null;
  body: string | null;
  content: unknown;
  isUserModified: boolean;
}): boolean {
  if (slide.isUserModified) return true;
  if (slide.headline?.trim()) return true;
  if (slide.subheadline?.trim()) return true;
  if (slide.body?.trim()) return true;
  if (slide.content && typeof slide.content === "object") {
    const keys = Object.keys(slide.content as Record<string, unknown>);
    if (keys.length > 3) return true;
  }
  return false;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const rows = await prisma.deckSlide.findMany({
      where: { type: { in: LEGACY_SLIDE_TYPES as unknown as string[] } },
      select: {
        id: true,
        deckId: true,
        type: true,
        order: true,
        isUserModified: true,
        headline: true,
        subheadline: true,
        body: true,
        content: true,
      },
      orderBy: [{ deckId: "asc" }, { order: "asc" }],
    });

    if (rows.length === 0) {
      console.log("No legacy DeckSlide rows found. Nothing to delete.");
      console.log("Searched types:", LEGACY_SLIDE_TYPES.join(", "));
      return;
    }

    // Group by deck for the operator's mental model.
    const byDeck = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byDeck.get(r.deckId) ?? [];
      list.push(r);
      byDeck.set(r.deckId, list);
    }

    const byType = new Map<string, number>();
    for (const r of rows) {
      byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    }

    console.log(`Found ${rows.length} legacy DeckSlide row(s) across ${byDeck.size} deck(s).`);
    console.log("\nBreakdown by type:");
    for (const t of LEGACY_SLIDE_TYPES) {
      console.log(`  ${t.padEnd(22)} ${byType.get(t) ?? 0}`);
    }

    console.log("\nSample rows (first 5):");
    for (const r of rows.slice(0, 5)) {
      console.log(`  id=${r.id} deck=${r.deckId} type=${r.type} order=${r.order}`);
    }

    const flagged = rows.filter(looksUserEdited);
    if (flagged.length > 0) {
      console.log(
        `\n⚠ ${flagged.length} row(s) look user-edited (non-default content). Review before deleting:`,
      );
      for (const r of flagged) {
        const summary = [
          r.headline ? `headline="${r.headline}"` : null,
          r.subheadline ? `subheadline="${r.subheadline}"` : null,
          r.body ? `body=<${r.body.length} chars>` : null,
          r.isUserModified ? "isUserModified=true" : null,
          r.content && typeof r.content === "object"
            ? `content keys=[${Object.keys(r.content as Record<string, unknown>).join(", ")}]`
            : null,
        ]
          .filter(Boolean)
          .join(" ");
        console.log(`  ${r.id} (${r.type}): ${summary}`);
      }
    } else {
      console.log("\nNo rows flagged as user-edited (all look like default seed content).");
    }

    if (!confirm) {
      console.log(
        "\nDry run. Re-run with --confirm to delete these rows. " +
          "All legacy types are unreachable from current code, so deleting is safe.",
      );
      return;
    }

    const result = await prisma.deckSlide.deleteMany({
      where: { type: { in: LEGACY_SLIDE_TYPES as unknown as string[] } },
    });
    console.log(`\nDeleted ${result.count} row(s).`);

    const post = await prisma.deckSlide.count({
      where: { type: { in: LEGACY_SLIDE_TYPES as unknown as string[] } },
    });
    console.log(`Post-delete count for legacy types: ${post} (expected 0).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
