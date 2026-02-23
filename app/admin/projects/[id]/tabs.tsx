"use client";

import Link from "next/link";
import { MediaTab } from "./media/media-tab";
import { OverviewTab } from "./overview/overview-tab";
import { RoomsTab } from "./rooms/rooms-tab";
import { TimelineTab } from "./timeline/timeline-tab";
import { InvestmentTab } from "./investment/investment-tab";

const TABS = [
  { slug: "overview", label: "Overview" },
  { slug: "rooms", label: "Rooms" },
  { slug: "media", label: "Media" },
  { slug: "timeline", label: "Timeline" },
  { slug: "investment", label: "Investment" },
  { slug: "publish", label: "Preview & Publish" },
] as const;

type ProjectForTabs = {
  id: string;
  title: string;
  slug: string;
  status: string;
  subtitle: string | null;
  address: string | null;
  clientNames: string | null;
  coverHeroImageId: string | null;
  objective: string | null;
  publishedVersion: number;
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
  roomType: string;
  roomLabel: string | null;
  scopeNarrative: string;
  sortOrder: number;
};
type MediaForTabs = {
  id: string;
  kind: string;
  caption: string | null;
  tags: string[];
  roomId: string | null;
  url: string;
  room: RoomForTabs | null;
};

export function ProjectTabs({
  project,
  currentTab,
}: {
  project: ProjectForTabs;
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
      <div className="min-h-[200px] rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        {currentTab === "overview" && (
          <OverviewTab
            projectId={project.id}
            project={{
              title: project.title,
              subtitle: project.subtitle,
              address: project.address,
              clientNames: project.clientNames,
              objective: project.objective,
              coverHeroImageId: project.coverHeroImageId,
            }}
            media={project.media.map((m) => ({
              id: m.id,
              url: m.url,
              kind: m.kind,
              caption: m.caption,
            }))}
          />
        )}
        {currentTab === "rooms" && (
          <RoomsTab
            projectId={project.id}
            rooms={project.rooms.map((r) => ({
              id: r.id,
              roomType: r.roomType,
              roomLabel: r.roomLabel,
              scopeNarrative: r.scopeNarrative,
              sortOrder: r.sortOrder,
            }))}
          />
        )}
        {currentTab === "media" && (
          <MediaTab
            projectId={project.id}
            media={project.media}
            rooms={project.rooms}
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
          <p className="text-zinc-600 dark:text-zinc-400">
            Preview & Publish: confirm dialog, create snapshot. (Phase 5.)
          </p>
        )}
      </div>
    </div>
  );
}
