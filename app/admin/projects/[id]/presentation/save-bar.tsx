"use client";

type SaveBarProps = {
  status: "idle" | "saving" | "saved" | "error";
  errorMessage: string | null;
  onSave: () => void;
  /** When true, save is disabled (e.g. Template C requires Executive Label). */
  disableSave?: boolean;
};

const labelClass = "text-sm font-medium";

export function SaveBar({ status, errorMessage, onSave, disableSave = false }: SaveBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
      <button
        type="button"
        onClick={onSave}
        disabled={status === "saving" || disableSave}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {status === "saving" ? "Saving…" : "Save"}
      </button>
      {status === "saved" && (
        <span className={labelClass + " text-emerald-600 dark:text-emerald-400"}>
          Saved.
        </span>
      )}
      {status === "error" && errorMessage && (
        <span className={labelClass + " text-red-600 dark:text-red-400"}>
          {errorMessage}
        </span>
      )}
    </div>
  );
}
