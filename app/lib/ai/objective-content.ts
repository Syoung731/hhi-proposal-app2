import "server-only";
import OpenAI from "openai";
import { SECTIONS, MAX_SECTIONS } from "@/app/lib/sections";
import { COMMON_TAGS } from "@/app/lib/common-tags";
import { mapCandidatesToTags, normalizeTag } from "@/app/lib/tag-utils";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const model = process.env.OPENAI_MODEL || "gpt-5.2";

export type ObjectiveContentSuggestion = {
  objectiveParagraph: string;
  commitments: string[];
  sections: string[];
  tags: string[];
};

export async function suggestObjectiveContentFromText(options: {
  transcriptText?: string | null;
  overviewText?: string | null;
}): Promise<ObjectiveContentSuggestion> {
  const transcriptRaw = options.transcriptText?.trim() ?? "";
  const overviewRaw = options.overviewText?.trim() ?? "";
  const primary = transcriptRaw || overviewRaw;
  if (!primary) {
    throw new Error("Missing transcript or overview text for objective suggestions.");
  }

  const systemContent = `
You are an expert residential remodeling proposal writer.

Task:
- Read the transcript and overview.
- Propose a concise project Objective paragraph and three short client-facing commitments.
- Suggest sections and photo-search-friendly tags for visual examples.

Rules:
- Use transcript as the primary source of truth; use overview only as a supplement.
- If transcript is empty, fall back to overview.
- Return STRICT JSON ONLY with keys: objectiveParagraph, commitments, sections, tags.
- No markdown, no commentary, no trailing text.

Objective paragraph:
- 2–3 sentences max.
- Describe overall project intent and scope at a high level.
- No pricing, no scheduling promises, no guarantees.
- No bullet points or lists.

Commitments:
- Exactly 3 short commitments.
- Action-oriented, client-facing promises.
- Examples of tone and style (do NOT copy verbatim):
  - "Clear scope and selections before build"
  - "Daily site protection and cleanliness"
  - "Trade partner coordination and inspection-ready work"
- Avoid fluff and avoid guarantees like "always", "perfect", "on-time", "on-budget".

Sections (REQUIRED – use EXACT strings from this list only; max ${MAX_SECTIONS}):
${SECTIONS.map((s) => `- "${s}"`).join("\n")}
- When the transcript mentions bathrooms, powder room, or master bath, include "Bathroom" or "Primary Bath".
- When it mentions laundry or laundry room, include "Laundry".
- Only include sections clearly relevant to the project; return 1–${MAX_SECTIONS} section values from the list above with exact spelling.

Tags:
- Short, lowercase, photo-search-friendly phrases.
- Examples: "laundry room", "vanity", "quartz", "glass shower", "tile".
- No long sentences.
- No pricing or schedule language.

Output JSON shape (STRICT):
{
  "objectiveParagraph": "string",
  "commitments": ["string", "string", "string"],
  "sections": ["string", ...],
  "tags": ["string", ...]
}
`;

  const userContent = `Transcript (primary source):
${transcriptRaw || "(none)"}

---

Overview text (fallback / secondary):
${overviewRaw || "(none)"}
`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No AI response for objective content.");
  }

  let parsed: Partial<ObjectiveContentSuggestion>;
  try {
    parsed = JSON.parse(content) as Partial<ObjectiveContentSuggestion>;
  } catch (e) {
    const truncated = typeof content === "string" ? content.slice(0, 500) : String(content).slice(0, 500);
    // eslint-disable-next-line no-console
    console.error("[suggestObjectiveContentFromText] JSON parse failed. Raw (first 500 chars):", truncated, e);
    throw new Error("AI returned invalid JSON for objective content.");
  }

  const paragraph = String(parsed.objectiveParagraph ?? "").trim();
  if (!paragraph) {
    throw new Error("AI response missing objectiveParagraph.");
  }

  const rawCommitments = Array.isArray(parsed.commitments)
    ? parsed.commitments.map((c) => String(c ?? "").trim()).filter(Boolean)
    : [];
  const commitments = rawCommitments.slice(0, 3);
  while (commitments.length < 3) commitments.push("");

  const rawSections = Array.isArray(parsed.sections)
    ? parsed.sections.map((s) => String(s ?? "").trim()).filter(Boolean)
    : [];
  const canonicalSections: string[] = [];
  const seenSections = new Set<string>();

  /** Map common transcript phrases to canonical SECTIONS for reliable Laundry/Bathroom detection. */
  const sectionAliases: [string, string][] = [
    ["laundry room", "Laundry"],
    ["laundry", "Laundry"],
    ["bathroom", "Bathroom"],
    ["bathrooms", "Bathroom"],
    ["primary bath", "Primary Bath"],
    ["master bath", "Primary Bath"],
    ["powder room", "Bathroom"],
    ["kitchen", "Kitchen"],
    ["kitchens", "Kitchen"],
  ];
  const aliasMap = new Map<string, string>();
  for (const [alias, canonical] of sectionAliases) {
    aliasMap.set(alias.toLowerCase().trim(), canonical);
  }

  for (const label of rawSections) {
    const lower = label.toLowerCase().trim();
    let canonical =
      SECTIONS.find((s) => s.toLowerCase() === lower) ??
      aliasMap.get(lower) ??
      SECTIONS.find((s) => s.toLowerCase().includes(lower) || lower.includes(s.toLowerCase()));
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seenSections.has(key)) continue;
    seenSections.add(key);
    canonicalSections.push(canonical);
    if (canonicalSections.length >= MAX_SECTIONS) break;
  }

  // Fallback: when model returns no sections but transcript/overview mention rooms, infer from keywords.
  if (canonicalSections.length === 0 && primary.length > 0) {
    const lowerPrimary = primary.toLowerCase();
    for (const [phrase, canonical] of sectionAliases) {
      if (canonicalSections.length >= MAX_SECTIONS) break;
      if (!lowerPrimary.includes(phrase)) continue;
      const key = canonical.toLowerCase();
      if (seenSections.has(key)) continue;
      seenSections.add(key);
      canonicalSections.push(canonical);
    }
  }

  const rawTags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t) => String(t ?? "").trim()).filter(Boolean)
    : [];
  const mappedTags = mapCandidatesToTags(
    rawTags,
    COMMON_TAGS,
    10
  );
  const normalized = new Set<string>();
  const finalTags: string[] = [];
  for (const tag of mappedTags) {
    const n = normalizeTag(tag);
    if (!n || normalized.has(n)) continue;
    normalized.add(n);
    finalTags.push(tag.toLowerCase());
    if (finalTags.length >= 10) break;
  }

  return {
    objectiveParagraph: paragraph,
    commitments,
    sections: canonicalSections,
    tags: finalTags,
  };
}

