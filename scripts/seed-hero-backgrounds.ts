/**
 * One-time seed script: generate and save 10 curated hero backgrounds to the
 * BrandBackground library.
 *
 * Run:  npx tsx scripts/seed-hero-backgrounds.ts
 *   or: npm run seed:hero-backgrounds
 *
 * Requires .env.local with GEMINI_API_KEY, DATABASE_URL, and R2 credentials.
 * Skips any slug that already exists in the database.
 * Adds a 3-second delay between each generation to respect rate limits.
 *
 * Implementation note: all env-dependent modules are loaded via dynamic
 * import() inside main() so that dotenv.config() runs first.  Static import
 * statements are hoisted before any runtime code by tsx/esbuild, which would
 * cause the Prisma singleton to initialize before env vars are available.
 */

import * as dotenv from "dotenv";
import { resolve } from "path";

// ── Load env vars synchronously ──────────────────────────────────────────────
// dotenv and path don't read DATABASE_URL so they are safe to import statically.
// Everything else is loaded via dynamic import() inside main().
dotenv.config({ path: resolve(process.cwd(), ".env") });
dotenv.config({ path: resolve(process.cwd(), ".env.local"), override: true });

// ── Types (erased at runtime — no dynamic import needed) ─────────────────────

type BackgroundStylePreset = "architectural" | "editorial" | "technical" | "warm-luxury";

interface BackgroundDef {
  slug:            string;
  name:            string;
  prompt:          string;
  stylePreset:     BackgroundStylePreset;
  compositionSeed: string;
  sortOrder:       number;
}

// ── Brand context ─────────────────────────────────────────────────────────────

const BRAND_CONTEXT = {
  accentColor: "#F47216",
  textColor:   "#1B1B1B",
  companyName: "HHI Builders",
};

// ── Background definitions ────────────────────────────────────────────────────

