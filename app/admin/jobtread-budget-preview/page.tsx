import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { runBudgetPushDryRun } from "@/app/lib/jobtread/budget-push/dry-run";
import type { JTCostItem, JTRoomGroup } from "@/app/lib/jobtread/budget-push/types";

export const dynamic = "force-dynamic";

const NAVY = "#1A2332";
const ORANGE = "#F47216";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
function num(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function sourceBadge(source: JTCostItem["lineSource"]) {
  const map: Record<JTCostItem["lineSource"], { label: string; cls: string }> = {
    TEMPLATE_SCAFFOLD: { label: "scaffold", cls: "bg-gray-100 text-gray-500" },
    ESTIMATE: { label: "estimate", cls: "bg-emerald-100 text-emerald-700" },
    EXTRA: { label: "extra", cls: "bg-amber-100 text-amber-800" },
  };
  const { label, cls } = map[source];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>;
}

function roomSubtotal(room: JTRoomGroup): number {
  let t = 0;
  for (const trade of room.trades) for (const it of trade.items) t += it.quantity * it.unitPrice;
  return t;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#FAF7F2", minHeight: "100vh" }} className="px-6 py-8">
      <div className="mx-auto max-w-5xl">{children}</div>
    </div>
  );
}

export default async function JobTreadBudgetPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  await requireAdmin();
  const { projectId } = await searchParams;

  if (!projectId) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold" style={{ color: NAVY }}>JobTread Budget — Dry-Run Preview</h1>
        <p className="mt-3 text-sm text-gray-600">
          Add <code className="rounded bg-gray-100 px-1">?projectId=&lt;id&gt;</code> to the URL to preview the
          budget that would be pushed to JobTread. Nothing is written.
        </p>
      </Shell>
    );
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, title: true } });
  if (!project) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold" style={{ color: NAVY }}>Project not found</h1>
        <p className="mt-3 text-sm text-gray-600">No project with id <code className="rounded bg-gray-100 px-1">{projectId}</code>.</p>
      </Shell>
    );
  }

  const { tree, payload, stats, warnings } = await runBudgetPushDryRun(project.id, project.title);
  const grandTotal = tree.rooms.reduce((s, r) => s + roomSubtotal(r), 0);

  const statCards: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: "Rooms", value: num(stats.roomCount) },
    { label: "Line items", value: num(stats.lineItemCount) },
    { label: "Template scaffold (qty 0)", value: num(stats.templateScaffoldCount) },
    { label: "Estimate", value: num(stats.estimateCount) },
    { label: "Extra", value: num(stats.extraCount) },
    { label: "Unmatched cost codes", value: num(stats.unmatchedCostCodeCount), accent: stats.unmatchedCostCodeCount > 0 },
  ];

  return (
    <Shell>
      <div className="flex items-baseline justify-between border-b-2 pb-3" style={{ borderColor: ORANGE }}>
        <h1 className="text-2xl font-semibold" style={{ color: NAVY }}>{project.title}</h1>
        <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500">DRY RUN · no writes</span>
      </div>

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-xl font-bold" style={{ color: c.accent ? "#DC2626" : NAVY }}>{c.value}</div>
            <div className="mt-0.5 text-[11px] leading-tight text-gray-500">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-sm text-gray-600">
        Budget target total: <span className="font-semibold" style={{ color: NAVY }}>{money(grandTotal)}</span>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900">Warnings ({warnings.length})</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
            {warnings.map((w, i) => (<li key={i}>{w}</li>))}
          </ul>
        </div>
      )}

      {/* Rooms */}
      <div className="mt-6 space-y-3">
        {tree.rooms.map((room) => {
          let s = 0, e = 0, x = 0;
          for (const trade of room.trades) for (const it of trade.items) {
            if (it.lineSource === "TEMPLATE_SCAFFOLD") s++; else if (it.lineSource === "ESTIMATE") e++; else x++;
          }
          return (
            <details key={room.roomId} className="rounded-lg border border-gray-200 bg-white" open={false}>
              <summary className="cursor-pointer list-none px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold" style={{ color: NAVY }}>
                    {room.roomName}
                    {room.isProjectOverhead && <span className="ml-2 text-xs font-normal text-gray-400">(COPE)</span>}
                    {!room.hasTemplate && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">no template</span>}
                  </span>
                  <span className="text-xs text-gray-500">
                    {room.sectionCategory ?? "—"} · {s} scaffold / {e} estimate / {x} extra · {money(roomSubtotal(room))}
                  </span>
                </div>
              </summary>
              <div className="border-t border-gray-100 px-4 py-3">
                {room.trades.map((trade, ti) => (
                  <div key={ti} className="mb-4 last:mb-0">
                    <div className="mb-1 text-sm font-semibold text-gray-700">{trade.tradeName}</div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-gray-400">
                          <th className="py-1 pr-2 font-medium">Item</th>
                          <th className="py-1 pr-2 font-medium">Src</th>
                          <th className="py-1 pr-2 text-right font-medium">Qty</th>
                          <th className="py-1 pr-2 font-medium">Unit</th>
                          <th className="py-1 pr-2 text-right font-medium">Unit $</th>
                          <th className="py-1 pr-2 text-right font-medium">Total $</th>
                          <th className="py-1 font-medium">Cost code / type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trade.items.map((it, ii) => (
                          <tr key={ii} className="border-t border-gray-50">
                            <td className="py-1 pr-2 text-gray-800">{it.name}</td>
                            <td className="py-1 pr-2">{sourceBadge(it.lineSource)}</td>
                            <td className="py-1 pr-2 text-right tabular-nums text-gray-700">{num(it.quantity)}</td>
                            <td className="py-1 pr-2 text-gray-500">{it.unit}</td>
                            <td className="py-1 pr-2 text-right tabular-nums text-gray-700">{money(it.unitPrice)}</td>
                            <td className="py-1 pr-2 text-right tabular-nums text-gray-800">{money(it.quantity * it.unitPrice)}</td>
                            <td className={`py-1 ${it.costCodeId ? "text-gray-500" : "font-semibold text-red-600"}`}>
                              {it.costCodeName ? `${it.costCodeName}${it.costTypeName ? ` · ${it.costTypeName}` : ""}` : "UNMATCHED"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      {/* Raw payload (collapsed) */}
      <details className="mt-6 rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-600">Raw Pave payload (createJob)</summary>
        <pre className="overflow-x-auto border-t border-gray-100 p-4 text-[11px] leading-snug text-gray-700">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </Shell>
  );
}