/** Template B layout fit: single short statement (20–28 words, max 36) for 1200×675 statement area. */
export async function suggestTemplateBFitStatement(objectiveText: string): Promise<string> {
  const source = (objectiveText ?? "").trim();
  if (!source) {
    throw new Error("Objective text is required to generate Template B fit statement.");
  }

  const systemContent = `
You are an expert residential remodeling proposal writer.

Task: Rewrite the given objective statement into a SINGLE short paragraph that fits a strict layout constraint.

Constraints (HARD):
- Output exactly ONE paragraph. No headings, no bullets, no line breaks.
- Target 20–28 words. Absolute maximum 36 words.
- Must fit within two lines in a fixed layout (1200×675 design, centered italic text).
- Keep a premium, confident tone.
- Do NOT start with "Scope includes…" or "Scope:" or similar.
- Prefer structure: "To [deliver/do] … that [result/benefit] …"
- Preserve the intent and key message of the original; only shorten and tighten.

Return ONLY the rewritten statement. No quotes, no prefix, no explanation.
`;

  const userContent = `Original objective statement:\n\n${source}`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.25,
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("No AI response for Template B fit statement.");
  }

  // Enforce max 36 words if model overflowed
  const words = raw.split(/\s+/).filter(Boolean);
  const capped = words.length > 36 ? words.slice(0, 36).join(" ") : raw;
  return capped.trim();
}

