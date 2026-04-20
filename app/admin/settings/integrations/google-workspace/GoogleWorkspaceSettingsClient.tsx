"use client";

import { useState, useTransition } from "react";
import {
  saveGoogleWorkspaceIntegrationAction,
  verifyGoogleWorkspaceIntegrationAction,
} from "./actions";

export interface GoogleWorkspaceConfigView {
  configured: boolean;
  isActive: boolean;
  authorizedDomain: string | null;
  defaultSenderEmail: string | null;
  lastTestedAt: string | null; // ISO
  lastStatus: string | null;
  lastMessage: string | null;
}

interface Props {
  initial: GoogleWorkspaceConfigView;
  currentAdminEmail: string | null;
}

type ToastKind = "success" | "error" | null;

export function GoogleWorkspaceSettingsClient({
  initial,
  currentAdminEmail,
}: Props) {
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [authorizedDomain, setAuthorizedDomain] = useState(
    initial.authorizedDomain ?? "hhi-builders.com",
  );
  const [defaultSenderEmail, setDefaultSenderEmail] = useState(
    initial.defaultSenderEmail ?? currentAdminEmail ?? "",
  );
  const [testRecipient, setTestRecipient] = useState(currentAdminEmail ?? "");
  const [saveToast, setSaveToast] = useState<{ kind: ToastKind; message: string }>({
    kind: null,
    message: "",
  });
  const [verifyResult, setVerifyResult] = useState<{
    kind: ToastKind;
    message: string;
    errorCode?: string;
    testSentTo?: string;
  } | null>(null);
  const [saving, startSave] = useTransition();
  const [verifying, startVerify] = useTransition();

  const status = deriveStatus(initial);

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
        message:
          "Saved. Click Test Send to verify and flip the integration to Active.",
      });
      // Clear the JSON field after save so it isn't re-sent on the next save.
      setServiceAccountJson("");
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
    });
  }

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

      <StatusBadge status={status} />

      {/* Form */}
      <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-800">Credentials</h2>

        <label className="mt-4 block text-xs font-medium text-zinc-700">
          Service Account JSON
        </label>
        <textarea
          value={serviceAccountJson}
          onChange={(e) => setServiceAccountJson(e.target.value)}
          rows={10}
          placeholder={
            initial.configured
              ? "Paste new JSON to rotate the key. Leave empty to keep the current key."
              : 'Paste the contents of the service-account JSON file (must include "type": "service_account", client_email, private_key).'
          }
          className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 p-3 font-mono text-[11px] text-zinc-800 focus:border-[#F47216] focus:outline-none"
          spellCheck={false}
          autoComplete="off"
        />
        <p className="mt-1 text-[11px] text-zinc-500">
          Stored encrypted at rest (AES-256-GCM). Never displayed back after save.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Authorized Domain"
            hint="Your Workspace domain. Sends from outside this domain are rejected."
          >
            <input
              type="text"
              value={authorizedDomain}
              onChange={(e) => setAuthorizedDomain(e.target.value)}
              placeholder="hhi-builders.com"
              className={inputClasses}
              autoComplete="off"
            />
          </Field>
          <Field
            label="Default Sender Email"
            hint="Used by Test Send and as a fallback when no sender is specified."
          >
            <input
              type="email"
              value={defaultSenderEmail}
              onChange={(e) => setDefaultSenderEmail(e.target.value)}
              placeholder="admin@hhi-builders.com"
              className={inputClasses}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-[#1A2332] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#0f1621] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Configuration"}
          </button>
          {saveToast.kind && (
            <span
              className={
                saveToast.kind === "success"
                  ? "text-xs text-emerald-700"
                  : "text-xs text-rose-700"
              }
            >
              {saveToast.message}
            </span>
          )}
        </div>
      </section>

      {/* Test send */}
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-800">Test Send</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Sends a one-line test email using the configured service account. On
          success, the integration flips to <strong>Active</strong>.
        </p>

        <Field label="Test Recipient" hint="Your own email is a safe default.">
          <input
            type="email"
            value={testRecipient}
            onChange={(e) => setTestRecipient(e.target.value)}
            className={inputClasses}
            autoComplete="off"
          />
        </Field>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onVerify}
            disabled={verifying || !initial.configured}
            className="rounded-md border border-[#F47216] px-4 py-2 text-sm font-medium text-[#F47216] transition hover:bg-[#F47216] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title={
              initial.configured
                ? undefined
                : "Save a service account JSON first."
            }
          >
            {verifying ? "Sending test…" : "Test Send"}
          </button>
        </div>

        {verifyResult && (
          <div
            className={
              "mt-4 rounded-md border p-3 text-xs " +
              (verifyResult.kind === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-rose-300 bg-rose-50 text-rose-900")
            }
            role="status"
            aria-live="polite"
          >
            <p className="font-medium">
              {verifyResult.kind === "success" ? "✓ " : "✕ "}
              {verifyResult.kind === "success"
                ? `Test email sent to ${verifyResult.testSentTo ?? testRecipient}`
                : "Test send failed"}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{verifyResult.message}</p>
            {verifyResult.errorCode && (
              <p className="mt-1 text-[11px] opacity-70">
                code: <code>{verifyResult.errorCode}</code>
              </p>
            )}
          </div>
        )}
      </section>

      <p className="mt-6 text-[11px] text-zinc-500">
        Daily send ceiling per employee:{" "}
        <code>EMPLOYEE_DAILY_EMAIL_LIMIT</code> env var (default 50). Change via{" "}
        <code>.env.local</code>.
      </p>
    </div>
  );
}

// ─── Presentational bits ─────────────────────────────────────────────────────

const inputClasses =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-[#F47216] focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-700">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

type StatusKind =
  | { kind: "unconfigured" }
  | { kind: "configured-unverified" }
  | { kind: "configured-failed"; when: string; message: string | null }
  | { kind: "active"; when: string };

function deriveStatus(v: GoogleWorkspaceConfigView): StatusKind {
  if (!v.configured) return { kind: "unconfigured" };
  if (!v.lastTestedAt) return { kind: "configured-unverified" };
  const when = new Date(v.lastTestedAt).toLocaleString();
  if (v.isActive && v.lastStatus === "success") {
    return { kind: "active", when };
  }
  return { kind: "configured-failed", when, message: v.lastMessage };
}

function StatusBadge({ status }: { status: StatusKind }) {
  let color = "bg-zinc-100 text-zinc-700 border-zinc-200";
  let label = "Not configured";
  let detail: string | null = null;
  switch (status.kind) {
    case "unconfigured":
      break;
    case "configured-unverified":
      color = "bg-amber-50 text-amber-900 border-amber-200";
      label = "Configured — never verified";
      detail = "Run Test Send to activate.";
      break;
    case "configured-failed":
      color = "bg-rose-50 text-rose-900 border-rose-200";
      label = "Configured — last verify failed";
      detail = `${status.when}${status.message ? ` · ${status.message}` : ""}`;
      break;
    case "active":
      color = "bg-emerald-50 text-emerald-900 border-emerald-200";
      label = "Active";
      detail = `Last verified ${status.when}`;
      break;
  }
  return (
    <div className={`rounded-md border px-4 py-3 text-xs ${color}`}>
      <p className="font-medium">{label}</p>
      {detail && <p className="mt-0.5 text-[11px] opacity-80">{detail}</p>}
    </div>
  );
}
