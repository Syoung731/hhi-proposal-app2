"use server";

import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";
import { getDeckForProject, regenerateDefaultDeck, saveAllSlides } from "@/app/lib/deck/db";
import { adaptBrandingForDeck } from "@/app/lib/deck/branding-adapter";
import { getOrCreateCompanySettings } from "@/app/admin/settings/actions";
import type { ProposalSlide, WhyUsPillarItem, WhyUsContent, AdditionBullet } from "@/app/lib/deck/types";
import { isDeckThemeKey, type DeckThemeKey } from "@/app/lib/deck/themes";
import { callClaude } from "@/app/lib/ai/model";
import { aiEditSlide, type AiEditResult } from "@/app/lib/deck/ai-edit";
import { resolveDuotoneIconImages, scopeIconSlug } from "@/app/lib/deck/scope-icon-resolver";

// ─── fetchProjectScopeOverviewAction ─────────────────────────────────────────

/**
 * Fetches the AI-generated scope overview text from the Project record.
 * Used by the InspectorPanel "Pull from Overview" button.
 */
export async function fetchProjectScopeOverviewAction(
  projectId: string
): Promise<{ scopeOverview: string | null }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { scopeOverview: true },
  });
  return { scopeOverview: project?.scopeOverview ?? null };
}

// ─── fetchFloorPlanRoomDataAction ────────────────────────────────────────────

/**
 * Rooms + computed square footage for the Floor Plan slide's "Pull rooms & SF"
 * button. SF = lengthFt × widthFt (the same dimensions that drive pricing),
 * so the callout cards can never drift from the data the estimate used.
 */
/** Fallback zone description (used only until the AI blurbs load): the first
 *  sentence, word-boundary capped to fit a narrow callout card. */
