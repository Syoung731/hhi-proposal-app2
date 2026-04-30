import "server-only";
import { callClaude } from "@/app/lib/ai/model";
import { parseDimToInches } from "@/app/lib/dimensions";
import { stripJsonFences } from "@/app/lib/ai/parse-json";

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
  const response = await callClaude({
    max_tokens: 4096,
    temperature: 0.2,
    system: `You are an expert residential remodeling proposal extractor.

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

Subtitle must always be present in overview. If a value is unknown for other fields, omit the field. Do not fabricate data.`,
    messages: [
      {
        role: "user",
        content: transcript,
      },
    ],
  });

  const content = response.content[0]?.type === "text" ? response.content[0].text : null;
  if (!content) throw new Error("No AI response");

  const parsed = JSON.parse(stripJsonFences(content)) as TranscriptExtraction;
  if (
    !parsed.overview ||
    typeof parsed.overview.subtitle !== "string" ||
    parsed.overview.subtitle.trim() === ""
  ) {
    throw new Error("AI response missing required overview.subtitle");
  }
  return parsed;
}

export type TranscriptFixtures = {
  baseCabinetCount?: number | null;
  wallCabinetCount?: number | null;
  sinkCount?: number | null;
  toiletCount?: number | null;
  hasTub?: boolean | null;
  hasShower?: boolean | null;
  hasTubShowerCombo?: boolean | null;
  appliances?: string[];
};

