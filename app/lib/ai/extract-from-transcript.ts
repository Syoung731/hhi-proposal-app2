import "server-only";
import OpenAI from "openai";
import { parseDimToInches } from "@/app/lib/dimensions";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const model = process.env.OPENAI_MODEL || "gpt-5.2";

export type TranscriptExtraction = {
  overview: {
    title?: string;
    subtitle: string; // required: 6–10 words, client-facing, premium remodel tone
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zip?: string;
    client1First?: string;
    client1Last?: string;
    client2First?: string;
    client2Last?: string;
    objective?: string;
    /**
     * Short human-readable summary of the overall remodel scope, e.g.
     * "Whole Home Remodel", "Kitchen Remodel", "Multiple Bathroom Remodel",
     * "Kitchen + Bath Remodel".
     */
    workSummary?: string;
  };
  rooms?: {
    name: string;
    description: string;
  }[];
};

const ROOM_NAME_EXCLUSION_KEYWORDS = [
  "walkthrough",
  "project",
  "meeting",
  "call",
  "intro",
  "general",
  "overview",
] as const;

const MIN_SCOPE_NARRATIVE_LENGTH = 40;

export async function extractFromTranscript(
  transcript: string
): Promise<TranscriptExtraction> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `
You are an expert residential remodeling proposal extractor.

Return ONLY valid JSON.
No commentary.
No markdown.
Strict JSON only.

Extract:

overview:
- title
- subtitle (REQUIRED): 6–10 words, client-facing, premium remodel tone. No quotes, no trailing period.
- workSummary: 2–6 words summarizing the overall remodel scope, like "Whole Home Remodel", "Kitchen Remodel", "Multiple Bathroom Remodel", or "Kitchen + Bath Remodel". No address, no quotes, no trailing period.
- addressLine1
- addressLine2
- city
- state
- zip
- client1First
- client1Last
- client2First
- client2Last
- objective

rooms:
Array of:
- name
- description

Subtitle must always be present in overview. If a value is unknown for other fields, omit the field. Do not fabricate data.
        `,
      },
      {
        role: "user",
        content: transcript,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No AI response");

  const parsed = JSON.parse(content) as TranscriptExtraction;
  if (
    !parsed.overview ||
    typeof parsed.overview.subtitle !== "string" ||
    parsed.overview.subtitle.trim() === ""
  ) {
    throw new Error("AI response missing required overview.subtitle");
  }
  return parsed;
}

export type RoomsFromTranscript = {
  rooms: {
    name: string;
    scopeNarrative: string;
    lengthIn?: number | null;
    widthIn?: number | null;
    ceilingHeightIn?: number | null;
  }[];
};

/** AI can return either "sections" or "rooms" (backward compat). Dimensions as string or number (inches). */
type SectionsFromTranscript = {
  sections?: {
    title?: string;
    name?: string;
    sectionTypeName?: string;
    category?: string;
    scopeNarrative?: string;
    description?: string;
    length?: string | null;
    width?: string | null;
    ceilingHeight?: string | null;
    lengthIn?: number | null;
    widthIn?: number | null;
    ceilingHeightIn?: number | null;
  }[];
};

/** Normalize one item from AI (section or room) to RoomsFromTranscript room shape. Parses dimension strings or numeric inches. */
function normalizeSectionOrRoom(
  item: Record<string, unknown>
): { name: string; scopeNarrative: string; lengthIn: number | null; widthIn: number | null; ceilingHeightIn: number | null } | null {
  const name = ((item.title as string) ?? (item.name as string) ?? "").trim();
  const scopeNarrative = ((item.scopeNarrative as string) ?? (item.description as string) ?? "").trim();
  if (!name || !scopeNarrative) return null;
  const lengthIn =
    parseDimToInches(item.lengthIn) ??
    parseDimToInches(item.length) ??
    null;
  const widthIn =
    parseDimToInches(item.widthIn) ??
    parseDimToInches(item.width) ??
    null;
  const ceilingHeightIn =
    parseDimToInches(item.ceilingHeightIn) ??
    parseDimToInches(item.ceilingHeight) ??
    null;
  return { name, scopeNarrative, lengthIn, widthIn, ceilingHeightIn };
}

