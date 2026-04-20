"use client";

import { GoogleWorkspaceForm } from "./GoogleWorkspaceForm";

interface Props {
  currentAdminEmail: string | null;
}

/**
 * Thin page wrapper — owns just the page header. The form body lives in
 * GoogleWorkspaceForm so the same component can be rendered inline in the
 * Integrations tab.
 */
export function GoogleWorkspaceSettingsClient({ currentAdminEmail }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-widest text-zinc-500">
          Integration
        </p>
        <h1
          className="mt-1 text-2xl text-[#1A2332]"
          style={{ fontFamily: "Cormorant Garamond, serif" }}
        >
          Google Workspace — Domain-Wide Delegation
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          The outbound email pipeline. This uses a service account authorized
          to impersonate users in the authorized domain, sending via Gmail API
          with scope <code className="rounded bg-zinc-100 px-1">gmail.send</code>.
        </p>
      </header>

      <GoogleWorkspaceForm currentAdminEmail={currentAdminEmail} />
    </div>
  );
}
