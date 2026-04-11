import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicProposalSnapshot, roomSlugFromName } from "@/app/lib/public-proposal";
import { stripScopeClarifications } from "@/app/lib/scope-narrative";
import type { PresentationConfigSaved, PublicLayoutConfigSaved } from "@/app/lib/layout-config";
import { isBadPlaceholderUrl } from "@/app/lib/media";

export default async function ScopePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const { snapshot, publicLayoutConfig } = data;
  const { media } = snapshot;

  const pages =
    publicLayoutConfig &&
    "pages" in (publicLayoutConfig as PublicLayoutConfigSaved | PresentationConfigSaved) &&
    (publicLayoutConfig as PresentationConfigSaved).pages &&
    typeof (publicLayoutConfig as PresentationConfigSaved).pages === "object" &&
    !Array.isArray((publicLayoutConfig as PresentationConfigSaved).pages)
      ? (publicLayoutConfig as PresentationConfigSaved).pages
      : undefined;
  const roomsConfig =
    (pages as PresentationConfigSaved["pages"] | undefined)?.rooms ?? {};
  const sectionsConfig =
    (pages as PresentationConfigSaved["pages"] | undefined)?.sections;
  const sectionsMap =
    sectionsConfig &&
    typeof sectionsConfig === "object" &&
    !Array.isArray(sectionsConfig)
      ? (sectionsConfig as Record<string, { include?: boolean }>)
      : null;

  const rooms = snapshot.rooms.filter((room) => {
    const sectionCfg = sectionsMap && room.id in sectionsMap ? sectionsMap[room.id] : undefined;
    if (sectionCfg !== undefined) {
      return sectionCfg.include !== false;
    }
    const cfg = (roomsConfig as Record<string, { published?: boolean }>)[room.id];
    return cfg?.published !== false;
  });
  const mediaByRoom = new Map<string, typeof media>();
  for (const m of media) {
    if (m.roomId) {
      const list = mediaByRoom.get(m.roomId) ?? [];
      list.push(m);
      mediaByRoom.set(m.roomId, list);
    }
  }

  const usedSlugs = new Set<string>();
  const roomSlugs = rooms.map((room) => {
    const base = roomSlugFromName(room.name);
    const slug = usedSlugs.has(base) ? room.id : base;
    usedSlugs.add(slug);
    return { ...room, slug };
  });

  return (
    <article className="space-y-8 pt-16">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        Scope
      </h1>
      <p className="mt-4 text-zinc-600 dark:text-zinc-400">
        Overview of spaces and scope. Select a room for detail.
      </p>
      <ul className="mt-10 grid gap-8 sm:grid-cols-2">
        {roomSlugs.map((room) => {
          const roomMedia = (mediaByRoom.get(room.id) ?? []).slice(0, 2);
          return (
            <li key={room.id}>
              <Link
                href={`/p/${id}/scope/${room.slug}`}
                className="group block overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/50"
              >
                {roomMedia[0] && (
                  <div className="aspect-[4/3] overflow-hidden rounded-t-xl border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                    {isBadPlaceholderUrl(roomMedia[0].url) ? (
                      <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                        No image
                      </div>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={roomMedia[0].url}
                        alt=""
                        className="transition group-hover:scale-[1.02]"
                      />
                    )}
                  </div>
                )}
                <div className="p-5">
                  <h2 className="text-xl font-semibold text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-100 dark:group-hover:text-zinc-300">
                    {room.name}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {stripScopeClarifications(room.scopeNarrative ?? "") || "—"}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
