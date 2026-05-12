/**
 * GET /api/projects/{id}/budget-export.pdf
 *
 * Streams a brand-styled PDF of the project's AI budget.
 *
 * Mechanically identical to /proposals/{snapshotId}/pdf: mint a short-
 * lived bypass token, drive headless Chromium to the print HTML page,
 * wait for the data-print-ready flag, return the PDF bytes. Output is
 * landscape Letter (driven by the @page rule in the budget-print
 * stylesheet, not by page.pdf() args).
 *
 * Auth: Clerk-gated by proxy.ts for the route itself. The budget-print
 * page that Chromium loads is bypassed via the pdfToken mechanism
 * extended in this same commit.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  renderBudgetPdf,
  BudgetPdfProjectNotFoundError,
} from "@/app/lib/budget-export/render-budget-pdf";
import { prisma } from "@/app/lib/prisma";
import { buildPdfFilename } from "@/app/lib/budget-export/filename";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;

  // Pull the project title for the filename. Cheap, runs in parallel
  // with the existence check the renderer does anyway.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  });
  if (!project) {
    return new NextResponse("Project not found", { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  try {
    const pdfBuffer = await renderBudgetPdf({ projectId, baseUrl });
    const filename = buildPdfFilename(project.title, new Date());

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof BudgetPdfProjectNotFoundError) {
      return new NextResponse("Project not found", { status: 404 });
    }
    console.error("budget-export.pdf render failure:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}
