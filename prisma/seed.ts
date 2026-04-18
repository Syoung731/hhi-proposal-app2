import dotenv from "dotenv";
import {
  PrismaClient,
  ProjectStatus,
  TimelinePhaseType,
} from "../app/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

// Load .env first, then .env.local (override) — mirrors Next.js behavior.
// .env.local is where real local credentials live in Next.js projects.
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

// Prefer DIRECT_URL (non-pooler) for the seed script.
// prisma.config.ts documents this: the pooler endpoint can cause advisory-lock
// timeouts and doesn't support the standard TCP connections that PrismaPg/pg needs.
// Fall back to DATABASE_URL so the script still works in environments that only
// set one of the two.
const seedConnectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!seedConnectionString) {
  throw new Error(
    "Neither DIRECT_URL nor DATABASE_URL is set. " +
    "Add DIRECT_URL (non-pooler Neon URL) to .env or .env.local."
  );
}

// Prisma 7 requires an adapter OR accelerateUrl.
// We are using Neon Postgres directly, so we use PrismaPg adapter.
const adapter = new PrismaPg({
  connectionString: seedConnectionString,
});

const prisma = new PrismaClient({
  adapter,
});

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// ─── Brand Backgrounds ───────────────────────────────────────────────────────
// 10 curated backgrounds matching HHI brand aesthetic.
// description is not a BrandBackground schema field — omitted.
const BRAND_BACKGROUNDS_SEED = [
  {
    slug: "blueprint-grid",
    name: "Blueprint Grid",
    baseColorHex: "#F8F9FA",
    generationMode: "blueprint-overlay",
    stylePreset: "technical",
    sortOrder: 1,
  },
  {
    slug: "warm-linen",
    name: "Warm Linen",
    baseColorHex: "#F8F4EE",
    generationMode: "subtle-texture",
    stylePreset: "warm-luxury",
    sortOrder: 2,
  },
  {
    slug: "navy-solid",
    name: "Navy Dark",
    baseColorHex: "#1A2332",
    generationMode: "subtle-texture",
    stylePreset: "architectural",
    sortOrder: 3,
  },
  {
    slug: "architectural-sketch",
    name: "Architectural Sketch",
    baseColorHex: "#F5F2EC",
    generationMode: "blueprint-overlay",
    stylePreset: "warm-luxury",
    sortOrder: 4,
  },
  {
    slug: "pure-white",
    name: "Clean White",
    baseColorHex: "#FFFFFF",
    generationMode: "subtle-texture",
    stylePreset: "editorial",
    sortOrder: 5,
  },
  {
    slug: "navy-blueprint",
    name: "Blueprint Dark",
    baseColorHex: "#003153",
    generationMode: "blueprint-overlay",
    stylePreset: "technical",
    sortOrder: 6,
  },
  {
    slug: "warm-gray",
    name: "Warm Gray",
    baseColorHex: "#F0EDEA",
    generationMode: "subtle-texture",
    stylePreset: "editorial",
    sortOrder: 7,
  },
  {
    slug: "charcoal-dark",
    name: "Charcoal",
    baseColorHex: "#2D2D2D",
    generationMode: "subtle-texture",
    stylePreset: "architectural",
    sortOrder: 8,
  },
  {
    slug: "coastal-sand",
    name: "Coastal Sand",
    baseColorHex: "#EDE8DF",
    generationMode: "subtle-texture",
    stylePreset: "warm-luxury",
    sortOrder: 9,
  },
  {
    slug: "grid-overlay-light",
    name: "Graph Paper",
    baseColorHex: "#FAFAFA",
    generationMode: "blueprint-overlay",
    stylePreset: "technical",
    sortOrder: 10,
  },
] as const;

