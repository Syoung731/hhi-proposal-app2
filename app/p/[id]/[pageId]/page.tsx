import { notFound } from "next/navigation";
import {
  getProposalSnapshotForViewer,
} from "@/app/lib/public-proposal";
import type { PresentationConfigSaved, SectionPageConfig } from "@/app/lib/layout-config";
import type { SnapshotData } from "@/app/lib/snapshot";
import { SectionTemplateSplit } from "@/components/public/section/SectionTemplateSplit";

const SECTION_PREFIX = "section:";

type MediaItem = SnapshotData["media"][number];

/** Same selection rules as admin: beforeSelectedMediaIds (or legacy beforeMediaIds), trimmed to splitDensity. */
function getBeforeImages(
  media: SnapshotData["media"],
  roomId: string,
  sectionCfg: { beforeSelectedMediaIds?: string[]; beforeMediaIds?: string[]; splitDensity?: 1 | 2 | 3 } | undefined
): { id: string; url: string; caption: string | null }[] {
  const existing = media
    .filter((m) => m.roomId === roomId && m.type === "EXISTING")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(existing.map((m) => [m.id, m]));
  const maxN = Math.min(sectionCfg?.splitDensity ?? 2, 3);
  const ids = sectionCfg?.beforeSelectedMediaIds ?? sectionCfg?.beforeMediaIds;

  if (Array.isArray(ids) && ids.length > 0) {
    const ordered = ids
      .slice(0, maxN)
      .map((id) => byId.get(id))
      .filter(Boolean) as MediaItem[];
    return ordered.map((m) => ({ id: m.id, url: m.url, caption: m.caption }));
  }
  return existing.slice(0, maxN).map((m) => ({
    id: m.id,
    url: m.url,
    caption: m.caption,
  }));
}

/** Same selection rules as admin: featured first, then afterSelectedMediaIds (or legacy afterMediaIds), trimmed to splitDensity. */
function getAfterImages(
  media: SnapshotData["media"],
  roomId: string,
  sectionCfg: {
    featuredConceptMediaId?: string | null;
    afterSelectedMediaIds?: string[];
    afterMediaIds?: string[];
    splitDensity?: 1 | 2 | 3;
  } | undefined
): { id: string; url: string; caption: string | null }[] {
  const renderings = media
    .filter((m) => m.roomId === roomId && m.type === "RENDERING")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const byId = new Map(renderings.map((m) => [m.id, m]));
  const maxN = Math.min(sectionCfg?.splitDensity ?? 2, 3);
  const featuredConceptMediaId = sectionCfg?.featuredConceptMediaId ?? null;
  const ids = sectionCfg?.afterSelectedMediaIds ?? sectionCfg?.afterMediaIds;

  if (Array.isArray(ids) && ids.length > 0) {
    let ordered = ids
      .slice(0, maxN)
      .map((id) => byId.get(id))
      .filter(Boolean) as MediaItem[];
    if (featuredConceptMediaId && renderings.some((m) => m.id === featuredConceptMediaId)) {
      const featured = byId.get(featuredConceptMediaId);
      if (featured) {
        const rest = ordered.filter((m) => m.id !== featuredConceptMediaId);
        ordered = [featured, ...rest].slice(0, maxN);
      }
    }
    return ordered.map((m) => ({ id: m.id, url: m.url, caption: m.caption }));
  }

  if (featuredConceptMediaId && renderings.length > 0) {
    const featured = renderings.find((m) => m.id === featuredConceptMediaId);
    const rest = renderings.filter((m) => m.id !== featuredConceptMediaId);
    const list = featured ? [featured, ...rest] : renderings;
    return list.slice(0, maxN).map((m) => ({ id: m.id, url: m.url, caption: m.caption }));
  }
  return renderings.slice(0, maxN).map((m) => ({
    id: m.id,
    url: m.url,
    caption: m.caption,
  }));
}

/**
 * Central dynamic segment for pageIds that don't have a dedicated route.
 * Handles section pages: pageId = "section:<roomId>".
 * Public nav uses this (section:roomId); admin preview uses same /p/[id] with draft data.
 */
export default async function DynamicPageIdPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id, pageId } = await params;

  if (!pageId.startsWith(SECTION_PREFIX)) notFound();

  const roomId = pageId.slice(SECTION_PREFIX.length);
  if (!roomId) notFound();

  const data = await getProposalSnapshotForViewer(id);
  if (!data) notFound();

  const room = data.snapshot.rooms.find((r) => r.id === roomId);
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
      ? (pages.sections as Record<string, SectionPageConfig>)
      : null;

  const sectionCfg = sectionsMap?.[room.id];
  if (sectionCfg?.include === false) notFound();

  const splitDensity =
    sectionCfg?.splitDensity === 1 || sectionCfg?.splitDensity === 2 || sectionCfg?.splitDensity === 3
      ? sectionCfg.splitDensity
      : 2;
  const titleScale =
    typeof sectionCfg?.titleScale === "number" && Number.isFinite(sectionCfg.titleScale)
      ? sectionCfg.titleScale
      : 1.2;
  const photoAreaPct =
    typeof sectionCfg?.photoAreaPct === "number" && Number.isFinite(sectionCfg.photoAreaPct)
      ? sectionCfg.photoAreaPct
      : 62;
  const scopeAreaPct =
    typeof sectionCfg?.scopeAreaPct === "number" && Number.isFinite(sectionCfg.scopeAreaPct)
      ? sectionCfg.scopeAreaPct
      : 24;
  const scopeTextScale =
    typeof sectionCfg?.scopeTextScale === "number" && Number.isFinite(sectionCfg.scopeTextScale)
      ? sectionCfg.scopeTextScale
      : 1.0;

  const beforeImages = getBeforeImages(
    data.snapshot.media,
    room.id,
    sectionCfg
  );
  const afterImages = getAfterImages(
    data.snapshot.media,
    room.id,
    sectionCfg
  );

  const onlyAfter = beforeImages.length === 0 && afterImages.length > 0;
  const onlyBefore = afterImages.length === 0 && beforeImages.length > 0;

  return (
    <SectionTemplateSplit
      title={room.name}
      beforeImages={beforeImages}
      afterImages={afterImages}
      onlyAfter={onlyAfter}
      onlyBefore={onlyBefore}
      splitDensity={splitDensity}
      scopeText={room.scopeNarrative ?? ""}
      titleScale={titleScale}
      photoAreaPct={photoAreaPct}
      scopeTextScale={scopeTextScale}
    />
  );
}
