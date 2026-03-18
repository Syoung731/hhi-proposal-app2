/**
 * Parser for the practical DataX-style JobTread budget export (formatted text).
 * This path is used because the connector contract is a formatted budget export;
 * it is more reliable than guessing unsupported raw Pave fields.
 * Official totals still come only from parsed row-level extCost/extSell (or fallback qty*cost, qty*price).
 */
import type {
  NormalizedJobBudget,
  NormalizedBudgetGroup,
  NormalizedBudgetItem,
} from "./budget-types";
import { looksLikeCostCodeName } from "./cost-code-heuristics";

/** Parse "key:value" segments separated by " | ". Value is everything after the first colon (so values may contain colons). */
function parseKeyValuePairs(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  const segment = line.split("|").map((s) => s.trim());
  for (const part of segment) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

/** Parse a line that starts with a prefix (e.g. "Job:" or "Summary:") and return key/value pairs from the rest. */
function parsePrefixedLine(line: string, prefix: string): Record<string, string> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(prefix)) return null;
  const rest = trimmed.slice(prefix.length).trim();
  return parseKeyValuePairs(rest);
}

function parseNum(s: string | undefined): number | null {
  if (s === undefined || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse ext value: "cost/sell" or "single" (use for both).
 * Returns [extCost, extSell]; either may be null if not present.
 */
function parseExt(extRaw: string | undefined): { extCost: number | null; extSell: number | null } {
  if (extRaw === undefined || extRaw === "") return { extCost: null, extSell: null };
  const trimmed = extRaw.trim();
  if (!trimmed) return { extCost: null, extSell: null };
  const slash = trimmed.indexOf("/");
  if (slash >= 0) {
    const first = parseNum(trimmed.slice(0, slash).trim());
    const second = parseNum(trimmed.slice(slash + 1).trim());
    return { extCost: first, extSell: second };
  }
  const single = parseNum(trimmed);
  return { extCost: single, extSell: single };
}

/**
 * Parse the formatted budget export text into NormalizedJobBudget.
 * Active group heading: the last non-empty line that is not Job/Summary and does not start with "-".
 * Item lines always start with "-". Each item is assigned the current group name at parse time.
 */
export function parseBudgetExportText(text: string): NormalizedJobBudget {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let jobId = "";
  let jobName = "";
  let jobNumber: string | null = null;
  let sourceSummaryCost: number | null = null;
  let sourceSummarySell: number | null = null;
  const groupNames: string[] = [];
  const groupNamesSeen = new Set<string>();
  let currentGroupName = "Uncategorized";
  const items: NormalizedBudgetItem[] = [];

  for (const line of lines) {
    if (!line) continue;

    const jobPairs = parsePrefixedLine(line, "Job:");
    if (jobPairs) {
      jobId = jobPairs.id ?? "";
      jobName = jobPairs.name ?? "";
      jobNumber = jobPairs.number?.trim() ?? null;
      continue;
    }

    const summaryPairs = parsePrefixedLine(line, "Summary:");
    if (summaryPairs) {
      const totalCost = summaryPairs.totalCost;
      const totalPrice = summaryPairs.totalPrice;
      if (totalCost !== undefined && totalCost !== "") {
        const n = parseNum(totalCost);
        if (n !== null) sourceSummaryCost = n;
      }
      if (totalPrice !== undefined && totalPrice !== "") {
        const n = parseNum(totalPrice);
        if (n !== null) sourceSummarySell = n;
      }
      continue;
    }

    if (line.startsWith("- ")) {
      const itemPairs = parseKeyValuePairs(line.slice(2));
      const id = itemPairs.id?.trim() ?? "";
      const name = itemPairs.name?.trim() ?? "";
      if (!id || !name) continue;

      const qty = parseNum(itemPairs.qty);
      const cost = parseNum(itemPairs.cost);
      const price = parseNum(itemPairs.price);
      const { extCost: parsedExtCost, extSell: parsedExtSell } = parseExt(itemPairs.ext);

      let extCost: number | null = parsedExtCost;
      let extSell: number | null = parsedExtSell;
      if (extCost == null && qty != null && cost != null) extCost = qty * cost;
      if (extSell == null && qty != null && price != null) extSell = qty * price;

      const code = itemPairs.code?.trim() ?? null;
      const type = itemPairs.type?.trim() ?? null;
      const unit = itemPairs.unit?.trim() ?? null;
      const desc = itemPairs.desc?.trim() ?? null;

      items.push({
        id,
        name,
        groupId: null,
        groupName: currentGroupName || null,
        costCode: code ?? null,
        costCodeName: code ?? null,
        costType: type ?? null,
        unit: unit ?? null,
        quantity: qty,
        unitCost: cost,
        unitPrice: price,
        extCost: extCost ?? undefined,
        extSell: extSell ?? undefined,
        description: desc ?? undefined,
        rawLine: line,
      });
      continue;
    }

    // Do not treat item-level cost code names as group headers (e.g. "43M Interior Paint - Material").
    // Only true cost group headings should drive room/trade hierarchy.
    if (looksLikeCostCodeName(line)) continue;
    currentGroupName = line;
    if (currentGroupName && !groupNamesSeen.has(currentGroupName)) {
      groupNamesSeen.add(currentGroupName);
      groupNames.push(currentGroupName);
    }
  }

  const groups: NormalizedBudgetGroup[] = groupNames.map((name, i) => ({
    id: `g-${i}`,
    name,
    parentId: null,
  }));

  return {
    jobId: jobId || "unknown",
    jobName: jobName || "Unknown",
    jobNumber,
    stage: null,
    location: null,
    groups,
    items,
    sourceSummarySell: sourceSummarySell ?? null,
    sourceSummaryCost: sourceSummaryCost ?? null,
  };
}
