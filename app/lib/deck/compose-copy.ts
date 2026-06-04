import "server-only";
import { revalidatePath } from "next/cache";
import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";
import { callClaude } from "@/app/lib/ai/model";
import { generateScopeOverviewNarrative } from "@/app/lib/ai/objective-content";

/**
 * AI deck composer (Phase 3).
 *
 * Drafts client-facing slide COPY from project data, writing it into the
 * existing DeckSlide rows. Strictly non-destructive:
 *   - never writes slide types owned by a sync function (before/after,
 *     scope-breakdown, investment, timeline, overall-investment),
 *   - never overwrites a slide the user has edited (isUserModified) or hidden,
 *   - merges into existing content (preserves style/layout fields).
 *
 * It also deliberately SKIPS the slides the deck page already auto-hydrates from
 * project data (objective/pillars, why-us pillars, cover hero/address) to avoid
 * fighting that injection. Targets here are copy that is otherwise blank.
 *
 * Reuses existing generators (generateScopeOverviewNarrative) rather than
 * duplicating prompts.
 */

const SYNC_OWNED_TYPES = new Set<string>([
  "before-after",
  "scope-breakdown",
  "investment-by-space",
  "timeline",
  "overall-investment",
]);

export type ComposeCopyResult = {
  updated: number;
  skipped: number;
  errors: { type: string; error: string }[];
};

type DraftScopeItem = { title: string; detail: string };

/**
 * Drafts structured scope lines ({title, detail}) from room scope narratives.
 * This is what powers the NotebookLM-style scope layouts (numbered / checklist
 * / gallery / editorial-split). Returns 4–6 concise items, or [] on failure so
 * the caller can fall back to the legacy paragraph.
 */
