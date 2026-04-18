"use client";

import type { ProjectForTabs } from "./page";
import { MediaTab } from "./media/media-tab";
import { OverviewTab } from "./overview/overview-tab";
import { RoomsTab } from "./rooms/rooms-tab";
import { TimelineTab } from "./timeline/timeline-tab";
import { InvestmentTab } from "./investment/investment-tab";
import { PublishTab } from "./publish/publish-tab";
import { RendrTab } from "./rendr/rendr-tab";
import { ProjectTabNav } from "./ProjectTabNav";

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
  rendrConfigured,
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
  /** Whether Rendr integration is configured — controls tab visibility. */
  rendrConfigured?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <ProjectTabNav
        projectId={project.id}
        currentTab={currentTab}
        rendrConfigured={rendrConfigured}
      />
      <div className={`min-h-[200px] rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${(currentTab === "presentation" && children) || currentTab === "rendr" ? "p-0 overflow-hidden" : "p-8"}`}>
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
              supportingText: project.supportingText,
              bullets: project.bullets,
              scopeOverview: project.scopeOverview,
              coverHeroImageId: project.coverHeroImageId,
            }}
          />
        )}
        {currentTab === "rooms" && (
          <RoomsTab
            projectId={project.id}
            projectStylePresetId={project.stylePresetId}
            defaultCeilingHeightFt={project.defaultCeilingHeightFt ?? 9}
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
              pricingTier: r.pricingTier,
              isProjectOverhead: r.isProjectOverhead,
              totalLow: r.totalLow ?? null,
              totalTarget: r.totalTarget ?? null,
              totalHigh: r.totalHigh ?? null,
              unitRateLow: r.unitRateLow ?? null,
              unitRateTarget: r.unitRateTarget ?? null,
              unitRateHigh: r.unitRateHigh ?? null,
              scopeQA: r.scopeQA ?? null,
              estimateStaleReason: r.estimateStaleReason ?? null,
              roomTemplateId: r.roomTemplateId ?? null,
              wallsSF: r.wallsSF ?? null,
              ceilingSF: r.ceilingSF ?? null,
              perimeterLF: r.perimeterLF ?? null,
              paintableSF: r.paintableSF ?? null,
              windowCount: r.windowCount ?? null,
              windowsSF: r.windowsSF ?? null,
              doorCount: r.doorCount ?? null,
              doorsSF: r.doorsSF ?? null,
              measurementSource: r.measurementSource ?? null,
              rendrCeilingHeightFt: r.rendrCeilingHeightFt ?? null,
              rendrRoomMappings: r.rendrRoomMappings as { index: number; label: string }[] | null,
              roomDetail: r.roomDetail as Record<string, unknown> | null,
              subAreas: (r.subAreas ?? []).map((sa) => ({
                id: sa.id,
                name: sa.name,
                lengthIn: sa.lengthIn ?? null,
                widthIn: sa.widthIn ?? null,
                ceilingHeightIn: sa.ceilingHeightIn ?? null,
                areaSqFt: sa.areaSqFt ?? null,
                sortOrder: sa.sortOrder,
                includeInArea: sa.includeInArea ?? true,
              })),
            }))}
            projectQA={project.projectQA ?? null}
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
            rendrSpaceId={project.rendrSpaceId ?? null}
          />
        )}
        {currentTab === "timeline" && (
          <TimelineTab
            projectId={project.id}
            phases={project.timelinePhases.map((p) => ({
              id: p.id,
              phase: p.phase,
              nameOverride: p.nameOverride,
              descriptionOverride: p.descriptionOverride,
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
            retainer={{
              enabled: project.retainerEnabled,
              percent: project.retainerPercent,
              roundTo: project.retainerRoundTo,
              override: project.retainerOverride,
            }}
          />
        )}
        {currentTab === "rendr" && rendrConfigured && (
          <RendrTab
            projectId={project.id}
            rendrSpaceId={project.rendrSpaceId ?? null}
            rendrProjectId={project.rendrProjectId ?? null}
            rendrImportedAt={project.rendrImportedAt?.toISOString() ?? null}
            rooms={project.rooms.map((r) => ({ id: r.id, name: r.name }))}
            sectionTypes={sectionTypes.map((st) => ({ id: st.id, name: st.name, category: st.category }))}
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
