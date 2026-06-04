"use client";

/**
 * Presentation Studio — Phase 0 scaffold.
 *
 * This is the new AI-driven presentation builder, in development behind the
 * NEXT_PUBLIC_STUDIO_ENABLED flag. Phase 1 replaces this placeholder with the
 * guided "Build Presentation" media wizard (room-by-room photo Q&A → before/after
 * slides; photo-less rooms roll up into "Additional Rooms" scope-breakdown slides).
 */
export function StudioTab({
  projectId,
  rooms,
}: {
  projectId: string;
  rooms: { id: string; name: string }[];
}) {
  return (
    <div className="py-8">
      <div className="mx-auto max-w-2xl rounded-lg border border-zinc-200 bg-zinc-50/60 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
        <span className="inline-block rounded bg-[#F47216]/10 px-2 py-0.5 text-xs font-medium text-[#F47216]">
          In development
        </span>
        <h2 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Build Presentation
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This is the new AI presentation builder. Once your sections are priced,
          it will walk you through a few photo questions and assemble an editable
          slide deck — including before/after slides — that you can tweak and
          present. It’s isolated behind a feature flag and won’t affect the live
          proposal flow.
        </p>

        <div className="mt-4 rounded border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            {rooms.length} section{rooms.length === 1 ? "" : "s"} ready to build from:
          </p>
          {rooms.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-zinc-600 dark:text-zinc-400">
              {rooms.map((r) => (
                <li key={r.id} className="truncate">
                  {r.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              No sections yet — add and price sections first.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
