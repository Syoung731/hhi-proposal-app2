/**
 * Email send entry points.
 *
 * getEmailProvider() — resolves the configured email provider from
 *   Integration (provider = "google_workspace_dwd"). For now only DWD is
 *   wired up; adding SendGrid/SES later is a matter of branching on
 *   integration.metaJson.providerKind.
 *
 * sendProposalEmail() — thin convenience wrapper around the provider:
 *   - checks the per-employee daily quota (EMPLOYEE_DAILY_EMAIL_LIMIT, default 50)
 *   - increments Employee.dailySentCount and stamps lastSentAt
 *   - writes an EmailSendLog row on BOTH success and failure
 *   - on failure, re-throws so upstream (Cleanup H) can retry
 *
 * All functions here are server-only. They decrypt secrets; never re-export,
 * log, or expose those values to client components.
 */

import "server-only";
import { prisma } from "@/app/lib/prisma";
import { decryptSecret } from "@/app/lib/integration-secrets";
import { GoogleWorkspaceDWDProvider } from "./providers/google-workspace-dwd";
import type {
  EmailProvider,
  SendEmailParams,
  SendEmailResult,
} from "./provider";

export const EMAIL_PROVIDER_GOOGLE_WORKSPACE_DWD = "google_workspace_dwd";

/** Default sender + domain come from Integration.metaJson. */
export interface EmailProviderMeta {
  authorizedDomain: string;
  defaultSenderEmail: string;
}

const DEFAULT_EMPLOYEE_DAILY_EMAIL_LIMIT = 50;

/**
 * Load the active email provider configuration, decrypt the service account
 * secret, and return an instantiated provider. Throws a helpful error if
 * nothing is configured.
 *
 * The decrypted secret never leaves this function — it's passed directly into
 * the provider constructor, which keeps it in-memory for the duration of the
 * request. Do not log the return value's internals.
 */
