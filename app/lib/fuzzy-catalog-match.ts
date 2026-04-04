/**
 * Fuzzy matching for catalog item names.
 * Improves hit rate from ~84% to 95%+ by handling:
 *  - Bracket prefixes: [FLR], [TIL], [CAB], etc.
 *  - Plural differences: "Appliances" vs "Appliance"
 *  - Minor typos via Levenshtein distance
 */

interface CatalogCandidate {
  id: string;
  name: string;
  unitPrice: number | null;
  unitCost: number | null;
}

interface FuzzyMatchResult {
  item: CatalogCandidate;
  score: number; // 1.0 = exact, <1.0 = fuzzy
}

// ---------- Levenshtein distance ----------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return dp[m][n];
}

// ---------- Name normalization ----------

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

export function normalizeName(name: string): string {
  // Strip bracket prefixes like [FLR], [CAB], [TIL]
  let result = name.replace(/^\[[\w]+\]\s*/, "");
  // Lowercase
  result = result.toLowerCase();
  // Trim
  result = result.trim();
  // Normalize plurals: remove trailing "s" if preceded by a consonant
  if (result.length > 2 && result.endsWith("s")) {
    const precedingChar = result[result.length - 2];
    if (precedingChar && !VOWELS.has(precedingChar)) {
      result = result.slice(0, -1);
    }
  }
  // Replace multiple spaces with single space
  result = result.replace(/\s+/g, " ");
  return result;
}

// ---------- Material type guard ----------

/**
 * Material keyword groups that must NOT cross-match.
 * E.g., "Remove Flooring Carpet" must not match "[DMO] Remove Flooring Hardwood".
 */
const MATERIAL_GROUPS: string[][] = [
  ["hardwood", "wood"],
  ["carpet"],
  ["tile", "ceramic", "porcelain"],
  ["vinyl", "lvp", "lvt", "laminate"],
  ["marble", "granite", "quartz", "stone"],
  ["concrete"],
  ["linoleum"],
];

function hasMaterialConflict(name1: string, name2: string): boolean {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();

  let group1: string[] | null = null;
  let group2: string[] | null = null;

  for (const group of MATERIAL_GROUPS) {
    if (!group1 && group.some((kw) => n1.includes(kw))) group1 = group;
    if (!group2 && group.some((kw) => n2.includes(kw))) group2 = group;
  }

  // Conflict only when both names contain a material keyword and the groups differ
  if (group1 && group2 && group1 !== group2) return true;

  return false;
}

// ---------- Fuzzy matching ----------

export function fuzzyMatch(
  candidateName: string,
  catalogItems: CatalogCandidate[],
): FuzzyMatchResult | null {
  const normalizedCandidate = normalizeName(candidateName);

  // First: exact match on normalized names
  for (const item of catalogItems) {
    if (normalizeName(item.name) === normalizedCandidate) {
      return { item, score: 1.0 };
    }
  }

  // Second: Levenshtein distance matching
  let bestMatch: CatalogCandidate | null = null;
  let bestDistance = Infinity;

  for (const item of catalogItems) {
    const normalizedItem = normalizeName(item.name);
    const dist = levenshtein(normalizedCandidate, normalizedItem);
    const shorterLen = Math.min(normalizedCandidate.length, normalizedItem.length);

    // Accept if distance <= 3 AND less than 15% of the shorter string length
    if (dist <= 3 && shorterLen > 0 && dist / shorterLen < 0.15) {
      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = item;
      }
    }
  }

  if (bestMatch) {
    // Reject match if material types conflict (e.g., carpet vs hardwood)
    if (hasMaterialConflict(candidateName, bestMatch.name)) {
      return null;
    }
    const shorterLen = Math.min(
      normalizedCandidate.length,
      normalizeName(bestMatch.name).length,
    );
    const score = shorterLen > 0 ? 1 - bestDistance / shorterLen : 0;
    return { item: bestMatch, score };
  }

  return null;
}
