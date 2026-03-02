import "server-only";
import { prisma } from "@/app/lib/prisma";
import type { SnapshotData } from "@/app/lib/snapshot";
import type {
  PublicLayoutConfigSaved,
  PresentationConfigSaved,
  ProposalSection,
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

export function buildProposalSections(
  proposalId: string,
  snapshot: SnapshotData
): ProposalSection[] {
  const base = `/p/${proposalId}`;
  const sections: ProposalSection[] = [
    { href: `${base}/cover`, label: "Cover", type: "page" },
    { href: `${base}/objective`, label: "Objective", type: "page" },
    { href: `${base}/difference`, label: "Why Us", type: "page" },
    { href: `${base}/scope`, label: "Scope", type: "page" },
  ];

  const usedSlugs = new Set<string>();
  for (const room of snapshot.rooms) {
    const baseSlug = roomSlugFromName(room.name);
    const slug = usedSlugs.has(baseSlug) ? room.id : baseSlug;
    usedSlugs.add(slug);
    sections.push({
      href: `${base}/scope/${slug}`,
      label: room.name,
      type: "room",
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
