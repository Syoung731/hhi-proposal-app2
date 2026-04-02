import Image from "next/image";
import { tokens } from "./tokens";
import { isBadPlaceholderUrl, isAllowedHostForNextImage } from "@/app/lib/media";

export type ProposalClosingProps = {
  /** Optional closing image (e.g. branded or property) */
  imageUrl?: string | null;
  imageAlt?: string;
  statement?: string | null;
  /** Contact block: company name, phone, email, etc. */
  contact?: {
    companyName?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  };
};

export function ProposalClosing({
  imageUrl,
  imageAlt = "Closing",
  statement,
  contact,
}: ProposalClosingProps) {
  const showImage =
    imageUrl &&
    !isBadPlaceholderUrl(imageUrl) &&
    (imageUrl.startsWith("/") || isAllowedHostForNextImage(imageUrl));

  const hasContact =
    contact &&
    (contact.companyName || contact.phone || contact.email || contact.website);

  return (
    <footer className="pt-4">
      {showImage && (
        <div
          className={`relative w-full overflow-hidden ${tokens.radius.image} bg-zinc-100 dark:bg-zinc-800 mb-10`}
          style={{ aspectRatio: "3/1" }}
        >
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 1024px"
          />
        </div>
      )}

      {statement && (
        <p
          className={`text-lg md:text-xl ${tokens.mutedStrong} leading-relaxed max-w-2xl`}
        >
          {statement}
        </p>
      )}

      {hasContact && (
        <div
          className={`mt-10 pt-10 border-t border-zinc-200/80 dark:border-zinc-700/80 ${tokens.section.block}`}
        >
          {contact!.companyName && (
            <p className={`font-medium ${tokens.accent.text}`}>
              {contact!.companyName}
            </p>
          )}
          <div className={`flex flex-wrap gap-x-6 gap-y-1 text-sm ${tokens.muted}`}>
            {contact!.phone && <span>{contact!.phone}</span>}
            {contact!.email && <span>{contact!.email}</span>}
            {contact!.website && <span>{contact!.website}</span>}
          </div>
        </div>
      )}
    </footer>
  );
}
