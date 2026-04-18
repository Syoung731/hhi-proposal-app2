"use client";

import { useState, useEffect } from "react";
import { fuzzyMatchRooms, type RoomMatch } from "@/app/lib/rendr/roomMatcher";
import type { ImperialTakeoffData } from "@/app/lib/rendr/types";

type AppRoom = { id: string; name: string };
type SectionTypeOption = { id: string; name: string; category: string };

/** Extended mapping: maps a Rendr room to either an existing section OR a section type (creates new). */
export type ExtendedMapping = {
  rendrRoomIndex: number;
  floorSF: number;
} & (
  | { appRoomId: string; sectionTypeId?: undefined; sectionTypeName?: undefined }
  | { appRoomId?: undefined; sectionTypeId: string; sectionTypeName: string }
);

type Props = {
  takeoffData: ImperialTakeoffData;
  appRooms: AppRoom[];
  sectionTypes: SectionTypeOption[];
  projectId: string;
  onConfirm: (mappings: ExtendedMapping[]) => void;
  onCancel: () => void;
};

/** Internal match state — extends RoomMatch with optional section type target. */
type ExtendedMatch = RoomMatch & {
  /** When mapped to a section type instead of an existing room */
  sectionTypeId?: string | null;
  sectionTypeName?: string | null;
};

