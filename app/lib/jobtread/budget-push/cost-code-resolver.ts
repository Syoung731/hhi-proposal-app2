/**
 * Live JobTread cost-code / cost-type resolver for the template-overlay budget push.
 *
 * `createCostCodeResolver()` fetches the org's full costCode + costType catalog
 * ONCE (the expensive part) and returns a synchronous `CostCodeResolver` whose
 * `resolve()` is called per pushed line.
 *
 * # Resolution strategy (per the contract in ./types.ts)
 *   1. Template-exact — if the line carried an authoritative template
 *      `costCodeName` / `costTypeName` (from `RoomTemplateItem.costCode` /
 *      `.costType`), match them by EXACT (normalized) name against the live
 *      catalog. Highest confidence (1, matchKind "template-exact").
 *   2. Fuzzy — otherwise compose a target costCode name from the trade name +
 *      the Material/Install/Sub hint ("<Trade> - <Material|Labor|Subcontract>")
 *      and pick the live costCode with the best normalized token overlap.
 *      The chosen code's "- <Type>" suffix selects the costType id. matchKind
 *      "fuzzy", confidence in (0, 1).
 *   3. Unmatched — nothing reasonable matched: all ids/names null, confidence 0,
 *      matchKind "unmatched". NEVER throws.
 *
 * # Cost-code naming convention (live, confirmed)
 *   costCodes are named "<Trade> - <Type>", e.g. "Framing - Material",
 *   "Framing - Labor", "Framing - Subcontract". costTypes are the 5 org types:
 *   Labor, Materials, Other, Subcontractor, "Sub Labor / Materials".
 *
 * # Hint → costCode-suffix → costType mapping
 *   "Material" → "Material"     suffix → costType "Materials"
 *   "Install"  → "Subcontract"  suffix → costType "Subcontractor"
 *   "Sub"      → "Subcontract"  suffix → costType "Subcontractor"
 *
 *   HHI subcontracts its trade install/labor work, so an "Install" (or "Labor")
 *   line routes to the trade's "- Subcontract" cost code, NOT "- Labor".
 *   Genuine in-house labor (admin/supervision/permit fees) carries an explicit
 *   "- Labor" cost code in the template and resolves via the template-exact path,
 *   which this hint mapping never overrides.
 *
 * Server-only — built from the JobTread Pave API via the shared client.
 */
import "server-only";

import { jobTreadRequest } from "@/app/lib/jobtread/client";
import { getOrgId } from "@/app/lib/jobtread/catalog-api";
import type {
  CostCodeResolution,
  CostCodeResolver,
  CostTypeHint,
} from "@/app/lib/jobtread/budget-push/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Raw catalog row shapes (the part of the live catalog we cache)
// ---------------------------------------------------------------------------

interface RawCostCode {
  id: string;
  name: string;
  /** JobTread cost-code number, e.g. "01L", "29S" (null if unset). */
  number: string | null;
  /** Pre-normalized name for matching (lowercased, punctuation stripped). */
  normName: string;
  /** Normalized tokens of the name, for token-overlap scoring. */
  tokens: string[];
}

/** Display label "<number> - <name>" (or just name when there is no number). */
function codeLabel(c: { number: string | null; name: string }): string {
  return c.number ? `${c.number} - ${c.name}` : c.name;
}

interface RawCostType {
  id: string;
  name: string;
  normName: string;
}

// ---------------------------------------------------------------------------
// Hint → cost-code suffix / cost-type name mapping
// ---------------------------------------------------------------------------

/**
 * The cost-code-name suffix each line-level hint targets.
 * "Material" → "Material", "Install"/"Sub" → "Subcontract".
 * (HHI subs out install/labor work, so Install routes to "- Subcontract".)
 */
const HINT_TO_CODE_SUFFIX: Record<Exclude<CostTypeHint, null>, string> = {
  Material: "Material",
  Install: "Subcontract",
  Sub: "Subcontract",
};

/**
 * The org costType NAME each line-level hint maps to.
 * "Material" → "Materials", "Install"/"Sub" → "Subcontractor".
 */
const HINT_TO_COST_TYPE_NAME: Record<Exclude<CostTypeHint, null>, string> = {
  Material: "Materials",
  Install: "Subcontractor",
  Sub: "Subcontractor",
};

