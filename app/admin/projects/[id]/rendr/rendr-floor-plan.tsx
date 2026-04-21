"use client";

import { useState } from "react";
import { InteractiveFloorPlan } from "./rendr-floor-plan-interactive";

/**
 * RendrFloorPlan — tabbed view with Interactive (SVG) and PDF viewer.
 *
 * - Interactive: custom SVG from geometry JSON blob with clickable walls,
 *   wall elevations, measurements, labels, and furniture overlay.
 * - PDF Viewer: the official Rendr-generated PDF floor plan.
 */

type FloorPlanTab = "interactive" | "pdf";

export function RendrFloorPlan({ spaceId }: { spaceId: number }) {
  const [tab, setTab] = useState<FloorPlanTab>("interactive");
  const pdfUrl = `/api/rendr/spaces/${spaceId}/floorplan`;

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-3 flex gap-1">
        <button
          onClick={() => setTab("interactive")}
          className={`rounded-t-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "interactive"
              ? "bg-orange-500 text-white"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          Interactive
        </button>
        <button
          onClick={() => setTab("pdf")}
          className={`rounded-t-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "pdf"
              ? "bg-orange-500 text-white"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          PDF Viewer
        </button>
      </div>

      {/* Tab content */}
      {tab === "interactive" && <InteractiveFloorPlan spaceId={spaceId} />}

      {tab === "pdf" && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700">
            <object
              data={`${pdfUrl}?v=${Date.now()}`}
              type="application/pdf"
              className="h-[700px] w-full"
            >
              <div className="flex h-[700px] flex-col items-center justify-center gap-3 text-zinc-500">
                <p className="text-sm">Your browser cannot display this PDF inline.</p>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Open PDF in New Tab
                </a>
              </div>
            </object>
          </div>
          <div className="flex items-center justify-end">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download PDF
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
