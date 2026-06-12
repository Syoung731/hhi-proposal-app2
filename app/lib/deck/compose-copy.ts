import "server-only";
import { revalidatePath } from "next/cache";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@/app/generated/prisma";
import { prisma } from "@/app/lib/prisma";
import { callClaude } from "@/app/lib/ai/model";
import { generateScopeOverviewNarrative } from "@/app/lib/ai/objective-content";
import { SCOPE_ICON_KEY_LIST, isScopeIconKey } from "@/app/lib/deck/scope-icon-keys";
import type { ScopeItem } from "@/app/lib/deck/types";
import { resolveScopeIconImages, scopeIconSlug } from "@/app/lib/deck/scope-icon-resolver";
import { generateBrandIconPngAction } from "@/app/admin/settings/actions";
import { mapWithConcurrency, sleep } from "@/app/lib/async-pool";

/**
 * Generates one bespoke monochrome line-art SCENE illustration (project-specific)
 * for a hub/zone. Returns the public URL, or null on failure (caller falls back
 * to an icon). Does not persist a BrandIcon row — these are one-off, per-project.
 */
async function genObjectiveIllustration(scene: string, label: string): Promise<string | null> {
  const visual = (scene || label).trim();
  if (!visual) return null;
  const params = {
    name: label,
    visual: `A detailed architectural line-art illustration of ${visual}. Confident, even-weight ink strokes; clean and uncluttered; depicts the full scene filling the frame`,
    description: `Objective slide illustration for a luxury remodeling proposal: ${visual}`,
    monochrome: true,
    mode: "illustration",
  } as const;
  // One retry — visuals runs draw several images back-to-back and a single
  // rate-limit blip used to silently cost the slide its illustration.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500);
    try {
      const gen = await generateBrandIconPngAction(params);
      if (!gen.error && gen.imageUrl) return gen.imageUrl;
    } catch {
      /* retry once, then fall back */
    }
  }
  return null;
}

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

type DraftObjective = {
  headline: string | null;
  objective: string | null;
  hubIcon: string;
  hubScene: string;
  pillars: { title: string; body: string; icon: string; scene: string }[];
};

/**
 * Drafts a per-project Objective for the hub-and-spoke layout: a creative
 * headline, a short mission opener (with **bold** key phrases), a central hub
 * icon, and EXACTLY 3 "zone" pillars (title + one-line body + icon) derived
 * from the project's actual scope. Returns null on failure / <3 pillars so the
 * caller can leave the slide untouched.
 */