async function draftScopeItems(
  rooms: { name: string; scopeNarrative: string; bucket: string }[],
): Promise<{ items: DraftScopeItem[]; intro: string | null }> {
  const scoped = rooms.filter((r) => (r.scopeNarrative ?? "").trim().length >= 20);
  const source = (scoped.length > 0 ? scoped : rooms)
    .map((r) => `${r.name} [${r.bucket}]: ${r.scopeNarrative || "(no detail)"}`)
    .join("\n");
  if (!source.trim()) return { items: [], intro: null };

  const response = await callClaude({
    max_tokens: 900,
    temperature: 0.4,
    system:
      "You write client-facing scope summaries for a luxury design-build remodeling firm. " +
      "Given room-by-room scope notes, produce a compact, scannable scope list for a single slide. " +
      "Return ONLY valid minified JSON of the shape " +
      '{"intro":"<1 short sentence framing the project, =16 words>","items":[{"title":"<2-4 word bold lead>","detail":"<one specific, benefit-forward line, =18 words, no period>"}]}. ' +
      "Produce 4 to 6 items. Group related rooms/work into a single item where natural. " +
      "Titles are Title Case noun phrases (e.g. 'Primary Bath', 'Custom Cabinetry'). " +
      "No markdown, no code fences, no commentary — JSON only.",
    messages: [
      {
        role: "user",
        content: `Room scope notes:\n${source}\n\nReturn the JSON now.`,
      },
    ],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");

  try {
    const parsed = JSON.parse(raw) as { intro?: string; items?: DraftScopeItem[] };
    const items = (parsed.items ?? [])
      .filter((it) => it && typeof it.title === "string")
      .map((it) => ({ title: it.title.trim(), detail: (it.detail ?? "").trim() }))
      .filter((it) => it.title.length > 0)
      .slice(0, 6);
    const intro = (parsed.intro ?? "").trim() || null;
    return { items, intro };
  } catch {
    return { items: [], intro: null };
  }
}

/**
 * Finds one good hero photo for the scope slide so the photo-bearing layouts
 * render complete. Prefers AFTER renders, then COVER, then BEFORE. Returns null
 * if the project has no usable image.
 */
async function findScopeHeroPhoto(
  projectId: string,
): Promise<{ id: string; url: string; thumbnailUrl: string | null } | null> {
  const media = await prisma.media.findMany({
    where: { projectId, kind: { in: ["AFTER", "COVER", "BEFORE"] } },
    select: { id: true, url: true, thumbnailUrl: true, kind: true },
    take: 30,
  });
  if (media.length === 0) return null;
  const rank: Record<string, number> = { AFTER: 0, COVER: 1, BEFORE: 2 };
  media.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
  const pick = media[0];
  return { id: pick.id, url: pick.url, thumbnailUrl: pick.thumbnailUrl };
}

function asObject(content: unknown): Record<string, unknown> {
  return content && typeof content === "object"
    ? (content as Record<string, unknown>)
    : {};
}

async function draftCoverTagline(params: {
  title: string;
  scopeBlurb: string;
}): Promise<string | null> {
  const response = await callClaude({
    max_tokens: 60,
    temperature: 0.6,
    system:
      "You write short, refined taglines for a luxury design-build remodeling firm. Return ONLY the tagline text — no quotes, no punctuation-heavy fluff, 8 words or fewer, evocative and confident.",
    messages: [
      {
        role: "user",
        content: `Project: ${params.title}\nScope: ${params.scopeBlurb}\n\nWrite one cover-slide tagline (≤8 words).`,
      },
    ],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^["'“‘]|["'”’]$/g, "")
    .trim();
  return text || null;
}

export async function composeDeckCopy(
  projectId: string,
): Promise<ComposeCopyResult | { error: string }> {
  const deck = await prisma.proposalDeck.findUnique({
    where: { projectId },
    include: { slides: { select: { id: true, type: true, content: true, isUserModified: true, isUserHidden: true } } },
  });
  if (!deck) {
    return {
      error: "No deck yet — open the Presentation Deck once to generate it, then compose.",
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      title: true,
      addressLine1: true,
      city: true,
      state: true,
      client1First: true,
      client1Last: true,
      rooms: {
        where: { isProjectOverhead: false },
        select: { name: true, scopeNarrative: true, bucket: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!project) return { error: "Project not found" };

  const clientName = [project.client1First, project.client1Last]
    .filter(Boolean)
    .join(" ");
  const projectAddress = [project.addressLine1, project.city, project.state]
    .filter(Boolean)
    .join(", ");
  const rooms = project.rooms.map((r) => ({
    name: r.name,
    scopeNarrative: r.scopeNarrative ?? "",
    bucket: String(r.bucket),
  }));

  let updated = 0;
  let skipped = 0;
  const errors: { type: string; error: string }[] = [];

  for (const slide of deck.slides) {
    if (
      SYNC_OWNED_TYPES.has(slide.type) ||
      slide.isUserModified ||
      slide.isUserHidden
    ) {
      skipped += 1;
      continue;
    }

    try {
      if (slide.type === "scope-overview") {
        // Legacy paragraph (kept for split-panel / image-row layouts) +
        // structured items (powers the NotebookLM-style rich layouts).
        const [description, structured, hero] = await Promise.all([
          generateScopeOverviewNarrative({
            rooms,
            companyName: "HHI Builders",
            projectAddress,
            clientName,
          }).catch(() => null),
          draftScopeItems(rooms),
          findScopeHeroPhoto(projectId),
        ]);

        const existing = asObject(slide.content);
        const existingPhotos = Array.isArray(existing.selectedPhotos)
          ? (existing.selectedPhotos as { id: string; url: string; thumbnailUrl: string | null }[])
          : [];
        // Only inject a hero if the user hasn't already chosen photos.
        const selectedPhotos =
          existingPhotos.length > 0
            ? existingPhotos
            : hero
              ? [{ id: hero.id, url: hero.url, thumbnailUrl: hero.thumbnailUrl }]
              : [];

        // Pick the layout the composer "likes": editorial-split when we have a
        // photo (premium), gallery-grid when 3 photos exist, numbered otherwise.
        const photoCount = selectedPhotos.length;
        const layoutKey =
          photoCount >= 3
            ? "gallery-grid"
            : photoCount >= 1
              ? "editorial-split"
              : "photo-numbered";

        await prisma.deckSlide.update({
          where: { id: slide.id },
          data: {
            layoutKey,
            content: {
              ...existing,
              ...(description ? { description } : {}),
              ...(structured.items.length > 0 ? { scopeItems: structured.items } : {}),
              ...(structured.intro ? { intro: structured.intro } : {}),
              selectedPhotos,
            },
            source: "auto",
          },
        });
        updated += 1;
      } else if (slide.type === "cover") {
        const scopeBlurb = rooms
          .map((r) => r.name)
          .slice(0, 6)
          .join(", ");
        const tagline = await draftCoverTagline({
          title: project.title,
          scopeBlurb,
        });
        if (tagline) {
          await prisma.deckSlide.update({
            where: { id: slide.id },
            data: { content: { ...asObject(slide.content), tagline } },
          });
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        skipped += 1;
      }
    } catch (e) {
      errors.push({
        type: slide.type,
        error: e instanceof Error ? e.message : "Draft failed",
      });
    }
  }

  if (updated > 0) {
    revalidatePath(`/admin/projects/${projectId}/deck`);
  }
  return { updated, skipped, errors };
}
