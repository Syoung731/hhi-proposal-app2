"use client";

import Link from "next/link";
import { MediaTab } from "./media/media-tab";
import { OverviewTab } from "./overview/overview-tab";
import { RoomsTab } from "./rooms/rooms-tab";
import { TimelineTab } from "./timeline/timeline-tab";
import { InvestmentTab } from "./investment/investment-tab";
import { PublishTab } from "./publish/publish-tab";

const TABS = [
  { slug: "overview", label: "Overview" },
  { slug: "rooms", label: "Rooms" },
  { slug: "media", label: "Media" },
  { slug: "timeline", label: "Timeline" },
  { slug: "investment", label: "Investment" },
  { slug: "publish", label: "Preview & Publish" },
] as const;

type StylePresetForTabs = { id: string; name: string; isActive?: boolean };

type ProjectForTabs = {
  id: string;
  title: string;
  slug: string;
  status: string;
  subtitle: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  client1First: string | null;
  client1Last: string | null;
  client2First: string | null;
  client2Last: string | null;
  transcriptText: string | null;
  coverHeroImageId: string | null;
  objective: string | null;
  publishedVersion: number;
  stylePresetId: string | null;
  stylePreset: StylePresetForTabs | null;
  rooms: RoomForTabs[];
  media: MediaForTabs[];
  timelinePhases: TimelinePhaseForTabs[];
  investmentLineItems: InvestmentItemForTabs[];
};

type TimelinePhaseForTabs = {
  id: string;
  phase: string;
  durationText: string;
  sortOrder: number;
};

type InvestmentItemForTabs = {
  id: string;
  label: string;
  rangeLow: number | null;
  rangeHigh: number | null;
  notes: string | null;
  sortOrder: number;
};

type RoomForTabs = {
  id: string;
  name: string;
  scopeNarrative: string;
  scopeSource: string | null;
  scopeUpdatedAt: Date | string | null;
  sortOrder: number;
  roomTypeId: string | null;
  roomType: { id: string; name: string } | null;
  stylePresetId: string | null;
  stylePreset: { id: string; name: string } | null;
};
type MediaForTabs = {
  id: string;
  kind: string;
  type: string;
  caption: string | null;
  tags: string[];
  roomId: string | null;
  url: string;
  sortOrder: number;
  room: RoomForTabs | null;
};

export function ProjectTabs({
  project,
  stylePresets,
  currentTab,
}: {
  project: ProjectForTabs;
  stylePresets: StylePresetForTabs[];
  currentTab: string;
}) {
  const base = `/admin/projects/${project.id}`;

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map(({ slug, label }) => {
          const href = slug === "overview" ? base : `${base}?tab=${slug}`;
          const isActive = currentTab === slug;
          return (
            <Link
              key={slug}
              href={href}
              className={
                isActive
                  ? "border-b-2 border-zinc-900 px-4 py-3 text-sm font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "px-4 py-3 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="min-h-[200px] rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        {currentTab === "overview" && (
          <OverviewTab
            projectId={project.id}
            project={{
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
              transcriptText: project.transcriptText,
              objective: project.objective,
              coverHeroImageId: project.coverHeroImageId,
              stylePresetId: project.stylePresetId,
              stylePreset: project.stylePreset,
            }}
            stylePresets={stylePresets}
            media={project.media.map((m) => ({
              id: m.id,
              url: m.url,
              kind: m.kind,
              type: m.type,
              caption: m.caption,
            }))}
          />
        )}
        {currentTab === "rooms" && (
          <RoomsTab
            projectId={project.id}
            rooms={project.rooms.map((r) => ({
              id: r.id,
              name: r.name,
              scopeNarrative: r.scopeNarrative,
              scopeSource: r.scopeSource,
              scopeUpdatedAt: r.scopeUpdatedAt,
              sortOrder: r.sortOrder,
              roomTypeId: r.roomTypeId,
              roomType: r.roomType,
              stylePresetId: r.stylePresetId,
              stylePreset: r.stylePreset,
            }))}
            stylePresets={stylePresets}
          />
        )}
        {currentTab === "media" && (
          <MediaTab
            projectId={project.id}
            media={project.media}
            rooms={project.rooms}
            projectStylePresetId={project.stylePresetId}
            stylePresets={stylePresets}
          />
        )}
        {currentTab === "timeline" && (
          <TimelineTab
            projectId={project.id}
            phases={project.timelinePhases.map((p) => ({
              id: p.id,
              phase: p.phase,
              durationText: p.durationText,
              sortOrder: p.sortOrder,
            }))}
          />
        )}
        {currentTab === "investment" && (
          <InvestmentTab
            projectId={project.id}
            items={project.investmentLineItems.map((i) => ({
              id: i.id,
              label: i.label,
              rangeLow: i.rangeLow,
              rangeHigh: i.rangeHigh,
              notes: i.notes,
              sortOrder: i.sortOrder,
            }))}
          />
        )}
        {currentTab === "publish" && (
          <PublishTab
            projectId={project.id}
            slug={project.slug}
            publishedVersion={project.publishedVersion}
          />
        )}
      </div>
    </div>
  );
}
