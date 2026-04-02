import { redirect } from "next/navigation";

/**
 * Redirect to the canonical v2 viewer under the same path pattern as the working public proposal.
 * Use /p/[proposalId]/view-v2 so the same proposal id that works for /p/[id] works here.
 */
export default async function ProposalViewV2Redirect({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  redirect(`/p/${proposalId}/view-v2`);
}
