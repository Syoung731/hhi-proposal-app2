import { notFound } from "next/navigation";

/**
 * Dynamic segment for pageIds that do not have a dedicated route.
 * Section pages are handled at /p/[id]/section/[roomId].
 * Unknown pageIds 404.
 */
export default async function DynamicPageIdPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  await params;
  notFound();
}
