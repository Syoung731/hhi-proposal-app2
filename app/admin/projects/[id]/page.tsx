import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { listActiveStylePresets, listSectionTypes, getOrCreateCompanySettings } from "@/app/admin/settings/actions";
import { recomputeInvestmentRollups } from "@/app/lib/investment-rollup";
import { isRendrConfigured } from "@/app/lib/rendr/rendrClient";
import { ProjectTabs } from "./tabs";

const TAB = "tab";

export async function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      proposal: { select: { id: true } },
      stylePreset: { select: { id: true, name: true } },
      rooms: {
        orderBy: { sortOrder: "asc" },
        include: {
          roomType: { select: { id: true, name: true, pricePerSqFtLow: true, pricePerSqFtTarget: true, pricePerSqFtHigh: true } },
          stylePreset: { select: { id: true, name: true } },
          sectionType: { select: { id: true, name: true, category: true, defaultMeasurementMode: true, defaultEstimateUnit: true, customUnitLabel: true, pricingBasis: true, priceLow: true, priceTarget: true, priceHigh: true } },
          subAreas: { orderBy: { sortOrder: "asc" } },
        },
      },
      media: {
        orderBy: { sortOrder: "asc" },
        // All Media scalars (id, url, renderStatus, etc.) are returned for Media tab
        include: {
          room: {
            include: {
              roomType: { select: { id: true, name: true } },
              stylePreset: { select: { id: true, name: true } },
            },
          },
        },
      },
      timelinePhases: { orderBy: { sortOrder: "asc" } },
      investmentLineItems: { orderBy: { sortOrder: "asc" } },
    },
  });
}

/** Derived from getProject so it stays in sync with the query. */
export type ProjectForTabs = NonNullable<Awaited<ReturnType<typeof getProject>>>;

export default async function AdminProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (typeof sp[TAB] === "string" ? sp[TAB] : undefined) || "overview";
  const roomIdFromUrl = typeof sp.roomId === "string" ? sp.roomId : undefined;

  // recomputeInvestmentRollups runs in parallel with non-project lookups so the
  // investmentLineItems returned by getProject always reflect the latest SectionType
  // rates — even for rooms whose totalLow/totalHigh was never written (stale rows
  // set via updateRoomsSectionType before Fix A).
  const [project, stylePresets, sectionTypes, companySettings, rendrConfigured, latestSnapshot] = await Promise.all([
    recomputeInvestmentRollups(id).catch(() => null).then(() => getProject(id)),
    listActiveStylePresets(),
    listSectionTypes(),
    getOrCreateCompanySettings(),
    isRendrConfigured().catch(() => false),
    prisma.publishedSnapshot.findFirst({
      where: { projectId: id },
      orderBy: { version: "desc" },
      select: { id: true, version: true, createdAt: true, sentAt: true },
    }),
  ]);
  if (!project) notFound();
  const roomTypeLowPct = companySettings.roomTypeLowPct ?? -10;
  const roomTypeHighPct = companySettings.roomTypeHighPct ?? 10;
  return (
    <div>
      <div className="sticky top-[112px] z-40 -mx-6 bg-zinc-50 px-6 pb-4 pt-4 dark:bg-zinc-950">
        <div className="mb-4">
          <Link
            href="/admin/projects"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            ← Projects
          </Link>
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {project.title}
          </h1>
        </div>
      </div>
      <ProjectTabs
        project={project}
        stylePresets={stylePresets}
        sectionTypes={sectionTypes ?? []}
        currentTab={tab}
        roomTypeLowPct={roomTypeLowPct}
        roomTypeHighPct={roomTypeHighPct}
        initialMediaRoomId={roomIdFromUrl}
        rendrConfigured={rendrConfigured}
        latestSnapshotId={latestSnapshot?.id ?? null}
        latestSnapshotVersion={latestSnapshot?.version ?? null}
        latestSnapshotCreatedAt={latestSnapshot?.createdAt.toISOString() ?? null}
        latestSnapshotSentAt={latestSnapshot?.sentAt?.toISOString() ?? null}
      />
    </div>
  );
}
