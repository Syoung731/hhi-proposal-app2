"use server";

import { prisma } from "@/app/lib/prisma";
import { extractFromTranscript, type TranscriptExtraction } from "@/app/lib/ai/extract-from-transcript";
import { generateLuxuryObjectiveParagraph, generateScopeOverviewNarrative } from "@/app/lib/ai/objective-content";

function classifyRoomCategory(name: string): "kitchen" | "bath" | "laundry" | "bedroom" | "living" | "dining" | "office" | "other" {
  const n = name.toLowerCase();
  if (n.includes("kitchen")) return "kitchen";
  if (n.includes("bath") || n.includes("powder") || n.includes("ensuite")) return "bath";
  if (n.includes("laundry") || n.includes("mud")) return "laundry";
  if (n.includes("bed") || n.includes("suite")) return "bedroom";
  if (n.includes("living") || n.includes("family") || n.includes("great room")) return "living";
  if (n.includes("dining")) return "dining";
  if (n.includes("office") || n.includes("den") || n.includes("study")) return "office";
  return "other";
}

function deriveWorkSummary(result: TranscriptExtraction): string {
  const rooms = Array.isArray(result.rooms) ? result.rooms : [];
  const objective = (result.overview.objective ?? "").toLowerCase();

  const categories = new Set<string>();
  let bathCount = 0;

  for (const room of rooms) {
    const name = (room?.name ?? "").trim();
    if (!name) continue;
    const cat = classifyRoomCategory(name);
    categories.add(cat);
    if (cat === "bath") {
      bathCount += 1;
    }
  }

  const hasKitchen = categories.has("kitchen");
  const hasBath = categories.has("bath");
  const distinctCategories = Array.from(categories).filter((c) => c !== "other");

  if (distinctCategories.length >= 4) {
    return "Whole Home Remodel";
  }

  if (hasKitchen && hasBath) {
    return "Kitchen + Bath Remodel";
  }

  if (bathCount >= 2 && distinctCategories.length <= 2 && !hasKitchen) {
    return "Multiple Bathroom Remodel";
  }

  if (distinctCategories.length === 1) {
    const only = distinctCategories[0];
    if (only === "kitchen") return "Kitchen Remodel";
    if (only === "bath") return "Bathroom Remodel";
    if (only === "laundry") return "Laundry Room Remodel";
    if (only === "bedroom") return "Bedroom Remodel";
    if (only === "living") return "Living Area Remodel";
    if (only === "dining") return "Dining Room Remodel";
    if (only === "office") return "Office Remodel";
  }

  if (objective) {
    const hasKitchenWord = objective.includes("kitchen");
    const hasBathWord = objective.includes("bath");
    if (hasKitchenWord && hasBathWord) {
      return "Kitchen + Bath Remodel";
    }
    if (hasKitchenWord) {
      return "Kitchen Remodel";
    }
    const bathMatches = objective.match(/bath/g);
    if (bathMatches && bathMatches.length >= 2) {
      return "Multiple Bathroom Remodel";
    }
    if (objective.includes("whole home") || objective.includes("entire home") || objective.includes("throughout")) {
      return "Whole Home Remodel";
    }
    if (objective.includes("laundry")) {
      return "Laundry Room Remodel";
    }
  }

  return "Remodel";
}

/** Build title from project fields only: "{Street or 'Unknown Address'} - {Project Type}". Subtitle stays the AI summary sentence. */
function buildOverviewTitle(
  project: { addressLine1: string | null },
  projectType: string
): string {
  const street = (project.addressLine1 ?? "").trim() || "Unknown Address";
  return `${street} - ${projectType}`;
}

export async function generateOverviewFromTranscriptAction(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project?.transcriptText) {
    throw new Error("No transcript available.");
  }

  // Fetch company name for the luxury objective prompt
  const settings = await prisma.companySettings.findFirst({ select: { companyName: true } });
  const companyName = (settings?.companyName ?? "").trim() || "HHI Builders";

  const addressParts = [
    project.addressLine1,
    project.addressLine2,
    [project.city, project.state].filter(Boolean).join(", "),
    project.zip,
  ].filter(Boolean);
  const projectAddress = addressParts.join(", ");
  const clientName = [project.client1First, project.client1Last].filter(Boolean).join(" ");

  // Fetch rooms for scope overview generation (non-overhead, with scope text)
  const rooms = await prisma.room.findMany({
    where: {
      projectId,
      isProjectOverhead: false,
      scopeNarrative: { not: "" },
    },
    select: {
      name: true,
      scopeNarrative: true,
      bucket: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  // Run transcript extraction, luxury objective, and scope overview generation in parallel
  const [result, luxuryResult, scopeOverviewResult] = await Promise.all([
    extractFromTranscript(project.transcriptText),
    generateLuxuryObjectiveParagraph({
      transcriptText: project.transcriptText,
      companyName,
      projectAddress: projectAddress || null,
      clientName: clientName || null,
    }).catch(() => null), // Don't fail the whole generation if luxury prompt fails
    rooms.length > 0
      ? generateScopeOverviewNarrative({
          rooms,
          companyName,
          projectAddress: projectAddress || "Unknown Address",
          clientName: clientName || "the homeowner",
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const overview = result.overview ?? {};
  // projectType: concise label for title only (never the subtitle text)
  const aiWorkSummary = (overview.workSummary ?? "").trim();
  const derivedWorkSummary = deriveWorkSummary(result);
  const projectType = aiWorkSummary || derivedWorkSummary || "Remodel";

  // Use AI-extracted address if the DB doesn't have one yet
  const aiAddress = (overview.addressLine1 ?? "").trim();
  const effectiveAddress = aiAddress || (project.addressLine1 ?? "").trim();
  overview.title = buildOverviewTitle({ addressLine1: effectiveAddress || null }, projectType);
  overview.workSummary = projectType;
  // subtitle: keep AI's descriptive sentence (required from extractFromTranscript); do not overwrite

  // Replace the short extracted objective with the luxury narrative version
  if (luxuryResult) {
    overview.objective = luxuryResult.objective;
    (overview as Record<string, unknown>).supportingText = luxuryResult.supportingText;
    (overview as Record<string, unknown>).bullets = luxuryResult.bullets;
  }

  // Regression: title (address — projectType) must not equal subtitle (summary sentence)
  if (overview.title != null && overview.subtitle != null && overview.title === overview.subtitle) {
    throw new Error("Overview title and subtitle must differ; title should be address — project type.");
  }

  return {
    ...result,
    overview,
    scopeOverview: scopeOverviewResult ?? null,
  };
}
