/**
 * Icon Lab — investigate what Gemini prompt + model produces NotebookLM-quality
 * duotone/isometric process icons. NOT part of any automated suite.
 *
 * It generates a matrix of CONCEPTS × PROMPT STYLES × MODELS and writes the raw
 * PNGs to scripts/icon-lab-out/ so you can eyeball which recipe wins. Once we
 * pick a winner we wire that prompt+model into resolveDuotoneIconImages().
 *
 * Run:
 *   npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/icon-lab.ts
 *   # optional: limit to one concept →  ... scripts/icon-lab.ts measure
 *
 * Needs GEMINI_API_KEY in env, or the key saved in Settings → Integrations
 * (it'll be read from the encrypted DB store as a fallback).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";

// ─── Concepts (the scene each icon should depict) ─────────────────────────────
const CONCEPTS: Record<string, string> = {
  measure:
    "a measuring tape together with a rolled architectural floor-plan blueprint",
  feasibility:
    "a magnifying glass inspecting a structural blueprint with a checkmark",
  documentation:
    "a set of rolled architectural blueprints and stamped construction drawings",
  selections:
    "a fan of paint/material swatches beside a small tile sample",
  contract:
    "a signed contract document with a pen and an approval seal/checkmark",
};

// ─── Prompt styles to compare ─────────────────────────────────────────────────
const STYLES: Record<string, (scene: string) => string> = {
  isometric: (scene) =>
    `A clean ISOMETRIC line illustration of ${scene}. ` +
    `Two-tone palette ONLY: dark navy (#1A2332) outlines as the primary linework, ` +
    `with selective burnt-orange (#F47216) accent details, plus subtle light warm-gray flat fills for depth. ` +
    `Modern, minimal, confident even medium stroke weight. The subject fills ~80% of the frame, centered, comfortable margins. ` +
    `Solid pure-white (#FFFFFF) background. No text, no words, no drop shadows, no glow, no background scenery, no plate or frame behind it.`,
  detailed: (scene) =>
    `A detailed but clean flat line-art icon illustration of ${scene}. ` +
    `Dark navy (#1A2332) outlines with small burnt-orange (#F47216) accent highlights and light gray fills. ` +
    `Slight depth, modern and crisp, centered, fills most of the frame. ` +
    `Solid white background, no text, no shadows, no extra background elements.`,
};

// ─── Models to compare ────────────────────────────────────────────────────────
const MODELS = ["gemini-2.5-flash-image", "imagen-4.0-fast-generate-001"];

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

async function genImagen(ai: GoogleGenAI, model: string, prompt: string): Promise<Buffer | null> {
  const res = await ai.models.generateImages({
    model,
    prompt,
    config: { numberOfImages: 1, outputMimeType: "image/png", aspectRatio: "1:1" },
  });
  const b64 = (res as { generatedImages?: { image?: { imageBytes?: string } }[] })
    ?.generatedImages?.[0]?.image?.imageBytes;
  return b64 ? Buffer.from(b64, "base64") : null;
}

async function genFlashImage(ai: GoogleGenAI, model: string, prompt: string): Promise<Buffer | null> {
  const res = await ai.models.generateContent({
    model,
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
  const only = process.argv[2]; // optional concept filter
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const outDir = join(process.cwd(), "scripts", "icon-lab-out");
  mkdirSync(outDir, { recursive: true });

  const concepts = Object.entries(CONCEPTS).filter(([k]) => !only || k === only);
  let ok = 0;
  let fail = 0;

  for (const [cKey, scene] of concepts) {
    for (const [sKey, build] of Object.entries(STYLES)) {
      const prompt = build(scene);
      for (const model of MODELS) {
        const label = `${cKey}__${sKey}__${model.replace(/[.:]/g, "-")}`;
        process.stdout.write(`→ ${label} ... `);
        try {
          const buf = model.startsWith("imagen")
            ? await genImagen(ai, model, prompt)
            : await genFlashImage(ai, model, prompt);
          if (!buf) {
            console.log("no image returned");
            fail++;
            continue;
          }
          writeFileSync(join(outDir, `${label}.png`), buf);
          console.log(`saved (${Math.round(buf.length / 1024)} KB)`);
          ok++;
        } catch (e) {
          console.log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
          fail++;
        }
      }
    }
  }

  console.log(`\nDone. ${ok} saved, ${fail} failed → ${outDir}`);
  console.log("Open that folder and tell me which concept__style__model looks best; I'll wire that recipe in.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
