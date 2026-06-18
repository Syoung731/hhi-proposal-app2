/**
 * Smoke / dry-run for the JobTread template-overlay budget push (Phase 1).
 *
 * Builds the JobTreadBudgetTree for a real project, resolves cost codes against
 * the LIVE JobTread catalog (read-only), assembles the createJob Pave payload,
 * and prints stats + a sample so you can eyeball it. Issues NO JobTread write.
 *
 * The budget-push modules use `import "server-only"`, so this MUST run with the
 * react-server export condition via the tsx ESM loader (otherwise `server-only`
 * throws under tsx's CJS require path):
 *
 *   npx dotenv -e .env.local -- node --conditions=react-server --import tsx \
 *     scripts/smoke/jobtread-budget-push-dryrun.ts [projectId]
 *
 * If no projectId arg is given, auto-picks the project with the most AI estimates.
 */
import { prisma } from "@/app/lib/prisma";
import { buildJobTreadBudgetTree } from "@/app/lib/jobtread/budget-push/merge";
import { createCostCodeResolver } from "@/app/lib/jobtread/budget-push/cost-code-resolver";
import { buildCreateJobPayload } from "@/app/lib/jobtread/budget-push/pave-payload";
import type { CostCodeResolver, JobTreadBudgetTree, JTCostItem } from "@/app/lib/jobtread/budget-push/types";

function hintFromName(name: string): "Material" | "Install" | "Sub" | null {
  const l = name.toLowerCase();
  if (l.endsWith("- material") || l.endsWith("- materials")) return "Material";
  if (l.endsWith("- install") || l.endsWith("- labor")) return "Install";
  if (l.endsWith("- sub") || l.endsWith("- subcontract")) return "Sub";
  return null;
}

function resolveTree(tree: JobTreadBudgetTree, resolver: CostCodeResolver): number {
  let unmatched = 0;
  for (const room of tree.rooms)
    for (const trade of room.trades)
      for (const item of trade.items) {
        const r = resolver.resolve(trade.tradeName, hintFromName(item.name), item.costCodeName, item.costTypeName);
        item.costCodeId = r.costCodeId;
        item.costCodeName = r.costCodeName;
        item.costTypeId = r.costTypeId;
        item.costTypeName = r.costTypeName;
        if (r.costCodeId == null) unmatched += 1;
      }
  return unmatched;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

async function pickProjectId(): Promise<string | null> {
  const arg = process.argv[2];
  if (arg && arg.trim()) return arg.trim();
  const grouped = await prisma.aIEstimate.groupBy({
    by: ["projectId"],
    _count: { _all: true },
    orderBy: { _count: { projectId: "desc" } },
    take: 1,
  });
  return grouped[0]?.projectId ?? null;
}

async function main() {
  const projectId = await pickProjectId();
  if (!projectId) {
    console.error("No project with AI estimates found. Pass a projectId arg.");
    process.exit(1);
  }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { title: true } });
  console.log(`\n=== JobTread budget-push DRY RUN ===`);
  console.log(`Project: ${project?.title ?? "(unknown)"}  (${projectId})\n`);

  // 1. The pure template-overlay merge (no JobTread calls).
  const tree = await buildJobTreadBudgetTree(projectId);

  let scaffold = 0, est = 0, extra = 0, total = 0;
  for (const room of tree.rooms)
    for (const trade of room.trades)
      for (const item of trade.items) {
        total += 1;
        if (item.lineSource === "TEMPLATE_SCAFFOLD") scaffold += 1;
        else if (item.lineSource === "ESTIMATE") est += 1;
        else extra += 1;
      }

  console.log(`Rooms pushed: ${tree.rooms.length}`);
  console.log(`Line items:   ${total}  (template-scaffold qty0: ${scaffold} | estimate: ${est} | extra: ${extra})`);
  if (tree.roomsWithoutTemplate.length)
    console.log(`Rooms w/o template (estimate-only): ${tree.roomsWithoutTemplate.join(", ")}`);
  if (tree.roomsWithoutEstimate.length)
    console.log(`Rooms skipped (no estimate): ${tree.roomsWithoutEstimate.join(", ")}`);

  // 2. Sample: first room, show trades + a few items proving scaffold(0) + overlay.
  const sampleRoom = tree.rooms.find((r) => !r.isProjectOverhead) ?? tree.rooms[0];
  if (sampleRoom) {
    console.log(`\n--- Sample room: "${sampleRoom.roomName}" (${sampleRoom.trades.length} trades) ---`);
    for (const trade of sampleRoom.trades.slice(0, 4)) {
      console.log(`  ${trade.tradeName}  [${trade.items.length} items]`);
      for (const it of trade.items.slice(0, 4)) {
        const tag = it.lineSource === "TEMPLATE_SCAFFOLD" ? "scaffold" : it.lineSource.toLowerCase();
        console.log(`    - ${it.name}  qty=${fmt(it.quantity)} @ $${fmt(it.unitPrice)}  [${tag}]`);
      }
      if (trade.items.length > 4) console.log(`    … +${trade.items.length - 4} more`);
    }
  }

  // 3. Live cost-code resolution + payload (read-only JobTread). Optional —
  //    if creds/connectivity fail, the merge demo above still stands.
  try {
    const resolver = await createCostCodeResolver();
    const unmatched = resolveTree(tree, resolver);
    const payload = buildCreateJobPayload(tree, {
      locationId: "DRY_RUN_LOCATION_ID",
      name: project?.title ?? "Dry Run",
      jobStageValue: "Design Contract",
      resolver,
    });
    console.log(`\n--- Cost-code resolution (live JobTread, read-only) ---`);
    console.log(`Unmatched cost codes: ${unmatched} / ${total}`);
    const sampleItems: JTCostItem[] = [];
    for (const room of tree.rooms)
      for (const trade of room.trades)
        for (const item of trade.items) if (sampleItems.length < 6) sampleItems.push(item);
    for (const it of sampleItems)
      console.log(`    ${it.name}  ->  ${it.costCodeName ?? "(none)"} / ${it.costTypeName ?? "(none)"}`);
    const createJob = (payload as Record<string, unknown>).createJob as Record<string, unknown> | undefined;
    const dollars = (payload as Record<string, unknown>).__lineItemCount;
    console.log(`\n--- Pave payload ---`);
    console.log(`Top-level op: ${createJob ? "createJob" : "(unexpected)"}  | lineItemCount: ${String(dollars)}`);
  } catch (e) {
    console.log(`\n[cost-code/payload step skipped] ${e instanceof Error ? e.message : String(e)}`);
  }

  console.log(`\n=== DRY RUN complete — no JobTread writes issued ===\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
