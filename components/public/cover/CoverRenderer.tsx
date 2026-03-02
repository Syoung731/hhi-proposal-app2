"use client";

import {
  EditorialHero,
  SplitCover,
  TitlePlate,
} from "@/components/public/blocks";
import type { PublicLayoutConfig } from "@/app/lib/layout-config";

export type CoverMediaItem = {
  id: string;
  url: string;
  kind?: string;
  type?: string;
};

export type CoverRendererContent = {
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  meta?: React.ReactNode;
};

type CoverRendererProps = {
  /** Merged cover config (variant + heroMediaId). */
  coverConfig: PublicLayoutConfig["pages"]["cover"];
  media: CoverMediaItem[];
  content: CoverRendererContent;
  /** Optional project coverHeroImageId for fallback when heroMediaId is not set. */
  coverHeroImageId?: string | null;
  /** When true, render with fixed heights for live preview (no vh units). */
  preview?: boolean;
};

/**
 * Resolves which media to use for the cover hero, matching the logic used on /p/[id]/cover.
 */
export function resolveCoverHeroMedia(
  heroMediaId: string | null | undefined,
  media: CoverMediaItem[],
  coverHeroImageId?: string | null
): CoverMediaItem | null {
  if (heroMediaId) {
    const found = media.find((m) => m.id === heroMediaId);
    if (found) return found;
  }
  const withType = media as { type?: string }[];
  const heroByType = withType.find((m) => m.type === "HERO");
  if (heroByType) return heroByType as CoverMediaItem;
  if (coverHeroImageId) {
    const byProject = media.find((m) => m.id === coverHeroImageId);
    if (byProject) return byProject;
  }
  const coverByKind = media.find((m) => m.kind === "COVER");
  if (coverByKind) return coverByKind;
  return heroByType ?? (media[0] ?? null);
}

export function CoverRenderer({
  coverConfig,
  media,
  content,
  coverHeroImageId,
  preview = false,
}: CoverRendererProps) {
  const heroMedia = resolveCoverHeroMedia(
    coverConfig.heroMediaId,
    media,
    coverHeroImageId
  );
  const coverMediaUrl = heroMedia?.url ?? null;

  const badge = content.badge ?? "Project Investment & Design Concept";
  const { title, subtitle, meta } = content;
  const variant = coverConfig.variant ?? "heroOverlay";

  if (variant === "splitCover") {
    return (
      <SplitCover
        imageUrl={coverMediaUrl}
        badge={badge}
        title={title}
        subtitle={subtitle ?? null}
        preview={preview}
      >
        {meta}
      </SplitCover>
    );
  }

  if (variant === "titlePlate") {
    return (
      <TitlePlate
        imageUrl={coverMediaUrl}
        badge={badge}
        title={title}
        subtitle={subtitle ?? null}
        preview={preview}
      >
        {meta}
      </TitlePlate>
    );
  }

  return (
    <EditorialHero
      imageUrl={coverMediaUrl}
      badge={badge}
      title={title}
      subtitle={subtitle ?? null}
      preview={preview}
    >
      {meta}
    </EditorialHero>
  );
}
