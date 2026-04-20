"use client";

/**
 * Send-by-Email modal — three-step compose flow + confirmation step.
 *
 * Steps:
 *   1. Recipient  — To / CC fields
 *   2. Compose    — sender picker, subject, message body, attach-PDF toggle,
 *                   live preview panel with signature
 *   3. Review     — read-only composition with Send button
 *   4. Confirmed  — sent timestamp + "send to another recipient" / close
 *
 * The modal lives entirely client-side. It calls sendProposalByEmail from
 * delivery-actions.ts; the server action handles the resend guard, quota
 * accounting, template composition, and tracking updates.
 *
 * Signature preview is rendered via buildEmployeeSignature() imported
 * directly — that module is a pure function with no server-only imports,
 * so pulling it into the client bundle is safe and keeps the preview in
 * sync with the real email output.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { sendProposalByEmail } from "./delivery-actions";
import { buildEmployeeSignature } from "@/app/lib/email/signature-builder";

export interface SendableEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  jobTitle: string | null;
  headshotUrl: string | null;
  signatureQuote: string | null;
  directPhone: string | null;
  mobilePhone: string | null;
  linkedInUrl: string | null;
  signatureEnabled: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  snapshotId: string;
  snapshotVersion: number;
  projectTitle: string;
  clientFirstName: string | null;
  /** Absolute URL. Composed server-side by the caller (no window access). */
  proposalUrl: string;
  /** Pre-fill for the "Send to" field — most recent sentToEmail for this project. */
  priorSentToEmail: string | null;
  employees: SendableEmployee[];
  defaultSenderEmployeeId: string | null;
  /** Called after a successful send — parent can refresh its data. */
  onSent?: () => void;
}

type Step = "recipient" | "compose" | "review" | "confirmed";

const DEFAULT_MESSAGE_BODY =
  "Thank you for the opportunity to put this proposal together for your {projectTitle}. You can view the full presentation at the link below:";

function defaultSubject(projectTitle: string): string {
  return `Your renovation proposal: ${projectTitle}`;
}

function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : `{${name}}`,
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

