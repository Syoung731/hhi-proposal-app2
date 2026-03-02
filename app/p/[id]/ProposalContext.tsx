"use client";

import { createContext, useContext } from "react";
import type { SnapshotData } from "@/app/lib/snapshot";
import type {
  ProposalSection,
  PublicLayoutConfig,
} from "@/app/lib/layout-config";

type ProposalContextValue = {
  proposalId: string;
  snapshot: SnapshotData;
  sections: ProposalSection[];
  layoutConfig: PublicLayoutConfig;
};

const ProposalContext = createContext<ProposalContextValue | null>(null);

export function ProposalProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: ProposalContextValue;
}) {
  return (
    <ProposalContext.Provider value={value}>{children}</ProposalContext.Provider>
  );
}

export function useProposal() {
  const ctx = useContext(ProposalContext);
  if (!ctx) throw new Error("useProposal must be used within ProposalProvider");
  return ctx;
}
