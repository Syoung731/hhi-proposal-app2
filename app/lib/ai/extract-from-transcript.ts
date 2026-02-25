import "server-only";
import OpenAI from "openai";

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
  rooms: { name: string; scopeNarrative: string }[];
};

export async function extractRoomsFromTranscript(
  transcript: string
): Promise<RoomsFromTranscript> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You are an expert residential remodeler writing proposal scope-of-work sections.

Read the transcript and extract a room-by-room scope.

Return ONLY valid JSON in this exact shape:
{ "rooms": [ { "name": "...", "scopeNarrative": "..." } ] }

Rules:
- Rooms/spaces can be any name used in remodeling proposals (Title Case).
- Combine repeated mentions of the same room into one entry.
- scopeNarrative must be ONE paragraph per room, professional, clear to a homeowner, using construction language.
- No bullet points, no numbering.
- Exclude general discussion not tied to a specific room.
- If transcript has no room-specific scope, return { "rooms": [] }.
- Do not create rooms like "General", "Overview", "Project", "Walkthrough", or similar. Only actual spaces/areas.
- Output JSON only, no extra text.`,
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

  let parsed: RoomsFromTranscript;
  try {
    parsed = JSON.parse(content) as RoomsFromTranscript;
  } catch {
    throw new Error("AI returned invalid JSON");
  }
  if (!parsed || typeof parsed.rooms !== "object" || !Array.isArray(parsed.rooms)) {
    throw new Error("AI response missing rooms array");
  }
  const rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];

  const filteredRooms: RoomsFromTranscript["rooms"] = rooms
    .map((room) => {
      const name = (room?.name ?? "").trim();
      const scopeNarrative = (room?.scopeNarrative ?? "").trim();
      return { name, scopeNarrative };
    })
    .filter((room) => {
      if (!room.name || !room.scopeNarrative) return false;
      if (room.scopeNarrative.length < MIN_SCOPE_NARRATIVE_LENGTH) return false;

      const nameLower = room.name.toLowerCase();
      const hasExcludedKeyword = ROOM_NAME_EXCLUSION_KEYWORDS.some((kw) =>
        nameLower.includes(kw)
      );
      if (hasExcludedKeyword) return false;

      return true;
    });

  return { rooms: filteredRooms };
}

/**
 * Rewrite a single room's scope narrative using transcript context and current scope.
 * Returns one paragraph: professional, construction language, no bullets/numbering.
 */
export async function rewriteRoomScopeNarrative(
  transcriptText: string,
  roomName: string,
  currentScopeNarrative: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You are an expert residential remodeler writing proposal scope-of-work.

Your task: rewrite ONLY the scope paragraph for one room.

Rules:
- Keep the same room name: "${roomName}". Do not change it.
- Output exactly ONE paragraph of prose. No bullet points, no numbering, no list items.
- Use only facts from the transcript; do not invent scope or details.
- Improve clarity, professionalism, and construction language.
- Output only the paragraph text. No labels, no "Scope:" prefix, no extra commentary.`,
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
