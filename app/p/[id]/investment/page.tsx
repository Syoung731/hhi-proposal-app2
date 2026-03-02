import { notFound } from "next/navigation";
import { getPublicProposalSnapshot } from "@/app/lib/public-proposal";
import { formatInvestmentRange } from "@/app/lib/format-investment-range";

function formatMoney(n: number): string {
  return `$${n.toLocaleString()}`;
}

export default async function InvestmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const { investmentLineItems } = data.snapshot;
  const inTotals = investmentLineItems.filter(
    (i) => i.includeInTotals !== false
  );
  const totalLow = inTotals.reduce((s, i) => s + (i.rangeLow ?? 0), 0);
  const totalTarget = inTotals.reduce(
    (s, i) => s + (i.rangeTarget ?? 0),
    0
  );
  const totalHigh = inTotals.reduce((s, i) => s + (i.rangeHigh ?? 0), 0);

  return (
    <article className="space-y-8 pt-16">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Investment
      </h1>
      {investmentLineItems.length > 0 ? (
        <>
          <div className="mt-10 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-5 py-4 font-semibold text-zinc-900 dark:text-zinc-100">
                    Item
                  </th>
                  <th className="px-5 py-4 font-semibold text-zinc-900 dark:text-zinc-100">
                    Range
                  </th>
                  <th className="px-5 py-4 font-semibold text-zinc-900 dark:text-zinc-100">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {investmentLineItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-zinc-200 dark:border-zinc-700"
                  >
                    <td className="px-5 py-4 text-zinc-900 dark:text-zinc-100">
                      {item.label}
                    </td>
                    <td className="px-5 py-4 text-zinc-600 dark:text-zinc-400">
                      {formatInvestmentRange(
                        item.rangeLow,
                        item.rangeTarget,
                        item.rangeHigh
                      )}
                    </td>
                    <td className="px-5 py-4 text-zinc-500 dark:text-zinc-500">
                      {item.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Totals
            </h2>
            <div className="flex flex-wrap gap-6 text-sm">
              <span>
                <span className="text-zinc-500 dark:text-zinc-400">Low: </span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {formatMoney(totalLow)}
                </span>
              </span>
              <span>
                <span className="text-zinc-500 dark:text-zinc-400">Target: </span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {formatMoney(totalTarget)}
                </span>
              </span>
              <span>
                <span className="text-zinc-500 dark:text-zinc-400">High: </span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {formatMoney(totalHigh)}
                </span>
              </span>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-6 text-zinc-500 dark:text-zinc-500">
          No investment line items.
        </p>
      )}
    </article>
  );
}
