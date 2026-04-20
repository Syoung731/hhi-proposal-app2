import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * PDF renderer for the public proposal deck.
 *
 * Routes:
 *   GET /proposals/{snapshotId}/pdf
 *     → validates the snapshot exists, prints that version of the deck.
 *
 *   GET /proposals/draft/pdf?draft=1&projectId={id}
 *     → validates the project exists, prints a draft preview with a
 *       "DRAFT — PROPOSAL v{N}" marker strip on every page.
 *
 * The route navigates a headless Chromium to the renderer with `?print=1`
 * which renders every slide as its own landscape A4 page. Chromium waits for
 * `[data-print-ready="true"]` on the renderer root — flipped only after all
 * slide images and fonts have resolved — before calling page.pdf().
 *
 * Production uses @sparticuz/chromium to fit Vercel's function size limit.
 * Local dev falls back to the system-resolved Chromium binary (requires
 * `playwright` devDependency, which ships the install).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ snapshotId: string }> },
) {
  const { snapshotId } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const isDraft = searchParams.get("draft") === "1" && snapshotId === "draft";
  const projectId = searchParams.get("projectId");

  if (isDraft) {
    if (!projectId) {
      return new NextResponse("Missing projectId for draft", { status: 400 });
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return new NextResponse("Project not found", { status: 404 });
    }
  } else {
    const snapshot = await prisma.publishedSnapshot.findUnique({
      where: { id: snapshotId },
      select: { id: true },
    });
    if (!snapshot) {
      return new NextResponse("Snapshot not found", { status: 404 });
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
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

    const filename = isDraft
      ? `draft-proposal-${projectId}.pdf`
      : `proposal-${snapshotId}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("PDF export error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  } finally {
    await browser.close();
  }
}
