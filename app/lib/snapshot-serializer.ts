import "server-only";
import { prisma } from "@/app/lib/prisma";
import type { SerializedDeck, SerializedDeckSlide } from "@/app/lib/snapshot";

/**
 * Loads the project's ProposalDeck and freezes its slides into a snapshot-safe shape.
 *
 * Read-only: this intentionally does NOT call `getDeckForProject` from app/lib/deck/db.ts —
 * that entry point runs heavy auto-sync logic (writes to before-after / scope-breakdown /
 * investment-by-space / timeline / overall-investment slides). Publishing should reflect the current
 * persisted deck state, not trigger further edits.
 *
 * Returns `undefined` if the project has no ProposalDeck row yet — callers should set
 * `snapshot.schema = "v1-legacy"` in that case.
 */
export async function serializeDeckForSnapshot(
  projectId: string
): Promise<SerializedDeck | undefined> {
  const deck = await prisma.proposalDeck.findUnique({
    where: { projectId },
    include: {
      slides: { orderBy: { order: "asc" } },
    },
  });

  if (!deck) return undefined;

  const slides: SerializedDeckSlide[] = deck.slides.map((row) => ({
    id: row.id,
    type: row.type,
    layoutKey: row.layoutKey,
    order: row.order,
    isEnabled: row.isEnabled,
    isUserHidden: row.isUserHidden,
    isUserModified: row.isUserModified,
    source: row.source,
    sectionId: row.sectionId,
    headline: row.headline,
    subheadline: row.subheadline,
    body: row.body,
    content:
      row.content !== null
        ? (row.content as unknown as Record<string, unknown>)
        : null,
    isLocked: row.isLocked,
    lockPosition: row.lockPosition,
    backgroundId: row.backgroundId,
    textZone:
      row.textZone !== null
        ? (row.textZone as unknown as Record<string, unknown>)
        : null,
  }));

  return {
    id: deck.id,
    deckTheme: deck.deckTheme ?? null,
    slides,
  };
}