export function RendrMatchingTable({ takeoffData, appRooms, sectionTypes, projectId, onConfirm, onCancel }: Props) {
  const [matches, setMatches] = useState<ExtendedMatch[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [skipUnmatched, setSkipUnmatched] = useState(true);
  const [importing, setImporting] = useState(false);

  // Build initial fuzzy matches
  useEffect(() => {
    const rendrRooms = takeoffData.rooms.map((r) => ({
      label: r.label,
      roomTakeoff: {} as never, // fuzzyMatchRooms only uses .label
    }));
    const fuzzyResults = fuzzyMatchRooms(
      rendrRooms as never,
      appRooms,
    );
    setMatches(fuzzyResults);

    // Trigger AI matching for unresolved (only if existing sections exist)
    const unmatched = fuzzyResults.filter((m) => m.confidence === "unmatched");
    if (unmatched.length > 0 && appRooms.length > 0) {
      runAiMatching(unmatched, fuzzyResults);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAiMatching = async (unmatched: RoomMatch[], allMatches: RoomMatch[]) => {
    setAiLoading(true);
    try {
      const usedAppRoomIds = new Set(allMatches.filter((m) => m.appRoomId).map((m) => m.appRoomId));
      const availableAppRooms = appRooms.filter((r) => !usedAppRoomIds.has(r.id));
      if (availableAppRooms.length === 0) {
        setAiLoading(false);
        return;
      }

      const res = await fetch("/api/rendr/match-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unmatchedRendrLabels: unmatched.map((m) => m.rendrLabel),
          appRoomNames: availableAppRooms.map((r) => r.name),
        }),
      });
      const data = await res.json();
      if (data.matches) {
        const aiResults = data.matches as { rendrLabel: string; appRoomName: string | null; confidence: number }[];
        setMatches((prev) =>
          prev.map((m) => {
            if (m.confidence !== "unmatched") return m;
            const aiMatch = aiResults.find((ai) => ai.rendrLabel === m.rendrLabel);
            if (!aiMatch?.appRoomName) return m;
            const appRoom = availableAppRooms.find((r) => r.name === aiMatch.appRoomName);
            if (!appRoom) return m;
            return {
              ...m,
              appRoomId: appRoom.id,
              appRoomName: appRoom.name,
              confidence: aiMatch.confidence >= 0.7 ? "suggested" : "unmatched",
              matchMethod: "ai" as const,
              sectionTypeId: null,
              sectionTypeName: null,
            };
          }),
        );
      }
    } catch {
      // AI matching is best-effort
    } finally {
      setAiLoading(false);
    }
  };

  // Handle dropdown selection — supports both existing rooms and section types
  const handleRoomSelect = (rendrIdx: number, value: string | null) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.rendrRoomIndex !== rendrIdx) return m;
        if (!value) {
          return { ...m, appRoomId: null, appRoomName: null, sectionTypeId: null, sectionTypeName: null, confidence: "unmatched", matchMethod: "manual" };
        }
        // Parse prefixed value
        if (value.startsWith("type:")) {
          const rest = value.slice(5);
          const sepIdx = rest.indexOf(":");
          const typeId = rest.slice(0, sepIdx);
          const typeName = rest.slice(sepIdx + 1);
          return {
            ...m,
            appRoomId: null,
            appRoomName: typeName,
            sectionTypeId: typeId,
            sectionTypeName: typeName,
            confidence: "high" as const,
            matchMethod: "manual" as const,
          };
        }
        // Existing room — value is "room:{id}"
        const roomId = value.startsWith("room:") ? value.slice(5) : value;
        const room = appRooms.find((r) => r.id === roomId);
        return {
          ...m,
          appRoomId: roomId,
          appRoomName: room?.name ?? null,
          sectionTypeId: null,
          sectionTypeName: null,
          confidence: "high" as const,
          matchMethod: "manual" as const,
        };
      }),
    );
  };

  const handleConfirm = async () => {
    setImporting(true);
    const mappings: ExtendedMapping[] = matches
      .filter((m) => m.appRoomId || m.sectionTypeId)
      .filter((m) => !skipUnmatched || m.confidence !== "unmatched" || m.appRoomId || m.sectionTypeId)
      .map((m) => {
        const base = {
          rendrRoomIndex: m.rendrRoomIndex,
          floorSF: takeoffData.rooms[m.rendrRoomIndex]?.takeoff?.floorSF ?? 0,
        };
        if (m.sectionTypeId) {
          return { ...base, sectionTypeId: m.sectionTypeId, sectionTypeName: m.sectionTypeName! };
        }
        return { ...base, appRoomId: m.appRoomId! };
      });
    await onConfirm(mappings);
    setImporting(false);
  };

  // Count how many Rendr rooms map to each target
  const targetMappingCounts = new Map<string, number>();
  for (const m of matches) {
    const key = m.sectionTypeId ? `type:${m.sectionTypeId}` : m.appRoomId ? `room:${m.appRoomId}` : null;
    if (key) targetMappingCounts.set(key, (targetMappingCounts.get(key) || 0) + 1);
  }

  // Get the labels of other Rendr rooms mapped to the same target
  const getOtherMappedLabels = (rendrIdx: number, m: ExtendedMatch): string[] => {
    if (!m.appRoomId && !m.sectionTypeId) return [];
    return matches
      .filter((other) => {
        if (other.rendrRoomIndex === rendrIdx) return false;
        if (m.sectionTypeId) return other.sectionTypeId === m.sectionTypeId;
        return other.appRoomId === m.appRoomId;
      })
      .map((other) => other.rendrLabel);
  };

  // Build the current select value for a match
  const selectValue = (m: ExtendedMatch): string => {
    if (m.sectionTypeId) return `type:${m.sectionTypeId}:${m.sectionTypeName}`;
    if (m.appRoomId) return `room:${m.appRoomId}`;
    return "";
  };

  const mappedCount = matches.filter((m) => m.appRoomId || m.sectionTypeId).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Confirm Room Matching
        </h3>
        {aiLoading && (
          <span className="flex items-center gap-2 text-sm text-zinc-500">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
            AI matching...
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Multiple Rendr rooms can be mapped to the same section (e.g., &quot;Primary Bathroom&quot; + &quot;Toilet Room&quot; → &quot;Primary Bath&quot;). Measurements will be combined automatically.
        {appRooms.length === 0 && sectionTypes.length > 0 && (
          <> No sections exist yet — select a section type to create one with Rendr measurements.</>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Rendr Room</th>
              <th className="pb-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Measurements</th>
              <th className="pb-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Match</th>
              <th className="pb-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Map To</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const room = takeoffData.rooms[m.rendrRoomIndex];
              const otherLabels = getOtherMappedLabels(m.rendrRoomIndex, m);
              const isCombined = otherLabels.length > 0;

              return (
                <tr key={m.rendrRoomIndex} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-4">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{m.rendrLabel}</span>
                  </td>
                  <td className="py-3 pr-4 text-zinc-500 dark:text-zinc-400">
                    {room?.takeoff?.floorSF ?? 0} SF &middot; {room?.takeoff?.wallsSF ?? 0} SF walls &middot; {room?.takeoff?.perimeterLF ?? 0} LF
                  </td>
                  <td className="py-3 pr-4">
                    {m.confidence === "high" && (
                      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        High
                      </span>
                    )}
                    {m.confidence === "suggested" && (
                      <span className="text-amber-600 dark:text-amber-400">Suggested</span>
                    )}
                    {m.confidence === "unmatched" && (
                      <span className="text-red-500 dark:text-red-400">Unmatched</span>
                    )}
                  </td>
                  <td className="py-3">
                    <select
                      value={selectValue(m)}
                      onChange={(e) => handleRoomSelect(m.rendrRoomIndex, e.target.value || null)}
                      className="w-full max-w-xs rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      <option value="">— Select Section —</option>
                      {appRooms.length > 0 && appRooms.map((r) => {
                        const key = `room:${r.id}`;
                        const count = targetMappingCounts.get(key) ?? 0;
                        const isMappedElsewhere = count > 0 && selectValue(m) !== `room:${r.id}`;
                        return (
                          <option key={r.id} value={`room:${r.id}`}>
                            {r.name}{isMappedElsewhere ? ` (${count} mapped)` : ""}
                          </option>
                        );
                      })}
                      {sectionTypes.length > 0 && (
                        <option disabled value="">— Create new section —</option>
                      )}
                      {sectionTypes.map((st) => (
                        <option key={`type-${st.id}`} value={`type:${st.id}:${st.name}`}>
                          + {st.name}
                        </option>
                      ))}
                    </select>
                    {m.sectionTypeId && (
                      <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                        Creates new section
                      </p>
                    )}
                    {isCombined && (
                      <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
                        Combined with: {otherLabels.join(", ")}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={skipUnmatched}
            onChange={(e) => setSkipUnmatched(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          Skip rooms with no match
        </label>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={importing || mappedCount === 0}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {importing ? "Importing..." : `Confirm & Import (${mappedCount} rooms)`}
          </button>
        </div>
      </div>
    </div>
  );
}
