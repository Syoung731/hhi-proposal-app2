 "use client";

 import { useEffect, useRef, useState } from "react";
 import {
   createExtensionPairCodeAction,
   startDirectConnectionAction,
   getConnectionStatusAction,
   markConnectionFailedAction,
 } from "../actions";
 import {
   detectZillowConnectionReadiness,
   sendBeginHandshake,
   sendOpenZillowForAddress,
   type ZillowConnectionReadinessState,
   type DetectionResult,
 } from "@/app/lib/zillow-extension-detection";

 /** Poll interval for direct connection status (Zillow extension handshake). */
 const DIRECT_CONNECTION_POLL_MS = 2000;
 /** Stop polling after this long when waiting for extension to verify. */
 const DIRECT_CONNECTION_TIMEOUT_MS = 3 * 60 * 1000;

 /** When set (e.g. Chrome Web Store or Edge Add-ons URL), "Install Extension" opens this; otherwise dev: "Open Chrome Extensions" → chrome://extensions. */
 const ZILLOW_EXTENSION_STORE_URL =
   typeof process !== "undefined"
     ? process.env.NEXT_PUBLIC_ZILLOW_EXTENSION_STORE_URL ?? null
     : null;

 type Props = {
   projectId: string;
   /** Project property address (Overview) for opening Zillow after direct handshake. */
   projectAddress?: string | null;
 };

 /**
  * Project-level Zillow Import: connection modal and Connect Browser entry point.
  * Handles browser/extension detection, direct handshake, manual pairing fallback, and opening Zillow.
  */
 export function ZillowConnectModal({ projectId, projectAddress = null }: Props) {
   const [zillowImportModalOpen, setZillowImportModalOpen] = useState(false);
   const [pairCode, setPairCode] = useState<string | null>(null);
   const [pairCodeExpiresAt, setPairCodeExpiresAt] = useState<Date | null>(null);
   const [pairCodeLoading, setPairCodeLoading] = useState(false);
   const [pairCodeError, setPairCodeError] = useState<string | null>(null);
   /** Direct browser connection (nonce handshake). */
   const [directSessionId, setDirectSessionId] = useState<string | null>(null);
   const [directNonce, setDirectNonce] = useState<string | null>(null);
   const [directStatus, setDirectStatus] = useState<
     "idle" | "connecting" | "connected" | "failed" | "expired"
   >("idle");
   const [directError, setDirectError] = useState<string | null>(null);
   const [showManualFallback, setShowManualFallback] = useState(false);
   /** Zillow Import: compatibility and extension detection before connection. */
   const [zillowDetectionStatus, setZillowDetectionStatus] = useState<
     "idle" | "detecting" | "done"
   >("idle");
   const [zillowReadinessState, setZillowReadinessState] =
     useState<ZillowConnectionReadinessState | null>(null);
   const [zillowDetectionMessage, setZillowDetectionMessage] = useState<string | null>(
     null
   );
   const [zillowDetectionDetail, setZillowDetectionDetail] =
     useState<DetectionResult | null>(null);

   /** Ref: have we already tried to start direct connection this modal open (avoid double-run). */
   const directStartAttemptedRef = useRef(false);
   /** Ref: have we already started detection this modal open (avoid double-run and effect cleanup cancelling the promise). */
   const zillowDetectionStartedRef = useRef(false);
   /** Ref: have we already sent openZillowForAddress this connection success (avoid opening multiple tabs). */
   const openedZillowForAddressRef = useRef(false);
   /** Incremented on Try Again so detection effect re-runs. */
   const [zillowDetectionRetryKey, setZillowDetectionRetryKey] = useState(0);

   /** Debug logging for Zillow detection/direct handshake; gated by localStorage zillowImportDebug. */
   const logZillowDebug = (...args: unknown[]) => {
     if (
       typeof window !== "undefined" &&
       window.localStorage?.getItem("zillowImportDebug") === "true"
     ) {
       console.log("[Zillow]", ...args);
     }
   };

   /** Reset all Zillow connection modal state and refs. */
   const resetZillowModalState = async (opts: {
     markConnectingFailed?: boolean;
     closeModal?: boolean;
     rerunDetection?: boolean;
   }) => {
     if (opts.markConnectingFailed && directSessionId && directStatus === "connecting") {
       await markConnectionFailedAction(directSessionId);
     }
     zillowDetectionStartedRef.current = false;
     directStartAttemptedRef.current = false;
     openedZillowForAddressRef.current = false;
     setPairCode(null);
     setPairCodeExpiresAt(null);
     setPairCodeError(null);
     setZillowDetectionStatus("idle");
     setZillowReadinessState(null);
     setZillowDetectionMessage(null);
     setZillowDetectionDetail(null);
     setDirectSessionId(null);
     setDirectNonce(null);
     setDirectStatus("idle");
     setDirectError(null);
     setShowManualFallback(false);
     if (opts.closeModal) setZillowImportModalOpen(false);
     if (opts.closeModal === false && opts.rerunDetection) {
       setZillowDetectionRetryKey((k) => k + 1);
     }
   };

   // When Zillow Import modal opens (or Try Again), run compatibility/extension detection once.
   // Use a ref (not zillowDetectionStatus) in the guard so that when we set "detecting", this effect does not re-run and its cleanup does not set cancelled=true.
   useEffect(() => {
     if (!zillowImportModalOpen) return;
     if (zillowDetectionStartedRef.current) return;
     zillowDetectionStartedRef.current = true;
     setZillowDetectionStatus("detecting");
     let cancelled = false;
     const debug =
       typeof window !== "undefined" &&
       window.localStorage?.getItem("zillowImportDebug") === "true";
     logZillowDebug("detection starting");
     detectZillowConnectionReadiness({
       pingTimeoutMs: 2500,
       capabilitiesTimeoutMs: 2500,
       debug: !!debug,
     }).then((result) => {
       if (cancelled) {
         logZillowDebug("detection cancelled, skipping setState");
         return;
       }
       setZillowReadinessState(result.state);
       setZillowDetectionMessage(result.message ?? null);
       setZillowDetectionDetail(result);
       setZillowDetectionStatus("done");
       logZillowDebug("detection done", result.state);
     });
     return () => {
       cancelled = true;
     };
   }, [zillowImportModalOpen, zillowDetectionRetryKey]);

   // When detection is done and state is supportedDirectHandshakeReady, start direct connection once (feature-flagged on server).
   useEffect(() => {
     if (
       !zillowImportModalOpen ||
       zillowDetectionStatus !== "done" ||
       zillowReadinessState !== "supportedDirectHandshakeReady"
     )
       return;
     if (directStartAttemptedRef.current) return;
     directStartAttemptedRef.current = true;
     let cancelled = false;
     (async () => {
       logZillowDebug("direct handshake starting");
       const result = await startDirectConnectionAction(projectId);
       if (cancelled) return;
       logZillowDebug(
         "session creation result",
         "error" in result ? result : { sessionId: result.sessionId, hasNonce: !!result.nonce }
       );
       if ("error" in result) {
         setShowManualFallback(true);
         setDirectError(result.error);
         return;
       }
       setDirectSessionId(result.sessionId);
       setDirectNonce(result.nonce);
       setDirectStatus("connecting");
       logZillowDebug("handshake request sent to extension");
       sendBeginHandshake(result.nonce, result.sessionId).then((handshakeResponse) => {
         if (cancelled) return;
         logZillowDebug("beginHandshake response from extension", handshakeResponse);
       });
     })();
     return () => {
       cancelled = true;
     };
   }, [
     zillowImportModalOpen,
     zillowDetectionStatus,
     zillowReadinessState,
     projectId,
   ]);

   // After direct handshake success, open Zillow in a new tab with project address (if available).
   useEffect(() => {
     if (directStatus !== "connected") return;
     if (openedZillowForAddressRef.current) return;
     const address =
       typeof projectAddress === "string" ? projectAddress.trim() : "";
     if (!address) return;
     openedZillowForAddressRef.current = true;
     logZillowDebug("address found, opening Zillow", address);
     sendOpenZillowForAddress(address).then((res) => {
       logZillowDebug("openZillowForAddress sent", res);
     });
   }, [directStatus, projectAddress]);

   // Poll connection status while waiting for extension to verify.
   useEffect(() => {
     if (directStatus !== "connecting" || !directSessionId) return;
     const startedAt = Date.now();
     const intervalId = setInterval(async () => {
       if (Date.now() - startedAt > DIRECT_CONNECTION_TIMEOUT_MS) {
         setDirectStatus("failed");
         setShowManualFallback(true);
         return;
       }
       const result = await getConnectionStatusAction(directSessionId);
       if ("error" in result) return;
       if (result.status === "CONNECTED") {
         setDirectStatus("connected");
         return;
       }
       if (result.status === "FAILED" || result.status === "EXPIRED") {
         setDirectStatus(result.status === "EXPIRED" ? "expired" : "failed");
         setShowManualFallback(true);
       }
     }, DIRECT_CONNECTION_POLL_MS);
     return () => clearInterval(intervalId);
   }, [directStatus, directSessionId]);

   return (
     <>
       {/* Project-level Zillow Import — single entry point; imported photos land in Imported from Zillow */}
       <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-800/30">
         <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
           Zillow Import
         </h2>
         <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
           Import photos from a Zillow listing at the project level. They will appear in{" "}
           <strong>Imported from Zillow</strong> in the Sections list; assign them to
           sections from there.
         </p>
         <div className="flex flex-col gap-1">
           <button
             type="button"
             onClick={() => {
               void resetZillowModalState({ closeModal: false, rerunDetection: false });
               setZillowImportModalOpen(true);
             }}
             className="w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
           >
             Connect Browser
           </button>
           <span className="text-xs text-zinc-500 dark:text-zinc-400">
             Securely connects this browser to Zillow Import so listing photos and details
             can be brought into this project.
           </span>
         </div>
         {/* Later: Import Selected status (Phase 4) */}
         <div
           className="min-h-[1.5rem] text-sm text-zinc-500 dark:text-zinc-400"
           aria-hidden="true"
         >
           {/* Placeholder for "Import Selected" status */}
         </div>
       </section>

       {/* Zillow Import modal: Connect Browser onboarding */}
       {zillowImportModalOpen && (
         <div
           className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
           role="dialog"
           aria-modal="true"
           aria-labelledby="zillow-connect-title"
         >
           <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
             {/* Hidden element for extension content script */}
             {directNonce != null && directSessionId != null && (
               <div
                 id="zillow-connection-handshake"
                 data-nonce={directNonce}
                 data-session-id={directSessionId}
                 aria-hidden="true"
                 className="hidden"
               />
             )}

             {/* Header */}
             <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
               <h2
                 id="zillow-connect-title"
                 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
               >
                 Connect Browser
               </h2>
               <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                 Securely connect this browser to Zillow Import so listing photos and
                 details can be brought into this project.
               </p>
             </div>

             {/* Body: state-based message */}
             <div className="min-h-[4rem] px-4 py-4">
               {/* Checking browser… / Checking extension… */}
               {(zillowDetectionStatus === "idle" ||
                 zillowDetectionStatus === "detecting") && (
                 <div className="flex items-center gap-3">
                   <span
                     className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"
                     aria-hidden
                   />
                   <p className="text-sm text-zinc-600 dark:text-zinc-400">
                     {zillowDetectionStatus === "idle"
                       ? "Checking browser…"
                       : "Checking extension…"}
                   </p>
                 </div>
               )}

               {/* Unsupported: Zillow Import works in desktop Chrome or Edge. */}
               {zillowDetectionStatus === "done" &&
                 (zillowReadinessState === "unsupportedBrowser" ||
                   zillowReadinessState === "unsupportedMobile") && (
                   <p className="text-sm text-zinc-700 dark:text-zinc-300">
                     Zillow Import works in desktop Chrome or Edge.
                   </p>
                 )}

               {/* No extension: setup instructions */}
               {zillowDetectionStatus === "done" &&
                 zillowReadinessState === "supportedNoExtension" &&
                 !showManualFallback && (
                   <div className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                     <p>
                       You’ll need the Zillow Import browser extension to import photos
                       and listing details from Zillow. This is a one-time setup.
                     </p>
                     <p>
                       Load the extension from the{" "}
                       <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-700">
                         chrome-extension/zillow-importer
                       </code>{" "}
                       folder (Chrome → Extensions → Load unpacked). When you’re done,
                       click Connect Browser again to retry.
                     </p>
                   </div>
                 )}

               {/* Direct handshake ready: Connecting browser… + spinner */}
               {zillowDetectionStatus === "done" &&
                 zillowReadinessState === "supportedDirectHandshakeReady" && (
                   <>
                     {directStatus === "idle" && !directNonce && (
                       <div className="flex items-center gap-3">
                         <span
                           className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"
                           aria-hidden
                         />
                         <p className="text-sm text-zinc-600 dark:text-zinc-400">
                           Connecting browser…
                         </p>
                       </div>
                     )}
                     {directStatus === "connecting" && (
                       <div className="flex items-center gap-3">
                         <span
                           className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"
                           aria-hidden
                         />
                         <div>
                           <p className="text-sm text-zinc-600 dark:text-zinc-400">
                             Extension detected. Connecting your browser…
                           </p>
                           <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                             Open the Zillow Import extension and click Connect (or Pair) to
                             finish.
                           </p>
                         </div>
                       </div>
                     )}
                     {directStatus === "connected" && (
                       <div className="space-y-1">
                         <p className="text-sm font-medium text-green-700 dark:text-green-400">
                           Browser connected. Zillow Import is ready.
                         </p>
                         {!projectAddress?.trim() && (
                           <p className="text-xs text-zinc-500 dark:text-zinc-400">
                             No project address on Overview. Open Zillow manually to import
                             listing photos.
                           </p>
                         )}
                       </div>
                     )}
                     {(showManualFallback ||
                       directStatus === "failed" ||
                       directStatus === "expired") && (
                       <>
                         <p className="text-sm text-zinc-700 dark:text-zinc-300">
                           Connection failed. You can connect using a code instead.
                         </p>
                         {pairCodeError && (
                           <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                             {pairCodeError}
                           </p>
                         )}
                         {pairCode ? (
                           <>
                             <div className="mt-3 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                               <span className="font-mono text-xl font-bold tracking-widest text-zinc-900 dark:text-zinc-100">
                                 {pairCode}
                               </span>
                             </div>
                             <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                               Expires{" "}
                               {pairCodeExpiresAt
                                 ? new Date(pairCodeExpiresAt).toLocaleString()
                                 : ""}
                             </p>
                             <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                               Open the Zillow Import extension, paste this code, and
                               connect. Then use Capture Gallery on a Zillow listing and
                               Open Photo Picker to import.
                             </p>
                           </>
                         ) : (
                           <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                             Click Generate Code below, then paste it in the extension.
                           </p>
                         )}
                       </>
                     )}
                   </>
                 )}

               {/* Extension detected but direct could not be completed */}
               {zillowDetectionStatus === "done" &&
                 (zillowReadinessState === "supportedExtensionDetected" ||
                   zillowReadinessState === "supportedFallbackOnly" ||
                   zillowReadinessState === "unknownOrDegraded") && (
                   <>
                     <p className="text-sm text-zinc-700 dark:text-zinc-300">
                       Extension detected but direct connection could not be completed.
                     </p>
                     {pairCodeError && (
                       <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                         {pairCodeError}
                       </p>
                     )}
                     {pairCode ? (
                       <>
                         <div className="mt-3 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                           <span className="font-mono text-xl font-bold tracking-widest text-zinc-900 dark:text-zinc-100">
                             {pairCode}
                           </span>
                         </div>
                         <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                           Expires{" "}
                           {pairCodeExpiresAt
                             ? new Date(pairCodeExpiresAt).toLocaleString()
                             : ""}
                         </p>
                         <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                           Open the Zillow Import extension, paste this code, and connect.
                           Then use Capture Gallery on a Zillow listing and Open Photo
                           Picker to import.
                         </p>
                       </>
                     ) : (
                       <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                         Click Generate Code below, then paste it in the extension.
                       </p>
                     )}
                   </>
                 )}

               {/* No extension but user chose manual: simplified manual UI */}
               {zillowDetectionStatus === "done" &&
                 zillowReadinessState === "supportedNoExtension" &&
                 showManualFallback && (
                   <>
                     {pairCodeError && (
                       <p className="text-xs text-red-600 dark:text-red-400">
                         {pairCodeError}
                       </p>
                     )}
                     {pairCode ? (
                       <>
                         <div className="flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 py-3 dark:border-zinc-700 dark:bg-zinc-800">
                           <span className="font-mono text-xl font-bold tracking-widest text-zinc-900 dark:text-zinc-100">
                             {pairCode}
                           </span>
                         </div>
                         <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                           Expires{" "}
                           {pairCodeExpiresAt
                             ? new Date(pairCodeExpiresAt).toLocaleString()
                             : ""}
                         </p>
                         <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                           Open the Zillow Import extension, paste this code, and connect.
                           Then use Capture Gallery on a Zillow listing and Open Photo
                           Picker to import.
                         </p>
                       </>
                     ) : (
                       <p className="text-sm text-zinc-500 dark:text-zinc-400">
                         Generate a code below, then open the extension and paste it to
                         connect.
                       </p>
                     )}
                   </>
                 )}
             </div>

             {/* Footer: action buttons */}
             <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
               {zillowDetectionStatus === "done" &&
                 zillowReadinessState === "supportedNoExtension" &&
                 !showManualFallback && (
                   <>
                     <button
                       type="button"
                       onClick={() => {
                         try {
                           if (ZILLOW_EXTENSION_STORE_URL) {
                             window.open(ZILLOW_EXTENSION_STORE_URL, "_blank", "noopener");
                           } else {
                             window.open("chrome://extensions", "_blank", "noopener");
                           }
                         } catch {
                           // ignore
                         }
                       }}
                       className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                     >
                       {ZILLOW_EXTENSION_STORE_URL
                         ? "Install Extension"
                         : "Open Chrome Extensions"}
                     </button>
                     <button
                       type="button"
                       onClick={() => setShowManualFallback(true)}
                       className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                     >
                       Use Manual Code Instead
                     </button>
                     <button
                       type="button"
                       onClick={() =>
                         void resetZillowModalState({
                           markConnectingFailed: true,
                           closeModal: false,
                           rerunDetection: true,
                         })
                       }
                       className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                     >
                       Try Again
                     </button>
                   </>
                 )}

               {zillowReadinessState === "supportedDirectHandshakeReady" &&
                 directStatus === "connecting" && (
                   <button
                     type="button"
                     onClick={() => setShowManualFallback(true)}
                     className="text-sm font-medium text-zinc-600 underline hover:no-underline dark:text-zinc-400"
                   >
                     Use Manual Code Instead
                   </button>
                 )}

               {/* Try Again: re-run detection for failed or fallback states */}
               {(zillowReadinessState === "supportedNoExtension" && showManualFallback) ||
               zillowReadinessState === "supportedExtensionDetected" ||
               zillowReadinessState === "supportedFallbackOnly" ||
               zillowReadinessState === "unknownOrDegraded" ||
               (zillowReadinessState === "supportedDirectHandshakeReady" &&
                 (showManualFallback ||
                   directStatus === "failed" ||
                   directStatus === "expired")) ? (
                 <button
                   type="button"
                   onClick={() =>
                     void resetZillowModalState({
                       markConnectingFailed: true,
                       closeModal: false,
                       rerunDetection: true,
                     })
                   }
                   className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                 >
                   Try Again
                 </button>
               ) : null}

               {/* Done: on successful connection */}
               {zillowReadinessState === "supportedDirectHandshakeReady" &&
                 directStatus === "connected" && (
                   <button
                     type="button"
                     onClick={() => void resetZillowModalState({ closeModal: true })}
                     className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                   >
                     Done
                   </button>
                 )}

               <button
                 type="button"
                 onClick={() =>
                   void resetZillowModalState({
                     markConnectingFailed: true,
                     closeModal: true,
                   })
                 }
                 className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
               >
                 Close
               </button>

               {/* Generate Code + Copy Code when in manual flow */}
               {((zillowReadinessState === "supportedDirectHandshakeReady" &&
                 (showManualFallback ||
                   directStatus === "failed" ||
                   directStatus === "expired")) ||
                 zillowReadinessState === "supportedExtensionDetected" ||
                 zillowReadinessState === "supportedFallbackOnly" ||
                 zillowReadinessState === "unknownOrDegraded" ||
                 (zillowReadinessState === "supportedNoExtension" &&
                   showManualFallback)) && (
                 <>
                   <button
                     type="button"
                     onClick={async () => {
                       setPairCodeError(null);
                       setPairCodeLoading(true);
                       const result = await createExtensionPairCodeAction(projectId);
                       setPairCodeLoading(false);
                       if ("error" in result) {
                         setPairCodeError(result.error);
                         return;
                       }
                       setPairCode(result.code);
                       setPairCodeExpiresAt(result.expiresAt);
                     }}
                     disabled={pairCodeLoading}
                     className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                   >
                     {pairCodeLoading ? "Generating…" : "Generate Code"}
                   </button>
                   {pairCode && (
                     <button
                       type="button"
                       onClick={() => {
                         if (pairCode) void navigator.clipboard.writeText(pairCode);
                       }}
                       className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                     >
                       Copy Code
                     </button>
                   )}
                 </>
               )}
             </div>
           </div>
         </div>
       )}
     </>
   );
 }

