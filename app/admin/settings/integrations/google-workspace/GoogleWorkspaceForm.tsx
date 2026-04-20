"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  saveGoogleWorkspaceIntegrationAction,
  verifyGoogleWorkspaceIntegrationAction,
  getGoogleWorkspaceIntegrationStatusAction,
  type GoogleWorkspaceIntegrationStatus,
} from "./actions";
import {
  deriveGoogleWorkspaceStatus,
  toSimplePill,
  type GoogleWorkspaceStatusKind,
} from "@/app/lib/email/status";

interface Props {
  /** Pre-filled default in the "Default Sender Email" field for first-time setup. */
  currentAdminEmail: string | null;
}

type ToastKind = "success" | "error" | null;

/**
 * Self-loading Google Workspace DWD form body. Fetches its own status on
 * mount via server action so it can render in two surfaces:
 *   - The dedicated settings page at /admin/settings/integrations/google-workspace
 *   - The inline section inside the Integrations tab
 *
 * Styled to match sibling integration sections in integrations-tab.tsx
 * (labelClass / inputClass, `rounded-xl border border-zinc-200 bg-zinc-50/50 p-6`
 * card wrapper, zinc-900 primary / zinc-50 outlined secondary buttons,
 * green-600 success / red-600 error text on the button row).
 */
