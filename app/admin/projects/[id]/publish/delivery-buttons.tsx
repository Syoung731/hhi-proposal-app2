"use client";

/**
 * Delivery buttons — Send by Email + Download PDF.
 *
 * The third delivery path (copy share link) is wired into the existing
 * inline Copy button on the share-URL row in publish-tab.tsx. Rendering
 * a redundant third button here would duplicate the same affordance.
 *
 * The component is self-contained — it owns the modal open state, the
 * download-in-progress state, and the toast state. Parent passes the
 * snapshot metadata + employee list.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  SendEmailModal,
  type SendableEmployee,
} from "./send-email-modal";
import { downloadProposalPdf } from "./delivery-actions";

interface Props {
  snapshotId: string;
  snapshotVersion: number;
  projectTitle: string;
  clientFirstName: string | null;
  proposalUrl: string;
  priorSentToEmail: string | null;
  employees: SendableEmployee[];
  defaultSenderEmployeeId: string | null;
}

/**
 * Convert a base64-encoded PDF payload to a Blob and trigger a download
 * via an injected anchor. Runs entirely in-browser; the server action
 * returned the bytes.
 */
function triggerPdfDownload(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Browsers keep the blob alive until the click resolves; revoking on
    // the next tick is the defensive choice.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function DeliveryButtons({
  snapshotId,
  snapshotVersion,
  projectTitle,
  clientFirstName,
  proposalUrl,
  priorSentToEmail,
  employees,
  defaultSenderEmployeeId,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    if (!defaultSenderEmployeeId) {
      setDownloadError(
        "No employee configured to attribute this download. Seed an employee or set DEV_EMPLOYEE_ID.",
      );
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      const result = await downloadProposalPdf({
        snapshotId,
        currentEmployeeId: defaultSenderEmployeeId,
      });
      if (!result.ok || !result.pdfBase64 || !result.filename) {
        setDownloadError(result.error ?? "Failed to generate PDF.");
        return;
      }
      triggerPdfDownload(result.pdfBase64, result.filename);
      // Refresh so the download count indicator updates.
      router.refresh();
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Unexpected error generating PDF.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={employees.length === 0}
          className="inline-flex items-center justify-center rounded-lg bg-[#F47216] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#d96310] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send by Email
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {downloading ? "Generating PDF…" : "Download PDF"}
        </button>
      </div>
      {downloadError && (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          {downloadError}
        </p>
      )}
      {employees.length === 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          No active employees configured. Add one in{" "}
          <a
            href="/admin/settings/employees"
            className="underline hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            /admin/settings/employees
          </a>{" "}
          before sending.
        </p>
      )}
      <SendEmailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        snapshotId={snapshotId}
        snapshotVersion={snapshotVersion}
        projectTitle={projectTitle}
        clientFirstName={clientFirstName}
        proposalUrl={proposalUrl}
        priorSentToEmail={priorSentToEmail}
        employees={employees}
        defaultSenderEmployeeId={defaultSenderEmployeeId}
        onSent={() => router.refresh()}
      />
    </div>
  );
}
