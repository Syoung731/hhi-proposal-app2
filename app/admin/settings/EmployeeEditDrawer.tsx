"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { updateEmployee } from "./actions";
import type { EmployeeForUI } from "./settings-tabs";
import {
  buildEmployeeSignature,
  type SignatureEmployee,
} from "@/app/lib/email/signature-builder";

interface Props {
  employee: EmployeeForUI;
  currentUserIsAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  roleTitle: string;
  email: string;
  phone: string;
  headshotUrl: string;
  jobTitle: string;
  signatureQuote: string;
  directPhone: string;
  mobilePhone: string;
  linkedInUrl: string;
  signatureEnabled: boolean;
}

function toFormState(emp: EmployeeForUI): FormState {
  return {
    firstName: emp.firstName,
    lastName: emp.lastName,
    roleTitle: emp.roleTitle ?? "",
    email: emp.email ?? "",
    phone: emp.phone ?? "",
    headshotUrl: emp.headshotUrl ?? "",
    jobTitle: emp.jobTitle ?? "",
    signatureQuote: emp.signatureQuote ?? "",
    directPhone: emp.directPhone ?? "",
    mobilePhone: emp.mobilePhone ?? "",
    linkedInUrl: emp.linkedInUrl ?? "",
    signatureEnabled: emp.signatureEnabled,
  };
}

function areEqual(a: FormState, b: FormState): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.roleTitle === b.roleTitle &&
    a.email === b.email &&
    a.phone === b.phone &&
    a.headshotUrl === b.headshotUrl &&
    a.jobTitle === b.jobTitle &&
    a.signatureQuote === b.signatureQuote &&
    a.directPhone === b.directPhone &&
    a.mobilePhone === b.mobilePhone &&
    a.linkedInUrl === b.linkedInUrl &&
    a.signatureEnabled === b.signatureEnabled
  );
}

/**
 * Right-aligned slide-in edit drawer for a single Employee row. Replaces
 * the prior inline-edit mode because the Signature section carries 7 new
 * fields + a live preview that won't fit inline with the 12-column grid.
 *
 * Layout:
 *   Top  → Basic Info + Signature form sections
 *   Mid  → Save / Cancel row
 *   Bot  → Live preview of buildEmployeeSignature() output, re-rendered on
 *          every keystroke via dangerouslySetInnerHTML
 */
