"use client";

/**
 * Client-side flag that flips `[data-print-ready="true"]` on the document
 * root once fonts have loaded. The PDF route waits on this selector
 * before invoking `page.pdf()`.
 *
 * Budget-print is HTML-only (no AI backgrounds, no image-heavy slides),
 * so we only gate on fonts. If we ever add a logo image we'll need to
 * preload it here the way print-stack does for the deck.
 */

import { useEffect } from "react";

export function PrintReadySignal() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (typeof document !== "undefined" && document.fonts?.ready) {
          await document.fonts.ready;
        }
      } catch {
        /* ignore — flip anyway */
      }
      if (cancelled) return;
      document.documentElement.setAttribute("data-print-ready", "true");
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
