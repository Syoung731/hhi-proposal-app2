"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listSectionTypes } from "@/app/admin/settings/actions";
import {
  bulkResolveNewRoomTypes,
  type UnmatchedRoomItem,
} from "./actions";

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const btnSecondary =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800";
const btnPrimary =
  "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200";

/** SectionType as returned by listSectionTypes (id, name, category). */
type SectionTypeOption = { id: string; name: string; category: string };

type PreferredCategory = "INTERIOR" | "EXTERIOR" | "SYSTEMS" | "WHOLE_HOME";

function inferPreferredCategory(unmatchedName: string): PreferredCategory | null {
  if (!unmatchedName || typeof unmatchedName !== "string") return null;
  const lower = unmatchedName.toLowerCase();
  const exteriorTerms = [
    "deck", "porch", "screened", "patio", "exterior", "roof", "siding",
    "landscape", "landscaping", "driveway", "pool", "walkway", "railing",
    "fascia", "soffit",
  ];
  for (const term of exteriorTerms) {
    if (lower.includes(term)) return "EXTERIOR";
  }
  const systemsTerms = [
    "hvac", "electrical", "plumbing", "water heater", "panel", "breaker",
    "duct", "vent", "thermostat",
  ];
  for (const term of systemsTerms) {
    if (lower.includes(term)) return "SYSTEMS";
  }
  const wholeHomeTerms = [
    "whole home", "whole-home", "entire house", "throughout",
    "full interior", "full remodel",
  ];
  for (const term of wholeHomeTerms) {
    if (lower.includes(term)) return "WHOLE_HOME";
  }
  return null;
}

function normalizeName(s: string): string {
  if (!s || typeof s !== "string") return "";
  let t = s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stopWords = ["room", "area", "space"];
  t = t
    .split(" ")
    .filter((w) => !stopWords.includes(w))
    .join(" ");
  return t.replace(/\s+/g, " ").trim();
}

function canonicalize(s: string): string {
  let t = normalizeName(s);
  t = t.replace(/\b(his|her)\b/g, "").replace(/\s+/g, " ").trim();
  if (/\b(jack\s*&\s*jill|jack\s+and\s+jill)\b/.test(t)) return "bathroom";
  if (/\b(bath|bathroom|shower|tub|toilet|wc|powder|water\s*closet)\b/.test(t))
    return "bathroom";
  if (/\b(laundry|washer|dryer)\b/.test(t)) return "laundry";
  return t;
}

const MIN_AUTO_MATCH_SCORE = 2;

function autoMatchSectionTypeId(
  unmatchedName: string,
  sectionTypes: SectionTypeOption[]
): string {
  const canon = canonicalize(unmatchedName);
  if (!canon) return "";
  const inferredCategory = inferPreferredCategory(unmatchedName);
  const options = sectionTypes.map((st) => ({
    id: st.id,
    name: st.name,
    category: st.category,
    canon: canonicalize(st.name),
  }));

  type Candidate = { id: string; baseScore: number };
  const byId = new Map<string, number>();

  for (const o of options) {
    if (!o.canon) continue;
    const existing = byId.get(o.id) ?? 0;
    if (o.canon === canon) {
      byId.set(o.id, Math.max(existing, 10));
      continue;
    }
    if (canon.includes(o.canon) || o.canon.includes(canon)) {
      byId.set(o.id, Math.max(existing, 5));
    }
  }

  if (byId.size === 0) {
    const canonTokens = new Set(canon.split(" ").filter(Boolean));
    for (const o of options) {
      if (!o.canon) continue;
      const tokens = o.canon.split(" ").filter(Boolean);
      let score = 0;
      for (const tok of tokens) {
        if (canonTokens.has(tok)) score++;
      }
      if (score >= 1) {
        const existing = byId.get(o.id) ?? 0;
        byId.set(o.id, Math.max(existing, score));
      }
    }
  }

  const candidates: Candidate[] = Array.from(byId.entries()).map(([id, baseScore]) => ({ id, baseScore }));
  if (candidates.length === 0) return "";

  const categoryWeight = (candidateCategory: string): number => {
    if (inferredCategory === null) return 0;
    const cat = candidateCategory.toUpperCase();
    if (cat === inferredCategory) return 3;
    return -2;
  };

  const optionById = new Map(options.map((o) => [o.id, o]));
  let bestId = "";
  let bestTotal = -Infinity;
  for (const c of candidates) {
    const opt = optionById.get(c.id);
    const total = c.baseScore + (opt ? categoryWeight(opt.category) : 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestId = c.id;
    }
  }
  return bestTotal >= MIN_AUTO_MATCH_SCORE ? bestId : "";
}

