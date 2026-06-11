/**
 * One-off: pull the approved dark-palette isometric Why Us icons (generated via
 * the Guarantee Grid "Generate isometric icons" button, cached in BrandIcon
 * under the `isod-` slug namespace / category "duotone-dark") out of storage and
 * commit them as default assets in public/why-us-icons/. These become the
 * Guarantee Grid DEFAULT pillar icons — no AI generation required, and they
 * survive a database wipe (the whole point of committing them to the repo).
 *
 * For each icon it: keys near-white → transparent (defensive), trims the margin,
 * then standardizes to a padded 512×512 transparent PNG.
 *
 * Run:  npx dotenv -e .env.local -- node node_modules/tsx/dist/cli.mjs scripts/prep-why-us-icons.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { prisma } from "../app/lib/prisma";

const OUT_DIR = join(process.cwd(), "public", "why-us-icons");
const SIZE = 512;
const INNER = 468; // icon size before padding (small even margin)
const WHITE = 250; // ≥ this on all channels = leftover background → transparent

// BrandIcon bare-slug (slug minus the `isod-` prefix) → committed clean filename.
// Both common phrasings of each HHI guarantee map to one stable concept file.
const RENAME: Record<string, string> = {
  "zero-change-orders-guarantee": "change-order.png",
  "zero-change-order-guarantee": "change-order.png",
  "zero-mark-up-on-materials": "markup.png",
  "zero-markup-on-materials": "markup.png",
  "freedom-with-your-design": "design-freedom.png",
  "designs-that-work-in-the-real-world": "real-world.png",
  "real-world-designs": "real-world.png",
};

async function processBuf(buf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  for (let i = 0; i < data.length; i += ch) {
    if (data[i] >= WHITE && data[i + 1] >= WHITE && data[i + 2] >= WHITE) data[i + 3] = 0;
  }
  const keyed = await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toBuffer();
  const pad = Math.round((SIZE - INNER) / 2);
  return sharp(keyed)
    .trim()
    .resize(INNER, INNER, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const icons = await prisma.brandIcon.findMany({
    where: { category: "duotone-dark", isActive: true },
    select: { slug: true, imageUrl: true, name: true },
  });
  if (icons.length === 0) {
    console.log("No duotone-dark icons found. Open the Guarantee Grid and click 'Generate isometric icons' first.");
    return;
  }
  console.log(`Found ${icons.length} dark isometric icon(s):`);
  for (const ic of icons) {
    const bare = ic.slug.replace(/^isod-/, "");
    const out = RENAME[bare] ?? `${bare}.png`;
    console.log(`  ${ic.slug}  →  ${out}   (${ic.name})`);
    if (!ic.imageUrl) {
      console.log("    ✗ no imageUrl");
      continue;
    }
    try {
      const res = await fetch(ic.imageUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      const png = await processBuf(buf);
      writeFileSync(join(OUT_DIR, out), png);
      console.log(`    ✓ ${out} (${Math.round(png.length / 1024)} KB)`);
    } catch (e) {
      console.log(`    ✗ ${out}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\nDone → ${OUT_DIR}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
