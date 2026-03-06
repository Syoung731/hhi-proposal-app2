import { redirect, notFound } from "next/navigation";
import {
  getProposalSnapshotForViewer,
  getRoomBySlug,
} from "@/app/lib/public-proposal";
import type { PresentationConfigSaved } from "@/app/lib/layout-config";

/**
 * Legacy route: /p/[id]/section/[roomSlug].
 * Redirects to the canonical section page URL: /p/[id]/section:roomId.
 * Nav and preview use section:roomId; this route is only for old links.
 */
export default async function SectionSlugRedirectPage({
  params,
}: {
  params: Promise<{ id: string; roomSlug: string }>;
}) {
  const { id, roomSlug } = await params;
  const data = await getProposalSnapshotForViewer(id);
  if (!data) notFound();

  const room = getRoomBySlug(data.snapshot, roomSlug);
  if (!room) notFound();

  const pages =
    data.publicLayoutConfig &&
    typeof data.publicLayoutConfig === "object" &&
    "pages" in data.publicLayoutConfig
      ? (data.publicLayoutConfig as PresentationConfigSaved).pages
      : undefined;
  const sectionsMap =
    pages?.sections &&
    typeof pages.sections === "object" &&
    !Array.isArray(pages.sections)
      ? (pages.sections as Record<string, { include?: boolean }>)
      : null;
  const sectionCfg = sectionsMap?.[room.id];
  if (sectionCfg?.include === false) notFound();

  redirect(`/p/${id}/section:${room.id}`);
}