export async function extractRoomsFromTranscript(
  transcript: string,
  stylePresetPrompt?: string
): Promise<RoomsFromTranscript> {
  let systemContent = `You are an expert residential remodeler writing proposal scope-of-work sections.

Read the transcript and extract section-by-section scope.

Return ONLY valid JSON. Prefer this shape (sections):
{ "sections": [ { "title": "...", "sectionTypeName": "Kitchen" or "Bathroom" etc (optional), "scopeNarrative": "...", "length": null, "width": null, "ceilingHeight": null, "lengthIn": null, "widthIn": null, "ceilingHeightIn": null } ] }

Alternatively you may return (backward compatible):
{ "rooms": [ { "name": "...", "scopeNarrative": "...", "length": null, "width": null, "ceilingHeight": null, "lengthIn": null, "widthIn": null, "ceilingHeightIn": null } ] }

Optional dimension fields (omit or set null when unknown). You may use EITHER string or numeric form per field:
- length: string (e.g. "12'6\\"", "12 ft 6 in", "150 in") or null
- width: string or null
- ceilingHeight: string or null
- lengthIn: total inches (integer), or null
- widthIn: total inches (integer), or null
- ceilingHeightIn: total inches (integer), or null

Extract dimensions only when clearly stated and tied to that section. Examples:
- "12 by 14" or "12x14" -> lengthIn 144, widthIn 168 (or interpret order consistently)
- "10x12" -> lengthIn 120, widthIn 144
- "Ceilings 9 feet" -> ceilingHeightIn 108
- Do NOT guess or hallucinate dimensions.

Rules:
- Sections/spaces can be any name used in remodeling proposals (Title Case).
- Combine repeated mentions of the same space into one entry.
- scopeNarrative must be ONE paragraph per section, professional, clear to a homeowner, using construction language.
- No bullet points, no numbering.
- Exclude general discussion not tied to a specific section.
- If transcript has no section-specific scope, return { "sections": [] } or { "rooms": [] }.
- Do not create sections like "General", "Overview", "Project", "Walkthrough", or similar. Only actual spaces/areas.
- Output JSON only, no extra text.`;
  if (stylePresetPrompt?.trim()) {
    systemContent += `\n\nStyle instructions (apply to tone and language of scope narratives where relevant):\n${stylePresetPrompt.trim()}`;
  }
  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: transcript,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("No AI response");

  let parsed: RoomsFromTranscript & SectionsFromTranscript;
  try {
    parsed = JSON.parse(content) as RoomsFromTranscript & SectionsFromTranscript;
  } catch {
    throw new Error("AI returned invalid JSON");
  }
  const rawList = Array.isArray(parsed.sections) ? parsed.sections : Array.isArray(parsed.rooms) ? parsed.rooms : [];
  const normalized = rawList
    .map((item) => normalizeSectionOrRoom(item as Record<string, unknown>))
    .filter((r): r is NonNullable<typeof r> => r != null)
    .filter((room) => {
      if (room.scopeNarrative.length < MIN_SCOPE_NARRATIVE_LENGTH) return false;
      const nameLower = room.name.toLowerCase();
      const hasExcludedKeyword = ROOM_NAME_EXCLUSION_KEYWORDS.some((kw) => nameLower.includes(kw));
      return !hasExcludedKeyword;
    });

  return { rooms: normalized };
}

/**
 * Rewrite a single room's scope narrative using transcript context and current scope.
 * Returns one paragraph: professional, construction language, no bullets/numbering.
 * Optional stylePresetPrompt: style instructions (materials, palette, vibe) to apply to the prose.
 */
export async function rewriteRoomScopeNarrative(
  transcriptText: string,
  roomName: string,
  currentScopeNarrative: string,
  stylePresetPrompt?: string
): Promise<string> {
  let systemContent = `You are an expert residential remodeler writing proposal scope-of-work.

Your task: rewrite ONLY the scope paragraph for one room.

Rules:
- Keep the same room name: "${roomName}". Do not change it.
- Output exactly ONE paragraph of prose. No bullet points, no numbering, no list items.
- Use only facts from the transcript; do not invent scope or details.
- Improve clarity, professionalism, and construction language.
- Output only the paragraph text. No labels, no "Scope:" prefix, no extra commentary.`;
  if (stylePresetPrompt?.trim()) {
    systemContent += `\n\nStyle instructions (apply to tone and language where relevant):\n${stylePresetPrompt.trim()}`;
  }
  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: `Transcript:\n\n${transcriptText}\n\n---\n\nCurrent scope for "${roomName}":\n${currentScopeNarrative || "(none)"}\n\nRewrite the scope paragraph for "${roomName}" using the transcript and current scope. One paragraph only.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("No AI response");
  return content;
}

/**
 * Combine multiple section scopes into a single polished scope paragraph.
 * Uses transcript context plus the existing per-section scopes.
 */
export async function mergeRoomScopesNarrative(
  transcriptText: string,
  mergedRoomName: string,
  sections: { name: string; scopeNarrative: string }[],
  stylePresetPrompt?: string
): Promise<string> {
  const nonEmpty = sections.filter(
    (s) => s.scopeNarrative && s.scopeNarrative.trim().length > 0
  );
  const fallback =
    sections
      .map((s) => s.scopeNarrative.trim())
      .filter(Boolean)
      .join(" ") || "";

  let systemContent = `You are an expert residential remodeler writing proposal scope-of-work.

Your task: combine multiple related sections into ONE clear scope paragraph for a single section.

Rules:
- The final room/section name is "${mergedRoomName}". Do not change it.
- Read all of the individual scopes and merge them into one cohesive paragraph.
- Remove redundancy while preserving every distinct task, material, and important detail.
- Use professional construction language suitable for a premium client-facing proposal.
- Output exactly ONE paragraph of prose. No bullet points, no numbering, no list items.
- Base facts primarily on the provided scopes; you may use transcript context to clarify but do not invent work that is not supported.`;

  if (stylePresetPrompt?.trim()) {
    systemContent += `\n\nStyle instructions (apply to tone and language where relevant):\n${stylePresetPrompt.trim()}`;
  }

  const scopesText =
    nonEmpty.length > 0
      ? nonEmpty
          .map(
            (s, idx) =>
              `Section ${idx + 1}: "${s.name}"\nScope:\n${s.scopeNarrative.trim()}`
          )
          .join("\n\n")
      : fallback;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: `Transcript (for reference):\n\n${transcriptText}\n\n---\n\nExisting scopes to merge into "${mergedRoomName}":\n\n${scopesText}\n\nWrite a single combined scope paragraph for "${mergedRoomName}". One paragraph only.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("No AI response");
  return content;
}
