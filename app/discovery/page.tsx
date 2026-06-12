import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";
import { isValidDiscoveryKey } from "@/app/lib/discovery/auth";
import DiscoveryForm from "./DiscoveryForm";

export const metadata: Metadata = {
  title: "HHI Builders — Website Discovery Questionnaire",
  description: "Internal discovery questionnaire for the HHI Builders website build",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /discovery — public (allowlisted in proxy.ts), gated by a shared access
 * code carried in the link (?k=...). Wrong/missing code renders the entry
 * gate; the form itself never loads without a valid code, and every API
 * call re-checks it server-side.
 */
export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string }>;
}) {
  const { k } = await searchParams;

  if (!isValidDiscoveryKey(k ?? null)) {
    return <AccessGate showError={!!k} />;
  }

  const [answers, links, attachments] = await Promise.all([
    prisma.discoveryAnswer.findMany(),
    prisma.discoveryLink.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.discoveryAttachment.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <DiscoveryForm
      portalKey={k!}
      initialAnswers={answers.map((a) => ({
        questionKey: a.questionKey,
        answerText: a.answerText,
        updatedBy: a.updatedBy,
        updatedAt: a.updatedAt.toISOString(),
      }))}
      initialLinks={links.map((l) => ({
        id: l.id,
        questionKey: l.questionKey,
        url: l.url,
        label: l.label,
        addedBy: l.addedBy,
      }))}
      initialAttachments={attachments.map((f) => ({
        id: f.id,
        questionKey: f.questionKey,
        fileName: f.fileName,
        publicUrl: f.publicUrl,
        sizeBytes: f.sizeBytes,
        uploadedBy: f.uploadedBy,
      }))}
    />
  );
}

function AccessGate({ showError }: { showError: boolean }) {
  return (
    <main className="min-h-screen bg-[#FAF7F1] flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-[#E8E1D5] bg-white p-10 shadow-sm text-center">
        <p className="text-xs font-semibold tracking-[0.25em] uppercase text-[#F47216]">
          HHI Builders
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1A2332] [font-family:var(--font-cormorant)]">
          Website Discovery
        </h1>
        <div className="mx-auto mt-3 h-[3px] w-14 rounded bg-[#F47216]" />
        <p className="mt-5 text-sm text-[#1A2332]/70">
          This questionnaire is for the HHI Builders team. Enter the access
          code from your invite link to continue.
        </p>
        {showError && (
          <p className="mt-3 text-sm font-medium text-red-600">
            That access code isn&apos;t right — check the link you were sent.
          </p>
        )}
        <form method="get" className="mt-6 flex gap-2">
          <input
            type="password"
            name="k"
            required
            placeholder="Access code"
            className="flex-1 rounded-lg border border-[#E8E1D5] bg-[#FAF7F1] px-4 py-2.5 text-sm text-[#1A2332] outline-none focus:border-[#F47216]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#1A2332] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#F47216]"
          >
            Enter
          </button>
        </form>
      </div>
    </main>
  );
}
