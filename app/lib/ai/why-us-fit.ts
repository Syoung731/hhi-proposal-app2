import "server-only";
import { callClaude } from "@/app/lib/ai/model";
import type { WhyUsPillar } from "@/app/lib/layout-config";
import { stripJsonFences } from "@/app/lib/ai/parse-json";

export type WhyUsFitPillar = {
  headline: string;
  body: string;
};

/**
 * Rewrites Why Us pillars so headline and body fit the Grid Cards layout:
 * headline ~2 lines, body ~3 lines at 17px. Preserves meaning and professional tone.
 */
export async function rewriteWhyUsPillarsToFit(pillars: WhyUsPillar[]): Promise<WhyUsFitPillar[]> {
  const input = pillars.slice(0, 4).map((p, i) => ({
    index: i + 1,
    headline: (p.headline ?? "").trim() || "(none)",
    body: (p.body ?? "").trim() || "(none)",
  }));

  const systemContent = `
You are an expert residential remodeling proposal writer.

Task: Rewrite each value pillar's headline and body so they fit a strict card layout.

Layout constraints (HARD):
- Each card has a headline (max ~2 lines at 25px) and body (max ~3 lines at 17px, ~60–75 chars per line).
- Headline: target 4–8 words; absolute max 12 words.
- Body: target 20–35 words; absolute max 45 words. Short, scannable sentences.
- Preserve the meaning and key message of each pillar. Keep tone professional and confident.
- No bullet points, no line breaks inside headline or body.

Return STRICT JSON only with this shape (no markdown, no explanation):
{
  "pillars": [
    { "headline": "string", "body": "string" },
    ...
  ]
}
Exactly 4 objects in "pillars" array. Order must match input order.
`;

  const userContent = `Rewrite these 4 value pillars to fit the card layout. Preserve meaning, shorten to fit.\n\n${JSON.stringify(input, null, 2)}`;

  const response = await callClaude({
    max_tokens: 2048,
    temperature: 0.25,
    system: systemContent,
    messages: [
      { role: "user", content: userContent },
    ],
  });

  const raw = (response.content[0]?.type === "text" ? response.content[0].text : "")?.trim();
  if (!raw) {
    throw new Error("No AI response for Why Us fit.");
  }

  let parsed: { pillars?: unknown[] };
  try {
    parsed = JSON.parse(stripJsonFences(raw)) as { pillars?: unknown[] };
  } catch {
    throw new Error("AI returned invalid JSON for Why Us fit.");
  }

  const arr = Array.isArray(parsed.pillars) ? parsed.pillars : [];
  const result: WhyUsFitPillar[] = [];
  for (let i = 0; i < 4; i++) {
    const item = arr[i];
    const headline =
      item && typeof item === "object" && "headline" in item
        ? String((item as { headline: unknown }).headline ?? "").trim()
        : (pillars[i]?.headline ?? "").trim();
    const body =
      item && typeof item === "object" && "body" in item
        ? String((item as { body: unknown }).body ?? "").trim()
        : (pillars[i]?.body ?? "").trim();
    result.push({ headline, body });
  }
  return result;
}
