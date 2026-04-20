import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HHI Builders — Proposal",
};

/**
 * Minimal layout for the client-facing proposal renderer.
 * No admin chrome, no header — the PresentationFrame owns all UI.
 */
export default function ProposalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "#ECEAE5" }}
    >
      {children}
    </div>
  );
}
