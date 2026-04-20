"use server";

/**
 * Delivery server actions for the Send-to-Client flow (Cleanup H).
 *
 * Three paths, each with its own tracking semantics:
 *   - sendProposalByEmail : sends the email, updates sentAt + sentToEmail +
 *                           Project.clientFacingVersion. Resend-guarded.
 *   - downloadProposalPdf : renders the snapshot to a Buffer, base64-encodes
 *                           for transport across the server-action boundary,
 *                           logs a PdfDownloadLog row. No sentAt update.
 *   - logShareLinkCopy    : write-only audit log. Called optimistically from
 *                           the client after the clipboard copy succeeds.
 *
 * The email path depends on Cleanup F (EmailProvider + sendProposalEmail
 * quota wrapper), Cleanup G (buildEmployeeSignature), Cleanup E/H-2
 * (renderSnapshotPdf) — it stitches those pieces together rather than
 * re-implementing any of them.
 *
 * # Why a server-action file instead of an API route
 * These are called from a client component on the same page. Server
 * actions give us automatic request scoping, typed input without zod
 * schemas, and no boilerplate around serialization. Auth is enforced via
 * requireAdmin() at the top of each action.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import {
  sendProposalEmail,
  DailyEmailQuotaExceededError,
} from "@/app/lib/email";
import { buildEmployeeSignature } from "@/app/lib/email/signature-builder";
import {
  renderSnapshotPdf,
  SnapshotNotFoundForPdfError,
} from "@/app/lib/pdf/render-snapshot-pdf";

// ─── Shared helpers (module-local, not exported) ─────────────────────────────

const BRAND_NAVY = "#1A2332";
const BRAND_ORANGE = "#F47216";
const MUTED = "#6B7280";

// RFC 5322 is obnoxious. This is a pragmatic format check — good enough as a
// first-line guard before we hand anything off to the provider, which does
// authoritative address validation on its side.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}

/**
 * Replace `{token}` placeholders in a template. Unknown tokens are left
 * in-place (surfaced to the reader) rather than blanked — that's a safer
 * failure mode than silently dropping context.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : `{${name}}`,
  );
}

/**
 * Conservative file-system-safe filename. Keeps alphanumerics, dashes, and
 * spaces; collapses runs of whitespace to a single hyphen. Email clients
 * and browsers both handle this better than attempting to preserve the
 * full Unicode project title.
 */
function sanitizeFilenamePart(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  return cleaned.replace(/\s+/g, "-");
}

function defaultAttachmentFilename(projectTitle: string, version: number): string {
  const safe = sanitizeFilenamePart(projectTitle);
  return `HHI-${safe || "Proposal"}-v${version}.pdf`;
}

/**
 * Resolve the absolute origin for proposal URLs. Server actions don't have
 * a NextRequest — we fall back to the inbound request's Host header, which
 * Next.js exposes via next/headers. The env var wins when present (pins
 * production to the canonical domain even if behind a proxy).
 */
async function resolveBaseUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("host");
  if (!host) {
    throw new Error(
      "Cannot resolve baseUrl for proposal links. Set NEXT_PUBLIC_APP_URL or run behind a reverse proxy that forwards the Host header.",
    );
  }
  // next/headers doesn't expose the inbound protocol reliably across hosts.
  // x-forwarded-proto is set by Vercel, most cloud proxies, and localhost
  // under `next dev` (http). Fall back to http for private hosts; prod
  // should always set NEXT_PUBLIC_APP_URL anyway.
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// ─── Email template ──────────────────────────────────────────────────────────

/**
 * Default message paragraph pre-filled in the Send-by-Email modal. The
 * modal passes this to sendProposalByEmail verbatim unless the user
 * edited it. `{projectTitle}` is substituted server-side in case the
 * default was passed through unmodified.
 */
const DEFAULT_MESSAGE_BODY =
  "Thank you for the opportunity to put this proposal together for your {projectTitle}. You can view the full presentation at the link below:";

