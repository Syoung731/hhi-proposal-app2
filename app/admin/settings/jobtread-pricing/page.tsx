import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { RebuildPricingStagingButton } from "./rebuild-button";
import { SyncJobTreadButton } from "./SyncJobTreadButton";
import { DeveloperToolsPanel } from "./DeveloperToolsPanel";
import { PricingTreeGrid } from "./pricing-tree-grid";
import { logDevError, logDevRouteHealth } from "@/src/lib/dev-context";

export default async function JobTreadPricingSettingsPage() {
  const t0 = Date.now();
  const env = process.env.NODE_ENV === "production" ? "production" : "local";
  const route = "/admin/settings/jobtread-pricing";

  try {
    await requireAdmin();

    const [jobs, sectionTypes] = await Promise.all([
      prisma.pricingSourceJob.findMany({
        orderBy: { jobName: "asc" },
        select: {
          id: true,
          jobId: true,
          jobName: true,
          jobNumber: true,
          includeInPricing: true,
          totalCost: true,
          totalSell: true,
          sourceLastSyncedAt: true,
          rooms: {
            orderBy: { roomName: "asc" },
            include: {
              sectionType: { select: { name: true } },
              trades: { orderBy: { tradeName: "asc" } },
            },
          },
        },
      }),
      prisma.sectionType.findMany({
        orderBy: [{ category: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
    ]);

    const budgetRows =
      jobs.length > 0
        ? await prisma.syncedBudgetRow.findMany({
            where: { jobId: { in: jobs.map((j) => j.jobId) } },
            select: {
              jobId: true,
              externalBudgetItemId: true,
              groupName: true,
              parentCostGroupId: true,
              parentCostGroupName: true,
              itemName: true,
              costType: true,
              costCode: true,
              costCodeName: true,
              extCost: true,
              extSell: true,
            },
          })
        : [];

    let stagedJobs = jobs.length;
    let stagedRooms = 0;
    let stagedTrades = 0;
    let unmappedRooms = 0;
    let missingSqFtRooms = 0;

    for (const job of jobs) {
      stagedRooms += job.rooms.length;
      for (const room of job.rooms) {
        stagedTrades += room.trades.length;
        if (room.sectionTypeId == null) unmappedRooms += 1;
        if (!room.hasValidSqFt) missingSqFtRooms += 1;
      }
    }

  // Group budget rows by (jobId, roomName, tradeName) using same convention as staging
    type RowKey = string;
    const key = (jobId: string, roomName: string, tradeName: string): RowKey =>
      `${jobId}\t${roomName}\t${tradeName}`;
    const rowsByJobRoomTrade = new Map<
      RowKey,
      {
        id: string;
        itemName: string;
        costType: string | null;
        costCode: string | null;
        costCodeName: string | null;
        extCost: number;
        extSell: number;
      }[]
    >();
    for (const row of budgetRows) {
      const jobId = row.jobId;
      const parentId =
        row.parentCostGroupId != null && String(row.parentCostGroupId).trim() !== ""
          ? String(row.parentCostGroupId).trim()
          : null;
      const roomName =
        parentId == null
          ? row.groupName != null && String(row.groupName).trim() !== ""
            ? String(row.groupName).trim()
            : "Ungrouped"
          : row.parentCostGroupName != null && String(row.parentCostGroupName).trim() !== ""
            ? String(row.parentCostGroupName).trim()
            : "Ungrouped";
      const tradeName =
        parentId == null
          ? "(No trade)"
          : row.groupName != null && String(row.groupName).trim() !== ""
            ? String(row.groupName).trim()
            : "(No trade)";
      const k = key(jobId, roomName, tradeName);
      const list = rowsByJobRoomTrade.get(k) ?? [];
      list.push({
        id: row.externalBudgetItemId,
        itemName: String(row.itemName ?? "").trim() || "—",
        costType: row.costType != null ? String(row.costType).trim() : null,
        costCode: row.costCode != null ? String(row.costCode).trim() : null,
        costCodeName: row.costCodeName != null ? String(row.costCodeName).trim() : null,
        extCost: Number(row.extCost) ?? 0,
        extSell: Number(row.extSell) ?? 0,
      });
      rowsByJobRoomTrade.set(k, list);
    }

    const jobsForClient = jobs.map((job) => {
      const rawCost = Number(job.totalCost);
      const rawSell = Number(job.totalSell);
      const hasStoredTotals = rawCost !== 0 || rawSell !== 0;
      const totalCost =
        hasStoredTotals || job.rooms.length === 0
          ? rawCost
          : job.rooms.reduce((sum, r) => sum + Number(r.totalCost), 0);
      const totalSell =
        hasStoredTotals || job.rooms.length === 0
          ? rawSell
          : job.rooms.reduce((sum, r) => sum + Number(r.totalSell), 0);

      return {
        id: job.id,
        jobId: job.jobId,
        jobName: job.jobName,
        jobNumber: job.jobNumber ?? null,
        includeInPricing: job.includeInPricing,
        totalCost,
        totalSell,
        rooms: job.rooms.map((room) => ({
          id: room.id,
          roomName: room.roomName,
          includeInPricing: room.includeInPricing,
          sectionTypeId: room.sectionTypeId,
          sectionType: room.sectionType ? { name: room.sectionType.name } : null,
          normalizedRoomName: room.normalizedRoomName,
          autoDetectedSqFt: room.autoDetectedSqFt ? Number(room.autoDetectedSqFt) : null,
          manualSqFtOverride: room.manualSqFtOverride ? Number(room.manualSqFtOverride) : null,
          totalCost: Number(room.totalCost),
          totalSell: Number(room.totalSell),
          costPerSqFt: room.costPerSqFt ? Number(room.costPerSqFt) : null,
          sellPerSqFt: room.sellPerSqFt ? Number(room.sellPerSqFt) : null,
          sqFtSource: room.sqFtSource,
          hasValidSqFt: room.hasValidSqFt,
          trades: room.trades.map((trade) => {
            const items =
              rowsByJobRoomTrade.get(key(job.jobId, room.roomName, trade.tradeName)) ?? [];
            return {
              id: trade.id,
              tradeName: trade.tradeName,
              totalCost: Number(trade.totalCost),
              totalSell: Number(trade.totalSell),
              items,
            };
          }),
        })),
      };
    });

    const dt = Date.now() - t0;
    await logDevRouteHealth(route, "ok", {
      responseTimeMs: dt,
      notes: `loaded jobtread pricing sheet (jobs=${jobs.length})`,
    });

    return (
      <div className="min-h-[320px] w-full overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 lg:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="min-w-[1200px] w-full">
          <header className="mb-6 border-b border-zinc-200 pb-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                  JobTread Pricing Sheet (Staging)
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Compact Job → Room → Trade tree-grid view for staging-based
                  pricing curation.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SyncJobTreadButton />
                <RebuildPricingStagingButton />
              </div>
            </div>
          </header>

          <div className="mb-4">
            <DeveloperToolsPanel />
          </div>

          <section className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/50">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Jobs Staged
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {stagedJobs}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/50">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Rooms Staged
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {stagedRooms}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/50">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Trades Staged
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {stagedTrades}
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm dark:border-amber-800/50 dark:bg-amber-900/20">
              <div className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Unmapped Rooms
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {unmappedRooms}
              </div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-sm dark:border-red-800/50 dark:bg-red-900/20">
              <div className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-400">
                Rooms Missing Sq Ft
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-red-700 dark:text-red-300">
                {missingSqFtRooms}
              </div>
            </div>
          </section>

          <PricingTreeGrid jobs={jobsForClient} sectionTypes={sectionTypes} />
        </div>
      </div>
    );
  } catch (e) {
    const dt = Date.now() - t0;
    const message = e instanceof Error ? e.message : String(e);
    await logDevError({
      source: "server",
      severity: "error",
      message,
      route,
      component: "JobTreadPricingSettingsPage",
      env,
      stack: e instanceof Error ? e.stack ?? null : null,
    });

    await logDevRouteHealth(route, "error", {
      responseTimeMs: dt,
      notes: "jobtread pricing page load failed",
    });

    throw e;
  }
}
