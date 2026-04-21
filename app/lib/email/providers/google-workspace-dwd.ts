/**
 * Google Workspace Domain-Wide Delegation email provider.
 *
 * Authentication model
 *   A service account with DWD enabled holds a private key; the Workspace
 *   admin has authorized that service account's numeric client ID to
 *   impersonate any user in the tenant under a specific OAuth scope
 *   (gmail.send). At send time we mint a short-lived JWT where `subject` is
 *   the impersonated user's email — the Gmail API then routes the send
 *   through that user's mailbox. The `from` header in the MIME message
 *   MUST match the impersonated subject, or Google rewrites the envelope
 *   and the recipient sees an awkward "on behalf of" header.
 *
 * Security
 *   The service account JSON (private key included) is decrypted from
 *   IntegrationSetting at provider-construction time. Do not log the
 *   decrypted JSON or any field of it (client_email, private_key) — treat
 *   the whole blob as a secret. Errors bubbled out of the Gmail API can
 *   contain the request body; strip or redact before surfacing to clients.
 *
 * Wire format gotchas
 *   - Gmail's `users.messages.send` requires base64URL encoding, NOT base64.
 *     Use Buffer.from(raw).toString("base64url").
 *   - The raw message is a standard RFC 2822 MIME document. Header lines
 *     end with CRLF (\r\n). Gmail is forgiving of LF-only in some cases but
 *     attachments and multipart boundaries must use CRLF to be safe.
 *   - `userId: "me"` in the API call resolves to the impersonated subject,
 *     not the service account.
 */

import { gmail_v1, gmail } from "@googleapis/gmail";
import { JWT } from "google-auth-library";
import type {
  EmailAttachment,
  EmailProvider,
  SendEmailParams,
  SendEmailResult,
  VerifyResult,
} from "../provider";
import { extractBareEmail } from "../address-format";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export interface GoogleWorkspaceDWDConfig {
  /**
   * The raw JSON (as a string or parsed object) of the service account key
   * downloaded from GCP. Must contain client_email + private_key + type
   * = "service_account". Already decrypted when passed here.
   * Never log this value or any of its fields.
   */
  serviceAccountJson: string | ServiceAccountKey;

  /** Authorized domain, e.g. "hhi-builders.com". `from` must end with "@<domain>". */
  authorizedDomain: string;

  /**
   * Default sender email when the caller doesn't pass one (e.g. the verify
   * flow when no employee context is available). Must belong to the
   * authorized domain.
   */
  defaultSenderEmail: string;
}

export interface ServiceAccountKey {
  type: string; // must be "service_account"
  project_id?: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
}

export class GoogleWorkspaceDWDProvider implements EmailProvider {
  readonly name = "google_workspace_dwd";
  readonly canSendAsAnyAddress = true; // authorized across the whole domain

  private readonly parsedKey: ServiceAccountKey;
  private readonly authorizedDomain: string;
  private readonly defaultSender: string;

  constructor(config: GoogleWorkspaceDWDConfig) {
    this.parsedKey = parseServiceAccountKey(config.serviceAccountJson);
    this.authorizedDomain = normalizeDomain(config.authorizedDomain);
    this.defaultSender = config.defaultSenderEmail.trim().toLowerCase();

    if (!this.authorizedDomain) {
      throw new Error(
        "GoogleWorkspaceDWDProvider: authorizedDomain is required.",
      );
    }
    if (!emailEndsWithDomain(this.defaultSender, this.authorizedDomain)) {
      throw new Error(
        `GoogleWorkspaceDWDProvider: defaultSenderEmail ${this.defaultSender} does not belong to authorized domain ${this.authorizedDomain}.`,
      );
    }
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const from = params.from.trim();
    // `from` may be plain (user@domain) or RFC 5322 with a display name
    // (Display Name <user@domain>). The authorized-domain guard and the
    // JWT impersonation subject both require the BARE email — extract it
    // once and reuse. The full formatted string still flows into the MIME
    // From: header so recipients see the display name.
    const bareFrom = extractBareEmail(from);
    if (!emailEndsWithDomain(bareFrom, this.authorizedDomain)) {
      throw new Error(
        `Refusing to send: "${bareFrom}" is not in authorized domain "${this.authorizedDomain}".`,
      );
    }

    const client = this.getGmailClient(bareFrom);
    const rawMime = buildMimeMessage({ ...params, from });
    // Gmail requires base64URL (not plain base64). Standard base64 breaks on
    // characters used in encoded headers and attachments.
    const raw = Buffer.from(rawMime, "utf8").toString("base64url");

    const response = await client.users.messages.send({
      userId: "me", // resolves to impersonated subject (from)
      requestBody: { raw },
    });

    const messageId = response.data.id ?? "";
    if (!messageId) {
      throw new Error("Gmail API returned no message id on send.");
    }
    return {
      messageId,
      providerName: this.name,
      sentAt: new Date(),
    };
  }

