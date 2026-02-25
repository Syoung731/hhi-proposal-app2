"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCompanyProfileAction } from "./actions";
import type { CompanySettingsForUI } from "./settings-tabs";

const inputClass =
  "w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type Props = { settings: CompanySettingsForUI };

export function CompanyProfileTab({ settings }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveCompanyProfileAction(formData);
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
        Company Profile
      </h2>
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="companyName" className={labelClass}>
            Company name
          </label>
          <input
            id="companyName"
            name="companyName"
            type="text"
            defaultValue={settings.companyName}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="addressLine1" className={labelClass}>
            Address line 1
          </label>
          <input
            id="addressLine1"
            name="addressLine1"
            type="text"
            defaultValue={settings.addressLine1 ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="addressLine2" className={labelClass}>
            Address line 2
          </label>
          <input
            id="addressLine2"
            name="addressLine2"
            type="text"
            defaultValue={settings.addressLine2 ?? ""}
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="city" className={labelClass}>
              City
            </label>
            <input
              id="city"
              name="city"
              type="text"
              defaultValue={settings.city ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="state" className={labelClass}>
              State
            </label>
            <input
              id="state"
              name="state"
              type="text"
              defaultValue={settings.state ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="zip" className={labelClass}>
              Zip
            </label>
            <input
              id="zip"
              name="zip"
              type="text"
              defaultValue={settings.zip ?? ""}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="text"
            defaultValue={settings.phone ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={settings.email ?? ""}
            className={inputClass}
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
