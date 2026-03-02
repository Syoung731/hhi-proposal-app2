import { notFound } from "next/navigation";
import { getPublicProposalSnapshot } from "@/app/lib/public-proposal";
import { getLayoutConfig } from "@/app/lib/layout-config";
import { EditorialSectionHeading } from "@/components/public/blocks";

const TRUST_CARDS = [
  {
    id: "change-order",
    title: "Zero Change Order Guarantee",
    body: "We commit to a fixed scope and transparent process. Unforeseen conditions are communicated upfront—no surprise change orders.",
    icon: (
      <svg className="h-7 w-7 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    id: "no-markup",
    title: "Zero Mark-up on Materials",
    body: "We pass through material costs at cost. You see exactly what we pay—no hidden margins on fixtures, finishes, or supplies.",
    icon: (
      <svg className="h-7 w-7 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
  {
    id: "design",
    title: "Construction-Led Design",
    body: "Design and build under one roof. We align feasibility, sequencing, and budget early so the plan is buildable from day one.",
    icon: (
      <svg className="h-7 w-7 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  {
    id: "visibility",
    title: "Realtime Project Visibility",
    body: "Stay informed without the guesswork. Schedules, updates, and documents in one place so you always know where things stand.",
    icon: (
      <svg className="h-7 w-7 text-zinc-600 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
  },
] as const;

export default async function DifferencePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const cfg = getLayoutConfig(data.publicLayoutConfig);
  const variant = cfg.pages.whyUs.variant;

  if (variant === "iconRows") {
    return (
      <article className="space-y-12 pt-8 sm:pt-12">
        <EditorialSectionHeading
          kicker="Why us"
          title="Why HHI Builders"
          accentRule
        />
        <div className="space-y-1 divide-y divide-zinc-200/80 dark:divide-zinc-700/80">
          {TRUST_CARDS.map((card) => (
            <div
              key={card.id}
              className="flex flex-col gap-4 py-10 sm:flex-row sm:items-start sm:gap-10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800">
                {card.icon}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {card.title}
                </h3>
                <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {card.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </article>
    );
  }

  return (
    <article className="space-y-12 pt-8 sm:pt-12">
      <EditorialSectionHeading
        kicker="Why us"
        title="Why HHI Builders"
        accentRule
      />
      <div className="grid gap-12 sm:grid-cols-2 sm:gap-x-10 sm:gap-y-14">
        {TRUST_CARDS.map((card) => (
          <div
            key={card.id}
            className="flex flex-col gap-4 rounded-2xl bg-white p-10 shadow-sm dark:bg-zinc-900/50 dark:shadow-none"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-50 dark:bg-zinc-800">
              {card.icon}
            </div>
            <h3 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {card.title}
            </h3>
            <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