/**
 * Trade-name token aliases applied before fuzzy matching, to bridge common
 * estimate/template trade names to the JobTread catalog's trade naming. Keyed by
 * a normalized source token → the catalog's normalized token. Conservative on
 * purpose — only unambiguous 1:1 mappings live here; genuinely ambiguous trades
 * (e.g. "ceiling", "fixtures", "specialty", "pool") are left to fall to Misc and
 * get flagged for manual selection. Extend as new abbreviations show up.
 */
const TRADE_TOKEN_ALIASES: Record<string, string> = {
  demo: "demolition", // "Demo" / "Demo & Site Clearing" → Demolition
  cabinetry: "cabinets",
  closet: "closets", // "Closet" / "Closet System" → Shelving / Closets
  miscellaneous: "misc",
  screening: "screens", // screened-porch screening → Screens
  landscape: "landscaping",
  railing: "handrails", // → Decking / Porches / Handrails
};

/**
 * Trades whose work is inherently subcontracted LABOR (no material supply), so a
 * line with no explicit "- Material"/"- Install" suffix defaults to the trade's
 * "- Subcontract" code instead of "- Material". E.g. Demolition — "Remove
 * Existing Concrete Slab" is labor, not a material. Keyed by normalized trade
 * token (compared against the aliased trade tokens). Extend as confirmed.
 * An explicit "- Material" line under these trades still resolves to Material.
 */
const SUBCONTRACT_DEFAULT_TRADE_TOKENS = new Set<string>(["demolition"]);

/** True when the trade defaults unsuffixed lines to Subcontract (labor trade). */
function tradeDefaultsToSubcontract(tradeTokens: string[]): boolean {
  return tradeTokens.some((t) => SUBCONTRACT_DEFAULT_TRADE_TOKENS.has(t));
}

/**
 * The org costType NAME implied by a cost-code's "- <Type>" suffix.
 * Used during fuzzy matching to derive the costType from the chosen code.
 * Keyed by normalized suffix token.
 */
const CODE_SUFFIX_TO_COST_TYPE_NAME: Record<string, string> = {
  material: "Materials",
  materials: "Materials",
  labor: "Labor",
  subcontract: "Subcontractor",
  subcontractor: "Subcontractor",
};

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Lowercase, strip punctuation, collapse whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a normalized string into non-empty tokens. */
function tokenize(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t.length > 0);
}

/** Apply the trade-name token aliases (e.g. "demo" → "demolition"). */
function aliasTradeTokens(tokens: string[]): string[] {
  return tokens.map((t) => TRADE_TOKEN_ALIASES[t] ?? t);
}

function safeStr(v: any): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// ---------------------------------------------------------------------------
// Pave query for the org's costCodes + costTypes (one fetch)
// ---------------------------------------------------------------------------

// JobTread caps Pave connection page size (~100); larger sizes 400. costCodes
// are paginated; costTypes are few (5 today) and fit one small page.
const PAGE_SIZE = 100;

function buildOrgCostTypesQuery(orgId: string): Record<string, unknown> {
  return {
    organization: {
      $: { id: orgId },
      costTypes: {
        $: { size: 50 },
        nodes: { id: {}, name: {} },
      },
    },
  };
}

