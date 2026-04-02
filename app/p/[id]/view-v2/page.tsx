import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProposalSnapshotForViewer } from "@/app/lib/public-proposal";
import { snapshotToProposalV2Props } from "@/components/proposals/v2/mock-data-adapter";
import { getMockProposalPages } from "@/components/proposals/v2/mock-page-config";
import { ProposalViewV2Composer } from "@/components/proposals/v2/ProposalViewV2Composer";

export const metadata: Metadata = {
  title: "Proposal | HHI Builders",
  description: "Project investment and design concept",
};

/**
 * V2 proposal viewer: page-composer system with DEV-ONLY builder UI.
 * Loads snapshot + mock page config; client composer handles layout state and preview.
 * TODO: Replace getMockProposalPages() with real config for persistence.
 */
export default async function ProposalViewV2Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getProposalSnapshotForViewer(id);

  if (!data) notFound();

  const sectionProps = snapshotToProposalV2Props(data.snapshot);
  const initialPages = getMockProposalPages();

  return (
    <ProposalViewV2Composer
      initialPages={initialPages}
      sectionProps={sectionProps}
    />
  );
}