export function EmployeeEditDrawer({
  employee,
  currentUserIsAdmin: _currentUserIsAdmin,
  onClose,
  onSaved,
}: Props) {
  const initialStateRef = useRef(toFormState(employee));
  const [state, setState] = useState<FormState>(initialStateRef.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const isDirty = useMemo(
    () => !areEqual(state, initialStateRef.current),
    [state],
  );

  // Close on Escape (with dirty check).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      attemptClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  function attemptClose() {
    if (isDirty) {
      const ok = window.confirm(
        "You have unsaved changes. Close without saving?",
      );
      if (!ok) return;
    }
    onClose();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateEmployee(employee.id, {
      firstName: state.firstName.trim(),
      lastName: state.lastName.trim(),
      roleTitle: state.roleTitle.trim() || null,
      email: state.email.trim() || null,
      phone: state.phone.trim() || null,
      headshotUrl: state.headshotUrl.trim() || null,
      jobTitle: state.jobTitle.trim() || null,
      signatureQuote: state.signatureQuote.trim() || null,
      directPhone: state.directPhone.trim() || null,
      mobilePhone: state.mobilePhone.trim() || null,
      linkedInUrl: state.linkedInUrl.trim() || null,
      signatureEnabled: state.signatureEnabled,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    initialStateRef.current = state;
    onSaved();
  }

  const handleHeadshotFile = useCallback(
    async (file: File) => {
      setUploadError(null);
      if (file.size > 5 * 1024 * 1024) {
        setUploadError("File is larger than 5 MB. Choose a smaller image.");
        return;
      }
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
        setUploadError("Unsupported file type. Use PNG, JPEG, or WEBP.");
        return;
      }
      setUploading(true);
      try {
        // 1) Request a presigned URL from our own API.
        const presignRes = await fetch(
          "/api/settings/employees/headshot/upload",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employeeId: employee.id,
              fileName: file.name,
              contentType: file.type,
            }),
          },
        );
        if (!presignRes.ok) {
          const body = (await presignRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Failed to get upload URL");
        }
        const { uploadUrl, publicUrl } = (await presignRes.json()) as {
          uploadUrl: string;
          publicUrl: string;
        };

        // 2) PUT the file binary directly to R2.
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`Upload failed with status ${putRes.status}`);
        }

        // 3) Stage the URL in the form — Save commits it to the DB.
        setState((prev) => ({ ...prev, headshotUrl: publicUrl }));
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Upload failed.",
        );
      } finally {
        setUploading(false);
      }
    },
    [employee.id],
  );

  function removeHeadshot() {
    setState((prev) => ({ ...prev, headshotUrl: "" }));
  }

  // Live signature preview — feed the current form state into the builder.
  const signatureInput: SignatureEmployee = {
    firstName: state.firstName,
    lastName: state.lastName,
    jobTitle: state.jobTitle.trim() || null,
    headshotUrl: state.headshotUrl.trim() || null,
    signatureQuote: state.signatureQuote.trim() || null,
    email: state.email.trim() || null,
    directPhone: state.directPhone.trim() || null,
    mobilePhone: state.mobilePhone.trim() || null,
    linkedInUrl: state.linkedInUrl.trim() || null,
    signatureEnabled: state.signatureEnabled,
  };

  const hasAnySignatureContent = Boolean(
    signatureInput.signatureEnabled &&
      (signatureInput.headshotUrl ||
        signatureInput.jobTitle ||
        signatureInput.signatureQuote ||
        signatureInput.email ||
        signatureInput.directPhone ||
        signatureInput.mobilePhone ||
        signatureInput.linkedInUrl ||
        signatureInput.firstName.trim() ||
        signatureInput.lastName.trim()),
  );
  const preview = hasAnySignatureContent
    ? buildEmployeeSignature(signatureInput)
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        aria-hidden
        onClick={attemptClose}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label={`Edit ${employee.firstName} ${employee.lastName}`}
        className="fixed right-0 top-0 z-50 flex h-full w-[640px] max-w-[95vw] flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-zinc-500">
              Edit Employee
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {employee.firstName} {employee.lastName}
            </h2>
          </div>
          <button
            type="button"
            onClick={attemptClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
            aria-label="Close drawer"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Basic Info
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input
                  type="text"
                  value={state.firstName}
                  onChange={(e) =>
                    setState((p) => ({ ...p, firstName: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Last name">
                <input
                  type="text"
                  value={state.lastName}
                  onChange={(e) =>
                    setState((p) => ({ ...p, lastName: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Operational role">
                <input
                  type="text"
                  value={state.roleTitle}
                  onChange={(e) =>
                    setState((p) => ({ ...p, roleTitle: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="e.g. Project Director"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={state.email}
                  onChange={(e) =>
                    setState((p) => ({ ...p, email: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Phone (general)">
                <input
                  type="tel"
                  value={state.phone}
                  onChange={(e) =>
                    setState((p) => ({ ...p, phone: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>
            </div>
          </section>

          <hr className="my-6 border-zinc-200 dark:border-zinc-800" />

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Signature
              </h3>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={state.signatureEnabled}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      signatureEnabled: e.target.checked,
                    }))
                  }
                  className="h-4 w-4"
                />
                Include in outbound emails
              </label>
            </div>

            {/* Headshot upload */}
            <Field label="Headshot">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                  {state.headshotUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={state.headshotUrl}
                      alt=""
                      className="h-16 w-16 object-cover"
                    />
                  ) : (
                    <span className="text-sm font-medium text-zinc-500">
                      {(state.firstName[0] ?? "").toUpperCase()}
                      {(state.lastName[0] ?? "").toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <label
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 ${
                      uploading ? "opacity-60" : ""
                    }`}
                  >
                    {uploading ? "Uploading…" : state.headshotUrl ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleHeadshotFile(file);
                        // Clear so re-selecting the same file fires onChange again.
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {state.headshotUrl && (
                    <button
                      type="button"
                      onClick={removeHeadshot}
                      className="ml-2 text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  )}
                  {uploadError && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {uploadError}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    PNG, JPEG, or WEBP, up to 5 MB. Square crops look best.
                  </p>
                </div>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Client-facing job title">
                <input
                  type="text"
                  value={state.jobTitle}
                  onChange={(e) =>
                    setState((p) => ({ ...p, jobTitle: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="e.g. Senior Project Manager"
                />
              </Field>
              <Field label="Signature quote (optional)">
                <input
                  type="text"
                  value={state.signatureQuote}
                  onChange={(e) =>
                    setState((p) => ({ ...p, signatureQuote: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="One-line tagline"
                  maxLength={120}
                />
              </Field>
              <Field label="Direct phone">
                <input
                  type="tel"
                  value={state.directPhone}
                  onChange={(e) =>
                    setState((p) => ({ ...p, directPhone: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="(555) 123-4567"
                />
              </Field>
              <Field label="Mobile phone">
                <input
                  type="tel"
                  value={state.mobilePhone}
                  onChange={(e) =>
                    setState((p) => ({ ...p, mobilePhone: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="(555) 123-4567"
                />
              </Field>
              <Field label="LinkedIn URL" colSpan={2}>
                <input
                  type="url"
                  value={state.linkedInUrl}
                  onChange={(e) =>
                    setState((p) => ({ ...p, linkedInUrl: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="https://linkedin.com/in/…"
                />
              </Field>
            </div>
          </section>

          <hr className="my-6 border-zinc-200 dark:border-zinc-800" />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Signature preview
              </h3>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Live — updates as you type
              </span>
            </div>
            <div
              data-testid="signature-preview"
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {preview ? (
                <div dangerouslySetInnerHTML={{ __html: preview.html }} />
              ) : (
                <p className="text-xs italic text-zinc-500 dark:text-zinc-400">
                  Fill in the fields above to see a preview.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          {error ? (
            <span className="text-xs text-red-600 dark:text-red-400">
              {error}
            </span>
          ) : (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {isDirty ? "Unsaved changes" : "No changes"}
            </span>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={attemptClose}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

function Field({
  label,
  children,
  colSpan,
}: {
  label: string;
  children: React.ReactNode;
  colSpan?: 1 | 2;
}) {
  return (
    <div className={colSpan === 2 ? "col-span-2" : undefined}>
      <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
    </div>
  );
}
