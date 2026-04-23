"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProposalDefaultsAction } from "./actions";
import type { CompanySettingsForUI } from "./settings-tabs";

const inputClass =
  "w-full max-w-2xl rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type Props = { settings: CompanySettingsForUI };

export function ProposalDefaultsTab({ settings }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveProposalDefaultsAction(formData);
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
        Proposal Defaults
      </h2>
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="defaultProposalDisclaimer" className={labelClass}>
            Default proposal disclaimer
          </label>
          <textarea
            id="defaultProposalDisclaimer"
            name="defaultProposalDisclaimer"
            rows={4}
            defaultValue={settings.defaultProposalDisclaimer}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="defaultTimelineNote" className={labelClass}>
            Default timeline note
          </label>
          <textarea
            id="defaultTimelineNote"
            name="defaultTimelineNote"
            rows={2}
            defaultValue={settings.defaultTimelineNote ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="designHourlyRate" className={labelClass}>
            Design hourly rate (USD)
          </label>
          <input
            id="designHourlyRate"
            name="designHourlyRate"
            type="number"
            min={0}
            max={5000}
            step={1}
            defaultValue={settings.designHourlyRate ?? ""}
            placeholder="e.g. 200 — leave blank to hide from retainer slide"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Displayed on the &ldquo;Your Investment&rdquo; retainer slide. Leave blank to omit the hourly-rate sentence entirely.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
          {status === "saved" && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Saved successfully.
            </span>
          )}
          {status === "error" && errorMessage && (
            <span className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
