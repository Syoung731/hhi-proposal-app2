import { notFound } from "next/navigation";
import {
  getPublicProposalSnapshot,
  getRoomBySlug,
} from "@/app/lib/public-proposal";
import {
  EditorialSectionHeading,
  EditorialGallery,
} from "@/components/public/blocks";

export default async function ScopeRoomPage({
  params,
}: {
  params: Promise<{ id: string; roomSlug: string }>;
}) {
  const { id, roomSlug } = await params;
  const data = await getPublicProposalSnapshot(id);
  if (!data) notFound();

  const room = getRoomBySlug(data.snapshot, roomSlug);
  if (!room) notFound();

  const { snapshot } = data;
  const roomMedia = snapshot.media
    .filter((m) => m.roomId === room.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const galleryImages = roomMedia.map((m) => ({
    id: m.id,
    url: m.url,
    caption: m.caption ?? undefined,
  }));

  return (
    <article className="space-y-10 pt-8 sm:pt-12">
      <EditorialSectionHeading kicker="Scope" title={room.name} />
      {room.scopeNarrative ? (
        <p className="max-w-2xl whitespace-pre-wrap text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
          {room.scopeNarrative}
        </p>
      ) : (
        <p className="max-w-2xl text-zinc-500 dark:text-zinc-500">—</p>
      )}
      <EditorialGallery images={galleryImages} columns={3} aspect="square" />
    </article>
  );
}
