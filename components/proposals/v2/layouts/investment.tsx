import { ProposalInvestment } from "../ProposalInvestment";
import { tokens } from "../tokens";
import type { ProposalLayoutProps } from "./types";

/** investment.table-callout — table + total range callout + retainer. */
export function InvestmentTableCallout({ page, sectionProps }: ProposalLayoutProps) {
  const i = sectionProps.investment;
  return (
    <ProposalInvestment
      title={page.title ?? i.title}
      lineItems={i.lineItems}
      totalRange={i.totalRange}
      retainerAmount={i.retainerAmount}
      retainerNote={i.retainerNote}
    />
  );
}

/** investment.range-cards — each line item as a card. */
export function InvestmentRangeCards({ page, sectionProps }: ProposalLayoutProps) {
  const i = sectionProps.investment;
  const title = page.title ?? i.title;
  return (
    <section>
      <h2 className={tokens.heading.h2}>{title}</h2>
      <div className="mt-8 space-y-4">
        {i.lineItems.map((item) => (
          <div key={item.id} className={tokens.cardSoft}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={`font-medium ${tokens.accent.text}`}>{item.label}</p>
              <p className={`text-sm ${tokens.mutedStrong}`}>{item.rangeDisplay}</p>
            </div>
            {item.notes && (
              <p className={`text-sm ${tokens.muted} mt-1`}>{item.notes}</p>
            )}
          </div>
        ))}
        {i.totalRange && (
          <div className={`${tokens.card} border-2 ${tokens.accent.border} text-center mt-6`}>
            <p className={`text-sm ${tokens.muted}`}>Estimated total</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              {i.totalRange}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
