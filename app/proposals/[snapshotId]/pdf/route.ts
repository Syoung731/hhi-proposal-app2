import { NextRequest, NextResponse } from "next/server";
import {
  renderSnapshotPdf,
  defaultPdfFilename,
  SnapshotNotFoundForPdfError,
  InvalidPdfRenderParamsError,
} from "@/app/lib/pdf/render-snapshot-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * PDF renderer for the public proposal deck.
 *
 * Routes:
 *   GET /proposals/{snapshotId}/pdf
 *     → prints the published snapshot.
 *
 *   GET /proposals/draft/pdf?draft=1&projectId={id}
 *     → prints a draft preview with a "DRAFT — PROPOSAL v{N}" marker strip
 *       on every page.
 *
 * This handler is a thin HTTP wrapper around `renderSnapshotPdf()` in
 * app/lib/pdf/render-snapshot-pdf.ts. The email send flow (Cleanup H) calls
 * the same utility directly to attach a PDF — keeping the route this thin
 * means there is exactly one Chromium-driving codepath to maintain.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ snapshotId: string }> },
) {
  const { snapshotId } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const isDraft = searchParams.get("draft") === "1" && snapshotId === "draft";
  const projectId = searchParams.get("projectId") ?? undefined;

  if (isDraft && !projectId) {
    return new NextResponse("Missing projectId for draft", { status: 400 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  try {
    const pdfBuffer = await renderSnapshotPdf({
      snapshotId,
      baseUrl,
      isDraft,
      projectId,
    });

    const filename = defaultPdfFilename({ isDraft, snapshotId, projectId });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof InvalidPdfRenderParamsError) {
      return new NextResponse(err.message, { status: 400 });
    }
    if (err instanceof SnapshotNotFoundForPdfError) {
      return new NextResponse(
        err.kind === "project" ? "Project not found" : "Snapshot not found",
        { status: 404 },
      );
    }
    console.error("PDF export error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
