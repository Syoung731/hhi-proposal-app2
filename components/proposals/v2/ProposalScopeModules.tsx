import Image from "next/image";
import { tokens } from "./tokens";
import { isBadPlaceholderUrl, isAllowedHostForNextImage } from "@/app/lib/media";

export type ScopeModule = {
  id: string;
  title: string;
  subtitle?: string | null;
  bullets?: readonly string[];
  imageUrl?: string | null;
  /** Optional price or range badge text, e.g. "$X – $Y" */
  priceBadge?: string | null;
};

export type ProposalScopeModulesProps = {
  title?: string;
  modules: readonly ScopeModule[];
  /** Alternate image left/right; if true, first module image on right, etc. */
  alternateLayout?: boolean;
};

function ScopeCard({
  module: m,
  imagePosition,
}: {
  module: ScopeModule;
  imagePosition: "left" | "right";
}) {
  const bullets = (m.bullets ?? []).slice(0, 5);
  const showImage =
    m.imageUrl &&
    !isBadPlaceholderUrl(m.imageUrl) &&
    (m.imageUrl.startsWith("/") || isAllowedHostForNextImage(m.imageUrl));

  const content = (
    <div className="flex-1 min-w-0">
      <h3 className={tokens.heading.h3}>{m.title}</h3>
      {m.subtitle && (
        <p className={`mt-1 ${tokens.muted} text-sm`}>{m.subtitle}</p>
      )}
      {bullets.length > 0 && (
        <ul className="mt-4 space-y-2">
          {bullets.map((text, i) => (
            <li key={i} className={`flex gap-2 text-sm ${tokens.mutedStrong}`}>
              <span className="text-zinc-400 shrink-0">—</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
      {m.priceBadge && (
        <p className={`mt-4 text-sm font-medium ${tokens.accent.text}`}>
          {m.priceBadge}
        </p>
      )}
    </div>
  );

  const imageBlock =
    !m.imageUrl ? null : showImage ? (
      <div
        className={`relative shrink-0 w-full sm:w-72 aspect-[4/3] overflow-hidden ${tokens.radius.image} bg-zinc-100 dark:bg-zinc-800`}
      >
        <Image
          src={m.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, 288px"
        />
      </div>
    ) : (
      <div
        className={`shrink-0 w-full sm:w-72 aspect-[4/3] ${tokens.radius.image} bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 text-xs`}
        aria-hidden
      >
        No image
      </div>
    );

  return (
    <div
      className={`${tokens.cardSoft} flex flex-col sm:flex-row gap-6 ${
        imagePosition === "right" ? "sm:flex-row-reverse" : ""
      }`}
    >
      {content}
      {imageBlock}
    </div>
  );
}

export function ProposalScopeModules({
  title = "Scope",
  modules,
  alternateLayout = true,
}: ProposalScopeModulesProps) {
  if (!modules.length) return null;

  return (
    <section>
      <h2 className={tokens.heading.h2}>{title}</h2>
      <div className={`mt-8 ${tokens.section.block}`}>
        {modules.map((m, i) => (
          <ScopeCard
            key={m.id}
            module={m}
            imagePosition={
              alternateLayout ? (i % 2 === 0 ? "left" : "right") : "left"
            }
          />
        ))}
      </div>
    </section>
  );
}
