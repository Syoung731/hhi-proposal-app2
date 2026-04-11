import "server-only";
import { callClaude } from "@/app/lib/ai/model";
import { SECTIONS, MAX_SECTIONS } from "@/app/lib/sections";
import { COMMON_TAGS } from "@/app/lib/common-tags";
import { mapCandidatesToTags, normalizeTag } from "@/app/lib/tag-utils";
import { stripJsonFences } from "@/app/lib/ai/parse-json";

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

  const response = await callClaude({
    max_tokens: 4096,
    temperature: 0.3,
    system: systemContent,
    messages: [
      { role: "user", content: userContent },
    ],
  });

  const content = response.content[0]?.type === "text" ? response.content[0].text : null;
  if (!content) {
    throw new Error("No AI response for objective content.");
  }

  let parsed: Partial<ObjectiveContentSuggestion>;
  try {
    parsed = JSON.parse(stripJsonFences(content)) as Partial<ObjectiveContentSuggestion>;
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

export type LuxuryObjectiveResult = {
  objective: string;
  supportingText: string;
  bullets: string[];
};

/**
 * Generate a luxury, client-facing Project Objective paragraph, supporting text,
 * and bullet points from a transcript in a single API call.
 */
export async function generateLuxuryObjectiveParagraph(options: {
  transcriptText: string;
  companyName: string;
  projectAddress?: string | null;
  clientName?: string | null;
}): Promise<LuxuryObjectiveResult> {
  const transcript = (options.transcriptText ?? "").trim();
  if (!transcript) {
    throw new Error("Transcript text is required for luxury objective generation.");
  }

  const company = options.companyName || "our company";
  const address = (options.projectAddress ?? "").trim();
  const client = (options.clientName ?? "").trim();

  const systemContent = `You are a senior proposal writer for a luxury design-build remodeling company called ${company} on Hilton Head Island, SC. You specialize in writing client-facing proposal content that is persuasive, confident, and emotionally resonant — the kind of writing that makes a homeowner feel that they are in expert hands and that their investment is worthwhile.

Your task is to write a Project Objective statement, supporting text, and bullet points for a proposal based on a transcript from an initial client meeting or site visit.

THE PROJECT OBJECTIVE MUST:

1. Open with a strong scene-setting sentence that acknowledges the current state of the space — what problem exists, what opportunity it presents, or what the client's vision is. This is not a list of problems. It is a narrative opening that makes the client feel heard and understood.

2. State the transformation objective clearly — not what will be removed or repaired, but what will be achieved. Focus on outcomes for the client (the feeling, the function, the quality of life improvement) rather than on contractor tasks.

3. Describe the scope in elevated, specific language. Use the actual room names, materials, and project details from the transcript. Do not be generic. If the transcript mentions heated floors, name them. If it mentions removing a soffit, explain why that matters to the client (openness, light, luxury feel). Every scope item should be connected to a client benefit.

4. Include a confidence statement — a sentence or two that positions ${company} as the right partner for this project. Reference the design-build advantage: single point of accountability, fixed-price contract, no surprises. This should feel earned and natural, not like a sales pitch bolted onto the end.

5. Close with a single powerful sentence — a vision statement for what this project becomes when it is complete. Short. Confident. Memorable.

SUPPORTING TEXT:
A single focused paragraph of 2-4 sentences that dives deeper into one specific and compelling aspect of this project. This could be the technical challenge being solved, the design opportunity being seized, or the transformation the client will experience. It should feel like the second beat of the story — the objective sets the scene, the supporting text goes deeper on one dimension.

Tone: Same elevated, client-facing language as the objective. No contractor jargon. Active voice. Specific to this project.
Length: 40-80 words. One tight paragraph.

BULLET POINTS (up to 3):
Three short, scannable highlights that capture the most important client benefits or project features. Each bullet is a complete thought in 6-10 words. They should feel like the "why this matters" version of the scope — focused on outcome and benefit, not on tasks.

Format each bullet to start with a strong action or outcome word.
Examples of good bullets:
- "Structural damage resolved with zero compromises"
- "Open, column-free layout reimagined from the ground up"
- "Heated floors and premium finishes throughout"

Bad bullets (do not write these):
- "Remove and replace damaged subfloor"
- "Install new fixtures and tile"
- "Coordinate with licensed trades"

TONE AND STYLE:
- Professional but warm — like a trusted advisor, not a contractor
- Specific and detailed — use real details from the transcript
- Elevated but not pretentious — accessible luxury language
- Active voice throughout — "we will" not "work will be performed"
- Written in third person for the space, first person plural for the company ("we", "our team", "our approach")
- Never use contractor jargon: no "demo", "rough-in", "punch list", "scope of work", "line items"
- Instead use: "carefully removed", "precisely installed", "thoughtfully designed", "meticulously planned"

LENGTH AND STRUCTURE (for the objective only):
- 3 to 4 substantial paragraphs
- Each paragraph 3 to 5 sentences
- No bullet points in the objective — this is narrative prose
- No headers — flowing paragraphs only
- Total length: 180 to 280 words
- Long enough to fill a slide comfortably, short enough to read in under 90 seconds

WHAT TO AVOID:
- Do not start with "This project" or "The project"
- Do not use the word "renovation" in the first sentence
- Do not list tasks sequentially (remove X, install Y, add Z)
- Do not mention budget, cost, or pricing
- Do not use passive voice ("will be removed", "will be installed")
- Do not use filler phrases ("world-class", "state-of-the-art", "cutting-edge", "seamless experience")
- Do not include caveats or qualifications ("depending on", "subject to", "if applicable")`;

  const shortTranscriptNote = transcript.length < 300
    ? "\n\nNote: The transcript is brief. Use the available details and fill in reasonable assumptions appropriate for a luxury design-build project of this type. Do not mention that the transcript was limited."
    : "";

  const userContent = `Based on the following transcript from an initial client meeting or site visit, write a Project Objective statement, supporting text, and bullet points for a luxury design-build proposal.

Project address: ${address || "(not provided)"}
Client name: ${client || "(not provided)"}

Transcript:
${transcript}${shortTranscriptNote}

Return your response in this exact JSON format with no additional text, no markdown, no code fences:

{"objective": "full objective text here", "supportingText": "supporting paragraph here", "bullets": ["first bullet here", "second bullet here", "third bullet here"]}

If the transcript does not support 3 meaningful bullets, return 2 or 1. Never return empty or generic bullets.`;

  const response = await callClaude({
    max_tokens: 1200,
    temperature: 0.7,
    system: systemContent,
    messages: [
      { role: "user", content: userContent },
    ],
  });

  const rawText = (response.content[0]?.type === "text" ? response.content[0].text : "")?.trim();
  if (!rawText) {
    throw new Error("No AI response for luxury objective generation.");
  }

  let parsed: { objective?: string; supportingText?: string; bullets?: string[] };
  try {
    parsed = JSON.parse(stripJsonFences(rawText)) as typeof parsed;
  } catch {
    // Fallback: treat entire response as objective text if JSON parse fails
    return {
      objective: rawText,
      supportingText: "",
      bullets: [],
    };
  }

  const objective = (parsed.objective ?? "").trim();
  if (!objective) {
    throw new Error("AI response missing objective text.");
  }

  const supportingText = (parsed.supportingText ?? "").trim();
  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.map((b) => String(b ?? "").trim()).filter(Boolean).slice(0, 3)
    : [];

  return { objective, supportingText, bullets };
}

/**
 * Generate a unified Scope Overview narrative from individual room scopes.
 * Used on the Overview tab and pulled into the Scope Overview deck slide.
 */
export async function generateScopeOverviewNarrative(options: {
  rooms: { name: string; scopeNarrative: string; bucket: string }[];
  companyName: string;
  projectAddress: string;
  clientName: string;
}): Promise<string> {
  // Filter: exclude empty/short scopes, only BASE unless no BASE rooms
  const baseRooms = options.rooms.filter(
    (r) => r.bucket === "BASE" && (r.scopeNarrative ?? "").trim().length >= 20
  );
  const altRooms = options.rooms.filter(
    (r) => r.bucket === "ALTERNATE" && (r.scopeNarrative ?? "").trim().length >= 20
  );
  const filtered = baseRooms.length > 0 ? baseRooms : altRooms;

  if (filtered.length === 0) {
    throw new Error("No rooms with sufficient scope narratives to generate overview.");
  }

  const company = options.companyName || "our company";
  const address = (options.projectAddress ?? "").trim();
  const client = (options.clientName ?? "").trim();

  const formattedRoomScopes = filtered
    .map((r) => `${r.name}: ${r.scopeNarrative.trim()}`)
    .join("\n");

  const systemContent = `You are a senior proposal writer for ${company}, a luxury design-build remodeling company. You write client-facing proposal content that is persuasive, specific, and professionally elevated.

Your task is to write a Scope Overview paragraph for a remodeling proposal. This paragraph appears on the Scope Overview slide — it is the first thing a client reads that tells them what work will be done and why it matters.

THE SCOPE OVERVIEW MUST:

1. Open with a unifying statement that frames the entire project as a cohesive vision — not a list of rooms, but a transformation. Connect the work across all spaces into a single narrative thread.

2. Reference the specific rooms and spaces being renovated using their actual names. Do not be generic. If the kitchen and two bathrooms are in scope, name them specifically.

3. Describe the work in elevated, outcome-focused language. For each major scope area, say what it becomes — not what is being removed or installed. Focus on the client's experience of the finished result.

4. Close with a confidence statement that positions the project as fully planned and ready to execute — reinforcing the design-build advantage without using that phrase explicitly.

TONE AND STYLE:
- Professional, warm, and confident
- Specific to this project — use actual room names and scope details
- Elevated but accessible — luxury language without pretension
- Active voice throughout — "we will" not "work will be performed"
- Never use contractor jargon: no "demo", "rough-in", "punch list", "FFE", "MEP", "scope of work"
- Never start with "This project" or "The project"
- No bullet points — flowing narrative prose only

LENGTH:
- Strict maximum: 200 words
- Target: 160-200 words
- Must be a single paragraph or two short paragraphs
- Long enough to fill a slide comfortably, tight enough to read in under 60 seconds

WHAT TO AVOID:
- Do not list rooms sequentially (first the kitchen, then the bathroom)
- Do not mention budget, cost, or pricing
- Do not use passive voice
- Do not include caveats or qualifications
- Do not use filler phrases like "world-class" or "state-of-the-art"`;

  const userContent = `Generate a Scope Overview paragraph for this remodeling proposal.

Client: ${client || "(not provided)"}
Project address: ${address || "(not provided)"}

Room scopes:
${formattedRoomScopes}

Each room scope above represents one space being renovated. Write a unified 160-200 word client-facing narrative that weaves these scopes into a cohesive project story.

Return only the scope overview text — no preamble, no labels, no explanation, no quotes around the response.`;

  const response = await callClaude({
    max_tokens: 400,
    temperature: 0.7,
    system: systemContent,
    messages: [{ role: "user", content: userContent }],
  });

  const rawText = (response.content[0]?.type === "text" ? response.content[0].text : "")?.trim();
  if (!rawText) {
    throw new Error("No AI response for scope overview generation.");
  }

  return rawText;
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

  const response = await callClaude({
    max_tokens: 256,
    temperature: 0.25,
    system: systemContent,
    messages: [
      { role: "user", content: userContent },
    ],
  });

  const raw = (response.content[0]?.type === "text" ? response.content[0].text : "")?.trim();
  if (!raw) {
    throw new Error("No AI response for Template B fit statement.");
  }

  // Enforce max 36 words if model overflowed
  const words = raw.split(/\s+/).filter(Boolean);
  const capped = words.length > 36 ? words.slice(0, 36).join(" ") : raw;
  return capped.trim();
}
