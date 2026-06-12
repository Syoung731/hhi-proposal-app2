"use client";

import { useState, useEffect, useMemo } from "react";
import { fuzzyMatchRooms, type RoomMatch } from "@/app/lib/rendr/roomMatcher";
import type { ImperialTakeoffData, ImperialRoomTakeoff } from "@/app/lib/rendr/types";
import type { LinkedSpace } from "@/app/lib/rendr/linkedSpaces";

type AppRoom = { id: string; name: string };
type SectionTypeOption = { id: string; name: string; category: string };

/** Extended mapping: maps a Rendr room to either an existing section OR a section type (creates new).
 *  When two or more mappings share the same `pendingKey`, the server folds them into a single new section.
 *  `spaceId` + `rendrRoomIndex` together identify a room within its source space (floor). */
export type ExtendedMapping = {
  spaceId: number;
  rendrRoomIndex: number;
  floorSF: number;
} & (
  | { appRoomId: string; sectionTypeId?: undefined; sectionTypeName?: undefined; pendingKey?: undefined }
  | { appRoomId?: undefined; sectionTypeId: string; sectionTypeName: string; pendingKey: string }
);

type Props = {
  /** Linked spaces (floors) in display order. */
  spaces: LinkedSpace[];
  /** Imperial takeoff per linked space, keyed by spaceId. */
  takeoffBySpace: Record<number, ImperialTakeoffData>;
  appRooms: AppRoom[];
  sectionTypes: SectionTypeOption[];
  projectId: string;
  onConfirm: (mappings: ExtendedMapping[]) => void;
  onCancel: () => void;
};

/** A Rendr room flattened across all linked spaces. `combinedIndex` is the row
 *  identity used internally; (spaceId, indexInSpace) is what the server needs. */
type CombinedRoom = {
  combinedIndex: number;
  spaceId: number;
  spaceLabel: string;
  indexInSpace: number;
  label: string;
  takeoff: ImperialRoomTakeoff;
};

/** Internal match state — extends RoomMatch with optional section type target. */
type ExtendedMatch = RoomMatch & {
  /** When mapped to a section type instead of an existing room */
  sectionTypeId?: string | null;
  sectionTypeName?: string | null;
  /** Identifies a pending-section bucket. Multiple matches sharing this key
   *  fold into one new section on import. Always set together with sectionTypeId. */
  pendingKey?: string | null;
};

/** Generate a fresh pendingKey. Browsers ≥ ~2022 expose crypto.randomUUID;
 *  fall back to a Math.random hex for older runtimes (jsdom, etc). */
function freshPendingKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `pk-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function RendrMatchingTable({ spaces, takeoffBySpace, appRooms, sectionTypes, projectId, onConfirm, onCancel }: Props) {
  const [matches, setMatches] = useState<ExtendedMatch[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [skipUnmatched, setSkipUnmatched] = useState(true);
  const [importing, setImporting] = useState(false);

  const multiSpace = spaces.length > 1;

  // Flatten every linked space's rooms into one list. `combinedIndex` becomes the
  // row identity (and the fuzzy matcher's rendrRoomIndex); (spaceId, indexInSpace)
  // is resolved back at confirm time.
  const combinedRooms = useMemo<CombinedRoom[]>(() => {
    const out: CombinedRoom[] = [];
    for (const s of spaces) {
      const td = takeoffBySpace[s.spaceId];
      if (!td) continue;
      td.rooms.forEach((r, i) => {
        out.push({
          combinedIndex: out.length,
          spaceId: s.spaceId,
          spaceLabel: s.label,
          indexInSpace: i,
          label: r.label,
          takeoff: r.takeoff,
        });
      });
    }
    return out;
  }, [spaces, takeoffBySpace]);

  // Build initial fuzzy matches
  useEffect(() => {
    const rendrRooms = combinedRooms.map((r) => ({
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

  // Handle dropdown selection — supports existing rooms, fresh pending sections, and combining into a pending bucket
  const handleRoomSelect = (rendrIdx: number, value: string | null) => {
    setMatches((prev) => {
      // bucket: lookup needs the prior state to find the bucket's section type info
      if (value && value.startsWith("bucket:")) {
        const key = value.slice(7);
        const bucketMember = prev.find((other) => other.pendingKey === key && other.rendrRoomIndex !== rendrIdx);
        if (!bucketMember || !bucketMember.sectionTypeId || !bucketMember.sectionTypeName) {
          // Bucket vanished between render and click — no-op rather than crash.
          return prev;
        }
        const typeId = bucketMember.sectionTypeId;
        const typeName = bucketMember.sectionTypeName;
        return prev.map((m) =>
          m.rendrRoomIndex !== rendrIdx
            ? m
            : {
                ...m,
                appRoomId: null,
                appRoomName: typeName,
                sectionTypeId: typeId,
                sectionTypeName: typeName,
                pendingKey: key,
                confidence: "high" as const,
                matchMethod: "manual" as const,
              },
        );
      }

      return prev.map((m) => {
        if (m.rendrRoomIndex !== rendrIdx) return m;
        if (!value) {
          return { ...m, appRoomId: null, appRoomName: null, sectionTypeId: null, sectionTypeName: null, pendingKey: null, confidence: "unmatched", matchMethod: "manual" };
        }
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
            pendingKey: freshPendingKey(),
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
          pendingKey: null,
          confidence: "high" as const,
          matchMethod: "manual" as const,
        };
      });
    });
  };

  const handleConfirm = async () => {
    setImporting(true);
    const mappings: ExtendedMapping[] = matches
      .filter((m) => m.appRoomId || m.sectionTypeId)
      .filter((m) => !skipUnmatched || m.confidence !== "unmatched" || m.appRoomId || m.sectionTypeId)
      .map((m) => {
        const cr = combinedRooms[m.rendrRoomIndex];
        const base = {
          spaceId: cr?.spaceId ?? spaces[0]?.spaceId ?? 0,
          rendrRoomIndex: cr?.indexInSpace ?? 0,
          floorSF: cr?.takeoff?.floorSF ?? 0,
        };
        if (m.sectionTypeId) {
          // Should always be set when sectionTypeId is set, but defensively
          // generate one so the server can still bucket correctly.
          const pendingKey = m.pendingKey ?? freshPendingKey();
          return { ...base, sectionTypeId: m.sectionTypeId, sectionTypeName: m.sectionTypeName!, pendingKey };
        }
        return { ...base, appRoomId: m.appRoomId! };
      });
    await onConfirm(mappings);
    setImporting(false);
  };

  // Count how many Rendr rooms map to each existing room (for the "(N mapped)" hint)
  const existingRoomCounts = new Map<string, number>();
  for (const m of matches) {
    if (m.appRoomId) {
      existingRoomCounts.set(m.appRoomId, (existingRoomCounts.get(m.appRoomId) || 0) + 1);
    }
  }

  // Build pending-section buckets: pendingKey → { sectionTypeId/Name, member labels }
  type BucketInfo = { sectionTypeId: string; sectionTypeName: string; rendrLabels: string[] };
  const pendingBuckets = new Map<string, BucketInfo>();
  for (const m of matches) {
    if (m.pendingKey && m.sectionTypeId && m.sectionTypeName) {
      const existing = pendingBuckets.get(m.pendingKey);
      if (existing) {
        existing.rendrLabels.push(m.rendrLabel);
      } else {
        pendingBuckets.set(m.pendingKey, {
          sectionTypeId: m.sectionTypeId,
          sectionTypeName: m.sectionTypeName,
          rendrLabels: [m.rendrLabel],
        });
      }
    }
  }

  // Number pending buckets per section type so two "+ Bathroom" picks render
  // as "Bathroom 1" and "Bathroom 2" (only when 2+ exist of the same type).
  const bucketNumberByKey = new Map<string, number>();
  const totalBucketsBySectionType = new Map<string, number>();
  {
    const counter = new Map<string, number>();
    for (const [key, b] of pendingBuckets) {
      const next = (counter.get(b.sectionTypeId) ?? 0) + 1;
      counter.set(b.sectionTypeId, next);
      bucketNumberByKey.set(key, next);
      totalBucketsBySectionType.set(b.sectionTypeId, next);
    }
  }
  const bucketDisplayName = (key: string): string => {
    const b = pendingBuckets.get(key);
    if (!b) return "";
    const total = totalBucketsBySectionType.get(b.sectionTypeId) ?? 1;
    if (total <= 1) return b.sectionTypeName;
    const n = bucketNumberByKey.get(key);
    return n ? `${b.sectionTypeName} ${n}` : b.sectionTypeName;
  };

  // Get the labels of other Rendr rooms mapped to the same target (existing room or pending bucket)
  const getOtherMappedLabels = (rendrIdx: number, m: ExtendedMatch): string[] => {
    return matches
      .filter((other) => {
        if (other.rendrRoomIndex === rendrIdx) return false;
        if (m.pendingKey) return other.pendingKey === m.pendingKey;
        if (m.appRoomId) return other.appRoomId === m.appRoomId;
        return false;
      })
      .map((other) => other.rendrLabel);
  };

  // Build the current select value for a match.
  // Multi-member buckets show as `bucket:` so the user sees the "combined" option as selected.
  // Single-member buckets show as `type:` so they read as "+ Bathroom" until another row joins.
  const selectValue = (m: ExtendedMatch): string => {
    if (m.pendingKey && m.sectionTypeId && m.sectionTypeName) {
      const bucket = pendingBuckets.get(m.pendingKey);
      if (bucket && bucket.rendrLabels.length >= 2) return `bucket:${m.pendingKey}`;
      return `type:${m.sectionTypeId}:${m.sectionTypeName}`;
    }
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
        Multiple Rendr rooms can be combined into one section (e.g. &quot;Primary Bathroom&quot; + &quot;Toilet Room&quot; → one &quot;Primary Bath&quot;). Pick a target for the first row, then on later rows use &quot;Combine with another Rendr room&quot; to fold them into the same section. Measurements and fixture counts are summed automatically.
        {appRooms.length === 0 && sectionTypes.length > 0 && (
          <> No sections exist yet — select a section type to create one with Rendr measurements.</>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Rendr Room</th>
              {multiSpace && (
                <th className="pb-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Floor</th>
              )}
              <th className="pb-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Measurements</th>
              <th className="pb-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Match</th>
              <th className="pb-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Map To</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => {
              const room = combinedRooms[m.rendrRoomIndex];
              const otherLabels = getOtherMappedLabels(m.rendrRoomIndex, m);
              const isCombined = otherLabels.length > 0;

              return (
                <tr key={m.rendrRoomIndex} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-4">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{m.rendrLabel}</span>
                  </td>
                  {multiSpace && (
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                        {room?.spaceLabel ?? "—"}
                      </span>
                    </td>
                  )}
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
                        const count = existingRoomCounts.get(r.id) ?? 0;
                        const isMappedElsewhere = count > 0 && m.appRoomId !== r.id;
                        return (
                          <option key={r.id} value={`room:${r.id}`}>
                            {r.name}{isMappedElsewhere ? ` (${count} mapped)` : ""}
                          </option>
                        );
                      })}
                      {/* Combine with another Rendr room — surfaces existing sections AND pending buckets that already have ≥1 other Rendr row mapped to them */}
                      {(() => {
                        const existingTargets = appRooms.filter((r) => {
                          const count = existingRoomCounts.get(r.id) ?? 0;
                          const otherCount = m.appRoomId === r.id ? count - 1 : count;
                          return otherCount >= 1;
                        });
                        const pendingTargets = Array.from(pendingBuckets.entries()).filter(([key, b]) => {
                          const otherCount = key === m.pendingKey ? b.rendrLabels.length - 1 : b.rendrLabels.length;
                          return otherCount >= 1;
                        });
                        if (existingTargets.length === 0 && pendingTargets.length === 0) return null;
                        return (
                          <optgroup label="Combine with another Rendr room">
                            {existingTargets.map((r) => {
                              const otherLabels = matches
                                .filter((other) => other.appRoomId === r.id && other.rendrRoomIndex !== m.rendrRoomIndex)
                                .map((other) => other.rendrLabel);
                              return (
                                <option key={`combine-room-${r.id}`} value={`room:${r.id}`}>
                                  → {r.name} ({otherLabels.join(" + ")})
                                </option>
                              );
                            })}
                            {pendingTargets.map(([key]) => {
                              const otherLabels = matches
                                .filter((other) => other.pendingKey === key && other.rendrRoomIndex !== m.rendrRoomIndex)
                                .map((other) => other.rendrLabel);
                              return (
                                <option key={`combine-bucket-${key}`} value={`bucket:${key}`}>
                                  → {bucketDisplayName(key)} ({otherLabels.join(" + ")})
                                </option>
                              );
                            })}
                          </optgroup>
                        );
                      })()}
                      {sectionTypes.length > 0 && (
                        <optgroup label="Create new section">
                          {sectionTypes.map((st) => (
                            <option key={`type-${st.id}`} value={`type:${st.id}:${st.name}`}>
                              + {st.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    {m.sectionTypeId && !isCombined && (
                      <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                        Creates new section{m.pendingKey ? `: ${bucketDisplayName(m.pendingKey)}` : ""}
                      </p>
                    )}
                    {isCombined && (
                      <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
                        {m.pendingKey
                          ? `Combining into ${bucketDisplayName(m.pendingKey)} with: `
                          : "Combined with: "}
                        {otherLabels.join(", ")}
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
