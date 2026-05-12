"use client";

/**
 * Toolbar dropdown for downloading the project's AI budget as XLSX or PDF.
 *
 * Two anchors that point straight at the existing routes
 * (/api/projects/{id}/budget-export/xlsx and .../pdf). The browser
 * handles the download natively via the routes' Content-Disposition
 * header — no client-side blob shuffling required.
 *
 * Dropdown opens on click, closes on outside click or Escape. The PDF
 * link kicks off a ~5-7s Chromium render server-side; the button shows
 * a brief "Generating…" hint while that's in flight, but the actual
 * file delivery is up to the browser.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  projectId: string;
  disabled?: boolean;
}

export function BudgetExportButton({ projectId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [pdfPending, setPdfPending] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const xlsxHref = `/api/projects/${encodeURIComponent(projectId)}/budget-export/xlsx`;
  const pdfHref = `/api/projects/${encodeURIComponent(projectId)}/budget-export/pdf`;

  function handlePdfClick() {
    setPdfPending(true);
    // The anchor's default behavior (navigate to URL with download header)
    // proceeds; we just track pending state so the button reads
    // "Generating…". Clear after a generous timeout — if the user cancels
    // or the server errors, the state self-clears.
    setTimeout(() => setPdfPending(false), 30_000);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {pdfPending ? "Generating PDF…" : "Export Budget"} <span aria-hidden>▾</span>
      </button>
      {open && !disabled && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <a
            href={xlsxHref}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
            role="menuitem"
          >
            Download XLSX
          </a>
          <a
            href={pdfHref}
            onClick={handlePdfClick}
            className="block border-t border-zinc-100 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
            role="menuitem"
          >
            Download PDF
          </a>
        </div>
      )}
    </div>
  );
}
