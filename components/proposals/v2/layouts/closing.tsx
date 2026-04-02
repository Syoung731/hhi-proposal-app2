import { ProposalClosing } from "../ProposalClosing";
import { tokens } from "../tokens";
import type { ProposalLayoutProps } from "./types";

/** closing.simple — statement + contact, no image. */
export function ClosingSimple({ sectionProps }: ProposalLayoutProps) {
  const c = sectionProps.closing;
  return (
    <footer className="pt-4">
      {c.statement && (
        <p className={`text-lg ${tokens.mutedStrong} leading-relaxed max-w-2xl`}>
          {c.statement}
        </p>
      )}
      {c.contact && (c.contact.companyName || c.contact.phone || c.contact.email || c.contact.website) && (
        <div className={`mt-10 pt-10 border-t border-zinc-200/80 dark:border-zinc-700/80 ${tokens.section.block}`}>
          {c.contact.companyName && (
            <p className={`font-medium ${tokens.accent.text}`}>{c.contact.companyName}</p>
          )}
          <div className={`flex flex-wrap gap-x-6 gap-y-1 text-sm ${tokens.muted}`}>
            {c.contact.phone && <span>{c.contact.phone}</span>}
            {c.contact.email && <span>{c.contact.email}</span>}
            {c.contact.website && <span>{c.contact.website}</span>}
          </div>
        </div>
      )}
    </footer>
  );
}

/** closing.image-driven — image first, then statement and contact. */
export function ClosingImageDriven({ sectionProps }: ProposalLayoutProps) {
  return <ProposalClosing imageUrl={sectionProps.closing.imageUrl} imageAlt={sectionProps.closing.imageAlt} statement={sectionProps.closing.statement} contact={sectionProps.closing.contact} />;
}
