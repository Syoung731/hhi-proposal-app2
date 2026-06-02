"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPhoneUploadSession } from "../actions";

type Props = {
  projectId: string;
  open: boolean;
  onClose: (didReceive: boolean) => void;
};

/**
 * "Send from Phone" QR modal. Mints a short-lived upload token, renders it as
 * a QR code, and polls for a live "N photos received" count. The salesperson
 * scans it with their phone camera to open /m/<token> and upload photos
 * straight to R2.
 */
export function PhoneUploadModal({ projectId, open, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [receivedCount, setReceivedCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mint a session + build the QR when the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl("");
    setToken("");
    setQrDataUrl("");
    setReceivedCount(0);
    setCopied(false);

    (async () => {
      const res = await createPhoneUploadSession(projectId);
      if (cancelled) return;
      if ("error" in res) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setUrl(res.url);
      setToken(res.token);
      try {
        const QRCode = await import("qrcode");
        const dataUrl = await QRCode.toDataURL(res.url, { width: 240, margin: 1 });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        /* QR render failed — the copyable URL below still works */
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  // Poll the live received-count while open.
  useEffect(() => {
    if (!open || !token) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/phone-upload/status?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (typeof data.uploadCount === "number") setReceivedCount(data.uploadCount);
      } catch {
        /* transient — keep polling */
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [open, token]);

  const handleClose = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    onClose(receivedCount > 0);
  }, [onClose, receivedCount]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [url]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-upload-title"
    >
      <div className="flex w-full max-w-md flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div>
            <h2
              id="phone-upload-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Send photos from your phone
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Scan this with your phone’s camera, then pick photos and upload.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="ml-4 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 px-4 py-6">
          {loading && (
            <p className="py-12 text-sm text-zinc-500 dark:text-zinc-400">
              Generating secure link…
            </p>
          )}

          {error && (
            <div className="w-full rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="QR code to open the phone upload page"
                  className="h-60 w-60 rounded border border-zinc-200 dark:border-zinc-700"
                  width={240}
                  height={240}
                />
              ) : (
                <div className="flex h-60 w-60 items-center justify-center rounded border border-zinc-200 text-xs text-zinc-400 dark:border-zinc-700">
                  QR unavailable — use the link below
                </div>
              )}

              <div className="w-full">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={url}
                    className="min-w-0 flex-1 truncate rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={copyUrl}
                    className="shrink-0 rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Link expires in 12 hours. Photos land in Unassigned Photos.
                </p>
              </div>

              <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
                <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                  {receivedCount}
                </span>{" "}
                <span className="text-emerald-700 dark:text-emerald-400">
                  photo{receivedCount === 1 ? "" : "s"} received
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={handleClose}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