async function draftObjective(params: {
  rooms: { name: string; scopeNarrative: string; bucket: string }[];
  projectTitle: string;
  projectAddress: string;
}): Promise<DraftObjective | null> {
  const scoped = params.rooms.filter((r) => (r.scopeNarrative ?? "").trim().length >= 12);
  const source = (scoped.length > 0 ? scoped : params.rooms)
    .map((r) => `${r.name}: ${r.scopeNarrative || "(remodel)"}`)
    .join("\n")
    .slice(0, 3500);
  if (!source.trim()) return null;

  const response = await callClaude({
    max_tokens: 1000,
    temperature: 0.8,
    system:
      "You are a creative brand strategist writing the Objective slide for a LUXURY design-build remodeling proposal. " +
      "It frames WHY the project matters before the deck covers what. Be genuinely creative and specific to THIS home — " +
      "avoid generic, formulaic phrasing. " +
      "Return ONLY minified JSON of the shape " +
      '{"headline":"<an evocative, distinctive objective name, =6 words, in the spirit of \'The Living Outward Objective\' or \'The Coastal Sanctuary Mandate\' — make it memorable and specific, NOT \'The X Objective\' boilerplate>","objective":"<1-2 sentence mission, =28 words, wrap 2-3 key phrases in **double asterisks** for emphasis>","hubIcon":"<one icon key for the home>","hubScene":"<short visual description of the existing home to illustrate, e.g. two-gable coastal home with covered porch>","pillars":[{"title":"<2-4 word zone name, evocative, e.g. The Poolside Retreat / Zone 1 (Leisure)>","body":"<one benefit line, =16 words, no trailing period>","icon":"<one icon key>","scene":"<concrete visual to illustrate this zone as a small line-art scene, e.g. screened porch with seating and ceiling fan / garage bay with car among mature trees / storage room with shelving and equipment>"}]}. ' +
      "Produce 3 to 5 pillars (zones) — choose the count that best fits the project's scope (a simple project = 3; a larger one = 4-5), grouping rooms/work meaningfully. " +
      `All icon values (hubIcon + each pillar.icon) MUST be exactly one key from this list: ${SCOPE_ICON_KEY_LIST}. Use "house" for hubIcon and "feature" for a pillar when unsure. ` +
      "The scene/hubScene fields describe a drawing to generate — be concrete and project-specific. " +
      "No markdown fences, no commentary — JSON only.",
    messages: [
      {
        role: "user",
        content: `Project: ${params.projectTitle}\nAddress: ${params.projectAddress}\nRooms & scope:\n${source}\n\nReturn the JSON now.`,
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
      headline?: string;
      objective?: string;
      hubIcon?: string;
      hubScene?: string;
      pillars?: { title?: string; body?: string; icon?: string; scene?: string }[];
    };
    const pillars = (parsed.pillars ?? [])
      .filter((p) => p && typeof p.title === "string" && typeof p.body === "string")
      .map((p) => ({
        title: (p.title ?? "").trim(),
        body: (p.body ?? "").trim(),
        icon: isScopeIconKey(p.icon) ? p.icon : "feature",
        scene: (p.scene ?? "").trim(),
      }))
      .filter((p) => p.title && p.body)
      .slice(0, 5);
    if (pillars.length < 2) return null;
    return {
      headline: (parsed.headline ?? "").trim() || null,
      objective: (parsed.objective ?? "").trim() || null,
      hubIcon: isScopeIconKey(parsed.hubIcon) ? parsed.hubIcon : "house",
      hubScene: (parsed.hubScene ?? "").trim(),
      pillars,
    };
  } catch {
    return null;
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
async function itemsWithIconImages(items: DraftScopeItem[], generateMissing = false): Promise<ScopeItem[]> {
  const imageMap = await resolveScopeIconImages(
    items.map((it) => it.iconConcept || it.title),
    { generateMissing },
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

async function draftCoverCopy(params: {
  title: string;
  address: string;
  scopeBlurb: string;
}): Promise<{ concept: string | null; tagline: string | null }> {
  const response = await callClaude({
    max_tokens: 160,
    temperature: 0.7,
    system:
      "You write the cover of a LUXURY design-build remodeling proposal. Return ONLY minified JSON " +
      '{"concept":"<the large cover TITLE — an evocative concept name, NOT just the address; spirit of \'Enhanced Livability for 94 Coggins Point\', \'A Complete Reimagining\', \'From Vision to Reality\'; <=7 words>","tagline":"<one short supporting line, <=8 words, evocative and confident>"}. ' +
      "No quotes around the whole object beyond JSON, no markdown, no code fences.",
    messages: [
      {
        role: "user",
        content: `Project: ${params.title}\nAddress: ${params.address}\nScope: ${params.scopeBlurb}\n\nReturn the JSON now.`,
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
    const parsed = JSON.parse(raw) as { concept?: string; tagline?: string };
    return {
      concept: (parsed.concept ?? "").trim() || null,
      tagline: (parsed.tagline ?? "").trim() || null,
    };
  } catch {
    return { concept: null, tagline: null };
  }
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
        // Paragraph narrative (used in "description" mode) + structured items
        // (powers the NotebookLM-style rich layouts).
        const [description, structured, hero] = await Promise.all([
          generateScopeOverviewNarrative({
            rooms,
            companyName: "HHI Builders",
            projectAddress,
            clientName,
          }).catch(() => null),
          draftScopeItems(rooms).catch((e) => {
            // eslint-disable-next-line no-console
            console.warn("[composeDeckCopy] draftScopeItems threw:", e instanceof Error ? e.message : e);
            return { items: [] as DraftScopeItem[], intro: null as string | null, stat: null as string | null };
          }),
          findScopeHeroPhoto(projectId).catch(() => null),
        ]);
        // eslint-disable-next-line no-console
        console.warn(`[composeDeckCopy] scope: items=${structured.items.length} narrative=${description ? "ok" : "FAIL"} hero=${hero ? "yes" : "no"}`);

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
      } else if (slide.type === "objective") {
        const obj = await draftObjective({
          rooms,
          projectTitle: project.title,
          projectAddress,
        });
        if (obj) {
          // Text-only draft: store the scene descriptions so the separate
          // "Generate illustrations" step can draw them later. No image gen here
          // (keeps Draft fast + reliable).
          const pillars = obj.pillars.map((p) => ({
            title: p.title,
            body: p.body,
            icon: p.icon,
            scene: p.scene,
          }));
          await prisma.deckSlide.update({
            where: { id: slide.id },
            data: {
              ...(obj.headline ? { headline: obj.headline } : {}),
              content: {
                ...asObject(slide.content),
                ...(obj.objective ? { objective: obj.objective } : {}),
                pillars,
                hubIcon: obj.hubIcon,
                hubScene: obj.hubScene,
                layout: "hub-spoke",
              } as unknown as Prisma.InputJsonObject,
              source: "auto",
            },
          });
          updated += 1;
        } else {
          // eslint-disable-next-line no-console
          console.warn("[composeDeckCopy] objective: draftObjective returned null (Claude/JSON failed)");
          skipped += 1;
        }
      } else if (slide.type === "cover") {
        const scopeBlurb = rooms
          .map((r) => r.name)
          .slice(0, 6)
          .join(", ");
        const { concept, tagline } = await draftCoverCopy({
          title: project.title,
          address: projectAddress,
          scopeBlurb,
        });
        if (concept || tagline) {
          await prisma.deckSlide.update({
            where: { id: slide.id },
            data: {
              // subheadline = the large serif cover title (see CoverSlide.tsx).
              ...(concept ? { subheadline: concept } : {}),
              ...(tagline ? { content: { ...asObject(slide.content), tagline } } : {}),
            },
          });
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        skipped += 1;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[composeDeckCopy] ${slide.type} threw:`, e instanceof Error ? e.message : e);
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

// ─── Generate illustrations (the slow image step, run separately) ─────────────

export type GenerateVisualsResult =
  | { illustrations: number; icons: number; errors: number }
  | { error: string };

/**
 * Generates the IMAGE assets for a deck after the (fast, text-only) copy draft:
 * the Objective hub + zone line-art illustrations (from stored scene
 * descriptions) and any missing Blueprint scope-item icons. Skips assets that
 * already exist so it can be re-run safely. Kept separate from composeDeckCopy
 * so the text draft stays fast and never blocks on image generation.
 */
async function getProjectRooms(
  projectId: string,
): Promise<{ name: string; scopeNarrative: string; bucket: string }[]> {
  const rooms = await prisma.room.findMany({
    where: { projectId, isProjectOverhead: false },
    select: { name: true, scopeNarrative: true, bucket: true },
    orderBy: { sortOrder: "asc" },
  });
  return rooms.map((r) => ({ name: r.name, scopeNarrative: r.scopeNarrative ?? "", bucket: String(r.bucket) }));
}

export async function generateDeckVisuals(projectId: string): Promise<GenerateVisualsResult> {
  const deck = await prisma.proposalDeck.findUnique({
    where: { projectId },
    include: { slides: { select: { id: true, type: true, layoutKey: true, content: true } } },
  });
  if (!deck) return { error: "No deck yet — draft slide copy first." };

  let illustrations = 0;
  let icons = 0;
  let errors = 0;

  for (const slide of deck.slides) {
    try {
      if (slide.type === "objective") {
        const content = asObject(slide.content);
        const pillars = Array.isArray(content.pillars)
          ? (content.pillars as Array<Record<string, unknown>>)
          : [];
        if (pillars.length === 0) continue;
        const hubScene = typeof content.hubScene === "string" ? content.hubScene : "";
        const hasHub = typeof content.hubImageUrl === "string" && !!content.hubImageUrl;
        // Hub first, then zones throttled — the old all-at-once burst tripped
        // rate limits on a cold cache (hub drew, every zone silently failed).
        const hubImg = !hasHub && hubScene ? await genObjectiveIllustration(hubScene, "the home") : null;
        const zoneImgs = await mapWithConcurrency(pillars, 2, (p) => {
          const scene = typeof p.scene === "string" ? p.scene : "";
          const has = typeof p.imageUrl === "string" && !!p.imageUrl;
          const title = typeof p.title === "string" ? p.title : "zone";
          return !has && scene ? genObjectiveIllustration(scene, title) : Promise.resolve(null);
        });
        const newPillars = pillars.map((p, i) => (zoneImgs[i] ? { ...p, imageUrl: zoneImgs[i] } : p));
        const got = (hubImg ? 1 : 0) + zoneImgs.filter(Boolean).length;
        if (got > 0) {
          await prisma.deckSlide.update({
            where: { id: slide.id },
            data: {
              content: {
                ...content,
                pillars: newPillars,
                ...(hubImg ? { hubImageUrl: hubImg } : {}),
              } as unknown as Prisma.InputJsonObject,
            },
          });
          illustrations += got;
        }
      } else if (slide.type === "scope-overview" && slide.layoutKey === "blueprint-icons") {
        const content = asObject(slide.content);
        let items = Array.isArray(content.scopeItems)
          ? (content.scopeItems as Array<Record<string, unknown>>)
          : [];
        let changed = false;

        // 1. Create structured scope items from the project scope if there are
        //    none (so the layout shows real items + icons instead of generic
        //    description sentences). Runs even on user-modified slides — this is
        //    an explicit "generate visuals" request.
        if (items.length === 0) {
          const rooms = await getProjectRooms(projectId);
          const draft = await draftScopeItems(rooms);
          if (draft.items.length > 0) {
            items = draft.items.map((it) => ({ title: it.title, detail: it.detail || null, icon: it.icon }));
            changed = true;
          }
        }
        if (items.length === 0) continue;

        // 2. Attach a hero photo if the slide has none (Blueprint needs one).
        let selectedPhotos = Array.isArray(content.selectedPhotos)
          ? (content.selectedPhotos as unknown[])
          : [];
        if (selectedPhotos.length === 0) {
          const hero = await findScopeHeroPhoto(projectId);
          if (hero) {
            selectedPhotos = [{ id: hero.id, url: hero.url, thumbnailUrl: hero.thumbnailUrl }];
            changed = true;
          }
        }

        // 3. Draw a BrandIcon line-art per item that doesn't have one yet.
        const needIcons = items.some(
          (it) => !(typeof it.iconImageUrl === "string" && it.iconImageUrl) && typeof it.title === "string",
        );
        if (needIcons) {
          const imageMap = await resolveScopeIconImages(
            items.map((it) => String(it.title ?? "")),
            { generateMissing: true },
          );
          items = items.map((it) => {
            if (typeof it.iconImageUrl === "string" && it.iconImageUrl) return it;
            const url = imageMap.get(scopeIconSlug(String(it.title ?? "")));
            if (url) {
              icons += 1;
              changed = true;
              return { ...it, iconImageUrl: url };
            }
            return it;
          });
        }

        if (changed) {
          await prisma.deckSlide.update({
            where: { id: slide.id },
            data: { content: { ...content, scopeItems: items, selectedPhotos } as unknown as Prisma.InputJsonObject },
          });
        }
      }
    } catch {
      errors += 1;
    }
  }

  revalidatePath(`/admin/projects/${projectId}/deck`);
  return { illustrations, icons, errors };
}
