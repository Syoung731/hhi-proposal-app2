"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from "react";

type Props = {
  projectId: string;
  open: boolean;
  onClose: (didImport: boolean) => void;
};

type PickedFile = { id: string; name: string; mimeType: string };
type Phase = "idle" | "picking" | "importing" | "done";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** Matches DRIVE_IMPORT_MAX_PER_CALL server-side; we chunk to stay under it. */
const CHUNK = 10;

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";

/** Inject a <script> once and resolve when it loads. */
function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export function DriveImportModal({ projectId, open, onClose }: Props) {
  const configured = !!CLIENT_ID && !!API_KEY;

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scriptsReady, setScriptsReady] = useState(false);
  const [counts, setCounts] = useState({ done: 0, failed: 0, total: 0 });

  // Load the Google scripts when the modal opens (once).
  useEffect(() => {
    if (!open || !configured) return;
    let cancelled = false;
    setError(null);
    setPhase("idle");
    setCounts({ done: 0, failed: 0, total: 0 });
    (async () => {
      try {
        await Promise.all([
          loadScript("https://accounts.google.com/gsi/client", "gsi-client"),
          loadScript("https://apis.google.com/js/api.js", "gapi-client"),
        ]);
        // Load the picker module from gapi.
        await new Promise<void>((resolve, reject) => {
          (window as any).gapi.load("picker", {
            callback: () => resolve(),
            onerror: () => reject(new Error("Failed to load Google Picker")),
          });
        });
        if (!cancelled) setScriptsReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load Google");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, configured]);

  /** Run the OAuth token client → resolve with a fresh access token. */
  const getAccessToken = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: (resp: any) => {
            if (resp?.access_token) resolve(resp.access_token);
            else reject(new Error(resp?.error || "Could not get Google access"));
          },
        });
        tokenClient.requestAccessToken({ prompt: "" });
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Google sign-in failed"));
      }
    });
  }, []);

  /** Open the Picker and resolve with the chosen image files. */
  const openPicker = useCallback((accessToken: string): Promise<PickedFile[]> => {
    return new Promise((resolve) => {
      const google = (window as any).google;
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMode(google.picker.DocsViewMode.GRID);

      const builder = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(API_KEY)
        .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const files: PickedFile[] = (data.docs ?? []).map((d: any) => ({
              id: d.id,
              name: d.name ?? "photo.jpg",
              mimeType: d.mimeType ?? "",
            }));
            resolve(files);
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve([]);
          }
        });
      if (APP_ID) builder.setAppId(APP_ID);
      builder.build().setVisible(true);
    });
  }, []);

  const handleChoose = useCallback(async () => {
    setError(null);
    setPhase("picking");
    try {
      const accessToken = await getAccessToken();
      const files = await openPicker(accessToken);
      if (files.length === 0) {
        setPhase("idle");
        return;
      }
      setPhase("importing");
      setCounts({ done: 0, failed: 0, total: files.length });

      for (let start = 0; start < files.length; start += CHUNK) {
        const chunk = files.slice(start, start + CHUNK);
        try {
          const res = await fetch("/api/drive-import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, accessToken, files: chunk }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Import failed");
          setCounts((c) => ({
            ...c,
            done: c.done + (data.success?.length ?? 0),
            failed: c.failed + (data.failed?.length ?? 0),
          }));
        } catch (e) {
          setCounts((c) => ({ ...c, failed: c.failed + chunk.length }));
          setError(e instanceof Error ? e.message : "Import failed");
        }
      }
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google Drive import failed");
      setPhase("idle");
    }
  }, [getAccessToken, openPicker, projectId]);

  const handleClose = useCallback(() => {
    onClose(counts.done > 0);
  }, [onClose, counts.done]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-import-title"
    >
      <div className="flex w-full max-w-md flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-start justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <div>
            <h2
              id="drive-import-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Import from Google Drive
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Pick photos from your Drive. They land in Unassigned Photos.
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
          {!configured && (
            <div className="w-full rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              Google Drive import isn’t configured yet. Set
              <code className="mx-1 rounded bg-amber-100 px-1 dark:bg-amber-900/40">
                NEXT_PUBLIC_GOOGLE_CLIENT_ID
              </code>
              and
              <code className="mx-1 rounded bg-amber-100 px-1 dark:bg-amber-900/40">
                NEXT_PUBLIC_GOOGLE_API_KEY
              </code>
              in the environment.
            </div>
          )}

          {error && (
            <div className="w-full rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          {configured && (phase === "idle" || phase === "picking") && (
            <button
              type="button"
              onClick={handleChoose}
              disabled={!scriptsReady || phase === "picking"}
              className={
                "w-full rounded-lg px-4 py-3 text-center text-sm font-semibold text-white " +
                (!scriptsReady || phase === "picking"
                  ? "cursor-not-allowed bg-zinc-300 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                  : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200")
              }
            >
              {!scriptsReady
                ? "Loading Google…"
                : phase === "picking"
                  ? "Waiting for Google…"
                  : "Choose from Google Drive"}
            </button>
          )}

          {(phase === "importing" || phase === "done") && (
            <div className="w-full text-center">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {phase === "done"
                  ? `Imported ${counts.done} of ${counts.total}`
                  : `Importing ${counts.done + counts.failed} of ${counts.total}…`}
              </p>
              {counts.failed > 0 && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {counts.failed} failed
                </p>
              )}
            </div>
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