/** Internal full-email builder — composes greeting + body + URL + boilerplate + signature + footer. */
function composeEmail(args: {
  clientFirstName: string | null;
  projectTitle: string;
  messageBody: string;
  proposalUrl: string;
  signatureHtml: string;
  signatureText: string;
}): { html: string; text: string } {
  const { clientFirstName, projectTitle, messageBody, proposalUrl, signatureHtml, signatureText } = args;

  const greetingName = clientFirstName?.trim() || "there";
  const body = interpolate(messageBody, {
    projectTitle,
    clientFirstName: greetingName,
    proposalUrl,
  });

  const closing =
    "The link will always show this exact version of the proposal for your reference. I'm available to walk through any section in detail — just call, text, or email with questions.";
  const signOff = "Looking forward to your thoughts.";
  const footer = "Sent via HHI Builders Proposal System";

  // HTML — inline styles only. Email clients strip <style> blocks (Gmail)
  // and ignore most CSS that isn't in `style="…"` on the element.
  const bodyFont =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
  const pStyle = `margin: 0 0 14px 0; font-family: ${bodyFont}; font-size: 14px; line-height: 1.6; color: ${BRAND_NAVY};`;
  const linkStyle = `color: ${BRAND_ORANGE}; text-decoration: none; word-break: break-all;`;
  const footerStyle = `margin: 24px 0 0 0; padding-top: 12px; border-top: 1px solid #E5E5E0; font-family: ${bodyFont}; font-size: 11px; color: ${MUTED};`;

  // Body may contain line breaks — keep them in the HTML by splitting on
  // double-newline for paragraphs and single-newline for soft breaks.
  const bodyHtml = body
    .split(/\n{2,}/)
    .map((para) =>
      `<p style="${pStyle}">${escapeHtml(para).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const html = [
    `<div style="font-family: ${bodyFont}; color: ${BRAND_NAVY}; font-size: 14px; line-height: 1.6; max-width: 620px;">`,
    `<p style="${pStyle}">Hi ${escapeHtml(greetingName)},</p>`,
    bodyHtml,
    `<p style="${pStyle}"><a href="${escapeAttr(proposalUrl)}" style="${linkStyle}">${escapeHtml(proposalUrl)}</a></p>`,
    `<p style="${pStyle}">${escapeHtml(closing)}</p>`,
    `<p style="${pStyle}">${escapeHtml(signOff)}</p>`,
    signatureHtml,
    `<div style="${footerStyle}">${escapeHtml(footer)}</div>`,
    `</div>`,
  ].join("");

  const text = [
    `Hi ${greetingName},`,
    ``,
    body,
    ``,
    proposalUrl,
    ``,
    closing,
    ``,
    signOff,
    ``,
    signatureText,
    ``,
    `--`,
    footer,
  ].join("\n");

  return { html, text };
}

// Minimal HTML escapers — duplicated rather than imported so this file
// stays self-contained. Imports from signature-builder.ts would pull the
// whole email-rendering module into the server-action chunk.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(value: string): string {
  return escapeHtml(value);
}

// ═════════════════════════════════════════════════════════════════════════════
// Action 1: sendProposalByEmail
// ═════════════════════════════════════════════════════════════════════════════

export interface SendProposalByEmailInput {
  snapshotId: string;
  recipientEmail: string;
  ccEmails?: string[];
  subject: string;
  /** The editable paragraph from the modal. Not the full email body. */
  messageBody: string;
  attachPdf: boolean;
  senderEmployeeId: string;
}

export interface SendProposalByEmailResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send a proposal email for a specific PublishedSnapshot.
 *
 * Validations:
 *   - recipient email format
 *   - snapshot exists
 *   - sender employee exists, is active, has an email on file
 *   - resend guard: sentAt populated AND sentToEmail matches recipient → reject
 *
 * On success:
 *   - EmailSendLog is written by sendProposalEmail (Cleanup F wrapper)
 *   - PublishedSnapshot.sentAt / sentByEmployeeId / sentToEmail updated
 *   - Project.clientFacingVersion advanced to this snapshot's version
 *
 * Caught errors returned as { ok: false, error }:
 *   - input validation failures
 *   - DailyEmailQuotaExceededError (user-actionable: "send more tomorrow")
 *
 * Uncaught errors (re-thrown) — operational failures: provider auth,
 * Chromium crash on PDF attach, DB write failure. These bubble to the
 * modal so the UI can show an error boundary and the caller can retry.
 */
export async function sendProposalByEmail(
  input: SendProposalByEmailInput,
): Promise<SendProposalByEmailResult> {
  await requireAdmin();

  const {
    snapshotId,
    recipientEmail,
    ccEmails,
    subject,
    messageBody,
    attachPdf,
    senderEmployeeId,
  } = input;

  const cleanRecipient = recipientEmail.trim();
  if (!isValidEmail(cleanRecipient)) {
    return { ok: false, error: "Invalid recipient email address." };
  }
  const cleanCc = (ccEmails ?? [])
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  for (const c of cleanCc) {
    if (!isValidEmail(c)) {
      return { ok: false, error: `Invalid CC email: ${c}` };
    }
  }
  if (!subject.trim()) {
    return { ok: false, error: "Subject is required." };
  }

  const snapshot = await prisma.publishedSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      version: true,
      sentAt: true,
      sentToEmail: true,
      projectId: true,
      project: {
        select: {
          id: true,
          title: true,
          client1First: true,
        },
      },
    },
  });
  if (!snapshot) {
    return { ok: false, error: "Snapshot not found." };
  }

  // Resend guard — same recipient, already sent. Different recipient on the
  // same snapshot is allowed (handles "send to spouse" / "send to
  // architect" flows without forcing a re-publish).
  if (
    snapshot.sentAt &&
    snapshot.sentToEmail &&
    snapshot.sentToEmail.trim().toLowerCase() === cleanRecipient.toLowerCase()
  ) {
    return {
      ok: false,
      error:
        "Already sent to this recipient. Publish a new version or choose a different recipient.",
    };
  }

  const employee = await prisma.employee.findUnique({
    where: { id: senderEmployeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      jobTitle: true,
      headshotUrl: true,
      signatureQuote: true,
      directPhone: true,
      mobilePhone: true,
      linkedInUrl: true,
      signatureEnabled: true,
      isActive: true,
    },
  });
  if (!employee) {
    return { ok: false, error: "Sender employee not found." };
  }
  if (!employee.isActive) {
    return { ok: false, error: "Sender employee is not active." };
  }
  if (!employee.email) {
    return {
      ok: false,
      error:
        "Sender employee has no email address on file. Add one in /admin/settings/employees before sending.",
    };
  }

  const baseUrl = await resolveBaseUrl();
  const proposalUrl = `${baseUrl}/proposals/${encodeURIComponent(snapshot.id)}`;

  const signature = buildEmployeeSignature({
    firstName: employee.firstName,
    lastName: employee.lastName,
    jobTitle: employee.jobTitle,
    headshotUrl: employee.headshotUrl,
    signatureQuote: employee.signatureQuote,
    email: employee.email,
    directPhone: employee.directPhone,
    mobilePhone: employee.mobilePhone,
    linkedInUrl: employee.linkedInUrl,
    signatureEnabled: employee.signatureEnabled,
  });

  const effectiveMessageBody = messageBody.trim() || DEFAULT_MESSAGE_BODY;
  const { html, text } = composeEmail({
    clientFirstName: snapshot.project.client1First,
    projectTitle: snapshot.project.title,
    messageBody: effectiveMessageBody,
    proposalUrl,
    signatureHtml: signature.html,
    signatureText: signature.text,
  });

  // PDF attachment — rendered only if requested. Failures here bubble up;
  // we do NOT try to send a "partial" email without the attachment the
  // user explicitly asked for.
  const attachments: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[] = [];
  if (attachPdf) {
    const pdfBuffer = await renderSnapshotPdf({
      snapshotId: snapshot.id,
      baseUrl,
    });
    attachments.push({
      filename: defaultAttachmentFilename(snapshot.project.title, snapshot.version),
      content: pdfBuffer,
      contentType: "application/pdf",
    });
  }

  let result;
  try {
    result = await sendProposalEmail({
      from: employee.email,
      to: cleanRecipient,
      cc: cleanCc.length > 0 ? cleanCc : undefined,
      subject: subject.trim(),
      html,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      replyTo: employee.email,
      metadata: {
        snapshotId: snapshot.id,
        projectId: snapshot.projectId,
        employeeId: employee.id,
        version: String(snapshot.version),
      },
      employeeId: employee.id,
      snapshotId: snapshot.id,
    });
  } catch (err) {
    if (err instanceof DailyEmailQuotaExceededError) {
      return {
        ok: false,
        error: `Daily email limit reached for this sender (${err.sent}/${err.limit}). Try again tomorrow.`,
      };
    }
    throw err;
  }

  // Update snapshot tracking + advance the project's client-facing cursor
  // atomically. If either update fails the email already went out — that's
  // an acceptable race: the EmailSendLog row is the authoritative record.
  await prisma.$transaction([
    prisma.publishedSnapshot.update({
      where: { id: snapshot.id },
      data: {
        sentAt: result.sentAt,
        sentByEmployeeId: employee.id,
        sentToEmail: cleanRecipient,
      },
    }),
    prisma.project.update({
      where: { id: snapshot.projectId },
      data: { clientFacingVersion: snapshot.version },
    }),
  ]);

  revalidatePath(`/admin/projects/${snapshot.projectId}`);

  return { ok: true, messageId: result.messageId };
}

// ═════════════════════════════════════════════════════════════════════════════
// Action 2: downloadProposalPdf
// ═════════════════════════════════════════════════════════════════════════════

export interface DownloadProposalPdfInput {
  snapshotId: string;
  currentEmployeeId: string;
}

export interface DownloadProposalPdfResult {
  ok: boolean;
  pdfBase64?: string;
  filename?: string;
  error?: string;
}

/**
 * Render a snapshot to PDF bytes and return them base64-encoded. Server
 * actions can't stream binary directly — the client decodes to a Blob and
 * triggers the download via an anchor click.
 *
 * Writes a PdfDownloadLog row with the current employee's id for
 * attribution. Does NOT update sentAt — a download doesn't confirm
 * anything reached the client.
 *
 * The currentEmployeeId is a foreign-key string. If the id is invalid we
 * log null (SetNull relation) rather than rejecting — the user still
 * wants their PDF; the audit attribution being a soft-miss is survivable.
 */
export async function downloadProposalPdf(
  input: DownloadProposalPdfInput,
): Promise<DownloadProposalPdfResult> {
  await requireAdmin();

  const { snapshotId, currentEmployeeId } = input;

  const snapshot = await prisma.publishedSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      version: true,
      project: { select: { title: true } },
    },
  });
  if (!snapshot) {
    return { ok: false, error: "Snapshot not found." };
  }

  const baseUrl = await resolveBaseUrl();

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderSnapshotPdf({ snapshotId: snapshot.id, baseUrl });
  } catch (err) {
    if (err instanceof SnapshotNotFoundForPdfError) {
      return { ok: false, error: "Snapshot not found." };
    }
    throw err;
  }

  // Best-effort employee attribution. If the id doesn't resolve we still
  // log the row with null — the download event itself is the signal we
  // care about.
  const employeeRef = await prisma.employee.findUnique({
    where: { id: currentEmployeeId },
    select: { id: true },
  });

  await prisma.pdfDownloadLog.create({
    data: {
      snapshotId: snapshot.id,
      employeeId: employeeRef?.id ?? null,
    },
  });

  return {
    ok: true,
    pdfBase64: pdfBuffer.toString("base64"),
    filename: defaultAttachmentFilename(snapshot.project.title, snapshot.version),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Action 3: logShareLinkCopy
// ═════════════════════════════════════════════════════════════════════════════

export interface LogShareLinkCopyInput {
  snapshotId: string;
  currentEmployeeId: string;
}

/**
 * Write-only audit log for share-link copies. Called from the client after
 * the clipboard write succeeds (optimistic — the user already has the URL,
 * the log is bookkeeping).
 *
 * No user-facing error surface: if the snapshot id is bogus or the
 * employee id is unresolvable the call is a no-op. We deliberately do not
 * throw, because the UI already showed the "Copied" affordance; surfacing
 * a failure here would confuse the user about whether the paste will
 * work.
 */
export async function logShareLinkCopy(
  input: LogShareLinkCopyInput,
): Promise<{ ok: boolean }> {
  await requireAdmin();

  const { snapshotId, currentEmployeeId } = input;

  const snapshot = await prisma.publishedSnapshot.findUnique({
    where: { id: snapshotId },
    select: { id: true },
  });
  if (!snapshot) return { ok: false };

  const employeeRef = await prisma.employee.findUnique({
    where: { id: currentEmployeeId },
    select: { id: true },
  });

  await prisma.shareLinkCopyLog.create({
    data: {
      snapshotId: snapshot.id,
      employeeId: employeeRef?.id ?? null,
    },
  });

  return { ok: true };
}
