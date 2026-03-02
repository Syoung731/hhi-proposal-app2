import { redirect } from "next/navigation";

/**
 * Public proposal root: redirect to the magazine cover so the multi-page
 * presentation is the default experience.
 */
export default async function PublicProposalRootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/p/${id}/cover`);
}
