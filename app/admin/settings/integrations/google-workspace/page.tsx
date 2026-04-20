import { requireAdmin, getCurrentUserEmail } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { EMAIL_PROVIDER_GOOGLE_WORKSPACE_DWD } from "@/app/lib/email";
import {
  GoogleWorkspaceSettingsClient,
  type GoogleWorkspaceConfigView,
} from "./GoogleWorkspaceSettingsClient";

export const dynamic = "force-dynamic";

/**
 * Admin settings page for the Google Workspace DWD email provider.
 *
 * The server component loads ONLY non-sensitive metadata — authorizedDomain,
 * defaultSenderEmail, lastTestedAt, lastStatus, lastMessage, isActive. The
 * encryptedSecret is deliberately NOT read here; it is consumed only by
 * server actions via getEmailProvider(). This keeps the decrypted service
 * account JSON out of the RSC-serialised props sent to the browser.
 */
export default async function GoogleWorkspaceSettingsPage() {
  await requireAdmin();
  const currentAdminEmail = await getCurrentUserEmail();

  const row = await prisma.integration.findFirst({
    where: { provider: EMAIL_PROVIDER_GOOGLE_WORKSPACE_DWD },
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
  const view: GoogleWorkspaceConfigView = {
    configured: Boolean(row?.encryptedSecret),
    isActive: row?.isActive ?? false,
    authorizedDomain: meta.authorizedDomain,
    defaultSenderEmail: meta.defaultSenderEmail,
    lastTestedAt: row?.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    lastStatus: row?.lastStatus ?? null,
    lastMessage: row?.lastMessage ?? null,
  };

  return (
    <GoogleWorkspaceSettingsClient
      initial={view}
      currentAdminEmail={currentAdminEmail}
    />
  );
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