function zoneDescriptionFor(room: { scopeOverviewShort: string | null; scopeNarrative: string }): string | null {
  const src = (room.scopeOverviewShort ?? room.scopeNarrative ?? "").trim();
  if (!src) return null;
  const first = src.split(/(?<=[.!?])\s+/)[0] ?? src;
  if (first.length <= 120) return first;
  const cut = first.slice(0, 120);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : 120).trimEnd()}…`;
}

export async function fetchFloorPlanRoomDataAction(
  projectId: string
): Promise<{ rooms: { id: string; name: string; sqft: number | null; description: string | null }[]; rendrSpaceId: number | null }> {
  await requireAdmin();
  const [rooms, project] = await Promise.all([
    prisma.room.findMany({
      where: { projectId, isProjectOverhead: false },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, lengthFt: true, widthFt: true, scopeOverviewShort: true, scopeNarrative: true },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { rendrSpaceId: true } }),
  ]);
  return {
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      sqft: r.lengthFt != null && r.widthFt != null ? Math.round(r.lengthFt * r.widthFt) : null,
      description: zoneDescriptionFor(r),
    })),
    rendrSpaceId: project?.rendrSpaceId ?? null,
  };
}

// ─── saveFloorPlanImageAction ────────────────────────────────────────────────

/**
 * Persists a rasterized floor-plan page (PNG data URL from the client-side
 * pdf.js conversion of the Rendr PDF) to R2 and returns its public URL.
 * Stays under the 5mb server-action body limit set in next.config.ts.
 */
export async function saveFloorPlanImageAction(
  projectId: string,
  dataUrl: string
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) return { error: "Expected a PNG data URL" };
  const b64 = dataUrl.slice(prefix.length);
  if (b64.length > 4_500_000) return { error: "Rendered plan is too large — try again (it will render smaller)" };
  try {
    const buf = Buffer.from(b64, "base64");
    const { uploadBuffer } = await import("@/app/lib/s3");
    const { publicUrl } = await uploadBuffer(`deck/floor-plans/${projectId}-${Date.now()}.png`, buf, "image/png");
    return { url: publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to save plan image" };
  }
}

// ─── composeZoneDescriptionsAction ───────────────────────────────────────────

/**
 * One Claude call that compresses every room's scope into a callout-card
 * blurb (≤2 short sentences). Used by the Floor Plan inspector's
 * "Pull rooms & SF" so zone descriptions always FIT the card instead of
 * truncating mid-word. Falls back silently — callers keep the deterministic
 * snippet when this errors.
 */
export async function composeZoneDescriptionsAction(
  projectId: string
): Promise<{ blurbs: Record<string, string> } | { error: string }> {
  await requireAdmin();
  const rooms = await prisma.room.findMany({
    where: { projectId, isProjectOverhead: false },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, scopeOverviewShort: true, scopeNarrative: true },
  });
  const withScope = rooms.filter((r) => (r.scopeOverviewShort ?? r.scopeNarrative ?? "").trim().length > 0);
  if (withScope.length === 0) return { blurbs: {} };
  try {
    const list = withScope
      .map((r) => `ROOM ${r.id} — ${r.name}:\n${(r.scopeOverviewShort ?? r.scopeNarrative ?? "").trim().slice(0, 600)}`)
      .join("\n\n");
    const msg = await callClaude({
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content:
            "Each room below has a renovation scope summary. For EACH room, rewrite the scope as a tight callout-card blurb: " +
            "ONE short sentence, 110 characters max — these render in a very narrow card, so shorter is better. Lead with the " +
            "most concrete scope items (what gets replaced/added), no marketing fluff, do not repeat the room name.\n\n" +
            list +
            '\n\nReturn ONLY a JSON object mapping room id to blurb: {"<roomId>": "<blurb>", ...}',
        },
      ],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: "AI returned no JSON" };
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const blurbs: Record<string, string> = {};
    for (const r of withScope) {
      const v = parsed[r.id];
      if (typeof v === "string" && v.trim()) blurbs[r.id] = v.trim().slice(0, 140);
    }
    return { blurbs };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to compose zone descriptions" };
  }
}

// ─── generateCraftsmanshipPhotoAction ────────────────────────────────────────

/**
 * Builds the Craftsmanship slide's Annotated Photo from the PROJECT'S OWN
 * recommended materials: pulls the material line items from each room's
 * latest AI estimate (+ style preset aesthetics), has Claude pick the 4-6
 * most visually distinctive ones and write a photo brief + matching callout
 * items, then Gemini renders one photorealistic detail vignette. Returns the
 * uploaded photo URL and the callout items (pins are placed manually).
 */
export type CraftsmanshipPhotoStyle = "vignette" | "technical" | "collage";

const CRAFTSMANSHIP_STYLE_BRIEFS: Record<CraftsmanshipPhotoStyle, string> = {
  vignette:
    "<one detailed prompt for a photorealistic, magazine-quality CLOSE-UP vignette showing those materials together: " +
    "camera angle, soft natural light, shallow depth of field, NO people, NO text or labels, NO brand logos>",
  technical:
    "<one detailed prompt for an EXPLODED ISOMETRIC TECHNICAL ILLUSTRATION of the assembly: clean architectural line art, " +
    "deep navy (#1A2332) linework with selective burnt-orange (#F47216) accents and light warm-gray fills, white background, " +
    "the chosen materials drawn as vertically separated layers/components of one cutaway (like an architect's exploded axonometric), " +
    "thin construction/projection lines connecting the layers, NO text, NO labels, NO dimensions, NO people>",
  collage:
    "<one detailed prompt for a COLLAGE composition: 3-4 overlapping rectangular photo panels, each panel a photorealistic " +
    "close-up of ONE of the chosen materials, panels staggered with thin white borders and subtle drop shadows, arranged over " +
    "a faint ghosted architectural floor-plan line drawing on a white/off-white background, NO text, NO labels, NO brand logos>",
};

/** Material line items (latest estimate per non-COPE room) + style context —
 *  shared by the annotated-photo and standards-grid AI builds. */
async function gatherProjectMaterials(projectId: string): Promise<
  | { topMaterials: { name: string; room: string; price: number }[]; styleNames: string[]; stylePromptSnippet: string }
  | { error: string }
> {
  const estimates = await prisma.aIEstimate.findMany({
    where: { projectId, section: { isProjectOverhead: false } },
    orderBy: { createdAt: "desc" },
    include: {
      lineItems: { select: { name: true, tradeGroup: true, totalPrice: true } },
      section: { select: { id: true, name: true, stylePreset: { select: { name: true, prompt: true } } } },
    },
  });
  const latestPerRoom = new Map<string, (typeof estimates)[number]>();
  for (const est of estimates) {
    if (!latestPerRoom.has(est.sectionId)) latestPerRoom.set(est.sectionId, est);
  }
  const materials: { name: string; room: string; price: number }[] = [];
  const styleNames = new Set<string>();
  let stylePromptSnippet = "";
  for (const est of latestPerRoom.values()) {
    if (est.section.stylePreset) {
      styleNames.add(est.section.stylePreset.name);
      if (!stylePromptSnippet) stylePromptSnippet = est.section.stylePreset.prompt.slice(0, 240);
    }
    for (const li of est.lineItems) {
      if (/material/i.test(li.name)) materials.push({ name: li.name, room: est.section.name, price: li.totalPrice });
    }
  }
  if (materials.length === 0) {
    return { error: "No material line items found — generate the room estimates first." };
  }
  materials.sort((a, b) => b.price - a.price);
  return { topMaterials: materials.slice(0, 24), styleNames: [...styleNames], stylePromptSnippet };
}

export async function generateCraftsmanshipPhotoAction(
  projectId: string,
  style: CraftsmanshipPhotoStyle = "vignette"
): Promise<{ url: string; items: { title: string; description: string }[] } | { error: string }> {
  await requireAdmin();
  try {
    const gathered = await gatherProjectMaterials(projectId);
    if ("error" in gathered) return gathered;
    const { topMaterials, styleNames, stylePromptSnippet } = gathered;

    // 1) Claude curates the materials and writes the photo brief + callouts.
    const msg = await callClaude({
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content:
            "You are art-directing ONE hero visual for a luxury remodel proposal's " +
            '"Material & Assembly Standards" slide. Callout cards with leader lines will pin onto specific details in the image.\n\n' +
            `RECOMMENDED MATERIALS for this project (from the estimate, priciest first):\n${topMaterials.map((m) => `- ${m.name} (${m.room})`).join("\n")}\n\n` +
            (styleNames.length > 0 ? `STYLE: ${styleNames.join(", ")}. ${stylePromptSnippet}\n\n` : "") +
            "Pick the 4-6 most VISUALLY DISTINCTIVE materials that can plausibly be featured together in ONE composition " +
            "(e.g. countertop edge, cabinet door + hardware, backsplash tile, flooring, lighting detail). " +
            "Then return ONLY JSON:\n" +
            '{"imagePrompt": "' +
            CRAFTSMANSHIP_STYLE_BRIEFS[style] +
            '", ' +
            '"items": [{"title": "<material name, 2-4 words>", "description": "<one sentence, max 110 chars, what we install and why it matters>"}]}',
        },
      ],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: "AI returned no photo brief" };
    const plan = JSON.parse(jsonMatch[0]) as { imagePrompt?: string; items?: { title?: string; description?: string }[] };
    if (!plan.imagePrompt || !Array.isArray(plan.items) || plan.items.length === 0) {
      return { error: "AI photo brief was incomplete — try again" };
    }

    // 2) Gemini renders the vignette.
    const { getGeminiApiKey } = await import("@/app/integrations/gemini");
    const apiKey = await getGeminiApiKey();
    if (!apiKey?.trim()) return { error: "Gemini API key not configured (Settings → Integrations)" };
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [{ role: "user", parts: [{ text: plan.imagePrompt }] }],
      config: { responseModalities: ["IMAGE"] },
    });
    const parts =
      (result as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] })
        ?.candidates?.[0]?.content?.parts ?? [];
    let b64: string | null = null;
    for (const p of parts) {
      if (p.inlineData?.data) {
        b64 = p.inlineData.data;
        break;
      }
    }
    if (!b64) return { error: "Gemini returned no image — try again" };

    const { uploadBuffer } = await import("@/app/lib/s3");
    const { publicUrl } = await uploadBuffer(
      `deck/craftsmanship/${projectId}-${Date.now()}.png`,
      Buffer.from(b64, "base64"),
      "image/png"
    );
    const items = plan.items
      .filter((it) => typeof it.title === "string" && it.title.trim())
      .slice(0, 6)
      .map((it) => ({ title: (it.title as string).trim(), description: (it.description ?? "").trim().slice(0, 140) }));
    return { url: publicUrl, items };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Photo generation failed" };
  }
}

// ─── generateCraftsmanshipCollageAction ──────────────────────────────────────

/**
 * Standards Grid version of the materials build: Claude picks the 6 most
 * important materials, writes a standards item for each (assigned to the
 * Structural/Finish columns) plus a per-material macro photo brief; Gemini
 * renders each macro shot in parallel. Returns the collage cell URLs and
 * the matching items.
 */
export async function generateCraftsmanshipCollageAction(
  projectId: string
): Promise<{ photos: string[]; items: { title: string; description: string; column: "a" | "b" }[] } | { error: string }> {
  await requireAdmin();
  try {
    const gathered = await gatherProjectMaterials(projectId);
    if ("error" in gathered) return gathered;
    const { topMaterials, styleNames, stylePromptSnippet } = gathered;

    const msg = await callClaude({
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content:
            'You are building a "Material & Assembly Standards" slide for a luxury remodel proposal: two titled standards ' +
            'columns ("Structural & Preparation" and "Finish & Function") beside a collage of macro detail photographs.\n\n' +
            `RECOMMENDED MATERIALS for this project (from the estimate, priciest first):\n${topMaterials.map((m) => `- ${m.name} (${m.room})`).join("\n")}\n\n` +
            (styleNames.length > 0 ? `STYLE: ${styleNames.join(", ")}. ${stylePromptSnippet}\n\n` : "") +
            "Pick the 6 most important materials (mix structural/prep and finish). For EACH return:\n" +
            '- "title": material name, 2-4 words\n' +
            '- "description": one sentence, max 110 chars, what we install and why it matters\n' +
            '- "column": "a" for Structural & Preparation, "b" for Finish & Function (aim for 3 each)\n' +
            '- "photoPrompt": a prompt for ONE photorealistic SQUARE macro close-up of that material/detail — texture-forward, soft natural light, shallow depth of field, NO people, NO text, NO brand logos\n\n' +
            'Return ONLY JSON: {"items": [{"title": "...", "description": "...", "column": "a", "photoPrompt": "..."}]}',
        },
      ],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { error: "AI returned no plan" };
    const plan = JSON.parse(jsonMatch[0]) as { items?: { title?: string; description?: string; column?: string; photoPrompt?: string }[] };
    const planned = (plan.items ?? []).filter((it) => typeof it.title === "string" && it.title.trim() && typeof it.photoPrompt === "string").slice(0, 6);
    if (planned.length === 0) return { error: "AI plan was incomplete — try again" };

    const { getGeminiApiKey } = await import("@/app/integrations/gemini");
    const apiKey = await getGeminiApiKey();
    if (!apiKey?.trim()) return { error: "Gemini API key not configured (Settings → Integrations)" };
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const { uploadBuffer } = await import("@/app/lib/s3");

    const stamp = Date.now();
    const rendered = await Promise.all(
      planned.map(async (it, i) => {
        try {
          const result = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: [{ role: "user", parts: [{ text: it.photoPrompt as string }] }],
            config: { responseModalities: ["IMAGE"] },
          });
          const parts =
            (result as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] })
              ?.candidates?.[0]?.content?.parts ?? [];
          for (const p of parts) {
            if (p.inlineData?.data) {
              const { publicUrl } = await uploadBuffer(
                `deck/craftsmanship/${projectId}-cell${i}-${stamp}.png`,
                Buffer.from(p.inlineData.data, "base64"),
                "image/png"
              );
              return publicUrl;
            }
          }
          return null;
        } catch {
          return null;
        }
      })
    );
    const photos = rendered.filter((u): u is string => !!u);
    if (photos.length === 0) return { error: "Gemini returned no images — try again" };

    const items = planned.map((it) => ({
      title: (it.title as string).trim(),
      description: (it.description ?? "").trim().slice(0, 140),
      column: (it.column === "b" ? "b" : "a") as "a" | "b",
    }));
    return { photos, items };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Collage build failed" };
  }
}

// ─── autoCropFloorPlanAction ─────────────────────────────────────────────────

/**
 * "Crop to the grid": Gemini VISION locates the floor-plan drawing area
 * (the graph-paper region with the wall linework) as a bounding box, then
 * sharp cuts those exact pixels — no generative redraw, the linework is
 * untouched. Writes a NEW R2 object; re-import restores the original.
 */
export async function autoCropFloorPlanAction(
  projectId: string,
  imageUrl: string
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return { error: `Could not load the current plan image (${res.status})` };
    const srcBuf = Buffer.from(await res.arrayBuffer());

    const { getGeminiApiKey } = await import("@/app/integrations/gemini");
    const apiKey = await getGeminiApiKey();
    if (!apiKey?.trim()) return { error: "Gemini API key not configured (Settings → Integrations)" };
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/png", data: srcBuf.toString("base64") } },
            {
              text:
                "This is a scanned floor-plan sheet. Find the bounding box of the floor-plan DRAWING AREA only — the " +
                "graph-paper/grid region containing the wall linework, including all of its grid. EXCLUDE any logo or " +
                "wordmark, address/date text block, page number, and scale/legend boxes that sit outside the drawing. " +
                'Return ONLY JSON: {"left": <0-100>, "top": <0-100>, "right": <0-100>, "bottom": <0-100>} as percentages ' +
                "of the image width/height.",
            },
          ],
        },
      ],
    });

    const text =
      (result as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
        ?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "")
        .join("") ?? "";
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return { error: "AI couldn't locate the plan area — use the Trim sliders instead" };
    const box = JSON.parse(jsonMatch[0]) as { left?: number; top?: number; right?: number; bottom?: number };
    const pad = 1; // breathe 1% so the grid edge isn't shaved
    const left = Math.max(0, Math.min(100, Number(box.left ?? 0) - pad));
    const top = Math.max(0, Math.min(100, Number(box.top ?? 0) - pad));
    const right = Math.max(0, Math.min(100, Number(box.right ?? 100) + pad));
    const bottom = Math.max(0, Math.min(100, Number(box.bottom ?? 100) + pad));
    if (!(right - left >= 20 && bottom - top >= 20)) {
      return { error: "AI returned an implausible crop box — use the Trim sliders instead" };
    }

    const sharp = (await import("sharp")).default;
    const meta = await sharp(srcBuf).metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return { error: "Could not read the plan image dimensions" };
    const ex = {
      left: Math.round((left / 100) * W),
      top: Math.round((top / 100) * H),
      width: Math.min(W, Math.round(((right - left) / 100) * W)),
      height: Math.min(H, Math.round(((bottom - top) / 100) * H)),
    };
    if (ex.left + ex.width > W) ex.width = W - ex.left;
    if (ex.top + ex.height > H) ex.height = H - ex.top;
    const outBuf = await sharp(srcBuf).extract(ex).png().toBuffer();

    const { uploadBuffer } = await import("@/app/lib/s3");
    const { publicUrl } = await uploadBuffer(
      `deck/floor-plans/${projectId}-crop-${Date.now()}.png`,
      outBuf,
      "image/png"
    );
    return { url: publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Auto-crop failed" };
  }
}

// ─── cleanFloorPlanImageAction ───────────────────────────────────────────────

/**
 * Gemini image-edit pass over the imported plan: strips dimension chips,
 * logos, address/timestamp blocks, and legends while keeping the wall
 * linework. Writes a NEW R2 object so the original import stays available
 * (re-import to undo).
 */
export async function cleanFloorPlanImageAction(
  projectId: string,
  imageUrl: string
): Promise<{ url: string } | { error: string }> {
  await requireAdmin();
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return { error: `Could not load the current plan image (${res.status})` };
    const srcB64 = Buffer.from(await res.arrayBuffer()).toString("base64");

    const { getGeminiApiKey } = await import("@/app/integrations/gemini");
    const apiKey = await getGeminiApiKey();
    if (!apiKey?.trim()) return { error: "Gemini API key not configured (Settings → Integrations)" };
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/png", data: srcB64 } },
            {
              text:
                "Clean up this architectural floor plan image for a client presentation. REMOVE: every dimension label and " +
                "measurement chip, all small text annotations, any logo or wordmark, the address/date/timestamp block, page " +
                "numbers, and the scale/legend boxes. KEEP EXACTLY AS DRAWN: all wall linework, doors, windows, openings, " +
                "fixtures, the graph-paper background, and the overall framing/geometry. Do not redraw, restyle, or move " +
                "anything — only erase the listed annotations. Output the cleaned plan as an image.",
            },
          ],
        },
      ],
      config: { responseModalities: ["IMAGE"] },
    });

    const parts =
      (result as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] })
        ?.candidates?.[0]?.content?.parts ?? [];
    let outB64: string | null = null;
    for (const p of parts) {
      if (p.inlineData?.data) {
        outB64 = p.inlineData.data;
        break;
      }
    }
    if (!outB64) return { error: "Gemini returned no image — try again" };

    const { uploadBuffer } = await import("@/app/lib/s3");
    const { publicUrl } = await uploadBuffer(
      `deck/floor-plans/${projectId}-clean-${Date.now()}.png`,
      Buffer.from(outB64, "base64"),
      "image/png"
    );
    return { url: publicUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Plan cleanup failed" };
  }
}

// ─── deleteProjectDeckAction ─────────────────────────────────────────────────

/**
 * Delete the entire deck for a project so the user can start over. Removes the
 * ProposalDeck row, which cascades to all DeckSlide rows (schema onDelete:
 * Cascade). Does NOT touch media/renders/rooms — only the slide deck. After
 * this, the deck editor shows the empty "Generate Default Deck" state again.
 */
export async function deleteProjectDeckAction(
  projectId: string,
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  if (!projectId) return { error: "Missing projectId" };
  try {
    await prisma.proposalDeck.deleteMany({ where: { projectId } });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to delete deck" };
  }
}

// ─── aiEditSlideAction (generic smart box) ───────────────────────────────────

/**
 * Universal prompt-driven "AI Edit" for ANY slide. One instruction; the engine
 * infers intent (copy / style / layout / icons / background / photo swap) within
 * the slide type's declared capabilities and returns a patch the client applies
 * via onUpdate (autosave + isUserModified + undo snapshot). Slide types without
 * a descriptor degrade to headline + background editing.
 */
export async function aiEditSlideAction(params: {
  slideId: string;
  prompt: string;
}): Promise<AiEditResult> {
  await requireAdmin();
  try {
    return await aiEditSlide(params);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI edit failed" };
  }
}

// ─── generateWhyUsPillarIconsAction (Guarantee Grid isometric icons) ─────────

/**
 * Generate (or reuse cached) isometric icons for the Why Us Value Pillars — the
 * same self-growing isometric pipeline the Design Experience slide uses. Returns
 * a map of pillar id → public PNG URL; the client writes each onto the pillar's
 * `iconImageUrl` and autosaves. The Guarantee Grid renders these mask-tinted in
 * the accent so they read as orange isometric line icons on the dark panel.
 */
export async function generateWhyUsPillarIconsAction(params: {
  pillars: { id: string; title: string }[];
}): Promise<{ ok: true; icons: Record<string, string> } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    const titles = params.pillars.map((p) => p.title).filter((t) => t && t.trim().length > 0);
    if (titles.length === 0) return { ok: true, icons: {} };
    const map = await resolveDuotoneIconImages(titles, { generateMissing: true, dark: true });
    const icons: Record<string, string> = {};
    for (const p of params.pillars) {
      const url = map.get(scopeIconSlug(p.title));
      if (url) icons[p.id] = url;
    }
    return { ok: true, icons };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Icon generation failed" };
  }
}

// ─── updateDeckThemeAction ───────────────────────────────────────────────────

/**
 * Persists the deck-level visual theme on ProposalDeck. Deck-level (not slide-
 * level) setting, so it has its own tiny update action.
 */
export async function updateDeckThemeAction(
  projectId: string,
  deckTheme: DeckThemeKey,
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  if (!isDeckThemeKey(deckTheme)) {
    return { error: "Invalid theme" };
  }
  try {
    await prisma.proposalDeck.update({
      where: { projectId },
      data: { deckTheme },
    });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update theme" };
  }
}

// ─── saveDeckSlidesAction ────────────────────────────────────────────────────

/**
 * Persists the current slide state from the editor to the database.
 * Called automatically by the auto-save debounce and by the manual Save button.
 */
export async function saveDeckSlidesAction(
  projectId: string,
  slides: ProposalSlide[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    await saveAllSlides(projectId, slides);
    return { ok: true };
  } catch (err) {
    console.error("[saveDeckSlidesAction]", err);
    return { ok: false, error: String(err) };
  }
}

// ─── generateDefaultDeckAction ────────────────────────────────────────────────

/**
 * Server-side entry point for the "Generate Default Deck" button.
 *
 * Validates preconditions (≥1 Room, project has a title + client name),
 * then calls regenerateDefaultDeck() in the chosen mode. Re-injects live
 * coverHeroUrl and valuePillars into the returned slides so the editor
 * immediately renders the current state.
 */
export async function generateDefaultDeckAction(
  projectId: string,
  mode: "keep-manual" | "replace-all"
): Promise<{ slides: ProposalSlide[]; error?: string }> {
  try {
    // Fetch project + preconditions data.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        client1First: true,
        client1Last: true,
        addressLine1: true,
        city: true,
        state: true,
        zip: true,
        coverHeroImageId: true,
        hasAddition: true,
        media: { select: { id: true, url: true, kind: true }, orderBy: { sortOrder: "asc" } },
      },
    });

    if (!project) return { slides: [], error: "Project not found" };

    // Precondition checks.
    const missing: string[] = [];
    if (!project.title?.trim()) missing.push("project title");
    if (!project.client1First?.trim() || !project.client1Last?.trim()) {
      missing.push("primary client name");
    }

    const roomCount = await prisma.room.count({ where: { projectId } });
    if (roomCount < 1) missing.push("at least one room");

    if (missing.length > 0) {
      return {
        slides: [],
        error: `Missing required project data: ${missing.join(", ")}.`,
      };
    }

    const clientName =
      [project.client1First, project.client1Last].filter(Boolean).join(" ") || null;
    const addressParts = [
      project.addressLine1,
      project.city,
      [project.state, project.zip].filter(Boolean).join(" "),
    ].filter(Boolean);
    const address = addressParts.length ? addressParts.join(", ") : null;
    const coverHeroUrl =
      project.media.find((m) => m.id === project.coverHeroImageId)?.url ??
      project.media.find((m) => m.kind === "COVER")?.url ??
      project.media[0]?.url ??
      null;

    // Fetch rooms with media for the regenerate call.
    const rawRooms = await prisma.room.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        selectedRenderMediaId: true,
        scopeNarrative: true,
        scopeOverviewShort: true,
        isProjectOverhead: true,
        media: {
          where: {
            OR: [{ type: "EXISTING" }, { type: "RENDERING", renderStatus: "DONE" }],
          },
          select: { id: true, url: true, kind: true, type: true, renderStatus: true, caption: true, parentMediaId: true, sourceMediaId: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const roomsWithMedia = rawRooms.map((room) => ({
      id: room.id,
      name: room.name,
      sortOrder: room.sortOrder,
      selectedRenderMediaId: room.selectedRenderMediaId,
      scopeNarrative: room.scopeNarrative ?? undefined,
      scopeOverviewShort: room.scopeOverviewShort,
      isProjectOverhead: room.isProjectOverhead,
      beforeMedia: room.media
        .filter((m) => m.type === "EXISTING")
        .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption })),
      renderMedia: (() => {
        const doneRenders = room.media.filter((m) => m.type === "RENDERING" && m.renderStatus === "DONE");
        const seenSources = new Set<string>();
        return doneRenders
          .filter((m) => {
            if (m.parentMediaId != null) return true;
            const key = m.sourceMediaId ?? m.id;
            if (seenSources.has(key)) return false;
            seenSources.add(key);
            return true;
          })
          .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption }));
      })(),
    }));

    // Regenerate.
    const slides = await regenerateDefaultDeck({
      projectId,
      projectTitle: project.title,
      clientName,
      address,
      roomsWithMedia,
      hasAddition: project.hasAddition,
      mode,
    });

    // Inject live cover hero URL.
    if (coverHeroUrl) {
      for (const slide of slides) {
        if (slide.type === "cover") {
          slide.content = { ...(slide.content ?? {}), heroImageUrl: coverHeroUrl };
        }
      }
    }

    // Inject live value pillars.
    let valuePillars: WhyUsPillarItem[] = [];
    try {
      const company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
      if (company) {
        const rawPillars = await prisma.valuePillar.findMany({
          where: { companyId: company.id },
          orderBy: { sortOrder: "asc" },
          include: { brandIcon: { select: { id: true, imageUrl: true } } },
        });
        valuePillars = rawPillars.map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          iconUrl: p.brandIcon?.imageUrl ?? null,
        }));
      }
    } catch {
      // Non-fatal
    }
    if (valuePillars.length > 0) {
      for (const slide of slides) {
        if (slide.type === "why-us") {
          const content = (slide.content ?? {}) as WhyUsContent;
          slide.content = {
            ...content,
            pillars: valuePillars,
            selectedPillarIds:
              content.selectedPillarIds && content.selectedPillarIds.length > 0
                ? content.selectedPillarIds
                : valuePillars.map((p) => p.id),
          };
        }
      }
    }

    return { slides };
  } catch (err) {
    console.error("[generateDefaultDeckAction]", err);
    return { slides: [], error: String(err) };
  }
}

// ─── refreshDeckAction ───────────────────────────────────────────────────────

/**
 * Re-runs the full server-side sync and returns fresh slides.
 *
 * Flow:
 *   1. Save the caller's current slides so user edits aren't lost.
 *   2. Re-fetch rooms, value pillars, and project metadata.
 *   3. Run getDeckForProject (which auto-syncs before-after + scope-breakdown).
 *   4. Re-inject live coverHeroUrl and valuePillars into the returned slides.
 *   5. Return the updated slide list.
 */
export async function refreshDeckAction(
  projectId: string,
  currentSlides: ProposalSlide[]
): Promise<{ slides: ProposalSlide[]; error?: string }> {
  try {
    // 1. Persist current state before syncing so user edits are preserved.
    await saveAllSlides(projectId, currentSlides);

    // 2. Re-fetch project metadata.
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        client1First: true,
        client1Last: true,
        addressLine1: true,
        city: true,
        state: true,
        zip: true,
        coverHeroImageId: true,
        hasAddition: true,
        media: { select: { id: true, url: true, kind: true }, orderBy: { sortOrder: "asc" } },
      },
    });

    if (!project) return { slides: currentSlides, error: "Project not found" };

    const clientName =
      [project.client1First, project.client1Last].filter(Boolean).join(" ") || null;

    const addressParts = [
      project.addressLine1,
      project.city,
      [project.state, project.zip].filter(Boolean).join(" "),
    ].filter(Boolean);
    const address = addressParts.length ? addressParts.join(", ") : null;

    const coverHeroUrl =
      project.media.find((m) => m.id === project.coverHeroImageId)?.url ??
      project.media.find((m) => m.kind === "COVER")?.url ??
      project.media[0]?.url ??
      null;

    // 3. Re-fetch rooms with media.
    const rawRooms = await prisma.room.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        selectedRenderMediaId: true,
        scopeNarrative: true,
        scopeOverviewShort: true,
        media: {
          where: {
            OR: [
              { type: "EXISTING" },
              { type: "RENDERING", renderStatus: "DONE" },
            ],
          },
          select: { id: true, url: true, kind: true, type: true, renderStatus: true, caption: true, parentMediaId: true, sourceMediaId: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    const roomsWithMedia = rawRooms.map((room) => ({
      id: room.id,
      name: room.name,
      sortOrder: room.sortOrder,
      selectedRenderMediaId: room.selectedRenderMediaId,
      scopeNarrative: room.scopeNarrative ?? undefined,
      scopeOverviewShort: room.scopeOverviewShort,
      beforeMedia: room.media
        .filter((m) => m.type === "EXISTING")
        .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption })),
      renderMedia: (() => {
        const doneRenders = room.media.filter((m) => m.type === "RENDERING" && m.renderStatus === "DONE");
        // Exclude orphaned children: when a parent render is deleted, its children get parentMediaId=null
        // and look like duplicate roots. Keep only the first root per sourceMediaId.
        const seenSources = new Set<string>();
        return doneRenders
          .filter((m) => {
            if (m.parentMediaId != null) return true; // child of existing root — keep
            const key = m.sourceMediaId ?? m.id;
            if (seenSources.has(key)) return false; // duplicate root — orphan
            seenSources.add(key);
            return true;
          })
          .map((m) => ({ id: m.id, url: m.url, kind: m.kind, renderStatus: m.renderStatus, caption: m.caption }));
      })(),
    }));

    // 4. Re-fetch value pillars.
    let valuePillars: WhyUsPillarItem[] = [];
    try {
      const company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
      if (company) {
        const rawPillars = await prisma.valuePillar.findMany({
          where: { companyId: company.id },
          orderBy: { sortOrder: "asc" },
          include: { brandIcon: { select: { id: true, imageUrl: true } } },
        });
        valuePillars = rawPillars.map((p) => ({
          id: p.id,
          title: p.title,
          body: p.body,
          iconUrl: p.brandIcon?.imageUrl ?? null,
        }));
      }
    } catch {
      // Non-fatal
    }

    // 5. Run full sync.
    const slides = await getDeckForProject({
      projectId,
      projectTitle: project.title,
      clientName,
      address,
      roomsWithMedia,
      hasAddition: project.hasAddition,
    });

    // 6. Inject live coverHeroUrl into cover slides.
    if (coverHeroUrl) {
      for (const slide of slides) {
        if (slide.type === "cover") {
          slide.content = { ...(slide.content ?? {}), heroImageUrl: coverHeroUrl };
        }
      }
    }

    // 7. Inject fresh value pillars into why-us slides.
    if (valuePillars.length > 0) {
      for (const slide of slides) {
        if (slide.type === "why-us") {
          const content = (slide.content ?? {}) as WhyUsContent;
          slide.content = {
            ...content,
            pillars: valuePillars,
            selectedPillarIds:
              content.selectedPillarIds && content.selectedPillarIds.length > 0
                ? content.selectedPillarIds
                : valuePillars.map((p) => p.id),
          };
        }
      }
    }

    return { slides };
  } catch (err) {
    console.error("[refreshDeckAction]", err);
    return { slides: currentSlides, error: String(err) };
  }
}

// ─── generateAdditionBulletsAction ──────────────────────────────────────────

const DEFAULT_ADDITION_BULLETS: AdditionBullet[] = [
  { id: "b1", label: "The Structure", description: "Foundations, structural framing, and all load-bearing elements engineered to current code standards." },
  { id: "b2", label: "Engineering & Systems", description: "Mechanical, electrical, and plumbing systems designed to serve the new space seamlessly." },
  { id: "b3", label: "Finishes & Site Work", description: "Interior finishes selected to complement the existing home, with exterior work matched to current materials." },
];

/**
 * Generate 3 scope-summary bullets for the Addition Overview slide
 * by pulling from the project's room scopes and summarizing via Claude.
 */
export async function generateAdditionBulletsAction(
  projectId: string
): Promise<{ bullets: AdditionBullet[]; fromAI: boolean }> {
  // Fetch all BASE rooms with scope narratives
  const rooms = await prisma.room.findMany({
    where: {
      projectId,
      bucket: "BASE",
    },
    select: { name: true, scopeNarrative: true },
    orderBy: { sortOrder: "asc" },
  });

  const roomsWithScope = rooms.filter((r) => r.scopeNarrative?.trim());

  if (roomsWithScope.length === 0) {
    return { bullets: DEFAULT_ADDITION_BULLETS, fromAI: false };
  }

  const formattedScopes = roomsWithScope
    .map((r) => `${r.name}:\n${r.scopeNarrative}`)
    .join("\n\n---\n\n");

  try {
    const response = await callClaude({
      system: `You are a proposal writer for a luxury design-build company. Extract exactly 3 bullet points from these room scopes for an Addition Overview slide. Each bullet has:
