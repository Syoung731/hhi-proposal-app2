"use client";

/**
 * Investment tab — "+ Add Group" inline dropdown.
 *
 * Phase 8A.1c T3. Lets users restore display groups in two scenarios:
 *
 *  1. **Predefined empty groups** — one of the fixed slugs (primary-suite,
 *     kitchen-dining, etc.) currently has zero members. Selecting it adds a
 *     transient empty group row to the tree (UI-only state) so the user has
 *     a drop target to drag rooms into. The empty row is NOT persisted —
 *     refreshing before dragging anything in loses it. Acceptable per spec.
 *
 *  2. **Individualized restorations** — a non-primary bedroom/bathroom/
 *     carolina-room that was previously promoted to `standalone-<id>` can
 *     be restored to its original `bedroom-<id>` / `bathroom-<id>` /
 *     `carolina-room-<id>` slug. Persisted via updateRoomDisplayGroup.
 *
 * Pattern mirrors the "+ Add Slide" dropdown in the Deck Builder.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FIXED_GROUPS,
  originalIndividualizedSlugFor,
  type FixedGroupSlug,
  type IndividualizedGroupSlug,
} from "@/app/lib/investment/display-group-classifier";
import { updateRoomDisplayGroup } from "./actions";
import type { SectionRow } from "./investment-group-tree-logic";

type Props = {
  projectId: string;
  /**
   * Current sections — used to detect which predefined groups are empty
   * and which standalone rooms are eligible for individualized restoration.
   */
  sections: SectionRow[];
  /**
   * Slugs currently held in transient "empty group" UI state. Used to skip
   * already-added entries from the predefined-groups list.
   */
  pendingEmptySlugs: ReadonlySet<string>;
  /** Caller adds the slug to its pending-empty set when chosen. */
  onAddEmptyGroup: (slug: FixedGroupSlug) => void;
};

// Predefined slugs the user may meaningfully restore as an empty group.
// Excludes "cope" (always present, server-pinned) and "ungrouped" (the
// fallback bucket — restoring it as empty has no UX value).
const RESTORABLE_PREDEFINED: FixedGroupSlug[] = [
  "primary-suite",
  "kitchen-dining",
  "living-spaces",
  "utility",
  "outdoor",
  "storage",
];

export function InvestmentAddGroupDropdown({
  projectId,
  sections,
  pendingEmptySlugs,
  onAddEmptyGroup,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Compute restorable predefined slugs: those with no members and not
  // already in pendingEmptySlugs.
  const slugsWithMembers = useMemo(() => {
    const set = new Set<string>();
    for (const s of sections) {
      const slug = s.displayGroupId ?? "ungrouped";
      set.add(slug);
    }
    return set;
  }, [sections]);

  const restorablePredefined = useMemo(
    () =>
      RESTORABLE_PREDEFINED.filter(
        (slug) => !slugsWithMembers.has(slug) && !pendingEmptySlugs.has(slug),
      ),
    [slugsWithMembers, pendingEmptySlugs],
  );

  // Restorable individualized: rooms currently in standalone-<id> whose name
  // matches a bedroom/bathroom/carolina-room rule (so they have an "original"
  // individualized slug to restore).
  type RestorableIndividualized = {
    roomId: string;
    roomName: string;
    targetSlug: IndividualizedGroupSlug;
    label: string;
  };
  const restorableIndividualized = useMemo<RestorableIndividualized[]>(() => {
    const result: RestorableIndividualized[] = [];
    for (const s of sections) {
      if (!s.displayGroupId?.startsWith("standalone-")) continue;
      const target = originalIndividualizedSlugFor({
        id: s.id,
        name: s.name,
        isProjectOverhead: s.isProjectOverhead,
      });
      if (!target) continue;
      result.push({
        roomId: s.id,
        roomName: s.name,
        targetSlug: target,
        label: `Restore '${s.name}' group`,
      });
    }
    return result;
  }, [sections]);

  const hasAny = restorablePredefined.length > 0 || restorableIndividualized.length > 0;

  function handlePredefinedClick(slug: FixedGroupSlug) {
    onAddEmptyGroup(slug);
    setOpen(false);
  }

  function handleIndividualizedClick(item: RestorableIndividualized) {
    setOpen(false);
    startTransition(async () => {
      const result = await updateRoomDisplayGroup(projectId, [
        {
          id: item.roomId,
          displayGroupId: item.targetSlug,
          displayGroupOrder: 0,
        },
      ]);
      if (result.error) {
        console.error("updateRoomDisplayGroup (restore individualized):", result.error);
      }
      router.refresh();
    });
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          "rounded border px-2 py-1 text-[11px] font-medium transition-colors " +
          (open
            ? "border-orange-300 bg-orange-50 text-orange-800"
            : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300")
        }
      >
        + Add Group ▾
      </button>

      {open && (
        <div
          className="absolute right-0 z-30 mt-1 min-w-[240px] overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {!hasAny ? (
            <div className="px-3 py-3 text-[11px] text-zinc-500 dark:text-zinc-400">
              No empty groups available to restore.
            </div>
          ) : (
            <>
              {restorablePredefined.length > 0 && (
                <div>
                  <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50">
                    Predefined Groups
                  </div>
                  {restorablePredefined.map((slug) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => handlePredefinedClick(slug)}
                      className="block w-full border-b border-zinc-100 px-3 py-1.5 text-left text-[12px] text-zinc-700 last:border-b-0 hover:bg-orange-50 hover:text-orange-900 dark:border-zinc-800 dark:text-zinc-300"
                    >
                      {FIXED_GROUPS[slug].label}
                    </button>
                  ))}
                </div>
              )}
              {restorableIndividualized.length > 0 && (
                <div>
                  <div className="border-b border-t border-zinc-100 bg-zinc-50 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50">
                    Individualized Groups
                  </div>
                  {restorableIndividualized.map((item) => (
                    <button
                      key={item.roomId}
                      type="button"
                      onClick={() => handleIndividualizedClick(item)}
                      className="block w-full border-b border-zinc-100 px-3 py-1.5 text-left text-[12px] text-zinc-700 last:border-b-0 hover:bg-orange-50 hover:text-orange-900 dark:border-zinc-800 dark:text-zinc-300"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
