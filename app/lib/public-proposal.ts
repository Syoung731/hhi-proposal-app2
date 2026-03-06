import "server-only";
import { prisma } from "@/app/lib/prisma";
import { checkIsAdmin } from "@/app/lib/auth";
import type { SnapshotData } from "@/app/lib/snapshot";
import type {
  PublicLayoutConfigSaved,
  PresentationConfigSaved,
  ProposalSection,
  SectionPageConfig,
} from "@/app/lib/layout-config";

/**
 * Loads the latest published snapshot for a public proposal.
 * Returns null if proposal not found, not public, or no snapshot.
 * Call getLayoutConfig(publicLayoutConfig) to get merged config for rendering.
 */
export async function getPublicProposalSnapshot(
  proposalId: string
): Promise<{
  snapshot: SnapshotData;
  proposalId: string;
  /** Raw saved config (use getLayoutConfig(this) for merged config). */
  publicLayoutConfig: PublicLayoutConfigSaved | PresentationConfigSaved | null;
} | null> {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { isPublic: true, projectId: true, publicLayoutConfig: true },
  });

  if (!proposal || !proposal.isPublic) return null;

  const snapshotRow = await prisma.publishedSnapshot.findFirst({
    where: { projectId: proposal.projectId },
    orderBy: { version: "desc" },
  });

  if (!snapshotRow) return null;

  const snapshot = snapshotRow.snapshotJson as unknown as SnapshotData;
  return {
    snapshot,
    proposalId,
    publicLayoutConfig: proposal.publicLayoutConfig as PublicLayoutConfigSaved | PresentationConfigSaved | null,
  };
}

/**
 * Loads the appropriate snapshot for a public proposal, with admin draft fallback.
 *
 * - For published/public proposals, returns the latest PublishedSnapshot (same as getPublicProposalSnapshot).
 * - If not public or no published snapshot:
 *   - Non-admins get null (public 404/blocked).
 *   - Admins get a draft snapshot built from the live project data.
 */
export async function getProposalSnapshotForViewer(
  proposalId: string
): Promise<{
  snapshot: SnapshotData;
  proposalId: string;
  publicLayoutConfig: PublicLayoutConfigSaved | PresentationConfigSaved | null;
} | null> {
  const published = await getPublicProposalSnapshot(proposalId);
  if (published) return published;

  const isAdmin = await checkIsAdmin();
  if (!isAdmin) return null;

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: {
      projectId: true,
      publicLayoutConfig: true,
    },
  });

  if (!proposal) return null;

  const project = await prisma.project.findUnique({
    where: { id: proposal.projectId },
    include: {
      rooms: { orderBy: { sortOrder: "asc" } },
      media: { orderBy: { sortOrder: "asc" } },
      timelinePhases: { orderBy: { sortOrder: "asc" } },
      investmentLineItems: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!project) return null;

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

  return {
    snapshot,
    proposalId,
    publicLayoutConfig: proposal.publicLayoutConfig as PublicLayoutConfigSaved | PresentationConfigSaved | null,
  };
}

/** Slugify room name for URL segment (e.g. "Living Room" -> "living-room"). */
export function roomSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "room";
}

/** Reserved key in pages.sections for Additional Sections page config (must not be treated as a room id). */
const ADDITIONAL_SECTIONS_KEY = "additionalSections";

export function buildProposalSections(
  proposalId: string,
  snapshot: SnapshotData,
  publicLayoutConfig?: PublicLayoutConfigSaved | PresentationConfigSaved | null
): ProposalSection[] {
  const base = `/p/${proposalId}`;
  const sections: ProposalSection[] = [
    { href: `${base}/cover`, label: "Cover", type: "page" },
    { href: `${base}/objective`, label: "Objective", type: "page" },
    { href: `${base}/difference`, label: "Why Us", type: "page" },
  ];

  const pages =
    publicLayoutConfig &&
    "pages" in publicLayoutConfig &&
    publicLayoutConfig.pages &&
    typeof publicLayoutConfig.pages === "object" &&
    !Array.isArray(publicLayoutConfig.pages)
      ? publicLayoutConfig.pages
      : undefined;
  const roomsConfig =
    (pages as PresentationConfigSaved["pages"] | undefined)?.rooms ?? {};
  const sectionsConfig =
    (pages as PresentationConfigSaved["pages"] | undefined)?.sections;
  const sectionsMap =
    sectionsConfig &&
    typeof sectionsConfig === "object" &&
    !Array.isArray(sectionsConfig)
      ? (sectionsConfig as Record<string, SectionPageConfig>)
      : null;

  // One section page per included room (include !== false), in room order. No generic Scope page.
  for (const room of snapshot.rooms) {
    const sectionCfg = sectionsMap?.[room.id];
    const includeSection =
      sectionCfg !== undefined
        ? sectionCfg.include !== false
        : (roomsConfig as Record<string, { published?: boolean }>)[room.id]?.published !== false;
    if (!includeSection) continue;
    sections.push({
      href: `${base}/section/${room.id}`,
      label: room.name,
      type: "room",
    });
  }

  // Additional Sections page when included (rooms with include === false appear here).
  const additionalCfg =
    sectionsMap && ADDITIONAL_SECTIONS_KEY in sectionsMap
      ? (sectionsMap as Record<string, { include?: boolean }>)[ADDITIONAL_SECTIONS_KEY]
      : undefined;
  const rollupPublished =
    (additionalCfg?.include ??
      (pages as PresentationConfigSaved["pages"] | undefined)?.rollup?.published ??
      true) !== false;
  if (rollupPublished) {
    sections.push({
      href: `${base}/additional-sections`,
      label: "Additional Sections",
      type: "page",
    });
  }

  sections.push(
    { href: `${base}/timeline`, label: "Timeline", type: "page" },
    { href: `${base}/investment`, label: "Investment", type: "page" },
    { href: `${base}/next-steps`, label: "Next Steps", type: "page" },
    { href: `${base}/closing`, label: "Closing", type: "page" }
  );

  return sections;
}

/** Resolve room from URL segment: match by id or by slugified name. */
export function getRoomBySlug(
  snapshot: SnapshotData,
  roomSlug: string
): SnapshotData["rooms"][0] | null {
  const byId = snapshot.rooms.find((r) => r.id === roomSlug);
  if (byId) return byId;
  const byName = snapshot.rooms.find(
    (r) => roomSlugFromName(r.name) === roomSlug
  );
  return byName ?? null;
}