function buildOrgCostCodesPageQuery(
  orgId: string,
  page: string | null,
): Record<string, unknown> {
  return {
    organization: {
      $: { id: orgId },
      costCodes: {
        $: { size: PAGE_SIZE, ...(page != null ? { page } : {}) },
        nextPage: {},
        nodes: { id: {}, name: {}, number: {} },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Catalog fetch
// ---------------------------------------------------------------------------

async function fetchCostCodesAndTypes(): Promise<{
  codes: RawCostCode[];
  types: RawCostType[];
}> {
  const orgId = await getOrgId();

  // costTypes — single small fetch.
  const typesRaw = (await jobTreadRequest(buildOrgCostTypesQuery(orgId), {
    step: "orgCostTypes",
  })) as any;
  const typesOrg = typesRaw?.organization ?? typesRaw?.data?.organization;
  const typeNodes: any[] = typesOrg?.costTypes?.nodes ?? [];
  const types: RawCostType[] = [];
  for (const n of typeNodes) {
    const id = safeStr(n?.id);
    const name = safeStr(n?.name);
    if (!id || !name) continue;
    types.push({ id, name, normName: normalize(name) });
  }

  // costCodes — paginated (page size capped; loop until nextPage is null).
  const codes: RawCostCode[] = [];
  let page: string | null = null;
  let guard = 0;
  do {
    const raw = (await jobTreadRequest(buildOrgCostCodesPageQuery(orgId, page), {
      step: "orgCostCodes",
    })) as any;
    const org = raw?.organization ?? raw?.data?.organization;
    const codeNodes: any[] = org?.costCodes?.nodes ?? [];
    for (const n of codeNodes) {
      const id = safeStr(n?.id);
      const name = safeStr(n?.name);
      if (!id || !name) continue;
      const number = safeStr(n?.number);
      const normName = normalize(name);
      codes.push({ id, name, number, normName, tokens: tokenize(normName) });
    }
    page = safeStr(org?.costCodes?.nextPage);
    guard += 1;
  } while (page && guard < 20);

  return { codes, types };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const UNMATCHED: CostCodeResolution = {
  costCodeId: null,
  costCodeName: null,
  costTypeId: null,
  costTypeName: null,
  confidence: 0,
  matchKind: "unmatched",
};

/**
 * Token-overlap score in [0, 1] between a target token set and a candidate.
 * Symmetric-ish: counts shared tokens over the union so a candidate that is a
 * strict superset still scores high but not perfect.
 */
function tokenOverlapScore(target: string[], candidate: string[]): number {
  if (target.length === 0 || candidate.length === 0) return 0;
  const candSet = new Set(candidate);
  let shared = 0;
  for (const t of target) {
    if (candSet.has(t)) shared++;
  }
  if (shared === 0) return 0;
  const union = new Set([...target, ...candidate]).size;
  return shared / union;
}

/**
 * Bonus added when a candidate code also carries the hint's type suffix
 * ("Material"/"Subcontract"). Kept well below a single shared trade token so the
 * TRADE identity always dominates — a same-trade code beats a different-trade
 * code that merely shares the type word.
 */
const SUFFIX_BONUS = 0.25;

// ---------------------------------------------------------------------------
// Resolver implementation
// ---------------------------------------------------------------------------

class LiveCostCodeResolver implements CostCodeResolver {
  private readonly codes: RawCostCode[];
  private readonly types: RawCostType[];
  /** Exact-name lookup for costCodes, keyed by normalized name. */
  private readonly codeByNorm: Map<string, RawCostCode>;
  /** Exact-name lookup for costTypes, keyed by normalized name. */
  private readonly typeByNorm: Map<string, RawCostType>;
  /** "Misc - <type>" catch-all codes per hint, for the never-null fallback. */
  private readonly miscByHint: Partial<Record<Exclude<CostTypeHint, null>, RawCostCode>>;

  constructor(codes: RawCostCode[], types: RawCostType[]) {
    this.codes = codes;
    this.types = types;
    this.codeByNorm = new Map();
    for (const c of codes) {
      // Index every form a stored costCode might take so the push resolves
      // regardless: plain name ("Permits - Labor"), numbered ("01L - Permits -
      // Labor"), or the number alone ("01L"). First-writer-wins per key.
      const keys = [c.normName];
      if (c.number) {
        keys.push(normalize(codeLabel(c)));
        keys.push(normalize(c.number));
      }
      for (const key of keys) {
        if (key && !this.codeByNorm.has(key)) this.codeByNorm.set(key, c);
      }
    }
    this.typeByNorm = new Map();
    for (const t of types) {
      if (!this.typeByNorm.has(t.normName)) this.typeByNorm.set(t.normName, t);
    }
    // Precompute the "Misc - <type>" catch-all codes (e.g. 50M/50S) for the
    // never-null fallback so custom/unmatched items are still pushable.
    this.miscByHint = {};
    for (const c of codes) {
      if (!c.normName.includes("misc")) continue;
      if (c.normName.includes("material")) this.miscByHint.Material ??= c;
      else if (c.normName.includes("subcontract")) this.miscByHint.Sub ??= c;
      // "Misc - Labor" (50L) is intentionally NOT used as a default target —
      // install/labor lines route to the Subcontract misc below.
    }
    // Install/Labor lines fall back to the Subcontract misc (HHI subs the work).
    this.miscByHint.Install = this.miscByHint.Sub;
  }

  resolve(
    tradeName: string,
    costTypeHint: CostTypeHint,
    templateCostCodeName?: string | null,
    templateCostTypeName?: string | null,
  ): CostCodeResolution {
    // ---- 1. Template-exact ------------------------------------------------
    const exact = this.resolveTemplateExact(
      templateCostCodeName,
      templateCostTypeName,
    );
    if (exact) return exact;

    // ---- 2. Fuzzy ---------------------------------------------------------
    return this.resolveFuzzy(tradeName, costTypeHint);
  }

  /**
   * Exact (normalized) name match against the live catalog using the
   * authoritative template cost code / cost type. Returns null when no
   * template costCodeName was given OR it didn't match a live code — the
   * caller falls through to fuzzy in that case.
   */
  private resolveTemplateExact(
    templateCostCodeName?: string | null,
    templateCostTypeName?: string | null,
  ): CostCodeResolution | null {
    const codeName = safeStr(templateCostCodeName ?? null);
    if (!codeName) return null;

    const code = this.codeByNorm.get(normalize(codeName));
    if (!code) return null;

    // Resolve the cost type: prefer the explicit template costType name; else
    // derive it from the matched code's "- <Type>" suffix.
    let costType: RawCostType | null = null;

    const typeName = safeStr(templateCostTypeName ?? null);
    if (typeName) {
      costType = this.typeByNorm.get(normalize(typeName)) ?? null;
    }
    if (!costType) {
      costType = this.costTypeFromCodeName(code.name);
    }

    return {
      costCodeId: code.id,
      costCodeName: codeLabel(code),
      costTypeId: costType?.id ?? null,
      costTypeName: costType?.name ?? null,
      confidence: 1,
      matchKind: "template-exact",
    };
  }

  /**
   * Pick the best live costCode for "<Trade>" + the Material/Subcontract hint.
   *
   * The TRADE name is the dominant signal: a candidate must share at least one
   * trade token, and trade-token overlap outweighs the type suffix. A candidate
   * that also carries the hint's suffix ("Material"/"Subcontract") gets a small
   * `SUFFIX_BONUS` tie-breaker. This prevents cross-trade mismatches like
   * "Demolition - <Material>" tie-breaking onto "Permits - Material" just
   * because both contain "Material". Fails soft to the Misc fallback.
   *
   * When the line name gave NO explicit type (`costTypeHint == null`) the
   * default is trade-aware: inherently subcontracted-labor trades (Demolition,
   * see `SUBCONTRACT_DEFAULT_TRADE_TOKENS`) default to Subcontract; every other
   * trade defaults to Material (most unsuffixed lines are physical materials).
   */
  private resolveFuzzy(
    tradeName: string,
    costTypeHint: CostTypeHint,
  ): CostCodeResolution {
    const tradeTokens = aliasTradeTokens(tokenize(normalize(tradeName)));
    if (tradeTokens.length === 0) {
      return this.miscFallback(costTypeHint ?? "Material");
    }

    // Resolve the ambiguous (null) hint to a concrete default by trade.
    const effectiveHint: Exclude<CostTypeHint, null> =
      costTypeHint ??
      (tradeDefaultsToSubcontract(tradeTokens) ? "Sub" : "Material");

    // The type-suffix word the effective hint targets ("material"/"subcontract").
    const suffixWord = normalize(HINT_TO_CODE_SUFFIX[effectiveHint]);

    let best: RawCostCode | null = null;
    let bestScore = 0;
    for (const code of this.codes) {
      const tradeScore = tokenOverlapScore(tradeTokens, code.tokens);
      if (tradeScore <= 0) continue; // must share the trade to be a candidate
      const suffixBonus = code.tokens.includes(suffixWord) ? SUFFIX_BONUS : 0;
      const score = tradeScore + suffixBonus;
      if (score > bestScore) {
        bestScore = score;
        best = code;
      }
    }

    if (!best) {
      // No code shares the trade name — park it under Misc, flagged for review.
      return this.miscFallback(effectiveHint);
    }

    // Cost type comes from the MATCHED code's "- <Type>" suffix so the costCode
    // and costType are always consistent; fall back to the effective hint's
    // intended type only if the matched code's suffix is unrecognized.
    let costType = this.costTypeFromCodeName(best.name);
    if (!costType) {
      costType =
        this.typeByNorm.get(
          normalize(HINT_TO_COST_TYPE_NAME[effectiveHint]),
        ) ?? null;
    }

    return {
      costCodeId: best.id,
      costCodeName: codeLabel(best),
      costTypeId: costType?.id ?? null,
      costTypeName: costType?.name ?? null,
      confidence: Math.min(1, Math.max(0, bestScore)),
      matchKind: "fuzzy",
    };
  }

  /**
   * Never-null fallback: park an unmatched item under "Misc - <type>" so it is
   * still pushable (JobTread requires a costCodeId on every cost item). Unknown
   * cost type defaults to Material. Returns UNMATCHED only when the org has no
   * Misc code at all. matchKind "fallback" → the push UI flags it for review.
   */
  private miscFallback(hint: CostTypeHint): CostCodeResolution {
    const effective: Exclude<CostTypeHint, null> = hint ?? "Material";
    const misc =
      this.miscByHint[effective] ??
      this.miscByHint.Material ??
      this.miscByHint.Sub ??
      this.miscByHint.Install;
    if (!misc) return { ...UNMATCHED };
    const costType =
      this.typeByNorm.get(normalize(HINT_TO_COST_TYPE_NAME[effective])) ??
      this.costTypeFromCodeName(misc.name);
    return {
      costCodeId: misc.id,
      costCodeName: codeLabel(misc),
      costTypeId: costType?.id ?? null,
      costTypeName: costType?.name ?? null,
      confidence: 0.1,
      matchKind: "fallback",
    };
  }

  /**
   * Derive the org costType from a costCode name's trailing "- <Type>" segment,
   * e.g. "Framing - Material" → Materials, "Framing - Labor" → Labor,
   * "Framing - Subcontract" → Subcontractor. Returns null when the suffix is
   * unrecognized or the implied type isn't in the live catalog.
   */
  private costTypeFromCodeName(codeName: string): RawCostType | null {
    const dash = codeName.lastIndexOf("-");
    if (dash < 0) return null;
    const suffixNorm = normalize(codeName.slice(dash + 1));
    if (!suffixNorm) return null;
    const typeName = CODE_SUFFIX_TO_COST_TYPE_NAME[suffixNorm];
    if (!typeName) return null;
    return this.typeByNorm.get(normalize(typeName)) ?? null;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a `CostCodeResolver` over the live JobTread costCode/costType catalog.
 * The catalog is fetched ONCE here; the returned resolver is synchronous and
 * holds the lookup maps in memory for the lifetime of the instance.
 *
 * The fetch failing (network / config) propagates as a `JobTreadApiError` /
 * `JobTreadConfigError` from the client — that's a build-time failure the
 * caller should surface before any write. Per-line `resolve()` itself never
 * throws and fails soft to "unmatched".
 */
export async function createCostCodeResolver(): Promise<CostCodeResolver> {
  const { codes, types } = await fetchCostCodesAndTypes();
  return new LiveCostCodeResolver(codes, types);
}

/**
 * Raw cost-code + cost-type catalog (id + name) for UI pickers — name-sorted.
 * Shares the same single live fetch the resolver uses. Read-only.
 */
export async function getCostCodeCatalog(): Promise<{
  costCodes: Array<{ id: string; name: string }>;
  costTypes: Array<{ id: string; name: string }>;
}> {
  const { codes, types } = await fetchCostCodesAndTypes();
  return {
    // "<number> - <name>" so pickers show the code (e.g. "01L - Permits - Labor").
    // Sorting by this label also orders them by code number.
    costCodes: codes
      .map((c) => ({ id: c.id, name: codeLabel(c) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    costTypes: types
      .map((t) => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
