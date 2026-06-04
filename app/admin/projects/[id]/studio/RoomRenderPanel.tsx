"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  prepareRoomRender,
  queueStudioRender,
  getRoomRenderState,
  type RoomRenderPrep,
  type StudioRenderState,
} from "./actions";
import {
  setSelectedRenderAction,
  clearSelectedRenderAction,
  startRenderUpdateAction,
  deleteMediaAction,
} from "../media/actions";

/**
 * Studio before/after render panel — modeled on the Media tab's render UX.
 * Per room: pick which before photo to work on (multi-photo), Render New with
 * the scope-aware checklist, then Set-as-main / Update / Delete the resulting
 * renders. The "main" render is the deck's primary before/after; others become
 * overflow (handled by the deck sync). Reuses the existing media render actions.
 */
export function RoomRenderPanel({
  projectId,
  roomId,
  roomName,
}: {
  projectId: string;
  roomId: string;
  roomName: string;
}) {
  const [state, setState] = useState<StudioRenderState | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [prep, setPrep] = useState<RoomRenderPrep | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [flow, setFlow] = useState<"idle" | "preparing" | "review">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    const s = await getRoomRenderState(projectId, roomId);
    if (!aliveRef.current) return;
    if ("error" in s) {
      setError(s.error);
      return;
    }
    setState(s);
    setSourceId((prev) => prev ?? s.photos[0]?.id ?? null);
  }, [projectId, roomId]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  // Poll while any render is in progress.
  useEffect(() => {
    if (!state) return;
    const pending = state.renders.some(
      (r) => r.status === "QUEUED" || r.status === "RENDERING",
    );
    if (!pending) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [state, load]);

  const photos = state?.photos ?? [];
  const selectedPhoto = photos.find((p) => p.id === sourceId) ?? null;
  const rendersForSource = (state?.renders ?? []).filter(
    (r) => r.sourceMediaId === sourceId,
  );

  const prepare = useCallback(async () => {
    if (!sourceId) return;
    setFlow("preparing");
    setError(null);
    const res = await prepareRoomRender(projectId, roomId, sourceId);
    if (!aliveRef.current) return;
    if ("error" in res) {
      setError(res.error);
      setFlow("idle");
      return;
    }
    setPrep(res);
    setChecked(new Set(res.items.filter((i) => i.defaultChecked).map((i) => i.itemText)));
    setFlow("review");
  }, [projectId, roomId, sourceId]);

  const generate = useCallback(async () => {
    if (!sourceId) return;
    setBusy(true);
    setError(null);
    const res = await queueStudioRender(projectId, roomId, sourceId, [...checked]);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setFlow("idle");
    setPrep(null);
    await load();
  }, [projectId, roomId, sourceId, checked, load]);

  const setMain = useCallback(
    async (mediaId: string) => {
      setBusy(true);
      await setSelectedRenderAction(projectId, roomId, mediaId);
      setBusy(false);
      await load();
    },
    [projectId, roomId, load],
  );

  const clearMain = useCallback(async () => {
    setBusy(true);
    await clearSelectedRenderAction(projectId, roomId);
    setBusy(false);
    await load();
  }, [projectId, roomId, load]);

  const update = useCallback(
    async (mediaId: string) => {
      const instruction = window.prompt(
        "Describe the change to make to this render (e.g. 'lighter cabinets, brass hardware'):",
      );
      if (!instruction || instruction.trim().length < 3) return;
      setBusy(true);
      setError(null);
      const res = await startRenderUpdateAction(
        projectId,
        roomId,
        mediaId,
        instruction.trim(),
      );
      setBusy(false);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      await load();
    },
    [projectId, roomId, load],
  );

  const remove = useCallback(
    async (mediaId: string) => {
      if (!window.confirm("Remove this render?")) return;
      setBusy(true);
      await deleteMediaAction(projectId, mediaId);
      setBusy(false);
      await load();
    },
    [projectId, load],
  );

  const toggle = useCallback((item: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }, []);

  const selectedId = state?.selectedRenderMediaId ?? null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{roomName}</span>
        {selectedId && (
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            ✓ Main render set
          </span>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Before-photo picker */}
      {photos.length > 1 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Before photo (pick one to work on)
          </p>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSourceId(p.id);
                  setFlow("idle");
                  setPrep(null);
                }}
                className={
                  "h-14 w-20 overflow-hidden rounded border-2 " +
                  (p.id === sourceId
                    ? "border-[#F47216]"
                    : "border-transparent hover:border-zinc-300")
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbnailUrl ?? p.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Before photo (always visible) */}
      {selectedPhoto ? (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Before
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedPhoto.thumbnailUrl ?? selectedPhoto.url}
            alt=""
            className="h-44 w-auto max-w-full rounded border border-zinc-200 object-cover dark:border-zinc-700"
          />
        </div>
      ) : (
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          No before photo on this section yet — add photos above.
        </p>
      )}

      {/* Render-new review (checklist) */}
      {flow === "review" && prep && (
        <div className="mb-3 rounded border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            What should we render?
          </p>
          {prep.items.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No scope items found for this section.
            </p>
          ) : (
            <ul className="space-y-1">
              {prep.items.map((item) => (
                <li key={item.itemText} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked.has(item.itemText)}
                    onChange={() => toggle(item.itemText)}
                    className="mt-0.5 accent-[#F47216]"
                  />
                  <span className="min-w-0">
                    <span className="text-zinc-800 dark:text-zinc-200">{item.itemText}</span>
                    <span
                      className={
                        "ml-2 text-xs " +
                        (item.recommendation === "confirm"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-zinc-400")
                      }
                    >
                      {item.visibleInPhoto === false ? "⚠ " : ""}
                      {item.reason}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="rounded bg-[#F47216] px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {busy ? "Starting…" : "Generate render"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFlow("idle");
                setPrep(null);
              }}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Renders for the selected photo */}
      {flow !== "review" && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Renders {sourceId ? "(from selected photo)" : ""}
            </p>
            <button
              type="button"
              onClick={prepare}
              disabled={!sourceId || flow === "preparing"}
              className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {flow === "preparing" ? "Analyzing…" : "Render new from this photo"}
            </button>
          </div>

          {rendersForSource.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No renders yet for this photo.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {rendersForSource.map((r) => {
                const isMain = r.id === selectedId;
                const pending = r.status === "QUEUED" || r.status === "RENDERING";
                return (
                  <div
                    key={r.id}
                    className={
                      "overflow-hidden rounded border " +
                      (isMain
                        ? "border-emerald-500 ring-1 ring-emerald-500"
                        : "border-zinc-200 dark:border-zinc-700")
                    }
                  >
                    <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-800">
                      {r.status === "DONE" && r.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.thumbnailUrl ?? r.url}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
                          {r.status === "FAILED" ? "✕ Failed" : "Generating…"}
                        </div>
                      )}
                      {isMain && (
                        <span className="absolute left-1 top-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Main
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 p-1.5 text-[11px]">
                      {r.status === "DONE" && !isMain && (
                        <button
                          type="button"
                          onClick={() => setMain(r.id)}
                          disabled={busy}
                          className="rounded bg-emerald-600 px-2 py-0.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Set as main
                        </button>
                      )}
                      {isMain && (
                        <button
                          type="button"
                          onClick={clearMain}
                          disabled={busy}
                          className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-600"
                        >
                          Unset main
                        </button>
                      )}
                      {r.status === "DONE" && (
                        <button
                          type="button"
                          onClick={() => update(r.id)}
                          disabled={busy}
                          className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-600"
                        >
                          Update
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        disabled={busy}
                        className="rounded border border-zinc-300 px-2 py-0.5 text-red-600 dark:border-zinc-600"
                      >
                        {pending ? "Cancel" : "Delete"}
                      </button>
                      {pending && (
                        <button
                          type="button"
                          onClick={() => void load()}
                          disabled={busy}
                          className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-600"
                        >
                          Refresh
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
