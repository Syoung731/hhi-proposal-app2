import { tokens } from "./tokens";

export type GuaranteeItem = {
  id: string;
  title: string;
  description: string;
  /** Optional icon name or component; we keep it minimal per requirements */
  icon?: React.ReactNode;
};

export type ProposalGuaranteesProps = {
  title?: string;
  items: readonly GuaranteeItem[];
};

export function ProposalGuarantees({
  title = "Our Guarantees",
  items,
}: ProposalGuaranteesProps) {
  if (!items.length) return null;

  const slice = items.slice(0, 4);

  return (
    <section>
      <h2 className={tokens.heading.h2}>{title}</h2>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {slice.map((item) => (
          <div
            key={item.id}
            className={`${tokens.card} flex flex-col min-h-[180px] md:min-h-[200px]`}
          >
            {item.icon && (
              <div className="mb-3 text-zinc-500 dark:text-zinc-400">
                {item.icon}
              </div>
            )}
            <h3 className={tokens.heading.h4}>{item.title}</h3>
            <p
              className={`mt-2 text-sm ${tokens.mutedStrong} leading-relaxed flex-1`}
            >
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
