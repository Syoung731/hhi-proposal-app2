import { tokens } from "./tokens";

export type InvestmentLineItem = {
  id: string;
  label: string;
  rangeDisplay: string;
  notes?: string | null;
  includeInTotals?: boolean;
};

export type ProposalInvestmentProps = {
  title?: string;
  lineItems: readonly InvestmentLineItem[];
  totalRange?: string | null;
  retainerAmount?: string | null;
  retainerNote?: string | null;
};

export function ProposalInvestment({
  title = "Investment",
  lineItems,
  totalRange,
  retainerAmount,
  retainerNote,
}: ProposalInvestmentProps) {
  const showTable = lineItems.length > 0;

  return (
    <section>
      <h2 className={tokens.heading.h2}>{title}</h2>
      <div className={`mt-8 ${tokens.section.block}`}>
        {showTable && (
          <div
            className={`overflow-hidden ${tokens.radius.card} ${tokens.border.default}`}
          >
            <table className="w-full text-left text-sm">
              <thead className={tokens.accent.bg}>
                <tr>
                  <th className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    Item
                  </th>
                  <th className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    Range
                  </th>
                  <th className="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100 hidden sm:table-cell">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-zinc-200/80 dark:border-zinc-700/80"
                  >
                    <td className="px-5 py-3 text-zinc-900 dark:text-zinc-100">
                      {item.label}
                    </td>
                    <td className="px-5 py-3 text-zinc-700 dark:text-zinc-300">
                      {item.rangeDisplay}
                    </td>
                    <td className="px-5 py-3 text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                      {item.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalRange && (
          <div
            className={`${tokens.card} text-center border-2 ${tokens.accent.border}`}
          >
            <p className={`text-sm ${tokens.muted}`}>Estimated total range</p>
            <p className="mt-1 text-2xl md:text-3xl font-semibold text-zinc-900 dark:text-zinc-100">
              {totalRange}
            </p>
          </div>
        )}

        {(retainerAmount || retainerNote) && (
          <div className={tokens.cardSoft}>
            {retainerAmount && (
              <p className={`font-medium ${tokens.accent.text}`}>
                Retainer: {retainerAmount}
              </p>
            )}
            {retainerNote && (
              <p className={`text-sm ${tokens.muted} mt-1`}>{retainerNote}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
