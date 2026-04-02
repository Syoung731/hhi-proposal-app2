import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { fetchCostGroupTemplates } from "@/app/lib/jobtread/catalog-api";

/**
 * GET /api/settings/templates/available
 *
 * Lists cost group templates from JobTread with import status.
 * Returns: Array<{ id, name, alreadyImported: boolean }>
 */
export async function GET() {
  try {
    const jtTemplates = await fetchCostGroupTemplates();

    // Get already-imported template IDs
    const imported = await prisma.roomTemplate.findMany({
      where: { jobtreadId: { not: null } },
      select: { jobtreadId: true },
    });
    const importedIds = new Set(
      imported.map((t) => t.jobtreadId).filter(Boolean)
    );

    const result = jtTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      alreadyImported: importedIds.has(t.id),
    }));

    return NextResponse.json({ templates: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error fetching templates";
    console.error("[templates/available]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
