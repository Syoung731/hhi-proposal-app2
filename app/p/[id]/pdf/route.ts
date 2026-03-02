import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

/**
 * PDF download for public proposal at /p/[id]/pdf. No auth required.
 * Returns 404 if proposal not found or proposal.isPublic is false.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const proposal = await prisma.proposal.findUnique({
    where: { id },
    select: { isPublic: true, projectId: true },
  });

  if (!proposal || !proposal.isPublic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const snapshot = await prisma.publishedSnapshot.findFirst({
    where: { projectId: proposal.projectId },
    orderBy: { version: "desc" },
  });

  if (!snapshot) {
    return NextResponse.json({ error: "Proposal not published" }, { status: 404 });
  }

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    const url = `${BASE_URL}/p/${id}?print=1`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    });
    await browser.close();
    const filename = `proposal-${id}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("PDF export error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
