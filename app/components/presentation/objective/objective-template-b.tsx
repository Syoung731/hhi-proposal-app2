"use client";

import type { ObjectivePageConfig } from "@/app/lib/layout-config";
import {
  getTemplateBDividerColor,
  getTemplateBUnderlineColor,
} from "@/app/lib/layout-config";

export type ObjectiveTemplateBProps = {
  config: ObjectivePageConfig;
  onChange?: (next: ObjectivePageConfig) => void;
  projectId?: string;
  transcriptText?: string | null;
  overviewText?: string | null;
  /** Branding accent color (e.g. CompanySettings.primaryColorHex). Underline defaults to this when templateB.underlineColor is unset. */
  brandingAccentColor?: string | null;
};

function parseCommitment(text: string): { heading: string; body: string } {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { heading: "", body: "" };
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline !== -1) {
    return {
      heading: trimmed.slice(0, firstNewline).trim(),
      body: trimmed.slice(firstNewline + 1).trim(),
    };
  }
  const dashSep = trimmed.indexOf(" - ");
  if (dashSep !== -1) {
    return {
      heading: trimmed.slice(0, dashSep).trim(),
      body: trimmed.slice(dashSep + 3).trim(),
    };
  }
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx !== -1) {
    return {
      heading: trimmed.slice(0, colonIdx).trim(),
      body: trimmed.slice(colonIdx + 1).trim(),
    };
  }
  return { heading: trimmed, body: "" };
}

export function ObjectiveTemplateB({
  config,
  brandingAccentColor,
}: ObjectiveTemplateBProps) {
  const title = config.title ?? "Project Objective";
  const objectiveText = config.objectiveText ?? "";
  const commitments = (config.commitments && config.commitments.length
    ? config.commitments
    : ["", "", ""]
  ).slice(0, 3);
  while (commitments.length < 3) commitments.push("");

  const underlineColor = getTemplateBUnderlineColor(config, brandingAccentColor);
  const dividerColor = getTemplateBDividerColor(config);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Fixed page canvas: single height, no run-off */}
      <div className="flex h-full min-h-0 flex-col px-8 py-10 sm:px-10 sm:py-12">
        {/* TOP – Big serif headline + full-width accent underline */}
        <section className="shrink-0 text-center">
          <h2 className="font-serif text-[clamp(28px,3.5vw,48px)] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
            {title.trim() || "Project Objective"}
          </h2>
          <div
            className="mx-auto mt-4 h-0.5 w-full max-w-full shrink-0 sm:mt-5"
            style={{ backgroundColor: underlineColor }}
            aria-hidden
          />
        </section>

        {/* MIDDLE – Large italic objective paragraph, centered, constrained width */}
        <section className="mt-6 min-h-0 shrink-0 sm:mt-8">
          <p
            className="mx-auto max-w-[85%] text-center font-serif text-[clamp(18px,2vw,28px)] italic leading-snug text-zinc-800 line-clamp-4 dark:text-zinc-200 sm:max-w-[720px]"
            style={{ lineHeight: 1.5 }}
          >
            {objectiveText.trim() ||
              "Add a focused, client-facing objective statement. It will appear here in an editorial style."}
          </p>
        </section>

        {/* BOTTOM – Three pillars with vertical dividers, line-clamped bodies */}
        <section className="mt-6 grid min-h-0 flex-1 grid-cols-1 gap-6 pt-6 sm:mt-8 sm:grid-cols-3 sm:gap-8 sm:pt-8">
          {commitments.map((raw, idx) => {
            const { heading, body } = parseCommitment(raw);
            return (
              <div
                key={idx}
                className={
                  "flex min-w-0 flex-col items-center text-center sm:px-6 " +
                  (idx > 0 ? "sm:border-l" : "")
                }
                style={
                  idx > 0 ? { borderLeftColor: dividerColor } : undefined
                }
              >
                {heading ? (
                  <p className="shrink-0 font-semibold text-zinc-900 dark:text-zinc-100 text-base sm:text-lg">
                    {heading}
                  </p>
                ) : (
                  <p className="shrink-0 font-semibold text-zinc-400 text-base dark:text-zinc-500 sm:text-lg">
                    Commitment {idx + 1}
                  </p>
                )}
                {body ? (
                  <p className="mt-2 min-h-0 overflow-hidden text-sm leading-relaxed text-zinc-600 line-clamp-4 dark:text-zinc-400 sm:mt-3 sm:text-base sm:line-clamp-5">
                    {body}
                  </p>
                ) : null}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