export type RoomsFromTranscript = {
  rooms: {
    name: string;
    scopeNarrative: string;
    lengthIn?: number | null;
    widthIn?: number | null;
    ceilingHeightIn?: number | null;
    fixtures?: TranscriptFixtures | null;
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
): { name: string; scopeNarrative: string; lengthIn: number | null; widthIn: number | null; ceilingHeightIn: number | null; fixtures: TranscriptFixtures | null } | null {
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
  const fixtures = item.fixtures && typeof item.fixtures === "object"
    ? (item.fixtures as TranscriptFixtures)
    : null;
  return { name, scopeNarrative, lengthIn, widthIn, ceilingHeightIn, fixtures };
}

export async function extractRoomsFromTranscript(
  transcript: string,
  stylePresetPrompt?: string,
  rendrContext?: string | null,
  existingSectionNames?: string[],
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
- Output JSON only, no extra text.

For sections identified as Kitchen or Bathroom type, also extract fixture information
if explicitly mentioned in the transcript. Add an optional "fixtures" field:

"fixtures": {
  "baseCabinetCount": number or null,
  "wallCabinetCount": number or null,
  "sinkCount": number or null,
  "toiletCount": number or null,
  "hasTub": true/false or null,
  "hasShower": true/false or null,
  "hasTubShowerCombo": true/false or null,
  "appliances": ["stove", "oven", "refrigerator", "dishwasher"]
}

Only include fixtures explicitly mentioned in the transcript. Do NOT guess counts.
Omit the "fixtures" field entirely if nothing is mentioned.
The "appliances" array should only include appliances that are explicitly discussed.`;

  if (rendrContext?.trim()) {
    systemContent += `

If RENDR LIDAR SCAN DATA is provided alongside the transcript:
- Rendr is the source of truth for AREA. Reference Rendr's area in the
  scope narrative naturally (e.g., "The 195-square-foot kitchen...").
- However, if the transcript explicitly states length × width dimensions
  for a space (e.g. "10 by 12", "12'6\\" by 14 feet", "measuring 10 feet
  10 inches by 8 feet wide"), DO extract them as lengthIn/widthIn so the
  user can verify the transcript values against Rendr's measurement.
  If the transcript does not state explicit L × W, leave lengthIn/widthIn null.
- For ceiling heights: prefer the transcript value when explicitly stated;
  otherwise set ceilingHeightIn from Rendr's value converted to inches
  (e.g., 8.0 ft = 96 inches).
- The Rendr room names represent physical spaces. The transcript may refer
  to these spaces by different names or discuss scope that spans multiple
  Rendr rooms. Create sections based on the TRANSCRIPT discussion, not
  the Rendr room list. But use Rendr measurements to inform the details.
- If the transcript discusses a space that matches a Rendr room, incorporate
  the Rendr measurements (area, fixture counts) into the scope narrative
  naturally.
- If the transcript discusses a space not found in Rendr data, create the
  section from transcript only (no Rendr measurements).
- For Kitchen/Bath rooms with Rendr fixture data, include the fixtures
  field with counts from Rendr (override any conflicting transcript mentions
  with the more accurate Rendr LiDAR data).`;
  }

  if (existingSectionNames?.length) {
    systemContent += `

EXISTING SECTIONS IN THIS PROJECT:
The following sections already exist in this project (created from LiDAR scan or
previous generation). You MUST use these exact section names when the transcript
discusses scope that belongs in these spaces:

${existingSectionNames.map((n) => `  - "${n}"`).join("\n")}

RULES FOR EXISTING SECTIONS:
1. If the transcript discusses work in a space that matches an existing section,
   use that EXACT section name as the title. Do not rename it or create a variant.
   Example: If "Living Room" exists and the transcript discusses wall removal in
   the living room, the section title must be "Living Room" — NOT "Living Room
   Kitchen Wall Opening" or "Living Room Renovation".

2. Combine ALL scope discussed for a space into ONE section. If the transcript
   mentions the living room multiple times (wall removal, flooring, lighting),
   all of that goes into the "Living Room" scopeNarrative as one paragraph.

3. Only create a NEW section (with a new name) if the transcript discusses a
   space that does NOT match any existing section. For example, if the transcript
   discusses a "Screened Porch" that isn't in the existing list, create it as new.

4. For scope that spans multiple rooms (e.g., "remove the wall between the
   kitchen and living room"), assign it to the section where the PRIMARY work
   occurs. If it's truly shared, put it in the larger room's section and
   reference the other room in the narrative.`;
  }

  if (stylePresetPrompt?.trim()) {
    systemContent += `\n\nStyle instructions (apply to tone and language of scope narratives where relevant):\n${stylePresetPrompt.trim()}`;
  }

  let userContent = transcript;
  if (rendrContext?.trim()) {
    userContent = `${rendrContext}\n\n---\n\nTRANSCRIPT:\n${transcript}`;
  }

  const response = await callClaude({
    max_tokens: 8192,
    temperature: 0.2,
    system: systemContent,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  const content = response.content[0]?.type === "text" ? response.content[0].text : null;
  if (!content) throw new Error("No AI response");

  let parsed: RoomsFromTranscript & SectionsFromTranscript;
  try {
    parsed = JSON.parse(stripJsonFences(content)) as RoomsFromTranscript & SectionsFromTranscript;
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
  const response = await callClaude({
    max_tokens: 2048,
    temperature: 0.2,
    system: systemContent,
    messages: [
      {
        role: "user",
        content: `Transcript:\n\n${transcriptText}\n\n---\n\nCurrent scope for "${roomName}":\n${currentScopeNarrative || "(none)"}\n\nRewrite the scope paragraph for "${roomName}" using the transcript and current scope. One paragraph only.`,
      },
    ],
  });

  const content = (response.content[0]?.type === "text" ? response.content[0].text : "")?.trim();
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

  const response = await callClaude({
    max_tokens: 2048,
    temperature: 0.2,
    system: systemContent,
    messages: [
      {
        role: "user",
        content: `Transcript (for reference):\n\n${transcriptText}\n\n---\n\nExisting scopes to merge into "${mergedRoomName}":\n\n${scopesText}\n\nWrite a single combined scope paragraph for "${mergedRoomName}". One paragraph only.`,
      },
    ],
  });

  const content = (response.content[0]?.type === "text" ? response.content[0].text : "")?.trim();
  if (!content) throw new Error("No AI response");
  return content;
}
