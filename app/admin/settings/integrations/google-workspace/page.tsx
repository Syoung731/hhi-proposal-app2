import { requireAdmin, getCurrentUserEmail } from "@/app/lib/auth";
import { GoogleWorkspaceSettingsClient } from "./GoogleWorkspaceSettingsClient";

export const dynamic = "force-dynamic";

/**
 * Admin settings page for the Google Workspace DWD email provider.
 *
 * All data loading is done by the client form component (self-loading via
 * getGoogleWorkspaceIntegrationStatusAction) so the same form can also be
 * rendered inline inside the Integrations tab. This page is a thin wrapper
 * that just passes the current admin email for default-value prefill.
 */
export default async function GoogleWorkspaceSettingsPage() {
  await requireAdmin();
  const currentAdminEmail = await getCurrentUserEmail();

  return <GoogleWorkspaceSettingsClient currentAdminEmail={currentAdminEmail} />;
}
