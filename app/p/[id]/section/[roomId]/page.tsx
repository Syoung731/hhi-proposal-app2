import { redirect, notFound } from "next/navigation";
import { getProposalSnapshotForViewer, getRoomBySlug } from "@/app/lib/public-proposal";
import { getLibraryMediaByIds } from "@/app/lib/library-media";
import type { PresentationConfigSaved, SectionPageConfig } from "@/app/lib/layout-config";
import type { SnapshotData } from "@/app/lib/snapshot";
import { SectionTemplateSplit } from "@/components/public/section/SectionTemplateSplit";
import { SectionTemplateComparisonCollage } from "@/components/public/section/SectionTemplateComparisonCollage";

type MediaItem = SnapshotData["media"][number];

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
 * Canonical section page: /p/[id]/section/[roomId].
 * Resolves room by exact room.id first; if segment is a legacy slug, redirects to /p/[id]/section/<room.id>.
 */
export default async function SectionPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id, roomId: segment } = await params;

  const data = await getProposalSnapshotForViewer(id);
  if (!data) notFound();

  let room = data.snapshot.rooms.find((r) => r.id === segment);
  if (!room) {
    const roomBySlug = getRoomBySlug(data.snapshot, segment);
    if (roomBySlug) redirect(`/p/${id}/section/${roomBySlug.id}`);
    notFound();
  }

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
  const includeSection = sectionCfg !== undefined ? sectionCfg.include !== false : true;
  if (!includeSection) notFound();

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
  const scopeTextScale =
    typeof sectionCfg?.scopeTextScale === "number" && Number.isFinite(sectionCfg.scopeTextScale)
      ? sectionCfg.scopeTextScale
      : 1.0;

  const layoutVariant = sectionCfg?.layoutVariant ?? "split";

  if (layoutVariant === "heroAfter" || layoutVariant === "storyboard") {
    return (
      <div className="px-6 py-8">
        <article className="flex min-h-[60vh] flex-col items-center justify-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {room.name}
          </h1>
          <p className="mt-4 max-w-md text-center text-zinc-500 dark:text-zinc-400">
            This section uses the {layoutVariant === "heroAfter" ? "Hero After" : "Storyboard"} template. It will be available in a future update.
          </p>
        </article>
      </div>
    );
  }

  if (layoutVariant === "comparisonCollage") {
    const beforeForCollage = getBeforeImages(data.snapshot.media, room.id, {
      ...sectionCfg,
      splitDensity: 1,
    });
    const afterForCollage = getAfterImages(data.snapshot.media, room.id, {
      ...sectionCfg,
      splitDensity: 1,
    });
    const referenceIds = sectionCfg?.referencePhotoIds ?? [];
    const referenceRaw = await getLibraryMediaByIds(referenceIds);
    const referenceImages = referenceRaw
      .filter((m) => m.url)
      .map((m) => ({ id: m.id, url: m.url, caption: null as string | null }));

    return (
      <div className="px-6 py-8">
        <SectionTemplateComparisonCollage
          title={room.name}
          beforeImage={beforeForCollage[0] ?? null}
          afterImage={afterForCollage[0] ?? null}
          referenceImages={referenceImages}
          scopeText={room.scopeNarrative ?? ""}
          titleScale={titleScale}
          photoAreaPct={photoAreaPct}
          scopeTextScale={scopeTextScale}
          referenceImageContain
        />
      </div>
    );
  }

  const beforeImages = getBeforeImages(data.snapshot.media, room.id, sectionCfg);
  const afterImages = getAfterImages(data.snapshot.media, room.id, sectionCfg);
  const onlyAfter = beforeImages.length === 0 && afterImages.length > 0;
  const onlyBefore = afterImages.length === 0 && beforeImages.length > 0;

  return (
    <div className="px-6 py-8">
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
    </div>
  );
}
