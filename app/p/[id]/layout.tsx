import { notFound } from "next/navigation";
import { getProposalSnapshotForViewer, buildProposalSections } from "@/app/lib/public-proposal";
import { getLayoutConfig, type PresentationConfigSaved } from "@/app/lib/layout-config";
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
  const data = await getProposalSnapshotForViewer(id);

  if (!data) notFound();

  const sections = buildProposalSections(
    data.proposalId,
    data.snapshot,
    data.publicLayoutConfig
  );
  const layoutConfig = getLayoutConfig(data.publicLayoutConfig);
  const presentationSettings = (data.publicLayoutConfig as PresentationConfigSaved | null)?.settings ?? null;

  return (
    <ProposalProvider
      value={{
        proposalId: data.proposalId,
        snapshot: data.snapshot,
        sections,
        layoutConfig,
        presentationSettings,
      }}
    >
      <ProposalShell proposalId={data.proposalId}>{children}</ProposalShell>
    </ProposalProvider>
  );
}