// Full HHI Builders RoomTypes (standard). Exterior room types are marked isExterior: true.
const ROOM_TYPES_SEED = [
  { name: "Entry/Hall", isExterior: false },
  { name: "Hallway", isExterior: false },
  { name: "Kitchen", isExterior: false },
  { name: "Dining Room", isExterior: false },
  { name: "Breakfast Nook", isExterior: false },
  { name: "Living Room", isExterior: false },
  { name: "Family Room", isExterior: false },
  { name: "Den", isExterior: false },
  { name: "Primary Bath", isExterior: false },
  { name: "Bathroom", isExterior: false },
  { name: "Bedroom", isExterior: false },
  { name: "Closet", isExterior: false },
  { name: "Laundry", isExterior: false },
  { name: "Pantry", isExterior: false },
  { name: "Carolina Room", isExterior: false },
  { name: "Stairway", isExterior: false },
  { name: "Wet / Dry Bar", isExterior: false },
  { name: "Office", isExterior: false },
  { name: "Garage", isExterior: false },
  { name: "Deck", isExterior: true },
  { name: "Screened Porch", isExterior: true },
  { name: "Landscaping", isExterior: true },
  { name: "Pool", isExterior: true },
  { name: "Driveway", isExterior: true },
] as const;

// Style presets: exactly 8, upsert by name. sortOrder 0..7. All isActive: true.
const STYLE_PRESETS_SEED = [
  {
    name: "Lowcountry Coastal Luxury",
    prompt:
      "Lowcountry coastal luxury. Bright, airy, high-end finishes. Soft coastal neutrals (warm whites, sand, driftwood, pale greige) with subtle navy/charcoal accents. Natural textures: white oak, rattan, linen, light stone. Elevated millwork and trim detail. Polished nickel or brushed brass accents. Layered warm lighting (2700–3000K) with clean recessed + statement fixtures. Resort-like, refined, not beachy kitsch.",
    sortOrder: 0,
  },
  {
    name: "Coastal Modern",
    prompt:
      "Coastal modern. Clean lines, minimal clutter, open and bright. White walls, light oak, simple cabinetry, thin-profile hardware. Quartz or light stone surfaces, subtle texture, minimal pattern. Matte black or brushed nickel accents. Natural daylight feel; crisp but warm lighting (3000K). Modern coastal without farmhouse or nautical themes.",
    sortOrder: 1,
  },
  {
    name: "Transitional Luxe",
    prompt:
      "Transitional luxury. Balanced classic + modern: timeless shapes with clean detailing. Neutral palette (warm white, greige, soft taupe) with richer accents (espresso, bronze). High-end stone (marble-look, quartzite vibe), refined cabinet profiles, elegant hardware. Warm layered lighting, upscale fixtures. Sophisticated and welcoming.",
    sortOrder: 2,
  },
  {
    name: "Contemporary Clean",
    prompt:
      "Contemporary clean. Sleek, minimal, crisp geometry. Flat or slab cabinetry, integrated pulls, clean surfaces. Neutral palette (white/gray/black) with occasional warm wood. Large-format tile or seamless materials, low visual noise. Modern lighting and subtle under-cabinet glow. Premium but restrained.",
    sortOrder: 3,
  },
  {
    name: "Warm Modern Organic",
    prompt:
      "Warm modern organic. Modern forms softened by natural materials. Warm whites, creamy beiges, clay tones; lots of light-to-medium wood. Textures: limewash/plaster feel, honed stone, natural tile, linen. Curved or softened edges where appropriate. Black accents used sparingly. Warm, cozy, elevated, spa-like.",
    sortOrder: 4,
  },
  {
    name: "Classic Traditional Upscale",
    prompt:
      "Classic traditional upscale. Timeless millwork, detailed trim, refined cabinet door profiles. Rich but tasteful materials: marble/quartzite look, classic tile patterns, warm wood tones. Polished nickel or antique brass. Elegant lighting (lanterns/sconces) and layered warmth (2700K). Traditional, not dated.",
    sortOrder: 5,
  },
  {
    name: "Light Scandinavian",
    prompt:
      "Light Scandinavian. Bright, minimal, calm. White walls, pale woods (birch/oak), simple cabinetry, minimal hardware. Matte black accents optional but subtle. Soft textiles, natural textures, clean lines. Daylight-forward, soft warm lighting (3000K). Cozy minimalism.",
    sortOrder: 6,
  },
  {
    name: "Moody Modern Contrast",
    prompt:
      "Moody modern contrast. Dark, dramatic, high-end. Deep charcoal/black/ink tones paired with warm wood and rich stone. Strong contrast, clean modern lines, premium fixtures. Brass or matte black accents. Focused layered lighting with warm highlights (2700–3000K). Cinematic but still realistic and livable.",
    sortOrder: 7,
  },
] as const;

