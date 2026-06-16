import "server-only";
import { prisma } from "@/app/lib/prisma";

/**
 * Engineering-assembly retrieval for the AI room estimate.
 *
 * When a room's scope includes structural work that doesn't exist yet (addition
 * framing, hurricane strapping, footings, CMU walls, etc.), this surfaces the
 * ENGINEER-VETTED assemblies from the knowledge base so the model uses the firm's
 * real method + per-unit quantity rules instead of inventing them. It returns a
 * compact markdown block (with its own `##` header) to inject into the UNCACHED
 * dynamic prompt block, or `null` when nothing relevant matches.
 *
 * Design notes:
 *  - Matching is DETERMINISTIC token-overlap (no embeddings) and FAILS CLOSED:
 *    no confident match → null → the model behaves exactly as it does today. This
 *    is intentional — force-applying a wrong "vetted" assembly is worse than the
 *    honest estimate.
 *  - Scope prose ("hurricane straps", "footer", "exterior walls") rarely matches
 *    canonical tags ("hurricane-strap", "footing", "exterior-wall") verbatim, so
 *    we singularize, apply a small construction-synonym map, and match a tag when
 *    ALL of its words appear in the scope's token set (order-independent). A
 *    multi-word ("compound") tag match is high-signal; broad single-word tags
 *    need a second hit to count.
 *  - The KB carries METHOD + per-unit QUANTITY RULES only, never price. Pricing
 *    still flows through the catalog/allowance machinery in the parser.
 *  - Never throws: any failure returns null so the estimate is never blocked.
 */

// Up to 8 so a multi-system scope (e.g. a porch = foundation + columns + the
// roof carrying-beam + eave) surfaces all the relevant vetted assemblies, not
// just the top-scoring foundation ones. Still bounded to keep prompt size sane.
const MAX_ASSEMBLIES = 8;

// Construction-vocabulary synonyms (contractor prose → canonical token).
const SYNONYMS: Record<string, string> = {
  footer: "footing",
  ftg: "footing",
  rebar: "rebar",
  cmu: "masonry",
  holddown: "holdown",
  strapping: "strap",
};

function singularize(w: string): string {
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function canon(w: string): string {
  const s = SYNONYMS[w] ?? w;
  return singularize(SYNONYMS[s] ?? s);
}

/** Scope prose → set of canonical word tokens. */
function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)) {
    if (raw) out.add(canon(raw));
  }
  return out;
}

/** A tag ("hurricane-strap") → its canonical words (["hurricane","strap"]). */
function tagWords(tag: string): string[] {
  return tag
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(canon);
}

type LoadedAssembly = Awaited<ReturnType<typeof loadApprovedAssemblies>>[number];
type ScoredAssembly = { score: number; matched: string[]; assembly: LoadedAssembly };

function loadApprovedAssemblies() {
  return prisma.engineeringAssembly.findMany({
    where: { reviewStatus: "APPROVED", isActive: true },
    include: { components: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] } },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Returns a markdown "## Vetted Engineering Assemblies" block for the given
 * scope, or null when no approved assembly confidently matches.
 */
export async function getEngineeringAssemblies(
  scopeNarrative: string,
): Promise<string | null> {
  const scope = (scopeNarrative ?? "").trim();
  if (scope.length < 8) return null;

  try {
    const assemblies = await loadApprovedAssemblies();
    if (assemblies.length === 0) return null;

    const scopeTokens = tokenize(scope);

    const scored: ScoredAssembly[] = [];
    for (const a of assemblies) {
      const keywords = [...(a.triggerKeywords ?? []), ...(a.tags ?? [])];
      const matched: string[] = [];
      let score = 0;
      let hasCompoundMatch = false;
      for (const raw of keywords) {
        const words = tagWords(raw);
        if (words.length === 0) continue;
        const key = words.join(" ");
        if (matched.includes(key)) continue;
        // Match when every word of the tag is present in the scope tokens.
        if (words.every((w) => scopeTokens.has(w))) {
          matched.push(key);
          score += 1;
          if (words.length > 1) hasCompoundMatch = true; // compound tags are high-signal
        }
      }
      // Include on a strong compound-tag hit (e.g. "hurricane strap", "wall
      // footing", "new to existing") OR on >= 2 overlapping tags. Keeps broad
      // single-word tags (e.g. "wall") from over-triggering on cosmetic scopes.
      if (hasCompoundMatch || score >= 2) {
        scored.push({ score, matched, assembly: a });
      }
    }

    if (scored.length === 0) return null;
    scored.sort((x, y) => y.score - x.score);
    const top = scored.slice(0, MAX_ASSEMBLIES);

    return renderBlock(top);
  } catch {
    return null; // never block the estimate
  }
}

function renderBlock(items: ScoredAssembly[]): string {
  const lines: string[] = [];
  lines.push("## Vetted Engineering Assemblies");
  lines.push(
    "These are ENGINEER-APPROVED structural assemblies from HHI's drawing library that " +
      "match this scope. For the relevant framing / structural / foundation work, you MUST " +
      "use the method and the PER-UNIT quantity rules shown here (do not invent an " +
      "alternative method or quantities for work these cover). Compute totals by scaling each " +
      "per-unit rule to this room's dimensions (e.g. studs at 16 in o.c. across the wall length, " +
      "one strap per rafter, anchor bolts per LF). Reference the assembly name in the line-item " +
      "notes. PRICING is unchanged — still price every line through the catalog/allowance rules.",
  );

  for (const { assembly: a } of items) {
    lines.push("");
    lines.push(`### ${a.name}${a.category ? ` (${a.category})` : ""}`);
    if (a.whenToUse) lines.push(`When to use: ${a.whenToUse}`);
    if (a.methodSummary) lines.push(`Method: ${a.methodSummary}`);

    const members = a.components.filter((c) => c.kind !== "CONNECTOR");
    const connectors = a.components.filter((c) => c.kind === "CONNECTOR");
    if (members.length) {
      lines.push("Members & materials:");
      for (const c of members) lines.push(`  - ${componentLine(c)}`);
    }
    if (connectors.length) {
      lines.push("Connectors & fasteners:");
      for (const c of connectors) lines.push(`  - ${componentLine(c)}`);
    }
    if (a.codeBasis) lines.push(`Code basis: ${a.codeBasis}`);
    if (a.quantityBasis) lines.push(`Quantity basis: ${a.quantityBasis}`);
    if (a.caveats) lines.push(`Caveats: ${a.caveats}`);
    const prov = [a.sourceFirm, a.engineerName, a.sourceRef].filter(Boolean).join(" — ");
    if (prov) lines.push(`Source: ${prov}`);
  }

  return lines.join("\n");
}

function componentLine(c: {
  name: string;
  spec: string | null;
  model: string | null;
  qtyRule: string | null;
  unit: string | null;
  isConditional: boolean;
  notes: string | null;
}): string {
  const specOrModel = [c.model, c.spec].filter(Boolean).join(", ");
  const qty = [c.qtyRule, c.unit].filter(Boolean).join(" ");
  const parts = [c.name];
  if (specOrModel) parts.push(specOrModel);
  if (qty) parts.push(qty);
  let line = parts.join(" | ");
  if (c.isConditional) line += " [conditional — only where its condition applies]";
  if (c.notes) line += ` (${c.notes})`;
  return line;
}
