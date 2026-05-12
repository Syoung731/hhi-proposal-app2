/**
 * Filename helpers for the budget-export downloads.
 *
 * Lives in its own module so the route handler and the toolbar button can
 * agree on filenames without crossing the server/client boundary through
 * a route file (Next.js route.ts files restrict non-handler exports).
 */

const SAFE_CHARS_RE = /[^a-zA-Z0-9-_ ]/g;
const WHITESPACE_RE = /\s+/g;

function sanitizeFilenamePart(raw: string): string {
  return raw.replace(SAFE_CHARS_RE, "").trim().replace(WHITESPACE_RE, "-");
}

/**
 * Produce the canonical XLSX filename. Same shape as the PDF helper —
 * keep them parallel so users see consistent naming across formats.
 *
 *   HHI-Budget-{ProjectTitle}-{YYYY-MM-DD}.xlsx
 */
export function buildXlsxFilename(projectTitle: string, date: Date): string {
  const safeTitle = sanitizeFilenamePart(projectTitle);
  const iso = date.toISOString().slice(0, 10);
  return `HHI-Budget-${safeTitle || "Project"}-${iso}.xlsx`;
}

/**
 * Canonical PDF filename. Used by both the PDF route and the toolbar
 * download button.
 *
 *   HHI-Budget-{ProjectTitle}-{YYYY-MM-DD}.pdf
 */
export function buildPdfFilename(projectTitle: string, date: Date): string {
  const safeTitle = sanitizeFilenamePart(projectTitle);
  const iso = date.toISOString().slice(0, 10);
  return `HHI-Budget-${safeTitle || "Project"}-${iso}.pdf`;
}
