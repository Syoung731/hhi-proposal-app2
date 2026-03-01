import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { listActiveStylePresets, listSectionTypes } from "@/app/admin/settings/actions";
import { ensureInvestmentLineItemsForBuckets } from "./investment/actions";
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

  if (tab === "investment") {
    await ensureInvestmentLineItemsForBuckets(id);
  }

  const [project, stylePresets, sectionTypes] = await Promise.all([
    getProject(id),
    listActiveStylePresets(),
    listSectionTypes(),
  ]);
  if (!project) notFound();
  return (
    <div>
      <div className="mb-4">
        <Link
          href="/admin/projects"
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Projects
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {project.title}
        </h1>
        <Link
          href={`/admin/projects/${id}/preview`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Preview draft
        </Link>
      </div>
      <ProjectTabs
        project={project}
        stylePresets={stylePresets}
        sectionTypes={sectionTypes ?? []}
        currentTab={tab}
      />
    </div>
  );
}
