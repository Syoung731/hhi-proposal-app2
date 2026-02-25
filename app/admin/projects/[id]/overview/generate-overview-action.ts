"use server";

import { prisma } from "@/app/lib/prisma";
import { extractFromTranscript } from "@/app/lib/ai/extract-from-transcript";

export async function generateOverviewFromTranscriptAction(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project?.transcriptText) {
    throw new Error("No transcript available.");
  }

  const result = await extractFromTranscript(project.transcriptText);

  return result;
}