const BACKGROUNDS: BackgroundDef[] = [
  {
    slug:            "hero-lowcountry-porch",
    name:            "Lowcountry Porch",
    prompt:          "Luxury Lowcountry home with deep covered porch, rocking chairs, live oak trees with Spanish moss, warm golden hour light",
    stylePreset:     "architectural",
    compositionSeed: "left-weighted",
    sortOrder:       20,
  },
  {
    slug:            "hero-coastal-exterior",
    name:            "Coastal Home Exterior",
    prompt:          "Hilton Head Island luxury home exterior, standing-seam metal roof, cedar shingle siding, palmetto landscaping, blue sky",
    stylePreset:     "architectural",
    compositionSeed: "right-weighted",
    sortOrder:       21,
  },
  {
    slug:            "hero-marsh-sunset",
    name:            "Marsh at Sunset",
    prompt:          "Lowcountry salt marsh at golden hour, warm amber light reflecting on water, sea grass, distant tree line, peaceful and expansive",
    stylePreset:     "editorial",
    compositionSeed: "bottom-fade",
    sortOrder:       22,
  },
  {
    slug:            "hero-kitchen-materials",
    name:            "Kitchen Materials",
    prompt:          "Luxury kitchen renovation close-up, honed marble countertop, warm wood cabinetry, brass hardware, natural light from window",
    stylePreset:     "warm-luxury",
    compositionSeed: "corner",
    sortOrder:       23,
  },
  {
    slug:            "hero-blueprint-home",
    name:            "Blueprint to Home",
    prompt:          "Architectural blueprint sketch transitioning to a finished Lowcountry luxury home with deep porches and coastal landscaping",
    stylePreset:     "architectural",
    compositionSeed: "split-diptych",
    sortOrder:       24,
  },
  {
    slug:            "hero-bathroom-stone",
    name:            "Bathroom Natural Stone",
    prompt:          "Luxury bathroom renovation, honed travertine shower wall, warm wood vanity, frameless glass, soft natural light",
    stylePreset:     "warm-luxury",
    compositionSeed: "left-weighted",
    sortOrder:       25,
  },
  {
    slug:            "hero-live-oak-canopy",
    name:            "Live Oak Canopy",
    prompt:          "Majestic live oak canopy with Spanish moss over a crushed shell driveway, luxury coastal home in background, dappled golden light",
    stylePreset:     "editorial",
    compositionSeed: "right-weighted",
    sortOrder:       26,
  },
  {
    slug:            "hero-wood-texture",
    name:            "Warm Cypress Wood",
    prompt:          "Macro close-up of warm aged cypress wood grain, golden directional light raking across the surface, refined natural texture",
    stylePreset:     "warm-luxury",
    compositionSeed: "left-weighted",
    sortOrder:       27,
  },
  {
    slug:            "hero-coastal-evening",
    name:            "Coastal Evening",
    prompt:          "Hilton Head luxury home at blue hour, warm interior lights glowing through large windows, palmetto silhouettes, deep blue twilight sky",
    stylePreset:     "architectural",
    compositionSeed: "bottom-fade",
    sortOrder:       28,
  },
  {
    slug:            "hero-tabby-detail",
    name:            "Tabby Shell Detail",
    prompt:          "Close-up of tabby shell wall texture with warm afternoon light, oyster shell aggregate, Lowcountry architectural detail",
    stylePreset:     "warm-luxury",
    compositionSeed: "corner",
    sortOrder:       29,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function divider() {
  console.log("─".repeat(56));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Dynamic imports execute here — AFTER dotenv.config() has already run,
  // so process.env.DATABASE_URL and GEMINI_API_KEY are available.
  const [
    { generateBackgroundImagesAction },
    { PrismaClient },
    { PrismaPg },
  ] = await Promise.all([
    import("../app/admin/settings/branding/backgrounds/actions"),
    import("../app/generated/prisma"),
    import("@prisma/adapter-pg"),
  ]);

  // Create a fresh Prisma client (bypasses the cached singleton in app/lib/prisma.ts
  // which would have been initialized before dotenv ran).
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const db = new PrismaClient({ adapter, log: ["error", "warn"] });

  console.log("\n🏝  HHI Builders — Hero Background Seeder");
  divider();
  console.log(`Generating ${BACKGROUNDS.length} backgrounds sequentially…\n`);

  let succeeded = 0;
  let failed    = 0;
  let skipped   = 0;

  for (let i = 0; i < BACKGROUNDS.length; i++) {
    const bg = BACKGROUNDS[i];
    const prefix = `[${i + 1}/${BACKGROUNDS.length}]`;

    // ── Skip if slug already exists ──────────────────────────────────────────
    const existing = await db.brandBackground.findUnique({
      where:  { slug: bg.slug },
      select: { id: true },
    });
    if (existing) {
      console.log(`${prefix} ⏭  Skipping "${bg.name}" — slug already exists`);
      skipped++;
      continue;
    }

    console.log(`${prefix} 🎨 Generating "${bg.name}"…`);
    console.log(`        prompt : ${bg.prompt.slice(0, 70)}…`);
    console.log(`        preset : ${bg.stylePreset}  /  seed: ${bg.compositionSeed}`);

    try {
      const result = await generateBackgroundImagesAction({
        prompt:       bg.prompt,
        mode:         "slide-visual",
        stylePreset:  bg.stylePreset,
        brandContext: BRAND_CONTEXT,
      });

      if (result.error || !result.images?.length) {
        console.error(`        ❌ Generation failed: ${result.error ?? "No images returned"}`);
        failed++;
      } else {
        // Use the image matching the requested compositionSeed; fall back to first.
        const match =
          result.images.find((img) => img.compositionSeed === bg.compositionSeed) ??
          result.images[0];

        await db.brandBackground.create({
          data: {
            slug:            bg.slug,
            name:            bg.name,
            baseColorHex:    "#F8F4EE",
            overlayImageUrl: match.imageUrl,
            overlayImageKey: match.imageKey,
            overlayOpacity:  100,
            overlayScale:    100,
            overlaySpacing:  9999,
            overlayRotation: 0,
            isAvailable:     true,
            isActive:        true,
            sortOrder:       bg.sortOrder,
            generationMode:  "slide-visual",
            stylePreset:     bg.stylePreset,
            compositionSeed: match.compositionSeed ?? bg.compositionSeed,
            tags:            [],
          },
        });

        console.log(`        ✅ Saved — composition: ${match.compositionSeed ?? bg.compositionSeed}`);
        succeeded++;
      }
    } catch (err) {
      console.error(`        ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    // Rate-limit delay (skip after the last item).
    // slide-visual mode generates 4 images in parallel = 4 API requests per run.
    // Imagen 4 quota is 10 req/min, so we need ≥24s between calls to stay safe.
    if (i < BACKGROUNDS.length - 1) {
      console.log(`        ⏳ Waiting 30s (rate-limit buffer)…`);
      await sleep(30000);
    }

    console.log("");
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  divider();
  console.log(`✅  Succeeded : ${succeeded}`);
  if (skipped > 0) console.log(`⏭   Skipped   : ${skipped}`);
  console.log(`❌  Failed    : ${failed}`);
  console.log(`    Total     : ${BACKGROUNDS.length}`);
  divider();

  if (succeeded > 0) {
    console.log(
      "\n💡 Tip: open Background Library → 'Fix previews' to generate\n" +
      "   thumbnails for the new backgrounds.\n"
    );
  }

  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n💥 Fatal error:", err);
  process.exit(1);
});
