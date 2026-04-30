"use client";

/**
 * Investment tab — drag-merge popup.
 *
 * Opens when the user drops one room onto another room from a different
 * display group (or both are ungrouped). Three ways to resolve the merge:
 *
 *   1. Pick an existing multi-member group already on the project.
 *   2. Pick a predefined fixed group (Primary Suite, Outdoor, etc.) to
 *      restore — even if it currently has no members.
 *   3. Type a custom name → a fresh slug is minted for the new group.
 *
 * The popup pre-fills the custom-name field with a smart suggestion derived
 * from the classifier when both rooms map to the same fixed group (e.g.
 * dragging Deck onto Landscaping → suggests "Outdoor"). Otherwise the
 * custom field is empty.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  classifyRoomToDisplayGroup,
  FIXED_GROUPS,
  type FixedGroupSlug,
} from "@/app/lib/investment/display-group-classifier";

export type MergeRoomsPopupRoom = {
  id: string;
  name: string;
  isProjectOverhead: boolean;
};

export type MergeRoomsPopupExistingGroup = {
  slug: string;
  label: string;
  memberCount: number;
};

export type MergeRoomsPopupResolution = {
  /** Slug to assign to both rooms. */
  slug: string;
  /**
   * Custom label to persist on Project.displayGroupNames. Null means "leave
   * existing label alone" (e.g. when joining an existing fixed group with no
   * custom override). Set the empty string to clear a previous custom label.
   */
  label: string | null;
};

type Props = {
  /** The room the user dragged (the "active" drag source). */
  draggedRoom: MergeRoomsPopupRoom;
  /** The room the user dropped onto (the "over" target). */
  targetRoom: MergeRoomsPopupRoom;
  /** All rooms in the project — used to compute classifier suggestions. */
  allRooms: MergeRoomsPopupRoom[];
  /** Existing multi-member groups currently on the project. */
  existingGroups: MergeRoomsPopupExistingGroup[];
  /** Predefined fixed-group slugs that the user may pick from. */
  fixedGroupSlugs: readonly FixedGroupSlug[];
  /** Resolved → caller commits the moves with these values. */
  onResolve: (resolution: MergeRoomsPopupResolution) => void;
  /** Dismissed without applying — caller should reset drag state. */
  onCancel: () => void;
};

/** Stable, project-unique-ish slug for a freshly-created custom group. */
function freshCustomSlug(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `custom-${crypto.randomUUID()}`;
  }
  return `custom-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function InvestmentMergeRoomsPopup({
  draggedRoom,
  targetRoom,
  allRooms,
  existingGroups,
  fixedGroupSlugs,
  onResolve,
  onCancel,
}: Props) {
  // Compute classifier suggestion: if both rooms classify to the same fixed
  // slug, pre-fill the custom-name field with that slug's label. Otherwise
  // leave empty so the user types their own.
  const suggestion = useMemo(() => {
    const draggedSlug = classifyRoomToDisplayGroup(draggedRoom, allRooms.filter((r) => r.id !== draggedRoom.id));
    const targetSlug = classifyRoomToDisplayGroup(targetRoom, allRooms.filter((r) => r.id !== targetRoom.id));
    if (draggedSlug === targetSlug && draggedSlug in FIXED_GROUPS) {
      const def = FIXED_GROUPS[draggedSlug as FixedGroupSlug];
      return { suggestedSlug: draggedSlug, suggestedLabel: def.label };
    }
    return null;
  }, [draggedRoom, targetRoom, allRooms]);

  const [customName, setCustomName] = useState<string>(suggestion?.suggestedLabel ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleConfirmCustom() {
    const trimmed = customName.trim();
    if (trimmed === "") return;
    onResolve({ slug: freshCustomSlug(), label: trimmed });
  }

  function handlePickExisting(slug: string) {
    onResolve({ slug, label: null });
  }

  function handlePickFixed(slug: FixedGroupSlug) {
    // No custom label — fall through to the deck's hard-coded label for
    // fixed slugs. User can rename later if they want.
    onResolve({ slug, label: null });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-rooms-title"
    >
      <div className="flex w-full max-w-md flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
          <h2 id="merge-rooms-title" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Group these sections
          </h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{draggedRoom.name}</span>
            {" + "}
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{targetRoom.name}</span>
          </p>
        </div>

        <div className="space-y-4 p-4">
          {/* Custom name */}
          <div>
            <label htmlFor="merge-rooms-custom-name" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Name this group
            </label>
            <div className="mt-1 flex gap-2">
              <input
                ref={inputRef}
                id="merge-rooms-custom-name"
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmCustom();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onCancel();
                  }
                }}
                placeholder={suggestion?.suggestedLabel ?? "e.g. Outdoor Living"}
                className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={handleConfirmCustom}
                disabled={customName.trim() === ""}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Create
              </button>
            </div>
            {suggestion && (
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Suggested from section types — edit or accept to use.
              </p>
            )}
          </div>

          {/* Existing groups */}
          {existingGroups.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Or add to an existing group
              </p>
              <ul className="mt-1 divide-y divide-zinc-100 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                {existingGroups.map((g) => (
                  <li key={g.slug}>
                    <button
                      type="button"
                      onClick={() => handlePickExisting(g.slug)}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <span>{g.label}</span>
                      <span className="text-[11px] text-zinc-500">{g.memberCount} room{g.memberCount === 1 ? "" : "s"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fixed groups (predefined) */}
          {fixedGroupSlugs.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Or pick a predefined group
              </p>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {fixedGroupSlugs.map((slug) => {
                  const def = FIXED_GROUPS[slug];
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => handlePickFixed(slug)}
                      className="rounded border border-zinc-200 px-2 py-1.5 text-left text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {def.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
