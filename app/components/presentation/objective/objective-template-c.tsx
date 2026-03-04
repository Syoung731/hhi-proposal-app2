"use client";

import type { ObjectivePageConfig } from "@/app/lib/layout-config";
import { getTemplateCBarColor, getTemplateCColumns } from "@/app/lib/layout-config";
import { isBadPlaceholderUrl } from "@/app/lib/media";

export type ObjectiveTemplateCProps = {
  config: ObjectivePageConfig;
  /** Map of icon id -> image URL (from getBrandIconsByIds). */
  iconUrls: Map<string, string>;
  /** When true, render for fixed-height preview frame (no vh-only spacing). */
  preview?: boolean;
  /** Brand accent color (e.g. CompanySettings.primaryColorHex). Bar uses this when templateC.barColor is null/empty. */
  brandingAccentColor?: string | null;
};

export function ObjectiveTemplateC({
  config,
  iconUrls,
  preview = false,
  brandingAccentColor,
}: ObjectiveTemplateCProps) {
  /** Left vertical bar label: from existing Objective Name (title) field. */
  const executiveLabel =
    (config.executiveLabel ?? config.title ?? "").trim() || "Executive Summary";
  const title = (config.title ?? "Project Objective").trim() || "Project Objective";
  // Shared subtitle lives on the top-level ObjectivePageConfig.
  // For backward compatibility, fall back to any legacy templateC.subtitle.
  const subtitle = (config.subtitle ?? config.templateC?.subtitle ?? "").trim();
  const objectiveText = config.objectiveText ?? "";
  const columns = getTemplateCColumns(config);
  const barColor = getTemplateCBarColor(config, brandingAccentColor);

  return (
    <article
      className={
        preview
          ? "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
          : "flex min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white pt-0 dark:bg-zinc-950"
      }
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
        {/* Left vertical bar: fixed width, writing-mode vertical, label fills ~70–80% height, centered */}
        <div
          className="flex w-[120px] shrink-0 items-center justify-center py-8"
          style={{ backgroundColor: barColor }}
        >
          <span
            className="flex items-center justify-center font-bold uppercase leading-none text-white"
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              fontSize: "clamp(18px, 4.5vw, 28px)",
              letterSpacing: "0.25em",
              maxHeight: "85%",
              overflow: "hidden",
            }}
          >
            {executiveLabel}
          </span>
        </div>

        {/* Main content: presentation-scale typography */}
        <div className="min-w-0 flex-1 overflow-hidden bg-white px-8 py-10 sm:px-12 sm:py-12 md:px-16 md:py-14 dark:bg-zinc-950">
          {/* Template C: subtitle is main headline; fall back to title if subtitle empty */}
          <h1
            className="text-left font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-100"
            style={{ fontSize: "45px" }}
          >
            {subtitle || title}
          </h1>
          <p
            className="mb-10 mt-5 w-full text-left text-zinc-700 dark:text-zinc-300 md:mb-12"
            style={{
              fontSize: "17px",
              fontWeight: 500,
              lineHeight: 1.55,
            }}
          >
            {objectiveText || "No objective provided."}
          </p>

          {/* Three equal columns: icon, bold title, description — 20–22px titles, 16–18px body */}
          <div className="grid min-w-0 grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8 md:gap-12">
            {columns.map((col, idx) => {
              const iconUrl = col.iconId ? iconUrls.get(col.iconId) : null;
              const hasValidIcon =
                iconUrl && iconUrl.trim() !== "" && !isBadPlaceholderUrl(iconUrl);

              return (
                <div
                  key={idx}
                  className="flex min-w-0 flex-col items-center text-center"
                >
                  <div className="flex shrink-0 items-center justify-center">
                    {hasValidIcon ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={iconUrl}
                        alt=""
                        width={80}
                        height={80}
                        className="object-contain"
                      />
                    ) : (
                      <svg
                        className="text-slate-300 dark:text-slate-600"
                        width={80}
                        height={80}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                        />
                      </svg>
                    )}
                  </div>
                  <h2
                    className="mt-4 line-clamp-2 break-words font-bold text-zinc-900 hyphens-auto dark:text-zinc-100"
                    style={{
                      fontSize: "21px",
                      overflowWrap: "break-word",
                      hyphens: "auto",
                    }}
                  >
                    {(col.title ?? "").trim() || `Column ${idx + 1}`}
                  </h2>
                  <p
                    className="mt-2 line-clamp-6 text-zinc-700 dark:text-zinc-300"
                    style={{
                      fontSize: "17px",
                      lineHeight: 1.5,
                      overflowWrap: "break-word",
                      hyphens: "auto",
                    }}
                  >
                    {(col.description ?? "").trim() || ""}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}
