"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveIntegrationsAction } from "./actions";
import type { CompanySettingsForUI } from "./settings-tabs";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type Props = { settings: CompanySettingsForUI };

export function IntegrationsTab({ settings }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const integrationsJsonString =
    settings.integrationsJson != null
      ? JSON.stringify(settings.integrationsJson, null, 2)
      : "{}";

  async function handleSubmit(formData: FormData) {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveIntegrationsAction(formData);
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
        Integrations
      </h2>
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="integrationsJson" className={labelClass}>
            Integrations config (JSON)
          </label>
          <textarea
            id="integrationsJson"
            name="integrationsJson"
            rows={12}
            defaultValue={integrationsJsonString}
            className="w-full max-w-2xl rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            spellCheck={false}
          />
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
