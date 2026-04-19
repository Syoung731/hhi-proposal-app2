"use client";

type EditorialSectionHeadingProps = {
  /** Small caps label above the title (e.g. "Overview", "Scope") */
  kicker?: string | null;
  /** Main heading text (H2 for section semantics) */
  title: React.ReactNode;
  /** Optional subcopy below the title */
  subcopy?: React.ReactNode | null;
  /** Show a thin rule accent below the heading block */
  accentRule?: boolean;
  /** Optional extra class for the section wrapper */
  className?: string;
};

const ruleClass =
  "h-px w-12 bg-zinc-300 dark:bg-zinc-600";

export function EditorialSectionHeading({
  kicker,
  title,
  subcopy,
  accentRule = false,
  className = "",
}: EditorialSectionHeadingProps) {
  return (
    <header className={`space-y-3 ${className}`}>
      {kicker && (
        <div className="flex items-center gap-3">
          <span className={ruleClass} aria-hidden />
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            {kicker}
          </span>
        </div>
      )}
      <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
        {title}
      </h2>
      {subcopy != null && subcopy !== "" && (
        <p className="max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          {subcopy}
        </p>
      )}
      {accentRule && (
        <div
          className="h-px w-16 bg-zinc-200 dark:bg-zinc-600"
          aria-hidden
        />
      )}
    </header>
  );
}