  async verifyConfiguration(testRecipient: string): Promise<VerifyResult> {
    const recipient = testRecipient.trim();
    if (!recipient || !/.+@.+\..+/.test(recipient)) {
      return {
        ok: false,
        details: "Test recipient is not a valid email address.",
        errorCode: "invalid_recipient",
      };
    }

    try {
      const result = await this.sendEmail({
        from: this.defaultSender,
        to: recipient,
        subject: "HHI Builders — Email configuration test",
        html: verifyBodyHtml(this.defaultSender, this.authorizedDomain),
        text: verifyBodyText(this.defaultSender, this.authorizedDomain),
        metadata: { purpose: "verify_configuration" },
      });
      return {
        ok: true,
        testSentTo: recipient,
        details: `Test email delivered. Message ID: ${result.messageId}`,
      };
    } catch (err) {
      // Never surface the raw JWT or private key. The error object from the
      // Gmail client typically contains the URL, status, and a message —
      // safe to log, but strip anything that looks like a token if present.
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        details: redactTokens(message),
        errorCode: classifyGmailError(err),
      };
    }
  }

  /**
   * Mint a JWT for a specific impersonated user and return a Gmail API
   * client bound to it. Each send creates its own client so subjects don't
   * leak across requests.
   */
  private getGmailClient(subject: string): gmail_v1.Gmail {
    const auth = new JWT({
      email: this.parsedKey.client_email,
      key: this.parsedKey.private_key,
      scopes: [GMAIL_SEND_SCOPE],
      subject, // the DWD impersonation — this is what makes "from" work
    });
    return gmail({ version: "v1", auth });
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

function parseServiceAccountKey(
  input: string | ServiceAccountKey,
): ServiceAccountKey {
  let parsed: unknown;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new Error(
        "GoogleWorkspaceDWDProvider: service account JSON is not valid JSON.",
      );
    }
  } else {
    parsed = input;
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "GoogleWorkspaceDWDProvider: service account JSON must be an object.",
    );
  }
  const rec = parsed as Record<string, unknown>;
  if (rec.type !== "service_account") {
    throw new Error(
      "GoogleWorkspaceDWDProvider: service account JSON type must be 'service_account'.",
    );
  }
  if (typeof rec.client_email !== "string" || !rec.client_email) {
    throw new Error(
      "GoogleWorkspaceDWDProvider: service account JSON is missing client_email.",
    );
  }
  if (typeof rec.private_key !== "string" || !rec.private_key) {
    throw new Error(
      "GoogleWorkspaceDWDProvider: service account JSON is missing private_key.",
    );
  }
  return rec as unknown as ServiceAccountKey;
}

function normalizeDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith("@")) return trimmed.slice(1);
  return trimmed;
}

function emailEndsWithDomain(email: string, domain: string): boolean {
  if (!email || !domain) return false;
  return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
}

/**
 * Build a compliant RFC 2822 MIME message. Supports:
 *   - Plain text + HTML multipart/alternative
 *   - Optional attachments (wraps the text/html part in multipart/mixed)
 *   - Reply-To, Cc, Bcc
 *
 * Header and body line endings are CRLF. Header values containing non-ASCII
 * are encoded as RFC 2047 base64; this is rare for our use case but safe.
 */
export function buildMimeMessage(params: SendEmailParams): string {
  const CRLF = "\r\n";
  const boundaryAlt = `alt_${randomBoundary()}`;
  const boundaryMixed = `mixed_${randomBoundary()}`;

  const toHeader = asList(params.to).join(", ");
  const ccHeader = params.cc?.length ? params.cc.join(", ") : undefined;
  const bccHeader = params.bcc?.length ? params.bcc.join(", ") : undefined;
  const replyToHeader = params.replyTo ?? params.from;

  const hasAttachments = !!params.attachments && params.attachments.length > 0;
  const outerBoundary = hasAttachments ? boundaryMixed : boundaryAlt;
  const outerContentType = hasAttachments
    ? `multipart/mixed; boundary="${outerBoundary}"`
    : `multipart/alternative; boundary="${outerBoundary}"`;

  const headerLines: string[] = [
    `From: ${encodeHeader(params.from)}`,
    `To: ${encodeHeader(toHeader)}`,
    ...(ccHeader ? [`Cc: ${encodeHeader(ccHeader)}`] : []),
    ...(bccHeader ? [`Bcc: ${encodeHeader(bccHeader)}`] : []),
    `Subject: ${encodeHeader(params.subject)}`,
    `Reply-To: ${encodeHeader(replyToHeader)}`,
    "MIME-Version: 1.0",
    `Content-Type: ${outerContentType}`,
  ];

  const alternativeBody = buildAlternativePart({
    text: params.text ?? htmlToText(params.html),
    html: params.html,
    boundary: boundaryAlt,
    CRLF,
  });

  let body: string;
  if (!hasAttachments) {
    body = alternativeBody;
  } else {
    const parts: string[] = [];
    parts.push(`--${boundaryMixed}`);
    parts.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    parts.push("");
    parts.push(alternativeBody);
    for (const att of params.attachments!) {
      parts.push(`--${boundaryMixed}`);
      parts.push(...attachmentLines(att));
    }
    parts.push(`--${boundaryMixed}--`);
    body = parts.join(CRLF);
  }

  return `${headerLines.join(CRLF)}${CRLF}${CRLF}${body}`;
}

function buildAlternativePart(args: {
  text: string;
  html: string;
  boundary: string;
  CRLF: string;
}): string {
  const { text, html, boundary, CRLF } = args;
  const lines: string[] = [];
  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/plain; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(wrapBase64(Buffer.from(text, "utf8").toString("base64")));
  lines.push(`--${boundary}`);
  lines.push("Content-Type: text/html; charset=UTF-8");
  lines.push("Content-Transfer-Encoding: base64");
  lines.push("");
  lines.push(wrapBase64(Buffer.from(html, "utf8").toString("base64")));
  lines.push(`--${boundary}--`);
  return lines.join(CRLF);
}

function attachmentLines(att: EmailAttachment): string[] {
  const lines: string[] = [];
  const buf =
    typeof att.content === "string"
      ? Buffer.from(att.content, "utf8")
      : att.content;
  lines.push(`Content-Type: ${att.contentType}; name="${sanitizeFilename(att.filename)}"`);
  lines.push("Content-Transfer-Encoding: base64");
  lines.push(
    `Content-Disposition: attachment; filename="${sanitizeFilename(att.filename)}"`,
  );
  lines.push("");
  lines.push(wrapBase64(buf.toString("base64")));
  return lines;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n"]/g, "_");
}

function wrapBase64(b64: string, width = 76): string {
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += width) {
    parts.push(b64.slice(i, i + width));
  }
  return parts.join("\r\n");
}

function randomBoundary(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function asList(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}

/**
 * Minimal header encoder — only wraps values with non-ASCII into RFC 2047
 * base64 form. Simple subjects and addresses pass through untouched.
 */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(value)) {
    const b64 = Buffer.from(value, "utf8").toString("base64");
    return `=?UTF-8?B?${b64}?=`;
  }
  return value;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function redactTokens(message: string): string {
  return message
    .replace(/ya29\.[A-Za-z0-9._\-]+/g, "[redacted-access-token]")
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, "[redacted-private-key]");
}

function classifyGmailError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/invalid_grant/i.test(message)) return "invalid_grant";
  if (/unauthorized_client/i.test(message)) return "unauthorized_client";
  if (/access_denied/i.test(message)) return "access_denied";
  if (/failedPrecondition|dwd|domain[- ]wide/i.test(message)) return "dwd_not_ready";
  if (/insufficient.*scope|scope/i.test(message)) return "insufficient_scope";
  if (/precondition|quota/i.test(message)) return "quota_or_precondition";
  return "unknown";
}

function verifyBodyHtml(sender: string, domain: string): string {
  return `<!doctype html>
<html><body style="font-family: system-ui, sans-serif; color: #1A2332; padding: 24px;">
  <h1 style="font-size: 18px; margin: 0 0 12px;">HHI Builders — email configuration test</h1>
  <p>If you are reading this, Google Workspace Domain-Wide Delegation is wired up correctly.</p>
  <p style="font-size: 12px; color: #6b7280;">Sent from <strong>${escapeHtml(sender)}</strong> (authorized domain: <strong>${escapeHtml(domain)}</strong>) via the service-account impersonation path.</p>
</body></html>`;
}

function verifyBodyText(sender: string, domain: string): string {
  return `HHI Builders — email configuration test

If you are reading this, Google Workspace Domain-Wide Delegation is wired up correctly.

Sent from ${sender} (authorized domain: ${domain}) via the service-account impersonation path.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
