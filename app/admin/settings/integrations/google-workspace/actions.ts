"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { encryptSecret, decryptSecret } from "@/app/lib/integration-secrets";
import {
  EMAIL_PROVIDER_GOOGLE_WORKSPACE_DWD,
  readEmailIntegrationMeta,
} from "@/app/lib/email";
import { GoogleWorkspaceDWDProvider } from "@/app/lib/email/providers/google-workspace-dwd";

/**
 * Server actions for the Google Workspace DWD integration settings page.
 *
 * Security
 *   - The raw service account JSON (including private_key) is encrypted at
 *     rest via integration-secrets.ts (AES-256-GCM). NEVER log, echo, or
 *     return the decrypted JSON from these actions. The read path
 *     (page.tsx) must not select encryptedSecret into what the client
 *     component receives.
 *   - isActive flips to true ONLY after verifyConfiguration succeeds.
 *     Saving new credentials resets it to false so a broken paste can't
 *     leave the system claiming the integration works.
 */

const PROVIDER = EMAIL_PROVIDER_GOOGLE_WORKSPACE_DWD;
const INTEGRATION_NAME = "HHI Builders Workspace";

// ─── Read action ─────────────────────────────────────────────────────────────

export interface GoogleWorkspaceIntegrationStatus {
  configured: boolean;
  isActive: boolean;
  authorizedDomain: string | null;
  defaultSenderEmail: string | null;
  lastTestedAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
}

/**
 * Non-sensitive read for the GW integration row. The encryptedSecret is never
 * selected — this action returns the same shape regardless of caller, so it's
 * safe to call from both the dedicated page and the inline integrations-tab.
 */
export async function getGoogleWorkspaceIntegrationStatusAction(): Promise<GoogleWorkspaceIntegrationStatus> {
  await requireAdmin();
  const row = await prisma.integration.findFirst({
    where: { provider: PROVIDER },
    orderBy: { updatedAt: "desc" },
    select: {
      isActive: true,
      metaJson: true,
      lastTestedAt: true,
      lastStatus: true,
      lastMessage: true,
      encryptedSecret: true,
    },
  });
  const meta = extractMeta(row?.metaJson);
  return {
    configured: Boolean(row?.encryptedSecret),
    isActive: row?.isActive ?? false,
    authorizedDomain: meta.authorizedDomain,
    defaultSenderEmail: meta.defaultSenderEmail,
    lastTestedAt: row?.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastStatus: row?.lastStatus ?? null,
    lastMessage: row?.lastMessage ?? null,
  };
}

function extractMeta(metaJson: unknown): {
  authorizedDomain: string | null;
  defaultSenderEmail: string | null;
} {
  if (!metaJson || typeof metaJson !== "object") {
    return { authorizedDomain: null, defaultSenderEmail: null };
  }
  const m = metaJson as Record<string, unknown>;
  return {
    authorizedDomain:
      typeof m.authorizedDomain === "string" ? m.authorizedDomain : null,
    defaultSenderEmail:
      typeof m.defaultSenderEmail === "string" ? m.defaultSenderEmail : null,
  };
}

// ─── Save action ─────────────────────────────────────────────────────────────

export interface SaveGoogleWorkspaceInput {
  serviceAccountJson: string;
  authorizedDomain: string;
  defaultSenderEmail: string;
}

export interface SaveGoogleWorkspaceResult {
  ok: boolean;
  error?: string;
}