export async function getEmailProvider(): Promise<EmailProvider> {
  const integration = await prisma.integration.findFirst({
    where: {
      provider: EMAIL_PROVIDER_GOOGLE_WORKSPACE_DWD,
      isActive: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!integration) {
    throw new Error(
      "No active email provider is configured. Visit /admin/settings/integrations/google-workspace/ to set one up.",
    );
  }
  if (!integration.encryptedSecret) {
    throw new Error(
      "Email provider integration is present but has no encrypted secret. Re-save the service account JSON.",
    );
  }
  const meta = readEmailIntegrationMeta(integration.metaJson);
  // NEVER log the decrypted value. Treat the whole JSON blob as a secret.
  const serviceAccountJson = decryptSecret(integration.encryptedSecret);

  if (integration.provider === EMAIL_PROVIDER_GOOGLE_WORKSPACE_DWD) {
    return new GoogleWorkspaceDWDProvider({
      serviceAccountJson,
      authorizedDomain: meta.authorizedDomain,
      defaultSenderEmail: meta.defaultSenderEmail,
    });
  }

  throw new Error(
    `Unsupported email provider "${integration.provider}". Only google_workspace_dwd is implemented.`,
  );
}

/**
 * Parse + validate the metaJson blob on an Integration row. Exported so the
 * verify server action can reuse it — verify needs to reach past the
 * isActive filter that gates `getEmailProvider()`, and parsing the same
 * metadata in two places would invite drift.
 */
export function readEmailIntegrationMeta(metaJson: unknown): EmailProviderMeta {
  if (!metaJson || typeof metaJson !== "object") {
    throw new Error(
      "Email integration metaJson is missing. Re-save the integration with authorizedDomain + defaultSenderEmail.",
    );
  }
  const m = metaJson as Record<string, unknown>;
  const authorizedDomain =
    typeof m.authorizedDomain === "string" ? m.authorizedDomain.trim() : "";
  const defaultSenderEmail =
    typeof m.defaultSenderEmail === "string" ? m.defaultSenderEmail.trim() : "";
  if (!authorizedDomain) {
    throw new Error("Email integration is missing metaJson.authorizedDomain.");
  }
  if (!defaultSenderEmail) {
    throw new Error("Email integration is missing metaJson.defaultSenderEmail.");
  }
  return { authorizedDomain, defaultSenderEmail };
}

// ─── sendProposalEmail wrapper ───────────────────────────────────────────────

export interface SendProposalEmailParams extends SendEmailParams {
  /** Who sent it (required for quota accounting + audit). */
  employeeId: string;
  /** Which snapshot this email relates to, if any (Cleanup H). */
  snapshotId?: string;
}

/** Error thrown when an employee hits their daily email ceiling. */
export class DailyEmailQuotaExceededError extends Error {
  constructor(
    public readonly employeeId: string,
    public readonly limit: number,
    public readonly sent: number,
  ) {
    super(
      `Employee ${employeeId} has already sent ${sent}/${limit} emails today.`,
    );
    this.name = "DailyEmailQuotaExceededError";
  }
}

/**
 * Send a proposal email via the configured provider.
 *
 * Flow:
 *   1. Load the employee; roll over daily counters if dailySentResetAt < now.
 *   2. Reject if already at the daily limit.
 *   3. Call provider.sendEmail().
 *   4. On success: update Employee.lastSentAt + dailySentCount, write
 *      EmailSendLog row, return the result.
 *   5. On failure: write EmailSendLog row with error populated, re-throw.
 *
 * Quota rollover: when the employee's dailySentResetAt has passed (or is
 * null), we treat today as a fresh window — count = 0, resetAt = end of
 * today (23:59:59.999 server-local-UTC). This is cheap to compute and
 * needs no cron.
 */
export async function sendProposalEmail(
  params: SendProposalEmailParams,
): Promise<SendEmailResult> {
  const { employeeId, snapshotId, ...emailParams } = params;

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      email: true,
      dailySentCount: true,
      dailySentResetAt: true,
    },
  });
  if (!employee) {
    throw new Error(`Employee not found: ${employeeId}`);
  }

  const now = new Date();
  const limit = getDailyEmailLimit();
  const { effectiveCount, nextResetAt } = rollDailyCounter({
    now,
    resetAt: employee.dailySentResetAt,
    count: employee.dailySentCount,
  });
  if (effectiveCount >= limit) {
    throw new DailyEmailQuotaExceededError(employee.id, limit, effectiveCount);
  }

  const provider = await getEmailProvider();

  let result: SendEmailResult | null = null;
  let sendError: unknown = null;
  try {
    result = await provider.sendEmail(emailParams);
  } catch (err) {
    sendError = err;
  }

  const toAddresses = Array.isArray(emailParams.to)
    ? emailParams.to.join(", ")
    : emailParams.to;

  if (result) {
    await prisma.$transaction([
      prisma.employee.update({
        where: { id: employeeId },
        data: {
          lastSentAt: now,
          dailySentCount: effectiveCount + 1,
          dailySentResetAt: nextResetAt,
        },
      }),
      prisma.emailSendLog.create({
        data: {
          snapshotId: snapshotId ?? null,
          employeeId,
          fromAddress: emailParams.from,
          toAddress: toAddresses,
          subject: emailParams.subject,
          providerName: result.providerName,
          providerMessageId: result.messageId,
          sentAt: result.sentAt,
          metadataJson: emailParams.metadata
            ? (emailParams.metadata as unknown as object)
            : undefined,
        },
      }),
    ]);
    return result;
  }

  // Failure path — log + re-throw.
  const errMessage =
    sendError instanceof Error ? sendError.message : String(sendError);
  await prisma.emailSendLog.create({
    data: {
      snapshotId: snapshotId ?? null,
      employeeId,
      fromAddress: emailParams.from,
      toAddress: toAddresses,
      subject: emailParams.subject,
      providerName: provider.name,
      providerMessageId: null,
      sentAt: now,
      error: errMessage,
      metadataJson: emailParams.metadata
        ? (emailParams.metadata as unknown as object)
        : undefined,
    },
  });
  throw sendError ?? new Error("Unknown send error");
}

/** Exposed for tests + UI status pages. */
export function getDailyEmailLimit(): number {
  const raw = process.env.EMPLOYEE_DAILY_EMAIL_LIMIT;
  if (!raw) return DEFAULT_EMPLOYEE_DAILY_EMAIL_LIMIT;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EMPLOYEE_DAILY_EMAIL_LIMIT;
}

function rollDailyCounter(args: {
  now: Date;
  resetAt: Date | null;
  count: number;
}): { effectiveCount: number; nextResetAt: Date } {
  const { now, resetAt, count } = args;
  const endOfToday = new Date(now);
  endOfToday.setUTCHours(23, 59, 59, 999);

  if (!resetAt || resetAt.getTime() <= now.getTime()) {
    return { effectiveCount: 0, nextResetAt: endOfToday };
  }
  return { effectiveCount: count, nextResetAt: resetAt };
}

// Re-exports so callers only need to import from ./email.
export type { EmailProvider, SendEmailParams, SendEmailResult } from "./provider";
