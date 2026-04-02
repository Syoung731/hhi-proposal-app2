import { tokens } from "./tokens";

/**
 * Page wrapper for proposal v2: consistent max width, spacing, section rhythm.
 * Print-safe: no sticky UI inside main content.
 */
export function ProposalViewV2Layout({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={`${tokens.container} ${tokens.section.inner} py-12 md:py-16 lg:py-20 print:py-8 ${tokens.section.gap} ${className}`}
      role="document"
    >
      {children}
    </main>
  );
}
