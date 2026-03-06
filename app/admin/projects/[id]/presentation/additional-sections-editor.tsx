"use client";

import type { AdditionalSectionsConfig, PresentationConfigSaved } from "@/app/lib/layout-config";
import { ADDITIONAL_SECTIONS_KEY } from "./types";

type RoomItem = { id: string; name: string };

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type AdditionalSectionsEditorProps = {
  config: PresentationConfigSaved;
  onConfigChange: (config: PresentationConfigSaved) => void;
  /** Room IDs where section is unchecked (pages.sections[roomId].include === false) or legacy published === false, in display order. */
  remainingScopeRoomIds: string[];
  /** Room id -> display name. */
  rooms: RoomItem[];
  /** Room id -> concept/render count for badge. */
  conceptCountByRoom: Map<string, number>;
};

export function AdditionalSectionsEditor({
  config,
  onConfigChange,
  remainingScopeRoomIds,
  rooms,
  conceptCountByRoom,
}: AdditionalSectionsEditorProps) {
  const sections = config.pages?.sections;
  const additionalCfg =
    sections &&
    typeof sections === "object" &&
    !Array.isArray(sections) &&
    ADDITIONAL_SECTIONS_KEY in sections
      ? (sections as Record<string, AdditionalSectionsConfig>)[ADDITIONAL_SECTIONS_KEY]
      : undefined;
  const include = (additionalCfg?.include ?? config.pages?.rollup?.published ?? true) !== false;

  const updateAdditionalSections = (partial: Partial<AdditionalSectionsConfig>) => {
    const prevPages = config.pages ?? {};
    const prevSections =
      prevPages.sections && typeof prevPages.sections === "object" && !Array.isArray(prevPages.sections)
        ? { ...prevPages.sections }
        : {};
    const current = (prevSections as Record<string, AdditionalSectionsConfig>)[ADDITIONAL_SECTIONS_KEY] ?? {};
    const next: AdditionalSectionsConfig = {
      include: current.include !== false,
      ...partial,
    };
    const nextSections = { ...prevSections, [ADDITIONAL_SECTIONS_KEY]: next };
    const nextInclude = next.include !== false;
    onConfigChange({
      ...config,
      pages: {
        ...prevPages,
        sections: nextSections,
        rollup: { ...prevPages.rollup, published: nextInclude },
      },
    });
  };

  const roomIdToName = new Map(rooms.map((r) => [r.id, r.name]));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Additional Sections
      </h2>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="additional-sections-include"
          checked={include}
          onChange={(e) => updateAdditionalSections({ include: e.target.checked })}
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <label htmlFor="additional-sections-include" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Include in proposal
        </label>
      </div>
      <div>
        <h3 className={labelClass}>Remaining scopes</h3>
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Scopes unchecked in the Sections list above. They appear on this Additional Sections page. Read-only.
        </p>
        {remainingScopeRoomIds.length === 0 ? (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            No additional scopes remaining.
          </p>
        ) : (
          <ul className="list-inside list-disc space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
            {remainingScopeRoomIds.map((roomId) => {
              const name = roomIdToName.get(roomId) ?? roomId;
              const count = conceptCountByRoom.get(roomId) ?? 0;
              return (
                <li key={roomId} className="text-zinc-700 dark:text-zinc-300">
                  {name}
                  {count > 0 && (
                    <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">
                      ({count} render{count !== 1 ? "s" : ""})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
