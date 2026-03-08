"use client";

import Link from "next/link";
import type { ProjectForTabs } from "./page";
import { MediaTab } from "./media/media-tab";
import { OverviewTab } from "./overview/overview-tab";
import { RoomsTab } from "./rooms/rooms-tab";
import { TimelineTab } from "./timeline/timeline-tab";
import { InvestmentTab } from "./investment/investment-tab";
import { PublishTab } from "./publish/publish-tab";

/** Build full address string from project Overview fields for Zillow search. */
function buildProjectAddress(project: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string | null {
  const parts = [
    project.addressLine1?.trim(),
    project.addressLine2?.trim(),
    project.city?.trim(),
    [project.state?.trim(), project.zip?.trim()].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

const TABS: { slug: string; label: string; hrefOnly?: boolean }[] = [
  { slug: "overview", label: "Overview" },
  { slug: "rooms", label: "Sections" },
  { slug: "media", label: "Media" },
  { slug: "timeline", label: "Timeline" },
  { slug: "investment", label: "Investment" },
  { slug: "presentation", label: "Presentation", hrefOnly: true },
  { slug: "publish", label: "Preview & Publish" },
];

type StylePresetForTabs = { id: string; name: string; isActive?: boolean };
type SectionTypeForTabs = { id: string; name: string; category: string; defaultMeasurementMode: string; defaultEstimateUnit: string; customUnitLabel: string | null };

export function ProjectTabs({
  project,
  stylePresets,
  sectionTypes,
  currentTab,
  roomTypeLowPct,
  roomTypeHighPct,
  initialMediaRoomId,
  children,
}: {
  project: ProjectForTabs;
  stylePresets: StylePresetForTabs[];
  sectionTypes: SectionTypeForTabs[];
  currentTab: string;
  roomTypeLowPct?: number;
  roomTypeHighPct?: number;
  /** When opening Media tab via URL ?tab=media&roomId=..., preselect this room. */
  initialMediaRoomId?: string;
  children?: React.ReactNode;
}) {
  const base = `/admin/projects/${project.id}`;

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map(({ slug, label, hrefOnly }) => {
          const href = hrefOnly
            ? `${base}/${slug}`
            : slug === "overview"
              ? base
              : `${base}?tab=${slug}`;
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
      <div className={`min-h-[200px] rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${currentTab === "presentation" && children ? "p-0" : "p-8"}`}>
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
            }}
          />
        )}
        {currentTab === "rooms" && (
          <RoomsTab
            projectId={project.id}
            projectStylePresetId={project.stylePresetId}
            roomTypeLowPct={roomTypeLowPct ?? -10}
            roomTypeHighPct={roomTypeHighPct ?? 10}
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
              estPricePerSqFt: r.estPricePerSqFt ?? null,
              lengthIn: r.lengthIn ?? null,
              widthIn: r.widthIn ?? null,
              ceilingHeightIn: r.ceilingHeightIn ?? null,
              sectionTypeId: r.sectionTypeId ?? null,
              sectionType: r.sectionType,
              measurementMode: r.measurementMode ?? null,
              areaSqFt: r.areaSqFt ?? null,
              quantity: r.quantity ?? null,
              origin: r.origin,
              estimateUnit: r.estimateUnit ?? null,
              customUnitLabel: r.customUnitLabel ?? null,
              unitQuantity: r.unitQuantity ?? null,
              unitQuantityManualOverride: r.unitQuantityManualOverride ?? false,
              bucket: r.bucket,
              totalLow: r.totalLow ?? null,
              totalTarget: r.totalTarget ?? null,
              totalHigh: r.totalHigh ?? null,
              unitRateLow: r.unitRateLow ?? null,
              unitRateTarget: r.unitRateTarget ?? null,
              unitRateHigh: r.unitRateHigh ?? null,
            }))}
            stylePresets={stylePresets}
            sectionTypes={sectionTypes}
          />
        )}
        {currentTab === "media" && (
          <MediaTab
            projectId={project.id}
            media={project.media}
            rooms={project.rooms.map((r) => ({
              id: r.id,
              name: r.name,
              sortOrder: r.sortOrder,
              selectedRenderMediaId: r.selectedRenderMediaId,
              scopeNarrative: r.scopeNarrative,
            }))}
            projectStylePreset={project.stylePreset}
            coverHeroImageId={project.coverHeroImageId}
            initialRoomId={initialMediaRoomId}
            projectAddress={buildProjectAddress(project)}
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
            sections={project.rooms.map((r) => ({
              id: r.id,
              name: r.name,
              sortOrder: r.sortOrder,
              bucket: r.bucket,
              sectionTypeName: r.sectionType?.name ?? "Unassigned",
              category: r.sectionType?.category ?? null,
              totalLow: r.totalLow ?? null,
              totalTarget: r.totalTarget ?? null,
              totalHigh: r.totalHigh ?? null,
            }))}
            items={project.investmentLineItems.map((i) => ({
              id: i.id,
              bucket: i.bucket,
              label: i.label,
              rangeLow: i.rangeLow,
              rangeTarget: i.rangeTarget,
              rangeHigh: i.rangeHigh,
              notes: i.notes,
              overrideLow: i.overrideLow,
              overrideTarget: i.overrideTarget,
              overrideHigh: i.overrideHigh,
              overrideNotes: i.overrideNotes,
              isOverride: i.isOverride,
              includeInTotals: i.includeInTotals,
              sortOrder: i.sortOrder,
            }))}
          />
        )}
        {currentTab === "publish" && (
          <PublishTab
            projectId={project.id}
            proposalId={project.proposal?.id ?? null}
            publishedVersion={project.publishedVersion}
          />
        )}
        {currentTab === "presentation" && children}
      </div>
    </div>
  );
}
