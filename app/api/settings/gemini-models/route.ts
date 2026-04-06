import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/app/integrations/gemini";

export type GeminiModelInfo = {
  id: string;
  displayName: string;
  description: string;
  category: "image" | "imagen" | "text";
  inputTokenLimit: number;
  outputTokenLimit: number;
};

/**
 * Models we care about for this app. Filter the Google API response to these prefixes.
 * "gemini-2" models for image understanding/editing, "imagen" for text-to-image.
 */
const RELEVANT_PREFIXES = [
  "models/gemini-2",
  "models/gemini-3",
  "models/imagen-4",
  "models/imagen-3",
];

/** Skip experimental/deprecated models */
const SKIP_PATTERNS = [
  "exp-",      // experimental
  "thinking",  // thinking mode variants
  "it-",       // instruction-tuned (not relevant)
];

function categorizeModel(name: string): "image" | "imagen" | "text" {
  if (name.includes("imagen")) return "imagen";
  if (name.includes("image")) return "image";
  return "text";
}

function getModelDescription(name: string, displayName: string): string {
  if (name.includes("imagen-4") && name.includes("ultra")) return "Highest quality text-to-image generation — slower but best results.";
  if (name.includes("imagen-4") && name.includes("fast")) return "Fast text-to-image generation — good quality with quick response.";
  if (name.includes("imagen-4") && !name.includes("fast") && !name.includes("ultra")) return "Balanced text-to-image generation — good quality and speed.";
  if (name.includes("imagen-3")) return "Previous generation text-to-image model.";
  if (name.includes("image")) return "Image understanding, editing, and vision tasks.";
  return displayName;
}

export async function GET() {
  try {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 400 },
      );
    }

    // Fetch all models from Google API
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
      throw new Error(data.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const allModels = (data.models ?? []) as Array<{
      name: string;
      displayName: string;
      description: string;
      inputTokenLimit?: number;
      outputTokenLimit?: number;
    }>;

    // Filter to relevant models
    const filtered: GeminiModelInfo[] = allModels
      .filter((m) => RELEVANT_PREFIXES.some((p) => m.name.startsWith(p)))
      .filter((m) => !SKIP_PATTERNS.some((p) => m.name.includes(p)))
      .map((m) => {
        // Strip "models/" prefix for the ID
        const id = m.name.replace(/^models\//, "");
        const category = categorizeModel(id);
        return {
          id,
          displayName: m.displayName || id,
          description: getModelDescription(id, m.description || ""),
          category,
          inputTokenLimit: m.inputTokenLimit ?? 0,
          outputTokenLimit: m.outputTokenLimit ?? 0,
        };
      })
      // Sort: image models first, then imagen
      .sort((a, b) => {
        const order = { image: 0, imagen: 1, text: 2 };
        return order[a.category] - order[b.category];
      });

    return NextResponse.json({ models: filtered });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