- A short bold label (2-4 words, e.g. "The Structure", "Engineering & Systems", "Site Work", "Interior Finishes")
- A description (1-2 sentences, specific to this project, client-facing elevated language, no contractor jargon)

Return JSON only:
{
  "bullets": [
    {"label": "...", "description": "..."},
    {"label": "...", "description": "..."},
    {"label": "...", "description": "..."}
  ]
}`,
      messages: [
        {
          role: "user",
          content: `Room scopes:\n\n${formattedScopes}\n\nGenerate 3 bullets that summarize the key scope areas for a property addition or major renovation project.`,
        },
      ],
      max_tokens: 512,
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Extract JSON from response (may be wrapped in markdown code fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[generateAdditionBullets] No JSON found in response");
      return { bullets: DEFAULT_ADDITION_BULLETS, fromAI: false };
    }

    const parsed = JSON.parse(jsonMatch[0]) as { bullets: { label: string; description: string }[] };
    if (!Array.isArray(parsed.bullets) || parsed.bullets.length === 0) {
      return { bullets: DEFAULT_ADDITION_BULLETS, fromAI: false };
    }

    const bullets: AdditionBullet[] = parsed.bullets.slice(0, 3).map((b, i) => ({
      id: `ai-${Date.now()}-${i}`,
      label: b.label,
      description: b.description,
    }));

    return { bullets, fromAI: true };
  } catch (err) {
    console.error("[generateAdditionBullets] Claude error:", err);
    return { bullets: DEFAULT_ADDITION_BULLETS, fromAI: false };
  }
}
