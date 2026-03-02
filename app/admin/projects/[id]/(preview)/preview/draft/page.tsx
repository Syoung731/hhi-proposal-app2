import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";
import { ProposalPublicPage } from "@/components/public/ProposalPublicPage";
import type { SnapshotData } from "@/app/lib/snapshot";

/**
 * Admin-only preview of the current draft (live project data).
 * Builds a snapshot from the project without publishing, so you can see how it will look.
 * Rendered with minimal layout (no HHI Admin header) for standalone/iframe preview.
 */
export default async function AdminProjectPreviewDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      proposal: { select: { id: true } },
      rooms: { orderBy: { sortOrder: "asc" } },
      media: { orderBy: { sortOrder: "asc" } },
      timelinePhases: { orderBy: { sortOrder: "asc" } },
      investmentLineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!project) notFound();

  const effectiveInvestmentItems = project.investmentLineItems.map((i) => {
    const rangeLow = i.isOverride ? i.overrideLow : i.rangeLow;
    const rangeTarget = i.isOverride ? i.overrideTarget : i.rangeTarget;
    const rangeHigh = i.isOverride ? i.overrideHigh : i.rangeHigh;
    return {
      id: i.id,
      label: i.label,
      rangeLow,
      rangeTarget,
      rangeHigh,
      notes: i.notes,
      sortOrder: i.sortOrder,
      includeInTotals: i.includeInTotals,
    };
  });

  const snapshot: SnapshotData = {
    version: project.publishedVersion + 1,
    project: {
      title: project.title,
      subtitle: project.subtitle,
      addressLine1: project.addressLine1,
      addressLine2: project.addressLine2,
      city: project.city,
      state: project.state,
      zip: project.zip,
      client1First: project.client1First,
      client1Last: project.client1Last,
      client2First: project.client2First,
      client2Last: project.client2Last,
      coverHeroImageId: project.coverHeroImageId,
      objective: project.objective,
    },
    rooms: project.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      scopeNarrative: r.scopeNarrative,
      sortOrder: r.sortOrder,
    })),
    media: project.media.map((m) => ({
      id: m.id,
      roomId: m.roomId,
      kind: m.kind,
      type: m.type,
      url: m.url,
      caption: m.caption,
      tags: m.tags,
      sortOrder: m.sortOrder,
    })),
    timelinePhases: project.timelinePhases.map((p) => ({
      id: p.id,
      phase: p.phase,
      durationText: p.durationText,
      sortOrder: p.sortOrder,
    })),
    investmentLineItems: effectiveInvestmentItems,
  };

  return (
    <ProposalPublicPage
      snapshot={snapshot}
      proposalId={null}
      backHref={`/admin/projects/${id}?tab=publish`}
    />
  );
}
