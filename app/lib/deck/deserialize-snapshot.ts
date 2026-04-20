import type { SerializedDeckSlide } from "@/app/lib/snapshot";
import type {
  ProposalSlide,
  SlideContent,
  SlideType,
  SlideLayoutKey,
  TextZoneSetting,
} from "./types";

/**
 * Convert a SerializedDeckSlide (flat DB-row shape persisted inside a
 * PublishedSnapshot) back into the runtime ProposalSlide shape expected by
 * SlideRenderer / SlideCanvas.
 *
 * Two asymmetries to handle:
 *
 * 1. aiBackground lives inside `content` JSON at rest (see app/lib/deck/db.ts),
 *    but the runtime ProposalSlide reads it from the top-level `aiBackground`
 *    field. Lift it here.
 * 2. SerializedDeckSlide types are loosely stringly-typed; ProposalSlide types
 *    are discriminated unions. We trust the snapshot was written by our own
 *    code and cast through `unknown`.
 */
export function deserializeSnapshotSlide(slide: SerializedDeckSlide): ProposalSlide {
  const content = (slide.content ?? undefined) as SlideContent | undefined;
  const aiBackground =
    content && typeof (content as { aiBackground?: unknown }).aiBackground === "string"
      ? ((content as { aiBackground: string }).aiBackground)
      : null;

  return {
    id: slide.id,
    type: slide.type as SlideType,
    layoutKey: slide.layoutKey as SlideLayoutKey,
    order: slide.order,
    isEnabled: slide.isEnabled,
    isUserHidden: slide.isUserHidden,
    isUserModified: slide.isUserModified,
    source: slide.source === "auto" ? "auto" : "manual",
    sectionId: slide.sectionId,
    headline: slide.headline,
    subheadline: slide.subheadline,
    body: slide.body,
    content,
    isLocked: slide.isLocked,
    lockPosition:
      slide.lockPosition === "first" || slide.lockPosition === "last"
        ? slide.lockPosition
        : undefined,
    backgroundId: slide.backgroundId,
    textZone: (slide.textZone as TextZoneSetting | null) ?? null,
    aiBackground,
  };
}

/**
 * Convert every slide in a serialized deck, filtering out user-hidden slides
 * (mirrors getDeckForProject's final query which excludes isUserHidden=true).
 */
export function deserializeSnapshotSlides(slides: SerializedDeckSlide[]): ProposalSlide[] {
  return slides
    .filter((s) => !s.isUserHidden)
    .sort((a, b) => a.order - b.order)
    .map(deserializeSnapshotSlide);
}
