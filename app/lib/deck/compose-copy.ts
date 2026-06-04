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
        const description = await generateScopeOverviewNarrative({
          rooms,
          companyName: "HHI Builders",
          projectAddress,
          clientName,
        });
        await prisma.deckSlide.update({
          where: { id: slide.id },
          data: {
            content: { ...asObject(slide.content), description },
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