export async function saveGoogleWorkspaceIntegrationAction(
  input: SaveGoogleWorkspaceInput,
): Promise<SaveGoogleWorkspaceResult> {
  await requireAdmin();

  const serviceAccountJson = (input.serviceAccountJson ?? "").trim();
  const authorizedDomain = (input.authorizedDomain ?? "").trim().toLowerCase();
  const defaultSenderEmail = (input.defaultSenderEmail ?? "").trim().toLowerCase();

  if (!serviceAccountJson) {
    return { ok: false, error: "Paste the service account JSON." };
  }
  if (!authorizedDomain) {
    return { ok: false, error: "Authorized domain is required." };
  }
  if (!defaultSenderEmail) {
    return { ok: false, error: "Default sender email is required." };
  }

  // Shape check — fail fast before encrypting, and do NOT echo the parsed
  // contents back in any error message.
  try {
    const parsed = JSON.parse(serviceAccountJson) as Record<string, unknown>;
    if (parsed.type !== "service_account") {
      return {
        ok: false,
        error: 'JSON "type" field must be "service_account".',
      };
    }
    if (typeof parsed.client_email !== "string" || !parsed.client_email) {
      return {
        ok: false,
        error: 'JSON is missing "client_email".',
      };
    }
    if (typeof parsed.private_key !== "string" || !parsed.private_key) {
      return {
        ok: false,
        error: 'JSON is missing "private_key".',
      };
    }
  } catch {
    return { ok: false, error: "Service account value is not valid JSON." };
  }

  // Domain guard — defaultSenderEmail must belong to authorizedDomain,
  // otherwise the provider constructor will reject at use time anyway.
  if (!defaultSenderEmail.endsWith(`@${authorizedDomain}`)) {
    return {
      ok: false,
      error: `Default sender "${defaultSenderEmail}" is not in authorized domain "${authorizedDomain}".`,
    };
  }

  // NEVER log the plaintext value. Encrypt immediately.
  const encrypted = encryptSecret(serviceAccountJson);

  await prisma.integration.upsert({
    where: {
      provider_name: { provider: PROVIDER, name: INTEGRATION_NAME },
    },
    create: {
      provider: PROVIDER,
      name: INTEGRATION_NAME,
      encryptedSecret: encrypted,
      metaJson: { authorizedDomain, defaultSenderEmail },
      // Stay inactive until verifyConfiguration succeeds. Re-saving always
      // forces a re-verify so stale "configured" state can't mask a bad key.
      isActive: false,
      lastTestedAt: null,
      lastStatus: null,
      lastMessage: null,
    },
    update: {
      encryptedSecret: encrypted,
      metaJson: { authorizedDomain, defaultSenderEmail },
      isActive: false,
      lastTestedAt: null,
      lastStatus: null,
      lastMessage: null,
    },
  });

  revalidatePath("/admin/settings/integrations/google-workspace");
  revalidatePath("/admin/settings/integrations");
  return { ok: true };
}

// ─── Verify action ───────────────────────────────────────────────────────────

export interface VerifyGoogleWorkspaceInput {
  testRecipient: string;
}

export interface VerifyGoogleWorkspaceResult {
  ok: boolean;
  details: string;
  testSentTo?: string;
  errorCode?: string;
}

export async function verifyGoogleWorkspaceIntegrationAction(
  input: VerifyGoogleWorkspaceInput,
): Promise<VerifyGoogleWorkspaceResult> {
  await requireAdmin();

  const recipient = (input.testRecipient ?? "").trim();
  if (!recipient) {
    return { ok: false, details: "Test recipient is required." };
  }

  // Verify is the one path that MUST reach past the isActive filter that
  // guards getEmailProvider() — the whole point here is to prove a freshly-
  // saved (and deliberately inactive) configuration works, then flip it to
  // active. Runtime sends still go through the factory and still require
  // isActive=true.
  const row = await prisma.integration.findUnique({
    where: {
      provider_name: { provider: PROVIDER, name: INTEGRATION_NAME },
    },
  });
  if (!row || !row.encryptedSecret) {
    return {
      ok: false,
      details:
        "Configuration not saved yet. Paste the service account JSON and save first.",
    };
  }

  let provider: GoogleWorkspaceDWDProvider;
  try {
    // NEVER log the decrypted value. It never leaves this scope.
    const serviceAccountJson = decryptSecret(row.encryptedSecret);
    const meta = readEmailIntegrationMeta(row.metaJson);
    provider = new GoogleWorkspaceDWDProvider({
      serviceAccountJson,
      authorizedDomain: meta.authorizedDomain,
      defaultSenderEmail: meta.defaultSenderEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, details: message };
  }

  const result = await provider.verifyConfiguration(recipient);

  // Persist verify state on the Integration row. We don't set isActive=true
  // if the verify failed — a failed send should never leave the integration
  // in a "configured" state that other code would trust.
  await prisma.integration.updateMany({
    where: { provider: PROVIDER, name: INTEGRATION_NAME },
    data: {
      lastTestedAt: new Date(),
      lastStatus: result.ok ? "success" : "error",
      lastMessage: result.details.slice(0, 2000),
      ...(result.ok ? { isActive: true } : {}),
    },
  });

  revalidatePath("/admin/settings/integrations/google-workspace");
  revalidatePath("/admin/settings/integrations");

  return {
    ok: result.ok,
    details: result.details,
    testSentTo: result.testSentTo,
    errorCode: result.errorCode,
  };
}
