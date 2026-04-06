import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/app/integrations/anthropic";

export type AnthropicModelInfo = {
  id: string;
  displayName: string;
  maxTokens: number;
  maxInputTokens: number;
  description: string;
  tier: "flagship" | "balanced" | "fast";
};

/**
 * Known alias IDs that represent the "latest" version of each model family.
 * These are the non-dated aliases Anthropic provides — they always point to the newest snapshot.
 */
const LATEST_ALIASES = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-sonnet-4-5",
  "claude-opus-4-5",
  "claude-sonnet-4-0",
  "claude-opus-4-0",
]);

function getTier(id: string): "flagship" | "balanced" | "fast" {
  if (id.includes("opus")) return "flagship";
  if (id.includes("haiku")) return "fast";
  return "balanced";
}

function getDescription(id: string, maxInput: number, maxOutput: number): string {
  const ctx = maxInput >= 1000000 ? "1M" : `${Math.round(maxInput / 1000)}K`;
  const out = `${Math.round(maxOutput / 1000)}K`;

  if (id.includes("opus-4-6")) return `Most intelligent — best for complex agents & coding. ${ctx} context, ${out} output.`;
  if (id.includes("sonnet-4-6")) return `Best balance of speed & intelligence. ${ctx} context, ${out} output. (Recommended)`;
  if (id.includes("haiku-4-5")) return `Fastest model — near-frontier intelligence. ${ctx} context, ${out} output.`;
  if (id.includes("sonnet-4-5")) return `Previous generation balanced model. ${ctx} context, ${out} output.`;
  if (id.includes("opus-4-5")) return `Previous generation flagship. ${ctx} context, ${out} output.`;
  if (id.includes("sonnet-4-0")) return `Legacy Sonnet 4. ${ctx} context, ${out} output.`;
  if (id.includes("opus-4-0")) return `Legacy Opus 4. ${ctx} context, ${out} output.`;
  return `${ctx} context, ${out} output.`;
}

export async function GET() {
  try {
    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 400 },
      );
    }

    const anthropic = new Anthropic({ apiKey, maxRetries: 5 });

    // Fetch all models from Anthropic API
    const modelList = await anthropic.models.list({ limit: 100 });
    const allModels = modelList.data;

    // Filter to only latest aliases (non-dated model IDs)
    const latestModels: AnthropicModelInfo[] = allModels
      .filter((m) => LATEST_ALIASES.has(m.id))
      .map((m) => ({
        id: m.id,
        displayName: m.display_name,
        maxTokens: m.max_tokens ?? 0,
        maxInputTokens: m.max_input_tokens ?? 0,
        description: getDescription(m.id, m.max_input_tokens ?? 0, m.max_tokens ?? 0),
        tier: getTier(m.id),
      }))
      // Sort: flagship first, then balanced, then fast
      .sort((a, b) => {
        const order = { flagship: 0, balanced: 1, fast: 2 };
        return order[a.tier] - order[b.tier];
      });

    return NextResponse.json({ models: latestModels });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
