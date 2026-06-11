/**
 * Generate candidate grayscale architectural floor-plan sheets for the
 * Closing slide's Blueprint Split layout. NOT part of any automated suite.
 *
 * Writes candidates to scripts/icon-lab-out/ (gitignored). Eyeball them,
 * then copy the winner to public/deck-art/closing-blueprint.png (committed),
 * which the layout uses as its built-in default.
 *
 * Run:
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/gen-closing-blueprint.ts
 *
 * Needs GEMINI_API_KEY in env, or the key saved in Settings → Integrations.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";

const PROMPT =
  "A professional residential architectural floor plan drawing: a top-down 2D CAD blueprint sheet " +
  "of a single-family home with a living room, kitchen, two bedrooms, bathroom, closets, and a front porch with steps. " +
  "Thin, precise light-gray and medium-gray technical linework on a plain white paper sheet. " +
  "Dimension strings with tick marks along the top and left edges, door swing arcs, " +
  "small simple room labels, and circled column-grid bubbles along the sheet border. " +
  "Monochrome grayscale ONLY — absolutely no color. Clean, flat, evenly lit, drafting-style. " +
  "The plan fills most of the sheet with comfortable margins. " +
  "No logos, no watermarks, no photographs, no perspective, no 3D, no people, no furniture renderings beyond simple line symbols.";

async function resolveApiKey(): Promise<string> {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
  try {
    const mod = await import("@/app/integrations/gemini");
    const k = await mod.getGeminiApiKey();
    if (k) return k;
  } catch {
    /* ignore — fall through */
  }
  throw new Error("No Gemini API key. Set GEMINI_API_KEY or configure Settings → Integrations.");
}

async function genImagen(ai: GoogleGenAI, prompt: string): Promise<Buffer | null> {
  const res = await ai.models.generateImages({
    model: "imagen-4.0-fast-generate-001",
    prompt,
    config: { numberOfImages: 1, outputMimeType: "image/png", aspectRatio: "3:4" },
  });
  const b64 = (res as { generatedImages?: { image?: { imageBytes?: string } }[] })
    ?.generatedImages?.[0]?.image?.imageBytes;
  return b64 ? Buffer.from(b64, "base64") : null;
}

async function genFlashImage(ai: GoogleGenAI, prompt: string): Promise<Buffer | null> {
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseModalities: ["IMAGE"] },
  });
  const parts = (res as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] })
    ?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p.inlineData?.data) return Buffer.from(p.inlineData.data, "base64");
  }
  return null;
}

async function main() {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });
  const outDir = join(process.cwd(), "scripts", "icon-lab-out");
  mkdirSync(outDir, { recursive: true });

  const jobs: { label: string; run: () => Promise<Buffer | null> }[] = [
    { label: "closing-bp-flash-1", run: () => genFlashImage(ai, PROMPT) },
    { label: "closing-bp-flash-2", run: () => genFlashImage(ai, PROMPT) },
    { label: "closing-bp-imagen-1", run: () => genImagen(ai, PROMPT) },
    { label: "closing-bp-imagen-2", run: () => genImagen(ai, PROMPT) },
  ];

  let ok = 0;
  for (const job of jobs) {
    process.stdout.write(`→ ${job.label} ... `);
    try {
      const buf = await job.run();
      if (!buf) {
        console.log("no image returned");
        continue;
      }
      writeFileSync(join(outDir, `${job.label}.png`), buf);
      console.log(`saved (${Math.round(buf.length / 1024)} KB)`);
      ok++;
    } catch (e) {
      console.log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\nDone. ${ok}/${jobs.length} saved → ${outDir}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
