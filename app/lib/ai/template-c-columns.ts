import "server-only";
import { callClaude } from "@/app/lib/ai/model";
import { stripJsonFences } from "@/app/lib/ai/parse-json";

export type TemplateCColumnSuggestion = {
  title: string;
  description: string;
  iconId: string | null;
};

export type SuggestTemplateCColumnsInput = {
  /** Objective/executive title (e.g. "Executive Summary"). */
  objectiveTitle?: string | null;
  /** Main objective paragraph. */
  objectiveText?: string | null;
  /** Additional context: transcript, overview, or scope/sections/rooms text. */
  scopeContext?: string | null;
  /** Available icons: id must be returned as iconId when picking one. */
  icons: { id: string; slug: string; name: string; tags: string[] }[];
};

/**
 * Generate 3 Executive Summary columns plus a short subtitle (title + description + suggested icon) from objective context.
 * Picks iconId from the provided icons list by slug/name/tags fit.
 */
export async function suggestTemplateCColumns(
  input: SuggestTemplateCColumnsInput
): Promise<{ columns: TemplateCColumnSuggestion[]; subtitle: string }> {
  const { objectiveTitle, objectiveText, scopeContext, icons } = input;
  const iconList =
    icons.length > 0
      ? icons.map((i) => ({
          id: i.id,
          slug: i.slug,
          name: i.name,
          tags: Array.isArray(i.tags) ? i.tags.slice(0, 10) : [],
        }))
      : [];

  const systemContent = `You are an expert residential remodeling proposal writer.

Task: Generate exactly 3 columns for an "Executive Summary" section, plus one short subtitle. Each column has:
- title: 2–5 words, scope-of-work oriented (e.g. "Design & Selections", "Quality Assurance", "Communication").
- description: 1–2 sentences, client-facing, describing what the client can expect in that area.
- iconId: pick ONE icon from the provided list that best fits the column theme, or null if no good match.

Also provide:
- subtitle: 4–10 words, a short executive line that summarizes the overall objective and the three columns together (e.g. "Full-scope remodel with clear process and communication").

Rules:
- Return STRICT JSON only: { "columns": [ { "title": "...", "description": "...", "iconId": "id-or-null" }, ... ], "subtitle": "..." }
- Exactly 3 objects in columns array.
- subtitle: 4–10 words, title-case or sentence case, no period at end. Summarize the objective and the three columns.
- title: short, title-case, no period.
- description: 1–2 sentences, scope-of-work oriented, no marketing fluff.
- iconId: must be one of the provided icon "id" values, or null. Do not invent IDs.
- Use the objective title, objective text, and scope context to tailor the three columns and subtitle to the project.`;

  const iconJson = JSON.stringify(iconList, null, 0);
  const userContent = `Objective title: ${(objectiveTitle ?? "").trim() || "(none)"}

Objective paragraph:
${(objectiveText ?? "").trim() || "(none)"}

Scope/context (transcript, overview, or scope text):
${(scopeContext ?? "").trim().slice(0, 3000) || "(none)"}

Available icons (use "id" as iconId; pick one per column or null):
${iconJson}

Return JSON: { "columns": [ { "title": "...", "description": "...", "iconId": "..." | null }, ... ], "subtitle": "4-10 word executive summary line" } with exactly 3 column items and one subtitle string.`;

  const response = await callClaude({
    max_tokens: 2048,
    temperature: 0.4,
    system: systemContent,
    messages: [
      { role: "user", content: userContent },
    ],
  });

  const content = response.content[0]?.type === "text" ? response.content[0].text : null;
  if (!content) {
    throw new Error("No AI response for Template C columns.");
  }

  let parsed: { columns?: unknown[] };
  try {
    parsed = JSON.parse(stripJsonFences(content)) as { columns?: unknown[] };
  } catch (e) {
    const truncated = typeof content === "string" ? content.slice(0, 400) : String(content).slice(0, 400);
    // eslint-disable-next-line no-console
    console.error("[suggestTemplateCColumns] JSON parse failed.", truncated, e);
    throw new Error("AI returned invalid JSON for Template C columns.");
  }

  const rawColumns = Array.isArray(parsed.columns) ? parsed.columns.slice(0, 3) : [];
  const validIds = new Set(icons.map((i) => i.id));
  const columns: TemplateCColumnSuggestion[] = [];

  for (let i = 0; i < 3; i++) {
    const raw = rawColumns[i];
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    let title = String(obj.title ?? "").trim();
    let description = String(obj.description ?? "").trim();
    let iconId: string | null = null;
    if (typeof obj.iconId === "string" && obj.iconId.trim() && validIds.has(obj.iconId.trim())) {
      iconId = obj.iconId.trim();
    }
    if (!title) title = `Column ${i + 1}`;
    columns.push({ title, description, iconId });
  }

  const rawSubtitle = typeof (parsed as { subtitle?: unknown }).subtitle === "string"
    ? (parsed as { subtitle: string }).subtitle.trim()
    : "";
  const subtitle = rawSubtitle.slice(0, 120) || "";

  return { columns, subtitle };
}

/**
 * Generate a single column suggestion (for "Regenerate" one column). Uses same context and icon list.
 */
export async function suggestTemplateCSingleColumn(
  input: SuggestTemplateCColumnsInput & { columnIndex: number }
): Promise<{ column: TemplateCColumnSuggestion }> {
  const { objectiveTitle, objectiveText, scopeContext, icons, columnIndex } = input;
  const iconList =
    icons.length > 0
      ? icons.map((i) => ({
          id: i.id,
          slug: i.slug,
          name: i.name,
          tags: Array.isArray(i.tags) ? i.tags.slice(0, 10) : [],
        }))
      : [];

  const systemContent = `You are an expert residential remodeling proposal writer.

Task: Generate exactly 1 column for an "Executive Summary" section. The column has:
- title: 2–5 words, scope-of-work oriented.
- description: 1–2 sentences, client-facing.
- iconId: pick ONE icon from the provided list that best fits the column theme, or null.

Return STRICT JSON only: { "column": { "title": "...", "description": "...", "iconId": "id-or-null" } }
iconId must be one of the provided icon "id" values, or null.`;

  const userContent = `Objective title: ${(objectiveTitle ?? "").trim() || "(none)"}

Objective paragraph:
${(objectiveText ?? "").trim() || "(none)"}

Scope/context:
${(scopeContext ?? "").trim().slice(0, 3000) || "(none)"}

Available icons:
${JSON.stringify(iconList)}

Return JSON: { "column": { "title": "...", "description": "...", "iconId": "..." | null } }`;

  const response = await callClaude({
    max_tokens: 1024,
    temperature: 0.4,
    system: systemContent,
    messages: [
      { role: "user", content: userContent },
    ],
  });

  const content = response.content[0]?.type === "text" ? response.content[0].text : null;
  if (!content) throw new Error("No AI response for Template C column.");

  let parsed: { column?: Record<string, unknown> };
  try {
    parsed = JSON.parse(stripJsonFences(content)) as { column?: Record<string, unknown> };
  } catch {
    throw new Error("AI returned invalid JSON for Template C column.");
  }

  const obj = parsed.column && typeof parsed.column === "object" ? parsed.column : {};
  let title = String(obj.title ?? "").trim();
  let description = String(obj.description ?? "").trim();
  const validIds = new Set(icons.map((i) => i.id));
  let iconId: string | null = null;
  if (typeof obj.iconId === "string" && obj.iconId.trim() && validIds.has(obj.iconId.trim())) {
    iconId = obj.iconId.trim();
  }
  if (!title) title = `Column ${columnIndex + 1}`;

  return { column: { title, description, iconId } };
}
