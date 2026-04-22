"use client";

/**
 * Investment tab — parent/child display-group tree.
 *
 * T4: render-only. T5 adds drag-and-drop + server actions.
 *
 * Renders rooms grouped by `Room.displayGroupId`. Group order respects the
 * project's saved `Project.displayGroupOrder`, with `DEFAULT_GROUP_ORDER` as
 * the fallback. COPE is always forced last.
 *
 * Single-room groups render as a root-level row (no parent wrapper).
 * Multi-room groups render as a collapsible parent with summed range +
 * "Includes: X, Y, Z" descriptor.
 *
 * Null-pricing rooms (both totalLow and totalHigh null) are hidden entirely.
 */

import { useMemo, useState } from "react";
import {
  DEFAULT_GROUP_ORDER,
  resolveGroup,
  isKnownDisplayGroupSlug,
  type FixedGroupSlug,
  type DisplayGroupSlug,
} from "@/app/lib/investment/display-group-classifier";

// ─── Public types ───────────────────────────────────────────────────────────

const BUCKET_LABELS: Record<string, string> = {
  BASE: "Base",
  ALTERNATE: "Alternates",
  ALLOWANCE: "Allowances",
};

export type SectionRow = {
  id: string;
  name: string;
  bucket: string;
  sectionTypeName: string;
  totalLow: number | null;
  totalTarget: number | null;
  totalHigh: number | null;
  displayGroupId: string | null;
  displayGroupOrder: number;
  isProjectOverhead: boolean;
};