function formatCategory(category: string): string {
  if (!category) return "";
  return category.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

type RowState = {
  selectedSectionTypeId: string;
  creatingNew: boolean;
  exterior: boolean;
};

type Props = {
  projectId: string;
  unmatchedRooms: UnmatchedRoomItem[];
  onClose: () => void;
};

export function NewRoomTypesModal({ projectId, unmatchedRooms, onClose }: Props) {
  const router = useRouter();
  const [sectionTypes, setSectionTypes] = useState<SectionTypeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const u of unmatchedRooms) {
      init[u.name] = { selectedSectionTypeId: "", creatingNew: false, exterior: false };
    }
    return init;
  });

  useEffect(() => {
    let cancelled = false;
    listSectionTypes().then((list) => {
      if (!cancelled) {
        const options = (list ?? []).map((st) => ({
          id: st.id,
          name: st.name,
          category: st.category,
        }));
        setSectionTypes(options);
        // Auto-preselect defaults only when none chosen and not creating new; never override user selections.
        setRowState((prev) => {
          let next = { ...prev };
          for (const u of unmatchedRooms) {
            const row = next[u.name];
            if (!row) continue;
            if (row.creatingNew) continue;
            const updates: Partial<RowState> = {};
            if (row.selectedSectionTypeId === "") {
              const matchedId = autoMatchSectionTypeId(u.name, options);
              if (matchedId) updates.selectedSectionTypeId = matchedId;
              if (row.exterior === false) {
                const preferred = inferPreferredCategory(u.name);
                if (preferred === "EXTERIOR") updates.exterior = true;
              }
            }
            if (Object.keys(updates).length > 0)
              next[u.name] = { ...row, ...updates };
          }
          return next;
        });
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [unmatchedRooms]);

  function setStateFor(name: string, patch: Partial<RowState>) {
    setRowState((prev) => ({
      ...prev,
      [name]: { ...prev[name]!, ...patch },
    }));
  }

  async function handleApply() {
    setApplying(true);
    setError(null);
    const resolutions = unmatchedRooms.map((u) => {
      const state = rowState[u.name]!;
      if (state.creatingNew) {
        return {
          name: u.name,
          roomIds: u.roomIds,
          createNew: { exterior: state.exterior },
        };
      }
      if (state.selectedSectionTypeId) {
        return {
          name: u.name,
          roomIds: u.roomIds,
          sectionTypeId: state.selectedSectionTypeId,
        };
      }
      return { name: u.name, roomIds: u.roomIds };
    });
    const result = await bulkResolveNewRoomTypes(projectId, resolutions);
    if (result.error) {
      setError(result.error);
      setApplying(false);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-section-types-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-700">
          <h2
            id="new-section-types-title"
            className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
          >
            Unmatched sections
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Map to an existing Pricing Profile or create new ones. Skip to leave sections custom (no profile).
          </p>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading pricing profiles…</p>
          ) : (
            <ul className="space-y-4">
              {unmatchedRooms.map((u) => {
                const state = rowState[u.name]!;
                return (
                  <li
                    key={u.name}
                    className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                  >
                    <div className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {u.name}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label htmlFor={`map-${u.name}`} className={labelClass}>
                          Map to existing Pricing Profile
                        </label>
                        <select
                          id={`map-${u.name}`}
                          className={inputClass + " w-full"}
                          value={state.selectedSectionTypeId}
                          disabled={state.creatingNew}
                          onChange={(e) =>
                            setStateFor(u.name, {
                              selectedSectionTypeId: e.target.value,
                              creatingNew: false,
                            })
                          }
                        >
                          <option value="">—</option>
                          {sectionTypes.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                              {st.category ? ` (${formatCategory(st.category)})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() =>
                            setStateFor(u.name, {
                              creatingNew: !state.creatingNew,
                              selectedSectionTypeId: state.creatingNew ? "" : state.selectedSectionTypeId,
                            })
                          }
                        >
                          {state.creatingNew ? "Cancel create" : "Create new Section Type"}
                        </button>
                        {state.creatingNew && (
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                            <input
                              type="checkbox"
                              checked={state.exterior}
                              onChange={(e) =>
                                setStateFor(u.name, { exterior: e.target.checked })
                              }
                              className="rounded border-zinc-300 dark:border-zinc-600"
                            />
                            Exterior
                          </label>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {error && (
          <p className="px-4 pb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <div className="flex justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Skip
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || loading}
            className={btnPrimary}
          >
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