export function GoogleWorkspaceForm({ currentAdminEmail }: Props) {
  const [status, setStatus] = useState<GoogleWorkspaceIntegrationStatus | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);

  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [authorizedDomain, setAuthorizedDomain] = useState("hhi-builders.com");
  const [defaultSenderEmail, setDefaultSenderEmail] = useState("");
  const [testRecipient, setTestRecipient] = useState(currentAdminEmail ?? "");

  const [saveToast, setSaveToast] = useState<{ kind: ToastKind; message: string }>(
    { kind: null, message: "" },
  );
  const [verifyResult, setVerifyResult] = useState<{
    kind: ToastKind;
    message: string;
    errorCode?: string;
    testSentTo?: string;
  } | null>(null);
  const [saving, startSave] = useTransition();
  const [verifying, startVerify] = useTransition();

  const refresh = useCallback(async () => {
    const next = await getGoogleWorkspaceIntegrationStatusAction();
    setStatus(next);
    setAuthorizedDomain((prev) => {
      if (prev && next.authorizedDomain === prev) return prev;
      return next.authorizedDomain ?? (prev || "hhi-builders.com");
    });
    setDefaultSenderEmail(
      (prev) => prev || next.defaultSenderEmail || currentAdminEmail || "",
    );
  }, [currentAdminEmail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await getGoogleWorkspaceIntegrationStatusAction();
      if (cancelled) return;
      setStatus(next);
      if (next.authorizedDomain) setAuthorizedDomain(next.authorizedDomain);
      setDefaultSenderEmail(next.defaultSenderEmail ?? currentAdminEmail ?? "");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentAdminEmail]);

  function onSave() {
    setSaveToast({ kind: null, message: "" });
    startSave(async () => {
      const result = await saveGoogleWorkspaceIntegrationAction({
        serviceAccountJson,
        authorizedDomain,
        defaultSenderEmail,
      });
      if (!result.ok) {
        setSaveToast({ kind: "error", message: result.error ?? "Save failed." });
        return;
      }
      setSaveToast({
        kind: "success",
        message: "Saved. Click Test Send to verify and activate.",
      });
      setServiceAccountJson(""); // never re-submit a pasted JSON
      await refresh();
    });
  }

  function onVerify() {
    setVerifyResult(null);
    startVerify(async () => {
      const result = await verifyGoogleWorkspaceIntegrationAction({
        testRecipient,
      });
      setVerifyResult({
        kind: result.ok ? "success" : "error",
        message: result.details,
        errorCode: result.errorCode,
        testSentTo: result.testSentTo,
      });
      await refresh();
    });
  }

  if (!loaded || !status) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  const kind = deriveGoogleWorkspaceStatus(status);

  return (
    <div className="space-y-4">
      <StatusBanner kind={kind} status={status} />

      <div className="flex flex-col gap-6 rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-700 dark:bg-zinc-800/30">
        {/* Credentials */}
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="gwJson" className={labelClass}>
              Service account JSON
            </label>
            <textarea
              id="gwJson"
              value={serviceAccountJson}
              onChange={(e) => setServiceAccountJson(e.target.value)}
              rows={8}
              placeholder={
                status.configured
                  ? "Paste new JSON to rotate the key. Leave empty to keep the current key."
                  : 'Paste the service-account JSON file contents (must include "type": "service_account", client_email, private_key).'
              }
              className={`${inputClass} font-mono text-[11px]`}
              spellCheck={false}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Stored encrypted at rest (AES-256-GCM). Never displayed back after save.
            </p>
          </div>
          <div>
            <label htmlFor="gwDomain" className={labelClass}>
              Authorized domain
            </label>
            <input
              id="gwDomain"
              type="text"
              value={authorizedDomain}
              onChange={(e) => setAuthorizedDomain(e.target.value)}
              placeholder="hhi-builders.com"
              className={inputClass}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Your Workspace domain. Sends from outside this domain are rejected.
            </p>
          </div>
          <div>
            <label htmlFor="gwSender" className={labelClass}>
              Default sender email
            </label>
            <input
              id="gwSender"
              type="email"
              value={defaultSenderEmail}
              onChange={(e) => setDefaultSenderEmail(e.target.value)}
              placeholder="admin@hhi-builders.com"
              className={inputClass}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Used by Test Send and as a fallback when no sender is specified.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? "Saving…" : "Save Configuration"}
            </button>
            {saveToast.kind === "success" && (
              <span className="text-sm text-green-600 dark:text-green-400">
                {saveToast.message}
              </span>
            )}
            {saveToast.kind === "error" && (
              <span className="text-sm text-red-600 dark:text-red-400">
                {saveToast.message}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Test send card */}
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-700 dark:bg-zinc-800/30">
        <div>
          <label htmlFor="gwTestRecipient" className={labelClass}>
            Test recipient
          </label>
          <input
            id="gwTestRecipient"
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Sends a one-line test email. On success, the integration flips to
            Active.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onVerify}
            disabled={verifying || !status.configured}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            title={
              status.configured ? undefined : "Save a service account JSON first."
            }
          >
            {verifying ? "Sending test…" : "Test Send"}
          </button>
          {verifyResult?.kind === "success" && (
            <span className="text-sm text-green-600 dark:text-green-400">
              ✓ Sent to {verifyResult.testSentTo ?? testRecipient}
            </span>
          )}
          {verifyResult?.kind === "error" && (
            <span className="text-sm text-red-600 dark:text-red-400">
              Test failed
              {verifyResult.errorCode ? ` (${verifyResult.errorCode})` : ""}
            </span>
          )}
          {status.lastTestedAt && verifyResult === null && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Last tested: {new Date(status.lastTestedAt).toLocaleString()}
            </span>
          )}
        </div>

        {verifyResult?.kind === "error" && (
          <pre className="whitespace-pre-wrap rounded-md border border-red-200 bg-red-50/60 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {verifyResult.message}
          </pre>
        )}
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Daily send ceiling per employee:{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
          EMPLOYEE_DAILY_EMAIL_LIMIT
        </code>{" "}
        env var (default 50).
      </p>
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

// Match integrations-tab.tsx labelClass / inputClass so this form blends
// into the Integrations tab when rendered inline.
const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";
const inputClass =
  "w-full max-w-xl rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

function StatusBanner({
  kind,
  status,
}: {
  kind: GoogleWorkspaceStatusKind;
  status: GoogleWorkspaceIntegrationStatus;
}) {
  let color = "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
  let label = "Not configured";
  let detail: string | null = null;
  switch (kind) {
    case "not_configured":
      break;
    case "configured_unverified":
      color =
        "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900";
      label = "Configured — never verified";
      detail = "Run Test Send to activate.";
      break;
    case "configured_failed":
      color =
        "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900";
      label = "Configured — last verify failed";
      if (status.lastTestedAt) {
        detail =
          new Date(status.lastTestedAt).toLocaleString() +
          (status.lastMessage ? ` · ${status.lastMessage}` : "");
      }
      break;
    case "active":
      color =
        "bg-green-50 text-green-900 border-green-200 dark:bg-green-950/30 dark:text-green-200 dark:border-green-900";
      label = "Active";
      if (status.lastTestedAt) {
        detail = `Last verified ${new Date(status.lastTestedAt).toLocaleString()}`;
      }
      break;
  }
  return (
    <div className={`rounded-md border px-4 py-3 text-xs ${color}`}>
      <p className="font-medium">{label}</p>
      {detail && <p className="mt-0.5 text-[11px] opacity-80">{detail}</p>}
    </div>
  );
}

export { toSimplePill };
