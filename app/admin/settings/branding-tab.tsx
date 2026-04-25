"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveBrandingAction, saveBrandingLogosAction } from "./actions";
import type {
  CompanySettingsForUI,
  BrandIconForUI,
  BrandBackgroundForUI,
  IconLibraryContext,
} from "./settings-tabs";
import { IconLibraryClient } from "./branding/icons/IconLibraryClient";
import { BackgroundLibraryClient } from "./branding/backgrounds/BackgroundLibraryClient";

const inputClass =
  "w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

const HEX_REGEX = /^#([0-9a-fA-F]{6})$/;

const ACCEPT = "image/png,image/svg+xml,image/webp";

type LogoVariant = "light" | "dark";

type Props = {
  settings: CompanySettingsForUI;
  brandIcons?: BrandIconForUI[];
  brandBackgrounds?: BrandBackgroundForUI[];
  iconLibraryContext?: IconLibraryContext;
  iconLibraryOpen?: boolean;
  onOpenIconLibrary?: () => void;
  onCloseIconLibrary?: () => void;
  backgroundLibraryOpen?: boolean;
  onOpenBackgroundLibrary?: () => void;
  onCloseBackgroundLibrary?: () => void;
};

export function BrandingTab({
  settings,
  brandIcons = [],
  brandBackgrounds = [],
  iconLibraryContext,
  iconLibraryOpen = false,
  onOpenIconLibrary,
  onCloseIconLibrary,
  backgroundLibraryOpen = false,
  onOpenBackgroundLibrary,
  onCloseBackgroundLibrary,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<LogoVariant | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [primaryColorHexInput, setPrimaryColorHexInput] = useState(
    (settings.primaryColorHex ?? settings.primaryColor ?? "").toUpperCase()
  );
  const [textColorHexInput, setTextColorHexInput] = useState(
    (settings.textColorHex ?? "").toUpperCase()
  );

  async function handleSubmit(formData: FormData) {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveBrandingAction(formData);
    if (result.error) {
      setStatus("error");
      setErrorMessage(result.error);
      return;
    }
    setStatus("saved");
    router.refresh();
    setTimeout(() => setStatus("idle"), 3000);
  }

  async function handleLogoFile(variant: LogoVariant, file: File) {
    setUploading(variant);
    setUploadError(null);
    try {
      const res = await fetch("/api/settings/branding/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          variant,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Failed to get upload URL");
        return;
      }
      const { uploadUrl, publicUrl } = data;
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putRes.ok) {
        setUploadError("Upload failed: " + putRes.statusText);
        return;
      }
      const newLight = variant === "light" ? publicUrl : (settings.logoLightUrl ?? null);
      const newDark = variant === "dark" ? publicUrl : (settings.logoDarkUrl ?? null);
      const saveRes = await saveBrandingLogosAction(newLight, newDark);
      if (saveRes.error) {
        setUploadError(saveRes.error);
        return;
      }
      router.refresh();
    } finally {
      setUploading(null);
    }
  }

  const previewHeight = "h-32";
  const uploadButtonClass =
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";

  const showIconLibraryPanel = iconLibraryOpen && iconLibraryContext;
  const showBackgroundLibraryPanel = backgroundLibraryOpen && iconLibraryContext;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenIconLibrary?.()}
          className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Icon Library
        </button>
        <button
          type="button"
          onClick={() => onOpenBackgroundLibrary?.()}
          className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Background Library
        </button>
      </div>

      {/* Icon Library slide-over (matches Presentation Settings panel) */}
      {showIconLibraryPanel && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
            onClick={() => onCloseIconLibrary?.()}
          />
          <div
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            role="dialog"
            aria-label="Icon Library"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Icon Library
              </h2>
              <button
                type="button"
                onClick={() => onCloseIconLibrary?.()}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                aria-label="Close Icon Library"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
              <IconLibraryClient
                icons={brandIcons}
                companyName={iconLibraryContext.companyName}
                websiteUrl={iconLibraryContext.websiteUrl}
                effectiveAccent={iconLibraryContext.effectiveAccent}
                effectiveText={iconLibraryContext.effectiveText}
                panelMode
              />
            </div>
          </div>
        </>
      )}
      {/* Background Library slide-over (matches Icon Library panel) */}
      {showBackgroundLibraryPanel && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
            onClick={() => onCloseBackgroundLibrary?.()}
          />
          <div
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900 lg:max-w-2xl"
            role="dialog"
            aria-label="Background Library"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Background Library
              </h2>
              <button
                type="button"
                onClick={() => onCloseBackgroundLibrary?.()}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                aria-label="Close Background Library"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
              <BackgroundLibraryClient
                brandIcons={brandIcons}
                brandBackgrounds={brandBackgrounds}
                companyName={iconLibraryContext.companyName}
                websiteUrl={iconLibraryContext.websiteUrl}
                effectiveAccent={iconLibraryContext.effectiveAccent}
                effectiveText={iconLibraryContext.effectiveText}
                panelMode
              />
            </div>
          </div>
        </>
      )}
      {uploadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
      )}
      <form action={handleSubmit} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Light background logo card */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Light background logo
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Dark letters. Used on light backgrounds (e.g. proposals, PDFs).
            </p>
            <div
              className={`mt-4 flex w-full items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white ${previewHeight} dark:border-zinc-700 dark:bg-zinc-800`}
            >
              {settings.logoLightUrl ? (
                <img
                  src={settings.logoLightUrl}
                  alt="Light logo"
                  className="max-h-full max-w-full object-contain p-2"
                />
              ) : (
                <span className="text-xs text-zinc-400">No logo</span>
              )}
            </div>
            <input
              type="hidden"
              name="logoLightUrl"
              value={settings.logoLightUrl ?? ""}
              readOnly
            />
            <label className="mt-4 block">
              <span className="sr-only">Upload light logo</span>
              <span className={uploadButtonClass}>
                <input
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoFile("light", file);
                    e.target.value = "";
                  }}
                />
                {uploading === "light"
                  ? "Uploading…"
                  : settings.logoLightUrl
                    ? "Replace"
                    : "Upload"}
              </span>
            </label>
          </div>

          {/* Dark background logo card */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Dark background logo
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Light/white letters. Used on dark backgrounds (e.g. headers).
            </p>
            <div
              className={`mt-4 flex w-full items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-800 ${previewHeight} dark:border-zinc-700 dark:bg-zinc-900`}
            >
              {settings.logoDarkUrl ? (
                <img
                  src={settings.logoDarkUrl}
                  alt="Dark logo"
                  className="max-h-full max-w-full object-contain p-2"
                />
              ) : (
                <span className="text-xs text-zinc-500">No logo</span>
              )}
            </div>
            <input
              type="hidden"
              name="logoDarkUrl"
              value={settings.logoDarkUrl ?? ""}
              readOnly
            />
            <label className="mt-4 block">
              <span className="sr-only">Upload dark logo</span>
              <span className={uploadButtonClass}>
                <input
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoFile("dark", file);
                    e.target.value = "";
                  }}
                />
                {uploading === "dark"
                  ? "Uploading…"
                  : settings.logoDarkUrl
                    ? "Replace"
                    : "Upload"}
              </span>
            </label>
          </div>
        </div>

        {/* Brand Preview section */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Brand Preview
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Accent and text colors for proposals and exports.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-6">
            <div>
              <label htmlFor="primaryColorHex" className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Accent color
              </label>
              <div className="flex w-full max-w-xs items-center gap-3 rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                <input
                  type="color"
                  aria-label="Accent color picker"
                  value={HEX_REGEX.test(primaryColorHexInput) ? primaryColorHexInput : "#000000"}
                  onChange={(e) =>
                    setPrimaryColorHexInput(e.target.value.toUpperCase())
                  }
                  className="h-8 w-8 shrink-0 cursor-pointer rounded-sm border-0 p-0"
                />
                <input
                  id="primaryColorHex"
                  name="primaryColorHex"
                  type="text"
                  value={primaryColorHexInput}
                  onChange={(e) =>
                    setPrimaryColorHexInput(e.target.value.toUpperCase())
                  }
                  className="h-8 flex-1 border-0 bg-transparent px-0 text-zinc-900 focus:ring-0 dark:text-zinc-100"
                  placeholder="#0F172A"
                />
              </div>
            </div>
            <div>
              <label htmlFor="textColorHex" className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Text color
              </label>
              <div className="flex w-full max-w-xs items-center gap-3 rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                <input
                  type="color"
                  aria-label="Text color picker"
                  value={HEX_REGEX.test(textColorHexInput) ? textColorHexInput : "#000000"}
                  onChange={(e) =>
                    setTextColorHexInput(e.target.value.toUpperCase())
                  }
                  className="h-8 w-8 shrink-0 cursor-pointer rounded-sm border-0 p-0"
                />
                <input
                  id="textColorHex"
                  name="textColorHex"
                  type="text"
                  value={textColorHexInput}
                  onChange={(e) =>
                    setTextColorHexInput(e.target.value.toUpperCase())
                  }
                  className="h-8 flex-1 border-0 bg-transparent px-0 text-zinc-900 focus:ring-0 dark:text-zinc-100"
                  placeholder="#18181B"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {(() => {
                const effectiveTextHex = HEX_REGEX.test(textColorHexInput)
                  ? textColorHexInput
                  : settings.textColorHex && HEX_REGEX.test(settings.textColorHex)
                    ? settings.textColorHex
                    : null;
                const effectiveAccentHex = HEX_REGEX.test(primaryColorHexInput)
                  ? primaryColorHexInput
                  : settings.primaryColorHex && HEX_REGEX.test(settings.primaryColorHex)
                    ? settings.primaryColorHex
                    : null;
                return (
                  <>
                    <span
                      className="text-lg font-semibold"
                      style={
                        effectiveTextHex
                          ? ({ color: effectiveTextHex } as React.CSSProperties)
                          : undefined
                      }
                    >
                      HHI Builders
                    </span>
                    {effectiveAccentHex && (
                      <span
                        className="inline-block rounded-full px-3 py-1 text-xs font-medium text-white"
                        style={{ backgroundColor: effectiveAccentHex }}
                      >
                        Accent
                      </span>
                    )}
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Your tagline or company description appears here.
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Brand Voice section */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Brand Voice
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Headline and tagline shown on the closing slide of every proposal.
            Leave blank to render nothing.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <label
                htmlFor="closingHeadline"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Closing headline
              </label>
              <input
                id="closingHeadline"
                name="closingHeadline"
                type="text"
                defaultValue={settings.closingHeadline ?? ""}
                placeholder="Let's Build Something Extraordinary"
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="brandTagline"
                className="mb-1.5 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Brand tagline
              </label>
              <input
                id="brandTagline"
                name="brandTagline"
                type="text"
                defaultValue={settings.brandTagline ?? ""}
                placeholder="Design. Build. Remodel."
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Save — submits the whole Branding form (colors + Brand Voice) */}
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
