/**
 * Server-side Chromium driver for the budget print page.
 *
 * Sibling of `app/lib/pdf/render-snapshot-pdf.ts` — same Playwright +
 * @sparticuz/chromium pattern, different target URL. Kept as a separate
 * module rather than generalizing the snapshot renderer because the two
 * have different page sizes (snapshot = A4 landscape with custom CSS
 * page size; budget = Letter landscape via `@page` CSS) and different
 * auth-bypass token shapes.
 *
 * Validates the project exists before launching Chromium — cheap guard
 * that saves ~1s of browser startup for bad input.
 */

import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";
import { prisma } from "@/app/lib/prisma";
import { generatePdfRenderToken } from "@/app/lib/pdf-render-token";

export interface RenderBudgetPdfParams {
  projectId: string;
  /** Origin for the print page URL — e.g. "https://proposals.hhi.com". */
  baseUrl: string;
}

export class BudgetPdfProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = "BudgetPdfProjectNotFoundError";
  }
}

export async function renderBudgetPdf(
  params: RenderBudgetPdfParams,
): Promise<Buffer> {
  const { projectId, baseUrl } = params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) {
    throw new BudgetPdfProjectNotFoundError(projectId);
  }

  // Mint a token keyed on projectId so the headless browser passes the
  // proxy.ts bypass for /budget-print/{id}. The `snapshotId` field is
  // required on the token but unused in the budget path — pass a
  // sentinel string ("budget") that won't collide with any real cuid.
  const pdfToken = await generatePdfRenderToken({
    snapshotId: "budget",
    projectId,
  });

  const targetUrl =
    `${baseUrl}/budget-print/${encodeURIComponent(projectId)}` +
    `?print=1&pdfToken=${encodeURIComponent(pdfToken)}`;

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
      viewport: { width: 1400, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector('[data-print-ready="true"]', { timeout: 30000 });

    const pdfBuffer = await page.pdf({
      // Letter landscape — @page rule in the print stylesheet drives the
      // actual paper size. preferCSSPageSize honors that.
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}
