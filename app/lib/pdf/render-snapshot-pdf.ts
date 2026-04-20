/**
 * Shared snapshot-PDF renderer.
 *
 * Drives headless Chromium to the public proposal page with `?print=1`,
 * waits for `[data-print-ready="true"]` (flipped by the renderer once every
 * slide image + font has resolved), and returns the PDF bytes as a Buffer.
 *
 * # Why this lives here instead of only in the route handler
 * The send-to-client flow (Cleanup H) needs to attach a PDF to an outbound
 * email. It needs the same bytes the download route produces. Two options:
 *   (a) `fetch()` the route from a server action — wastes a request, doubles
 *       cold-start cost on Vercel, breaks if the route ever gets admin-gated.
 *   (b) extract the Chromium drive into a reusable function and call it from
 *       both the route and the server action — this file.
 * We do (b).
 *
 * # Production vs local Chromium
 * Vercel functions can't ship a full Chromium binary (size cap), so prod
 * uses `@sparticuz/chromium` which packages just the bits needed. Local dev
 * uses the Playwright-bundled system Chromium for faster iteration. This
 * branching was originally inside the route; it lives here now. Callers
 * don't pick — `NODE_ENV === "development"` selects for them.
 *
 * # Snapshot existence is validated here
 * The function validates the snapshot (or project, in draft mode) exists
 * before launching Chromium. Cheap guard that saves ~1s of browser startup
 * for bad input. Callers still need to enforce their own authorization —
 * this function does not know who the caller is.
 */

import "server-only";

import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";
import { prisma } from "@/app/lib/prisma";

export interface RenderSnapshotPdfParams {
  /** PublishedSnapshot.id. Ignored when `isDraft` is true. */
  snapshotId: string;
  /** Origin for the renderer URL — e.g. "https://proposals.hhi.com". Required. */
  baseUrl: string;
  /** When true, render the live draft preview instead of a locked snapshot. */
  isDraft?: boolean;
  /** Required when `isDraft` is true; ignored otherwise. */
  projectId?: string;
}

/** Thrown when the snapshot/project referenced for PDF render doesn't exist. */
export class SnapshotNotFoundForPdfError extends Error {
  constructor(
    message: string,
    public readonly kind: "snapshot" | "project",
  ) {
    super(message);
    this.name = "SnapshotNotFoundForPdfError";
  }
}

/** Thrown for caller-input validation failures (e.g. draft without projectId). */
export class InvalidPdfRenderParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPdfRenderParamsError";
  }
}

/**
 * Render a published snapshot (or a draft preview) to PDF bytes.
 *
 * Returns a Node Buffer of the PDF. Caller owns the bytes — stream them to
 * HTTP, attach them to an email, write them to disk, whatever.
 *
 * Throws:
 *   - InvalidPdfRenderParamsError on missing draft projectId
 *   - SnapshotNotFoundForPdfError on unknown snapshot / project
 *   - Playwright / Chromium launch errors — propagated, not wrapped, so
 *     log pipes can pick up the underlying stack
 */
export async function renderSnapshotPdf(
  params: RenderSnapshotPdfParams,
): Promise<Buffer> {
  const { snapshotId, baseUrl, isDraft, projectId } = params;

  if (isDraft) {
    if (!projectId) {
      throw new InvalidPdfRenderParamsError(
        "renderSnapshotPdf: projectId is required when isDraft=true",
      );
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new SnapshotNotFoundForPdfError(
        `Project not found: ${projectId}`,
        "project",
      );
    }
  } else {
    const snapshot = await prisma.publishedSnapshot.findUnique({
      where: { id: snapshotId },
      select: { id: true },
    });
    if (!snapshot) {
      throw new SnapshotNotFoundForPdfError(
        `Snapshot not found: ${snapshotId}`,
        "snapshot",
      );
    }
  }

  const targetUrl = isDraft
    ? `${baseUrl}/proposals/draft?draft=1&projectId=${encodeURIComponent(projectId!)}&print=1`
    : `${baseUrl}/proposals/${encodeURIComponent(snapshotId)}?print=1`;

  const isLocal = process.env.NODE_ENV === "development";
  const launchOptions = isLocal
    ? { headless: true }
    : {
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      };

  const browser = await playwright.launch(launchOptions);
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector('[data-print-ready="true"]', { timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

/**
 * Conventional download filename for a snapshot PDF. Callers that stream
 * the bytes as an attachment use this so the name is consistent across the
 * HTTP route and the email-attachment path.
 */
export function defaultPdfFilename(args: {
  isDraft?: boolean;
  snapshotId: string;
  projectId?: string;
}): string {
  if (args.isDraft) {
    return `draft-proposal-${args.projectId ?? "unknown"}.pdf`;
  }
  return `proposal-${args.snapshotId}.pdf`;
}
