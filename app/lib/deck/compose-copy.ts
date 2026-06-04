import "server-only";
import { revalidatePath } from "next/cache";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import { callClaude } from "@/app/lib/ai/model";
import { generateScopeOverviewNarrative } from "@/app/lib/ai/objective-content";
import { SCOPE_ICON_KEY_LIST, isScopeIconKey } from "@/app/lib/deck/scope-icon-keys";
import { SCOPE_OVERVIEW_LAYOUTS } from "@/app/lib/deck/types";
import type { ScopeOverviewContent, ScopeOverviewLayoutKey, ScopeItem } from "@/app/lib/deck/types";
import { resolveScopeIconImages, scopeIconSlug } from "@/app/lib/deck/scope-icon-resolver";

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

type DraftScopeItem = { title: string; detail: string; icon: string | null; iconConcept: string };

/**
 * Drafts structured scope lines ({title, detail, icon}) + an intro + a stat
 * from room scope narratives. Powers all the NotebookLM-style scope layouts
 * (blueprint-icons uses the icons + stat; the others use title/detail). Returns
 * empty on failure so the caller can fall back to the legacy paragraph.
 */
async function draftScopeItems(
  rooms: { name: string; scopeNarrative: string; bucket: string }[],
): Promise<{ items: DraftScopeItem[]; intro: string | null; stat: string | null }> {
  const scoped = rooms.filter((r) => (r.scopeNarrative ?? "").trim().length >= 20);
  const source = (scoped.length > 0 ? scoped : rooms)
    .map((r) => `${r.name} [${r.bucket}]: ${r.scopeNarrative || "(no detail)"}`)
    .join("\n");
  if (!source.trim()) return { items: [], intro: null, stat: null };

  const response = await callClaude({
    max_tokens: 1100,
    temperature: 0.4,
    system:
      "You write client-facing scope summaries for a luxury design-build remodeling firm. " +
      "Given room-by-room scope notes, produce a compact, scannable scope list for a single slide. " +
      "Return ONLY valid minified JSON of the shape " +
      '{"intro":"<1 short framing sentence, =16 words>","stat":"<optional headline metric like \'168 square feet of extended living space\' or \'\' if none is obvious>","items":[{"title":"<2-4 word bold lead>","detail":"<one specific, benefit-forward line, =18 words, no trailing period>","icon":"<one icon key>","iconConcept":"<2-3 word concrete noun for the icon, e.g. ceiling fan, walk-in shower, composite deck>"}]}. ' +
      "Produce 4 to 6 items. Group related rooms/work into a single item where natural. " +
      "Titles are Title Case noun phrases (e.g. 'Primary Bath', 'Custom Cabinetry'). " +
      `The "icon" MUST be exactly one key from this list (closest built-in match): ${SCOPE_ICON_KEY_LIST}. Use "feature" when nothing fits. ` +
      'The "iconConcept" is a plain concrete noun describing the icon subject (used to find or generate a custom icon). ' +
      "Only include a stat if a concrete number appears in the notes (square footage, counts); otherwise use an empty string. " +
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
    const parsed = JSON.parse(raw) as {
      intro?: string;
      stat?: string;
      items?: { title?: string; detail?: string; icon?: string; iconConcept?: string }[];
    };
    const items: DraftScopeItem[] = (parsed.items ?? [])
      .filter((it) => it && typeof it.title === "string")
      .map((it) => ({
        title: (it.title ?? "").trim(),
        detail: (it.detail ?? "").trim(),
        icon: isScopeIconKey(it.icon) ? it.icon : null,
        iconConcept: (it.iconConcept ?? "").trim() || (it.title ?? "").trim(),
      }))
      .filter((it) => it.title.length > 0)
      .slice(0, 6);
    const intro = (parsed.intro ?? "").trim() || null;
    const stat = (parsed.stat ?? "").trim() || null;
    return { items, intro, stat };
  } catch {
    return { items: [], intro: null, stat: null };
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

/** Map draft items → ScopeItem (vector-icon only, no image resolution). */
function itemsToScopeItems(items: DraftScopeItem[]): ScopeItem[] {
  return items.map((it) => ({
    title: it.title,
    detail: it.detail || null,
    icon: it.icon,
  }));
}

/**
 * Map draft items → ScopeItem, resolving an AI-generated BrandIcon PNG per item
 * (matching the library or generating + persisting on a miss). Used for the
 * blueprint-icons layout, which renders the PNG; vector `icon` stays as fallback.
 */
async function itemsWithIconImages(items: DraftScopeItem[]): Promise<ScopeItem[]> {
  const imageMap = await resolveScopeIconImages(
    items.map((it) => it.iconConcept || it.title),
  );
  return items.map((it) => {
    const url = imageMap.get(scopeIconSlug(it.iconConcept || it.title));
    return {
      title: it.title,
      detail: it.detail || null,
      icon: it.icon,
      ...(url ? { iconImageUrl: url } : {}),
    };
  });
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

        // Pick the layout the composer "likes": blueprint-icons when we have a
        // photo + icons (the designed look), gallery-grid for 3 photos,
        // editorial-split as a photo fallback, numbered when photo-less.
        const photoCount = selectedPhotos.length;
        const hasIcons = structured.items.some((it) => it.icon);
        const layoutKey =
          photoCount >= 3
            ? "gallery-grid"
            : photoCount >= 1
              ? hasIcons
                ? "blueprint-icons"
                : "editorial-split"
              : "photo-numbered";

        // Resolve AI-generated icon PNGs only for the layout that shows them.
        const scopeItemsForWrite =
          structured.items.length === 0
            ? []
            : layoutKey === "blueprint-icons"
              ? await itemsWithIconImages(structured.items)
              : itemsToScopeItems(structured.items);

        await prisma.deckSlide.update({
          where: { id: slide.id },
          data: {
            layoutKey,
            content: {
              ...existing,
              ...(description ? { description } : {}),
              ...(scopeItemsForWrite.length > 0 ? { scopeItems: scopeItemsForWrite } : {}),
              ...(structured.intro ? { intro: structured.intro } : {}),
              ...(structured.stat ? { stat: structured.stat } : {}),
              backgroundSkin: layoutKey === "blueprint-icons" ? "blueprint" : "none",
              selectedPhotos,
            } as unknown as Prisma.InputJsonObject,
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

// ─── AI Edit (Part 2): prompt-driven scope-slide redesign ─────────────────────

export type ScopeAiEditResult =
  | {
      ok: true;
      headline: string | null;
      layoutKey: ScopeOverviewLayoutKey | null;
      contentPatch: Partial<ScopeOverviewContent>;
      note: string | null;
    }
  | { ok: false; error: string };

const VALID_SCOPE_LAYOUTS = new Set(SCOPE_OVERVIEW_LAYOUTS.map((l) => l.key));

/**
 * Prompt-driven editor for a single scope-overview slide — the "AI Edit" box.
 * `changeCopy` gates text + items + icons; `changeLayout` gates layoutKey +
 * background skin. Returns a patch for the client to apply via onUpdate (so it
 * flows through the existing autosave + isUserModified path); does NOT write
 * the DB itself. Photos are never touched.
 */
export async function aiEditScopeSlide(params: {
  slideId: string;
  prompt: string;
  changeCopy: boolean;
  changeLayout: boolean;
}): Promise<ScopeAiEditResult> {
  const instruction = params.prompt.trim();
  if (!instruction) return { ok: false, error: "Type what you'd like changed." };
  if (!params.changeCopy && !params.changeLayout) {
    return { ok: false, error: "Pick at least one: change copy and/or layout." };
  }

  const slide = await prisma.deckSlide.findUnique({
    where: { id: params.slideId },
    select: { id: true, type: true, headline: true, layoutKey: true, content: true, deck: { select: { projectId: true } } },
  });
  if (!slide) return { ok: false, error: "Slide not found." };
  if (slide.type !== "scope-overview") {
    return { ok: false, error: "AI Edit currently supports the Scope slide only." };
  }

  const content = asObject(slide.content) as ScopeOverviewContent;
  const projectId = slide.deck?.projectId;

  // Light project context to ground copy edits.
  let roomContext = "";
  if (projectId) {
    const rooms = await prisma.room.findMany({
      where: { projectId, isProjectOverhead: false },
      select: { name: true, scopeNarrative: true },
      orderBy: { sortOrder: "asc" },
    });
    roomContext = rooms
      .filter((r) => (r.scopeNarrative ?? "").trim())
      .map((r) => `${r.name}: ${r.scopeNarrative}`)
      .join("\n")
      .slice(0, 4000);
  }

  const currentState = {
    headline: slide.headline ?? "",
    layoutKey: slide.layoutKey,
    intro: content.intro ?? "",
    stat: content.stat ?? "",
    backgroundSkin: content.backgroundSkin ?? "none",
    scopeItems: (content.scopeItems ?? []).map((it) => ({
      title: it.title,
      detail: it.detail ?? "",
      icon: it.icon ?? "feature",
    })),
    hasPhoto: (content.selectedPhotos ?? []).some((p) => p.url),
  };

  const layoutList = SCOPE_OVERVIEW_LAYOUTS.map((l) => `${l.key} (${l.label})`).join(", ");
  const scopeRules = [
    params.changeCopy
      ? 'COPY is editable: you MAY change "headline", "intro", "stat", and the "scopeItems" array (each item\'s title, detail, and icon).'
      : 'COPY is LOCKED: do NOT change headline, intro, stat, or any scopeItems text/icons. Omit those keys.',
    params.changeLayout
      ? 'LAYOUT is editable: you MAY change "layoutKey" and "backgroundSkin" ("blueprint" or "none").'
      : 'LAYOUT is LOCKED: do NOT change layoutKey or backgroundSkin. Omit those keys.',
  ].join(" ");

  const response = await callClaude({
    max_tokens: 1300,
    temperature: 0.5,
    system:
      "You are a slide designer for a luxury design-build remodeling firm, editing ONE scope slide. " +
      "Apply the user's instruction, honoring these permissions strictly. " +
      scopeRules +
      ` Valid layoutKey values: ${layoutList}. ` +
      `Valid icon keys (for scopeItems[].icon): ${SCOPE_ICON_KEY_LIST}; use "feature" when unsure. ` +
      "Keep titles to 2-4 words (Title Case) and details to one benefit-forward line (=18 words, no trailing period). " +
      "Aim for 4-6 scopeItems. Return ONLY minified JSON with the keys you are permitted to change, " +
      'plus an optional "note" (=12 words, what you did). No markdown, no code fences.',
    messages: [
      {
        role: "user",
        content:
          `Current slide:\n${JSON.stringify(currentState)}\n\n` +
          (roomContext ? `Room scope reference:\n${roomContext}\n\n` : "") +
          `Instruction: ${instruction}\n\nReturn the JSON patch now.`,
      },
    ],
  });

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");

  let parsed: {
    headline?: string;
    layoutKey?: string;
    intro?: string;
    stat?: string;
    backgroundSkin?: string;
    scopeItems?: { title?: string; detail?: string; icon?: string }[];
    note?: string;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The AI response could not be read. Try rephrasing." };
  }

  const contentPatch: Partial<ScopeOverviewContent> = {};
  let headline: string | null = null;

  if (params.changeCopy) {
    if (typeof parsed.headline === "string" && parsed.headline.trim()) {
      headline = parsed.headline.trim();
    }
    if (typeof parsed.intro === "string") contentPatch.intro = parsed.intro.trim() || null;
    if (typeof parsed.stat === "string") contentPatch.stat = parsed.stat.trim() || null;
    if (Array.isArray(parsed.scopeItems)) {
      const items: ScopeItem[] = parsed.scopeItems
        .filter((it) => it && typeof it.title === "string" && it.title.trim())
        .map((it) => ({
          title: (it.title ?? "").trim(),
          detail: (it.detail ?? "").trim() || null,
          icon: isScopeIconKey(it.icon) ? it.icon : "feature",
        }))
        .slice(0, 6);
      if (items.length > 0) contentPatch.scopeItems = items;
    }
  }

  let layoutKey: ScopeOverviewLayoutKey | null = null;
  if (params.changeLayout) {
    if (typeof parsed.layoutKey === "string" && VALID_SCOPE_LAYOUTS.has(parsed.layoutKey as ScopeOverviewLayoutKey)) {
      layoutKey = parsed.layoutKey as ScopeOverviewLayoutKey;
    }
    if (parsed.backgroundSkin === "blueprint" || parsed.backgroundSkin === "none") {
      contentPatch.backgroundSkin = parsed.backgroundSkin;
    }
  }

  if (headline === null && layoutKey === null && Object.keys(contentPatch).length === 0) {
    return { ok: false, error: "The AI didn't return any applicable changes. Try being more specific." };
  }

  // When the slide will be (or stays) blueprint-icons, resolve a BrandIcon PNG
  // per item — matching the library or generating + persisting on a miss.
  const finalLayout = layoutKey ?? (slide.layoutKey as ScopeOverviewLayoutKey);
  if (finalLayout === "blueprint-icons") {
    const baseItems: ScopeItem[] = contentPatch.scopeItems ?? content.scopeItems ?? [];
    if (baseItems.length > 0) {
      const imageMap = await resolveScopeIconImages(baseItems.map((it) => it.title));
      contentPatch.scopeItems = baseItems.map((it) => {
        const url = imageMap.get(scopeIconSlug(it.title));
        return { ...it, ...(url ? { iconImageUrl: url } : {}) };
      });
    }
  }

  return {
    ok: true,
    headline,
    layoutKey,
    contentPatch,
    note: typeof parsed.note === "string" ? parsed.note.trim() || null : null,
  };
}
