import "server-only";
import { prisma } from "@/app/lib/prisma";
import { normalizeIconKey } from "@/app/lib/brand-icons";
import {
  generateBrandIconPngAction,
  createBrandIcon,
} from "@/app/admin/settings/actions";

/**
 * Self-growing scope-icon resolver.
 *
 * Given a list of icon CONCEPTS (short nouns like "ceiling fan", "walk-in
 * shower", "composite deck"), it:
 *   1. matches each against the existing BrandIcon library (by slug or tag), and
 *   2. on a miss — when generateMissing is true — generates a new on-brand PNG
 *      via Gemini, persists it to BrandIcon (tagged so future lookups hit), and
 *      reuses it.
 *
 * Returns a Map keyed by NORMALIZED concept slug → public PNG URL. Concepts
 * that don't match and can't be generated are simply absent (caller falls back
 * to the built-in vector icon). The library grows over time, so each concept
 * costs a generation at most once across the whole app.
 */

const SCOPE_ICON_CATEGORY = "scope";

export async function resolveScopeIconImages(
  rawConcepts: string[],
  opts: { generateMissing?: boolean } = {},
): Promise<Map<string, string>> {
  const generateMissing = opts.generateMissing ?? true;

  // Normalize + dedupe.
  const slugs = Array.from(
    new Set(
      rawConcepts
        .map((c) => normalizeIconKey(c))
        .filter((s) => s.length > 0),
    ),
  );
  const labelBySlug = new Map<string, string>();
  for (const raw of rawConcepts) {
    const slug = normalizeIconKey(raw);
    if (slug && !labelBySlug.has(slug)) labelBySlug.set(slug, raw.trim());
  }

  const result = new Map<string, string>();
  if (slugs.length === 0) return result;

  // 1) Match against existing active icons (one query).
  const existing = await prisma.brandIcon.findMany({
    where: { isActive: true },
    select: { slug: true, imageUrl: true, tags: true },
  });
  const bySlug = new Map<string, string>();
  const byTag = new Map<string, string>();
  for (const ic of existing) {
    if (ic.imageUrl) {
      bySlug.set(ic.slug, ic.imageUrl);
      for (const t of ic.tags ?? []) {
        const nt = normalizeIconKey(t);
        if (nt && !byTag.has(nt)) byTag.set(nt, ic.imageUrl);
      }
    }
  }

  const missing: string[] = [];
  for (const slug of slugs) {
    const hit = bySlug.get(slug) ?? byTag.get(slug);
    if (hit) result.set(slug, hit);
    else missing.push(slug);
  }

  if (!generateMissing || missing.length === 0) return result;

  // 2) Generate + persist the misses in parallel (one-time cost per concept).
  await Promise.all(
    missing.map(async (slug) => {
      const label = labelBySlug.get(slug) ?? slug.replace(/-/g, " ");
      try {
        const gen = await generateBrandIconPngAction({
          name: label,
          visual: `Simple, clean line-art icon of a ${label}, minimal, centered, even padding`,
          description: `Scope icon for a remodeling proposal representing "${label}".`,
        });
        if (gen.error || !gen.imageUrl || !gen.imageKey) return;

        const created = await createBrandIcon({
          slug,
          name: label,
          imageUrl: gen.imageUrl,
          imageKey: gen.imageKey,
          tags: Array.from(new Set([slug, "scope", ...label.toLowerCase().split(/\s+/)])).filter(Boolean),
          category: SCOPE_ICON_CATEGORY,
        });

        if (created.error) {
          // Likely a slug race (another worker created it) — re-fetch and reuse.
          const row = await prisma.brandIcon.findUnique({
            where: { slug },
            select: { imageUrl: true },
          });
          if (row?.imageUrl) result.set(slug, row.imageUrl);
          return;
        }
        result.set(slug, gen.imageUrl);
      } catch {
        // Swallow — caller falls back to the built-in vector icon.
      }
    }),
  );

  return result;
}

/** Convenience: normalized lookup key for a concept (re-exported for callers). */
export function scopeIconSlug(concept: string | null | undefined): string {
  return normalizeIconKey(concept);
}