type Props = {
  sections: SectionRow[];
  /** The project's saved group order (array of slugs). Empty = use default. */
  groupOrder: string[];
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function formatRange(lo: number | null, hi: number | null): string {
  if (lo == null && hi == null) return "TBD";
  if (lo != null && hi != null && lo !== hi) {
    return `${formatMoney(lo)} – ${formatMoney(hi)}`;
  }
  return formatMoney(lo ?? hi);
}

/** Filter out rooms with no pricing anywhere. */
function hasPricing(s: SectionRow): boolean {
  return s.totalLow != null || s.totalHigh != null;
}

type GroupNode = {
  slug: string;
  label: string;
  isIndividualized: boolean;
  members: SectionRow[];
  bucket: string;         // use the first member's bucket for the badge
  sumLow: number;
  sumTarget: number;
  sumHigh: number;
};

function buildGroupNodes(
  sections: SectionRow[],
  savedOrder: string[]
): GroupNode[] {
  // Bucket sections by displayGroupId (null → "ungrouped").
  const buckets = new Map<string, SectionRow[]>();
  for (const s of sections) {
    const slug = s.displayGroupId ?? "ungrouped";
    const arr = buckets.get(slug) ?? [];
    arr.push(s);
    buckets.set(slug, arr);
  }

  // Sort members within each group by displayGroupOrder, then name.
  for (const arr of buckets.values()) {
    arr.sort((a, b) => {
      if (a.displayGroupOrder !== b.displayGroupOrder) {
        return a.displayGroupOrder - b.displayGroupOrder;
      }
      return a.name.localeCompare(b.name);
    });
  }

  // Compute nodes.
  const nodes: GroupNode[] = [];
  for (const [slug, members] of buckets) {
    const resolved = isKnownDisplayGroupSlug(slug)
      ? resolveGroup(slug as DisplayGroupSlug)
      : { label: "(Unknown)", individualized: false };
    // For individualized groups (bedroom-<id>, bathroom-<id>, carolina-<id>),
    // use the first member's name as the group label.
    const label = resolved.individualized && members[0]
      ? members[0].name
      : resolved.label;

    let sumLow = 0;
    let sumHigh = 0;
    let sumTarget = 0;
    for (const m of members) {
      sumLow += m.totalLow ?? 0;
      sumHigh += m.totalHigh ?? 0;
      sumTarget += m.totalTarget ?? 0;
    }

    nodes.push({
      slug,
      label,
      isIndividualized: resolved.individualized,
      members,
      bucket: members[0]?.bucket ?? "BASE",
      sumLow,
      sumHigh,
      sumTarget,
    });
  }

  // Sort by user-saved order first, then default order, then alphabetical fallback.
  const userSlugSet = new Set(savedOrder);
  const userIndex = new Map(savedOrder.map((s, i) => [s, i]));
  const defaultIndex = new Map<string, number>();
  for (let i = 0; i < DEFAULT_GROUP_ORDER.length; i++) {
    defaultIndex.set(DEFAULT_GROUP_ORDER[i], i);
  }

  nodes.sort((a, b) => {
    // COPE always last, regardless of any saved order.
    if (a.slug === "cope" && b.slug !== "cope") return 1;
    if (b.slug === "cope" && a.slug !== "cope") return -1;

    const aUser = userIndex.get(a.slug);
    const bUser = userIndex.get(b.slug);
    if (aUser !== undefined && bUser !== undefined) return aUser - bUser;
    if (aUser !== undefined) return -1;
    if (bUser !== undefined) return 1;

    // Neither in user order — use default priority. Individualized groups
    // (bedroom-<id> etc.) inherit their render category's position.
    const aCat = categoryIndex(a);
    const bCat = categoryIndex(b);
    if (aCat !== bCat) return aCat - bCat;

    // Within same category, sort alphabetically by label.
    return a.label.localeCompare(b.label);
  });

  return nodes;
}

function categoryIndex(node: GroupNode): number {
  // Returns the index of the node's render category within DEFAULT_GROUP_ORDER.
  // Individualized categories (bedroom, bathroom, carolina-room) slot into
  // synthetic positions between living-spaces and utility.
  if (isKnownDisplayGroupSlug(node.slug)) {
    const res = resolveGroup(node.slug as DisplayGroupSlug);
    switch (res.renderCategory) {
      case "primary-suite": return 0;
      case "kitchen-dining": return 1;
      case "living-spaces": return 2;
      case "bedroom": return 3;
      case "bathroom": return 4;
      case "carolina-room": return 5;
      case "utility": return 6;
      case "outdoor": return 7;
      case "storage": return 8;
      case "ungrouped": return 9;
      case "cope": return 99;
    }
  }
  return 9; // unknown → treat as ungrouped
}

function buildIncludesText(members: SectionRow[]): string | null {
  if (members.length <= 1) return null;
  const names = members.map((m) => m.name);
  if (names.length <= 3) {
    return `Includes: ${names.join(", ")}`;
  }
  return `Includes: ${names.slice(0, 3).join(", ")}, … and ${names.length - 3} more`;
}

// ─── Tree component ─────────────────────────────────────────────────────────

export function InvestmentGroupTree({ sections, groupOrder }: Props) {
  const nodes = useMemo(
    () => buildGroupNodes(sections.filter(hasPricing), groupOrder),
    [sections, groupOrder]
  );

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      {/* Column header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
        <span className="w-4"></span>
        <span>Section</span>
        <span>Bucket</span>
        <span className="text-right">Range</span>
      </div>

      {nodes.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No sections with pricing yet.
        </div>
      ) : (
        nodes.map((node) => (
          <GroupRow key={node.slug} node={node} />
        ))
      )}
    </div>
  );
}

// ─── Group + child row rendering ────────────────────────────────────────────

function GroupRow({ node }: { node: GroupNode }) {
  const [expanded, setExpanded] = useState(false);
  const isCope = node.slug === "cope";
  const isSingleRoom = node.members.length === 1;

  // Single-room groups render as a root-level row — no parent wrapper, no
  // chevron. The row shows the room's own name and range.
  if (isSingleRoom) {
    const m = node.members[0];
    return (
      <div
        className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-t border-zinc-100 px-4 py-2 text-sm dark:border-zinc-800"
        title={m.sectionTypeName}
      >
        <span className="w-4">
          {isCope ? (
            <span aria-label="Locked" title="COPE is pinned at the end">🔒</span>
          ) : null}
        </span>
        <span className="truncate text-zinc-900 dark:text-zinc-100">{m.name}</span>
        <BucketBadge bucket={m.bucket} />
        <span className="text-right font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
          {formatRange(m.totalLow, m.totalHigh)}
        </span>
      </div>
    );
  }

  const includesText = buildIncludesText(node.members);

  return (
    <>
      {/* Parent row */}
      <div className="border-t border-zinc-100 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2 text-left text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          aria-expanded={expanded}
        >
          <span className="w-4 text-zinc-400">{expanded ? "▾" : "▸"}</span>
          <span className="flex flex-col">
            <span className="text-zinc-900 dark:text-zinc-100">{node.label}</span>
            {includesText && (
              <span className="mt-0.5 text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                {includesText}
              </span>
            )}
          </span>
          <BucketBadge bucket={node.bucket} />
          <span className="text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatRange(node.sumLow, node.sumHigh)}
          </span>
        </button>
      </div>

      {/* Child rows */}
      {expanded &&
        node.members.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-t border-zinc-100 bg-zinc-50/50 px-4 py-1.5 pl-10 text-[13px] dark:border-zinc-800 dark:bg-zinc-900/40"
            title={m.sectionTypeName}
          >
            <span className="w-4"></span>
            <span className="truncate text-zinc-700 dark:text-zinc-300">{m.name}</span>
            <BucketBadge bucket={m.bucket} muted />
            <span className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">
              {formatRange(m.totalLow, m.totalHigh)}
            </span>
          </div>
        ))}
    </>
  );
}

function BucketBadge({ bucket, muted }: { bucket: string; muted?: boolean }) {
  const label = BUCKET_LABELS[bucket] ?? bucket;
  return (
    <span
      className={
        "rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
        (muted
          ? "bg-transparent text-zinc-500 dark:text-zinc-500"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300")
      }
    >
      {label}
    </span>
  );
}
