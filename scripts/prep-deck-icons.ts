/**
 * One-off: turn the approved icon-lab PNGs into clean committed deck-icon assets.
 *
 * For each chosen source it: keys near-white background → transparent, trims the
 * surrounding margin so the icon fills the frame, then standardizes to a padded
 * 512×512 transparent PNG written to public/deck-icons/. These become the
 * Design Experience default stage icons (no AI Edit required).
 *
 * Run:  node node_modules/tsx/dist/cli.mjs scripts/prep-deck-icons.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SRC_DIR = join(process.cwd(), "scripts", "icon-lab-out");
const OUT_DIR = join(process.cwd(), "public", "deck-icons");

// Approved source (all isometric / gemini-2.5-flash-image) → committed name.
const MAP: Record<string, string> = {
  "measure__isometric__gemini-2-5-flash-image.png": "measure.png",
  "feasibility__isometric__gemini-2-5-flash-image.png": "feasibility.png",
  "documentation__isometric__gemini-2-5-flash-image.png": "documentation.png",
  "selections__isometric__gemini-2-5-flash-image.png": "selections.png",
  "contract__isometric__gemini-2-5-flash-image.png": "contract.png",
};

const SIZE = 512;
const INNER = 468; // icon size before padding (leaves a small even margin)
const WHITE = 248; // ≥ this on all channels = background → transparent

async function prep(srcName: string, outName: string) {
  const buf = readFileSync(join(SRC_DIR, srcName));

  // 1) key near-white → transparent (raw pixel pass)
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i] >= WHITE && data[i + 1] >= WHITE && data[i + 2] >= WHITE) data[i + 3] = 0;
  }
  const keyed = await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toBuffer();

  // 2) trim the transparent margin, 3) contain to INNER, 4) pad to SIZE square
  const pad = Math.round((SIZE - INNER) / 2);
  const out = await sharp(keyed)
    .trim()
    .resize(INNER, INNER, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  writeFileSync(join(OUT_DIR, outName), out);
  console.log(`✓ ${outName} (${Math.round(out.length / 1024)} KB)`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [src, out] of Object.entries(MAP)) {
    try {
      await prep(src, out);
    } catch (e) {
      console.log(`✗ ${out}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\nDone → ${OUT_DIR}`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