function parseCcList(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function SendEmailModal({
  open,
  onClose,
  snapshotId,
  snapshotVersion,
  projectTitle,
  clientFirstName,
  proposalUrl,
  priorSentToEmail,
  employees,
  defaultSenderEmployeeId,
  onSent,
}: Props) {
  const [step, setStep] = useState<Step>("recipient");
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [senderId, setSenderId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [attachPdf, setAttachPdf] = useState(false);
  const [bodyEdited, setBodyEdited] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<Date | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize / reset state each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep("recipient");
    setRecipient(priorSentToEmail ?? "");
    setCc("");
    setSenderId(defaultSenderEmployeeId ?? employees[0]?.id ?? "");
    setSubject(defaultSubject(projectTitle));
    setMessageBody(interpolate(DEFAULT_MESSAGE_BODY, { projectTitle }));
    setAttachPdf(false);
    setBodyEdited(false);
    setSending(false);
    setError(null);
    setSentAt(null);
    // Focus the first field after the dialog mounts.
    setTimeout(() => firstInputRef.current?.focus(), 0);
  }, [open, priorSentToEmail, defaultSenderEmployeeId, employees, projectTitle]);

  // Escape closes — with an unsaved-edits confirm when the body was edited.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleRequestClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bodyEdited, step]);

  function handleRequestClose() {
    if (step === "confirmed") {
      onClose();
      return;
    }
    if (bodyEdited && step !== "recipient") {
      const ok = window.confirm(
        "Discard your edits and close the email composer?",
      );
      if (!ok) return;
    }
    onClose();
  }

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === senderId) ?? null,
    [employees, senderId],
  );

  const signature = useMemo(() => {
    if (!selectedEmployee) return { html: "", text: "" };
    return buildEmployeeSignature({
      firstName: selectedEmployee.firstName,
      lastName: selectedEmployee.lastName,
      jobTitle: selectedEmployee.jobTitle,
      headshotUrl: selectedEmployee.headshotUrl,
      signatureQuote: selectedEmployee.signatureQuote,
      email: selectedEmployee.email,
      directPhone: selectedEmployee.directPhone,
      mobilePhone: selectedEmployee.mobilePhone,
      linkedInUrl: selectedEmployee.linkedInUrl,
      signatureEnabled: selectedEmployee.signatureEnabled,
    });
  }, [selectedEmployee]);

  const ccList = useMemo(() => parseCcList(cc), [cc]);

  if (!open) return null;

  // ── Step handlers ──────────────────────────────────────────────────────────

  function goToCompose() {
    setError(null);
    if (!isValidEmail(recipient)) {
      setError("Please enter a valid recipient email.");
      return;
    }
    for (const c of ccList) {
      if (!isValidEmail(c)) {
        setError(`Invalid CC email: ${c}`);
        return;
      }
    }
    setStep("compose");
  }

  function goToReview() {
    setError(null);
    if (!senderId) {
      setError("Select a sender.");
      return;
    }
    if (!selectedEmployee?.email) {
      setError("Selected sender has no email address on file.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    setStep("review");
  }

  async function handleSend() {
    if (!senderId) {
      setError("Select a sender.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await sendProposalByEmail({
        snapshotId,
        recipientEmail: recipient,
        ccEmails: ccList,
        subject: subject.trim(),
        messageBody: messageBody.trim(),
        attachPdf,
        senderEmployeeId: senderId,
      });
      if (!result.ok) {
        // Resend-guard and validation errors come back here. Surface the
        // message on Step 1 so the user can change the recipient.
        setError(result.error ?? "Failed to send.");
        setStep("recipient");
        return;
      }
      setSentAt(new Date());
      setStep("confirmed");
      onSent?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setSending(false);
    }
  }

  function resetForAnotherRecipient() {
    setStep("recipient");
    setRecipient("");
    setCc("");
    setError(null);
    setSentAt(null);
    setTimeout(() => firstInputRef.current?.focus(), 0);
  }

  // ── Body preview composition (client-side mirror of server composition) ──

  const interpolatedBody = interpolate(messageBody, {
    projectTitle,
    clientFirstName: clientFirstName ?? "there",
    proposalUrl,
  });
  const greetingName = clientFirstName?.trim() || "there";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleRequestClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-[720px] overflow-hidden rounded-lg bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {step === "confirmed"
                ? "Proposal sent"
                : `Send proposal — version ${snapshotVersion}`}
            </h2>
            {step !== "confirmed" && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Step{" "}
                {step === "recipient" ? 1 : step === "compose" ? 2 : 3} of 3
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="max-h-[calc(90vh-120px)] overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          {step === "recipient" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="send-to"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Send to
                </label>
                <input
                  ref={firstInputRef}
                  id="send-to"
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
                {priorSentToEmail && recipient === priorSentToEmail && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Pre-filled from the last recipient for this project.
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="send-cc"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  CC <span className="text-zinc-400">(optional, comma-separated)</span>
                </label>
                <input
                  id="send-cc"
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="spouse@example.com, architect@example.com"
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          )}

          {step === "compose" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="send-sender"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Sending as
                </label>
                <select
                  id="send-sender"
                  value={senderId}
                  onChange={(e) => setSenderId(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                      {emp.email ? ` — ${emp.email}` : " — (no email)"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="send-subject"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Subject
                </label>
                <input
                  id="send-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>

              <div>
                <label
                  htmlFor="send-body"
                  className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Message
                </label>
                <textarea
                  id="send-body"
                  value={messageBody}
                  onChange={(e) => {
                    setMessageBody(e.target.value);
                    setBodyEdited(true);
                  }}
                  rows={4}
                  className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  The share link, closing, and your signature are appended automatically.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={attachPdf}
                  onChange={(e) => setAttachPdf(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                <span>Attach PDF copy of the proposal</span>
              </label>

              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Preview
                </p>
                <div className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                  <p>
                    <span className="text-zinc-500">From:</span>{" "}
                    {selectedEmployee
                      ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}${selectedEmployee.email ? ` <${selectedEmployee.email}>` : ""}`
                      : "—"}
                  </p>
                  <p>
                    <span className="text-zinc-500">To:</span> {recipient}
                  </p>
                  {ccList.length > 0 && (
                    <p>
                      <span className="text-zinc-500">CC:</span> {ccList.join(", ")}
                    </p>
                  )}
                  <p>
                    <span className="text-zinc-500">Subject:</span> {subject}
                  </p>
                </div>
                <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  <p className="mb-2 text-sm text-zinc-800 dark:text-zinc-200">
                    Hi {greetingName},
                  </p>
                  <p className="mb-2 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                    {interpolatedBody}
                  </p>
                  <p className="mb-2 break-all text-sm">
                    <a
                      href={proposalUrl}
                      className="text-[#F47216] underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {proposalUrl}
                    </a>
                  </p>
                  <p className="mb-2 text-sm text-zinc-800 dark:text-zinc-200">
                    The link will always show this exact version of the proposal for your reference. I&apos;m available to walk through any section in detail — just call, text, or email with questions.
                  </p>
                  <p className="mb-3 text-sm text-zinc-800 dark:text-zinc-200">
                    Looking forward to your thoughts.
                  </p>
                  {signature.html && (
                    <div
                      className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700"
                      // Pure-function output with escaped values — safe.
                      dangerouslySetInnerHTML={{ __html: signature.html }}
                    />
                  )}
                  <p className="mt-3 text-xs text-zinc-500">
                    {attachPdf
                      ? "PDF attached: yes"
                      : "PDF attached: no"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-3">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Ready to send. Review and click{" "}
                <span className="font-semibold">Send Proposal</span>.
              </p>
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
                <dl className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                  <div>
                    <dt className="inline text-zinc-500">From: </dt>
                    <dd className="inline">
                      {selectedEmployee
                        ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}${selectedEmployee.email ? ` <${selectedEmployee.email}>` : ""}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-zinc-500">To: </dt>
                    <dd className="inline">{recipient}</dd>
                  </div>
                  {ccList.length > 0 && (
                    <div>
                      <dt className="inline text-zinc-500">CC: </dt>
                      <dd className="inline">{ccList.join(", ")}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="inline text-zinc-500">Reply-To: </dt>
                    <dd className="inline">{selectedEmployee?.email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="inline text-zinc-500">Subject: </dt>
                    <dd className="inline">{subject}</dd>
                  </div>
                  <div>
                    <dt className="inline text-zinc-500">PDF attached: </dt>
                    <dd className="inline">{attachPdf ? "yes" : "no"}</dd>
                  </div>
                  <div>
                    <dt className="inline text-zinc-500">Share link: </dt>
                    <dd className="inline break-all">{proposalUrl}</dd>
                  </div>
                </dl>
                <div className="mt-3 whitespace-pre-wrap border-t border-zinc-200 pt-3 text-sm text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
                  {`Hi ${greetingName},\n\n${interpolatedBody}\n\n${proposalUrl}\n\nThe link will always show this exact version of the proposal for your reference. I'm available to walk through any section in detail — just call, text, or email with questions.\n\nLooking forward to your thoughts.`}
                </div>
                {signature.html && (
                  <div
                    className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700"
                    dangerouslySetInnerHTML={{ __html: signature.html }}
                  />
                )}
              </div>
            </div>
          )}

          {step === "confirmed" && (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12l5 5L20 6" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Proposal sent
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Version {snapshotVersion} sent to {recipient}
                  {sentAt
                    ? ` on ${sentAt.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}`
                    : ""}
                  .
                </p>
              </div>
              <div className="mx-auto max-w-md rounded-md border border-zinc-200 bg-zinc-50 p-3 text-left text-xs dark:border-zinc-700 dark:bg-zinc-800/50">
                <p className="mb-1 text-zinc-500">Share link (for your records):</p>
                <p className="break-all font-mono text-zinc-700 dark:text-zinc-300">
                  {proposalUrl}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
          {step === "recipient" && (
            <>
              <button
                type="button"
                onClick={handleRequestClose}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={goToCompose}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Next →
              </button>
            </>
          )}
          {step === "compose" && (
            <>
              <button
                type="button"
                onClick={() => setStep("recipient")}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={goToReview}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Review →
              </button>
            </>
          )}
          {step === "review" && (
            <>
              <button
                type="button"
                onClick={() => setStep("compose")}
                disabled={sending}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="rounded-md bg-[#F47216] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#d96310] disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send Proposal"}
              </button>
            </>
          )}
          {step === "confirmed" && (
            <>
              <button
                type="button"
                onClick={resetForAnotherRecipient}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Send to another recipient
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
