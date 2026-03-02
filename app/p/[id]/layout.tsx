import { notFound } from "next/navigation";
import { getPublicProposalSnapshot, buildProposalSections } from "@/app/lib/public-proposal";
import { getLayoutConfig } from "@/app/lib/layout-config";
import { ProposalProvider } from "./ProposalContext";
import { ProposalShell } from "@/components/public/ProposalShell";

export default async function PublicProposalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getPublicProposalSnapshot(id);

  if (!data) notFound();

  const sections = buildProposalSections(data.proposalId, data.snapshot);
  const layoutConfig = getLayoutConfig(data.publicLayoutConfig);

  return (
    <ProposalProvider
      value={{
        proposalId: data.proposalId,
        snapshot: data.snapshot,
        sections,
        layoutConfig,
      }}
    >
      <ProposalShell proposalId={data.proposalId}>{children}</ProposalShell>
    </ProposalProvider>
  );
}