/** Normalize name for matching: lowercase, trim, collapse spaces, remove punctuation like / - & */
function normalizeRoomTypeKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s/\-&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const slug = "sample-remodel";

  await prisma.project.upsert({
    where: { slug },
    create: {
      slug,
      status: ProjectStatus.DRAFT,
      title: "Sample Home Remodel",
      subtitle: "Kitchen & Bath Proposal",
      addressLine1: "123 Main St",
      addressLine2: null,
      city: "Anytown",
      state: null,
      zip: null,
      client1First: "Jane",
      client1Last: "Smith",
      client2First: "John",
      client2Last: "Smith",
      objective:
        "Transform the kitchen and primary bath into modern, functional spaces that match your style and improve daily living.",
      publishedVersion: 0,
      rooms: {
        create: [
          {
            name: "Kitchen",
            scopeNarrative:
              "Full cabinet refresh, new countertops, and island with seating. New appliances and lighting. Flooring refinish to match existing hardwood.",
            scopeSource: "MANUAL",
            scopeUpdatedAt: new Date(),
            sortOrder: 0,
          },
          {
            name: "Primary Bath",
            scopeNarrative:
              "Walk-in shower with tile surround, double vanity, and heated floor. New fixtures and mirror.",
            scopeSource: "MANUAL",
            scopeUpdatedAt: new Date(),
            sortOrder: 1,
          },
        ],
      },
      timelinePhases: {
        create: [
          {
            phase: TimelinePhaseType.SIGN_CONTRACT,
            durationText: "",
            sortOrder: 0,
          },
          {
            phase: TimelinePhaseType.START_DESIGN,
            durationText: "",
            sortOrder: 1,
          },
          {
            phase: TimelinePhaseType.DESIGN_FEASIBILITY,
            durationText: "4 to 8 weeks",
            sortOrder: 2,
          },
          {
            phase: TimelinePhaseType.PRECONSTRUCTION,
            durationText: "3 to 5 weeks",
            sortOrder: 3,
          },
          {
            phase: TimelinePhaseType.CONSTRUCTION,
            durationText: "12 to 16 weeks",
            sortOrder: 4,
          },
        ],
      },
      investmentLineItems: {
        create: [
          { bucket: "BASE", label: "Base", rangeLow: 0, rangeTarget: 0, rangeHigh: 0, sortOrder: 0 },
          { bucket: "ALTERNATE", label: "Alternates", rangeLow: 0, rangeTarget: 0, rangeHigh: 0, sortOrder: 1 },
          { bucket: "ALLOWANCE", label: "Allowances", rangeLow: 0, rangeTarget: 0, rangeHigh: 0, sortOrder: 2 },
        ],
      },
    },
    update: {},
  });

  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) throw new Error("Project not created");

  // Do not create a Media row with empty url. When there is no cover media,
  // the UI shows the proposal without a hero image (no Media record needed).

  // HHI Builders standard room types: insert all if empty; otherwise upsert by normalized name
  const roomTypeCount = await prisma.roomType.count();
  if (roomTypeCount === 0) {
    await prisma.roomType.createMany({
      data: ROOM_TYPES_SEED.map((r, i) => ({
        name: r.name,
        sortOrder: i + 1,
        active: true,
        exterior: r.isExterior,
      })),
    });
    console.log("Inserted HHI Builders room types:", ROOM_TYPES_SEED.length);
  } else {
    const existing = await prisma.roomType.findMany();
    const byNormalized = new Map(
      existing.map((rt) => [normalizeRoomTypeKey(rt.name), rt])
    );
    let updated = 0;
    let created = 0;
    for (let i = 0; i < ROOM_TYPES_SEED.length; i++) {
      const seed = ROOM_TYPES_SEED[i];
      const key = normalizeRoomTypeKey(seed.name);
      const match = byNormalized.get(key);
      const sortOrder = i + 1;
      if (match) {
        const preserveSortOrder = match.sortOrder !== 0;
        await prisma.roomType.update({
          where: { id: match.id },
          data: {
            exterior: seed.isExterior,
            active: true,
            ...(preserveSortOrder ? {} : { sortOrder }),
          },
        });
        updated++;
      } else {
        await prisma.roomType.create({
          data: {
            name: seed.name,
            exterior: seed.isExterior,
            active: true,
            sortOrder,
          },
        });
        created++;
      }
    }
    console.log(
      "Room types upserted:",
      updated,
      "updated,",
      created,
      "created. Total in seed:",
      ROOM_TYPES_SEED.length
    );
  }

  // Style presets: upsert by name; exactly these 8, isActive: true, sortOrder 0..7
  const seedNames = new Set(STYLE_PRESETS_SEED.map((p) => p.name));
  for (let i = 0; i < STYLE_PRESETS_SEED.length; i++) {
    const preset = STYLE_PRESETS_SEED[i]!;
    await prisma.stylePreset.upsert({
      where: { name: preset.name },
      create: {
        name: preset.name,
        prompt: preset.prompt,
        isActive: true,
        sortOrder: preset.sortOrder,
      },
      update: {
        prompt: preset.prompt,
        isActive: true,
        sortOrder: preset.sortOrder,
      },
    });
  }
  // Deactivate any preset not in the seed list so dropdowns show only these 8
  await prisma.stylePreset.updateMany({
    where: { name: { notIn: [...seedNames] } },
    data: { isActive: false },
  });
  console.log("Style presets upserted:", STYLE_PRESETS_SEED.length);

  // Optional: ensure one CompanySettings row exists (singleton). Seed does not overwrite.
  const settingsCount = await prisma.companySettings.count();
  if (settingsCount === 0) {
    await prisma.companySettings.create({
      data: {
        companyName: "",
        defaultProposalDisclaimer: "",
      },
    });
    console.log("Created default CompanySettings row.");
  }

  // Ensure one CompanyContext row exists (singleton for AI pricing).
  const DEFAULT_ESTIMATION_ASSUMPTIONS = `STANDARD ESTIMATION ASSUMPTIONS:
1. CEILING HEIGHT: If ceiling height is not provided, assume 9 ft standard ceiling height. If ceiling height IS provided, use the given height.
2. WALL AREA CALCULATION: For a room with dimensions L x W and ceiling height H: Total wall linear feet = 2*(L + W). Total wall square footage = Total wall linear feet x H. Subtract openings: each standard door = 21 SF, each window = 12 SF. For bathrooms: subtract tiled areas from paintable wall SF.
3. FLOOR AREA: Use the provided square footage exactly. Do not reduce floor area unless the scope explicitly states partial flooring.
4. DRYWALL: When scope says "to studs" or "gut", assume ALL walls and ceiling in the room need new drywall. Wall SF + ceiling SF = total drywall.
5. SCOPE BOUNDARIES: Only include items that are clearly within the described scope of work. If the scope says "all other fixtures to remain," do NOT include replacement of those fixtures. If adding an item that is not explicitly in the scope, you MUST explain why it is necessary in the notes field.
6. ELECTRICAL: Do not add new electrical runs unless the scope explicitly calls for new circuits, relocated outlets, or new lighting. Minor reconnection for existing fixtures after demo is included in the trade's base labor.
7. PAINT: After new drywall, all new surfaces need primer + 2 coats. Calculate paint SF from wall + ceiling areas minus tiled surfaces.
8. PROTECTION: Content protection (Ram Board, plastic sheeting), final construction cleaning, dumpster/waste removal, permits, and supervision are all handled at the PROJECT level in the COPE budget. Do NOT include any of these items in room-level estimates.
9. QUANTITIES: Always show your math in the notes field. Example: "48 SF room, 9 ft ceilings, walls = 2*(8+6)*9 = 252 SF minus 21 SF door = 231 SF wall area"`;

  const companyContextCount = await prisma.companyContext.count();
  if (companyContextCount === 0) {
    await prisma.companyContext.create({
      data: {
        market: "Hilton Head Island, SC",
        marketNotes:
          "Second home/vacation market, coastal construction premium. Island location affects material delivery costs. Hurricane-rated construction requirements.",
        clientProfile:
          "Luxury residential renovation, $150K-$500K+ projects. Discerning homeowners expect high-end finishes and premium materials.",
        defaultFinishTier: "high-end",
        standardInclusions:
          "The following are handled at the project level in COPE and should NOT be included in room-level estimates: project supervision, content protection (Ram Board), construction cleaning, dumpster/waste removal, port-o-let, permit coordination.",
        markupStructure:
          "Catalog items have unitCost (our cost) and unitPrice (client price). Markup varies by trade and item type — it is already baked into the catalog prices. Do not apply additional markup. Use unitPrice from catalog as-is.",
        estimationAssumptions: DEFAULT_ESTIMATION_ASSUMPTIONS,
      },
    });
    console.log("Created default CompanyContext row for AI pricing.");
  } else {
    // Backfill estimationAssumptions if missing
    const existingCtx = await prisma.companyContext.findFirst();
    if (existingCtx && !existingCtx.estimationAssumptions) {
      await prisma.companyContext.update({
        where: { id: existingCtx.id },
        data: { estimationAssumptions: DEFAULT_ESTIMATION_ASSUMPTIONS },
      });
      console.log("Backfilled estimationAssumptions on CompanyContext.");
    }

    // Update old PROTECTION rule to exclude COPE items from room estimates
    if (existingCtx && existingCtx.estimationAssumptions) {
      const updated = existingCtx.estimationAssumptions.replace(
        /8\. PROTECTION: Every project includes content protection[^\n]*Include these as standard\./,
        "8. PROTECTION: Content protection (Ram Board, plastic sheeting), final construction cleaning, dumpster/waste removal, permits, and supervision are all handled at the PROJECT level in the COPE budget. Do NOT include any of these items in room-level estimates."
      );
      if (updated !== existingCtx.estimationAssumptions) {
        await prisma.companyContext.update({
          where: { id: existingCtx.id },
          data: { estimationAssumptions: updated },
        });
        console.log("Updated estimation assumptions to exclude COPE items from room estimates.");
      }
    }

    // Update standardInclusions to clarify COPE items are project-level
    if (existingCtx && existingCtx.standardInclusions) {
      const oldInclusions = "Project supervision, content protection (Ram Board), construction cleaning, dumpster/waste removal, port-o-let, permit coordination";
      if (existingCtx.standardInclusions === oldInclusions) {
        await prisma.companyContext.update({
          where: { id: existingCtx.id },
          data: {
            standardInclusions:
              "The following are handled at the project level in COPE and should NOT be included in room-level estimates: project supervision, content protection (Ram Board), construction cleaning, dumpster/waste removal, port-o-let, permit coordination.",
          },
        });
        console.log("Updated standardInclusions to clarify COPE items are project-level.");
      }
    }
  }

  // Brand backgrounds: upsert by slug so re-running seed is safe
  for (const bg of BRAND_BACKGROUNDS_SEED) {
    await prisma.brandBackground.upsert({
      where: { slug: bg.slug },
      create: {
        slug: bg.slug,
        name: bg.name,
        baseColorHex: bg.baseColorHex,
        generationMode: bg.generationMode,
        stylePreset: bg.stylePreset,
        sortOrder: bg.sortOrder,
        isActive: true,
        isAvailable: true,
        tags: [],
      },
      update: {
        name: bg.name,
        baseColorHex: bg.baseColorHex,
        generationMode: bg.generationMode,
        stylePreset: bg.stylePreset,
        sortOrder: bg.sortOrder,
        isActive: true,
        isAvailable: true,
      },
    });
  }
  console.log("Brand backgrounds upserted:", BRAND_BACKGROUNDS_SEED.length);

  // Flag COPE template as project overhead
  await prisma.roomTemplate.updateMany({
    where: { displayName: "COPE" },
    data: { isProjectOverhead: true },
  });
  console.log("Flagged COPE template as project overhead.");

  console.log("Seed complete. Sample project slug:", slug);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });