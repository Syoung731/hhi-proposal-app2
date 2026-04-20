/**
 * EmailProvider interface — the send-side abstraction.
 *
 * Any future provider (SendGrid, SES, Postmark, another Workspace tenant in
 * multi-tenant SaaS) implements this interface. `getEmailProvider()` in
 * ./index.ts resolves a configured IntegrationSetting to a concrete provider.
 *
 * All provider code is server-only. Do not import from client components.
 * Secrets passed into providers are already decrypted — they must never be
 * logged, serialized to telemetry, or returned from server actions.
 */

export interface EmailProvider {
  readonly name: string;

  /**
   * True if the provider can send from any `from` address its credentials
   * authorize (e.g. Google Workspace DWD can impersonate any user in the
   * authorized domain); false if `from` must be a specific verified sender.
   */
  readonly canSendAsAnyAddress: boolean;

  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;

  /**
   * Dry-run configuration check. Sends a small test email to `testRecipient`
   * using the provider's default sender. Returns ok/false plus a human-
   * readable details string and (on failure) an errorCode the UI can surface.
   */
  verifyConfiguration(testRecipient: string): Promise<VerifyResult>;
}

export interface SendEmailParams {
  /** Must be an address the provider is authorized to send as. */
  from: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  /** Free-form tags for logging — written into EmailSendLog.metadataJson. */
  metadata?: Record<string, string>;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface SendEmailResult {
  messageId: string;
  providerName: string;
  sentAt: Date;
}

export interface VerifyResult {
  ok: boolean;
  details: string;
  testSentTo?: string;
  errorCode?: string;
}
