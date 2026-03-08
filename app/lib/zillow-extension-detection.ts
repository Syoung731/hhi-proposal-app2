/**
 * Browser compatibility and extension detection for the Zillow Import flow.
 * Client-side only: uses navigator, window.postMessage; import in "use client" components.
 *
 * Supported browser matrix:
 * - Desktop Chrome: supported
 * - Desktop Edge (Chromium): supported
 * - Mobile (any): unsupported (unsupportedMobile)
 * - Other desktop browsers: unsupported (unsupportedBrowser)
 */

/** Supported browser families for Zillow Import (desktop). */
export type BrowserFamily = "chrome" | "edge" | "unknown";

/** Device class for support matrix. */
export type DeviceClass = "desktop" | "mobile" | "unknown";

/** Result of browser/device classification. */
export type BrowserClassification = {
  browserFamily: BrowserFamily;
  deviceClass: DeviceClass;
  /** True if environment is in the supported matrix (desktop Chrome/Edge). */
  supported: boolean;
  /** Short label for UI, e.g. "Chrome (desktop)" or "Unsupported mobile browser". */
  label: string;
};

/** Response from extension ping (postMessage bridge). */
export type ExtensionPingResult = {
  installed: true;
  extensionVersion: string;
  supportedHandshakeVersion: string;
  scraperReady: boolean;
};

/** Response from extension getCapabilities. */
export type ExtensionCapabilitiesResult = {
  directHandshakeSupported: boolean;
  manualPairingSupported: boolean;
  supportedOrigins: string[];
  extensionVersion: string;
};

/**
 * App-ready state for the Zillow Import flow. Drives UI: unsupported vs setup vs direct vs fallback.
 */
export type ZillowConnectionReadinessState =
  | "unsupportedBrowser"
  | "unsupportedMobile"
  | "supportedNoExtension"
  | "supportedExtensionDetected"
  | "supportedDirectHandshakeReady"
  | "supportedFallbackOnly"
  | "unknownOrDegraded";

export type DetectionResult = {
  state: ZillowConnectionReadinessState;
  browser: BrowserClassification;
  ping: ExtensionPingResult | null;
  capabilities: ExtensionCapabilitiesResult | null;
  /** Human-readable message for UI or debug. */
  message?: string;
};

export type DetectionOptions = {
  pingTimeoutMs?: number;
  capabilitiesTimeoutMs?: number;
  debug?: boolean;
};

const DEFAULT_PING_TIMEOUT_MS = 2500;
const DEFAULT_CAPABILITIES_TIMEOUT_MS = 2500;

const PAGE_REQUEST_TYPE = "ZILLOW_EXTENSION_REQUEST";
const PAGE_RESPONSE_TYPE = "ZILLOW_EXTENSION_RESPONSE";

function debugLog(debug: boolean, ...args: unknown[]) {
  if (!debug) return;
  if (typeof window !== "undefined" && window.localStorage?.getItem("zillowImportDebug") === "true") {
    console.log("[Zillow detection]", ...args);
  }
}

/**
 * Classify browser and device from navigator. Pragmatic: Chrome and Edge on desktop are supported.
 */
export function getBrowserClassification(): BrowserClassification {
  if (typeof navigator === "undefined") {
    return {
      browserFamily: "unknown",
      deviceClass: "unknown",
      supported: false,
      label: "Unknown environment",
    };
  }
  const ua = navigator.userAgent;
  const uaLower = ua.toLowerCase();

  // Mobile hints (order matters: check mobile before desktop Chrome/Edge).
  const mobile =
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(uaLower) ||
    (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 2 && /mac|ipad/i.test(uaLower));
  const deviceClass: DeviceClass = mobile ? "mobile" : "desktop";

  if (mobile) {
    return {
      browserFamily: "unknown",
      deviceClass: "mobile",
      supported: false,
      label: "Unsupported mobile browser",
    };
  }

  // Desktop: Chrome (including Chromium-based Edge)
  if (/edg\/|edge\//i.test(ua)) {
    return {
      browserFamily: "edge",
      deviceClass: "desktop",
      supported: true,
      label: "Edge (desktop)",
    };
  }
  if (/chrome\/|chromium\//i.test(ua) && !/edg\/|edge\//i.test(ua)) {
    return {
      browserFamily: "chrome",
      deviceClass: "desktop",
      supported: true,
      label: "Chrome (desktop)",
    };
  }

  return {
    browserFamily: "unknown",
    deviceClass: "desktop",
    supported: false,
    label: "Unsupported browser",
  };
}

type ExtensionMethod = "ping" | "getCapabilities" | "beginHandshake" | "openZillowForAddress";

/**
 * Send a message to the Zillow Import extension via the postMessage bridge and wait for response or timeout.
 */
function sendExtensionMessage(
  method: ExtensionMethod,
  params: Record<string, unknown> = {},
  timeoutMs: number,
  debug: boolean
): Promise<unknown> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `zi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const timeoutLabel =
      method === "ping"
        ? "ping"
        : method === "getCapabilities"
          ? "getCapabilities"
          : method === "beginHandshake"
            ? "beginHandshake"
            : "openZillowForAddress";
    const timeoutId = setTimeout(() => {
      window.removeEventListener("message", listener);
      debugLog(debug, `${timeoutLabel}: timeout`);
      resolve(null);
    }, timeoutMs);

    function listener(event: MessageEvent) {
      if (event.source !== window || !event.data) return;
      const data = event.data as { type?: string; requestId?: string; result?: unknown; error?: string };
      if (data.type !== PAGE_RESPONSE_TYPE || data.requestId !== requestId) return;
      window.removeEventListener("message", listener);
      clearTimeout(timeoutId);
      if (data.error) {
        debugLog(debug, `${timeoutLabel}: failure`, data.error);
        resolve(null);
        return;
      }
      debugLog(debug, `${timeoutLabel}: success`, data.result);
      resolve(data.result ?? null);
    }

    window.addEventListener("message", listener);
    window.postMessage(
      {
        type: PAGE_REQUEST_TYPE,
        requestId,
        method,
        params,
      },
      "*"
    );
  });
}

const DEFAULT_BEGIN_HANDSHAKE_TIMEOUT_MS = 15000;

/**
 * Send beginHandshake to the extension (nonce + sessionId). Extension will POST to verify endpoint.
 * origin defaults to window.location.origin when omitted.
 */
export function sendBeginHandshake(
  nonce: string,
  sessionId: string,
  origin?: string,
  timeoutMs: number = DEFAULT_BEGIN_HANDSHAKE_TIMEOUT_MS,
  debug: boolean = false
): Promise<unknown> {
  const effectiveOrigin = typeof origin === "string" && origin.trim()
    ? origin.trim()
    : typeof window !== "undefined"
      ? window.location.origin
      : "";
  const params: Record<string, unknown> = { nonce, sessionId, origin: effectiveOrigin };
  return sendExtensionMessage("beginHandshake", params, timeoutMs, debug);
}

const DEFAULT_OPEN_ZILLOW_TIMEOUT_MS = 5000;

/**
 * Ask the extension to open a new Zillow tab with a search for the given address.
 * Extension will build a Zillow search-by-address URL and open it in a new tab.
 */
export function sendOpenZillowForAddress(
  address: string,
  timeoutMs: number = DEFAULT_OPEN_ZILLOW_TIMEOUT_MS,
  debug: boolean = false
): Promise<unknown> {
  const trimmed = typeof address === "string" ? address.trim() : "";
  const params: Record<string, unknown> = { address: trimmed };
  return sendExtensionMessage("openZillowForAddress", params, timeoutMs, debug);
}

/**
 * Probe extension via ping. Returns ping result or null on timeout/failure.
 */
export async function probeExtensionPing(
  timeoutMs: number = DEFAULT_PING_TIMEOUT_MS,
  debug: boolean = false
): Promise<ExtensionPingResult | null> {
  const raw = await sendExtensionMessage("ping", {}, timeoutMs, debug);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.installed !== true) return null;
  return {
    installed: true,
    extensionVersion: typeof r.extensionVersion === "string" ? r.extensionVersion : "",
    supportedHandshakeVersion: typeof r.supportedHandshakeVersion === "string" ? r.supportedHandshakeVersion : "",
    scraperReady: r.scraperReady === true,
  };
}

/**
 * Probe extension via getCapabilities. Returns capabilities or null on timeout/failure.
 */
export async function probeExtensionCapabilities(
  timeoutMs: number = DEFAULT_CAPABILITIES_TIMEOUT_MS,
  debug: boolean = false
): Promise<ExtensionCapabilitiesResult | null> {
  const raw = await sendExtensionMessage("getCapabilities", {}, timeoutMs, debug);
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    directHandshakeSupported: r.directHandshakeSupported === true,
    manualPairingSupported: r.manualPairingSupported === true,
    supportedOrigins: Array.isArray(r.supportedOrigins) ? (r.supportedOrigins as string[]) : [],
    extensionVersion: typeof r.extensionVersion === "string" ? r.extensionVersion : "",
  };
}

/**
 * Run full detection: classify browser, then probe extension (ping + getCapabilities).
 * Returns a single readiness state and details for UI and debug.
 */
export async function detectZillowConnectionReadiness(
  options: DetectionOptions = {}
): Promise<DetectionResult> {
  const {
    pingTimeoutMs = DEFAULT_PING_TIMEOUT_MS,
    capabilitiesTimeoutMs = DEFAULT_CAPABILITIES_TIMEOUT_MS,
    debug = false,
  } = options;

  const browser = getBrowserClassification();
  debugLog(debug, "browser", browser);

  if (!browser.supported) {
    const state: ZillowConnectionReadinessState =
      browser.deviceClass === "mobile" ? "unsupportedMobile" : "unsupportedBrowser";
    console.log("[Zillow detection] readiness state calculated", state);
    debugLog(debug, "chosen state", state);
    return {
      state,
      browser,
      ping: null,
      capabilities: null,
      message:
        browser.deviceClass === "mobile"
          ? "Zillow Import is not supported on mobile. Use a desktop browser (Chrome or Edge)."
          : "Use a supported desktop browser (Chrome or Edge) to connect the Zillow Import extension.",
    };
  }

  const ping = await probeExtensionPing(pingTimeoutMs, debug);
  console.log("[Zillow detection] ping result received", ping);
  if (!ping) {
    const state: ZillowConnectionReadinessState = "supportedNoExtension";
    console.log("[Zillow detection] readiness state calculated", state);
    debugLog(debug, "chosen state", state);
    return {
      state,
      browser,
      ping: null,
      capabilities: null,
      message: "Zillow Import extension not detected. Install the extension or use a manual pairing code.",
    };
  }

  const capabilities = await probeExtensionCapabilities(capabilitiesTimeoutMs, debug);
  console.log("[Zillow detection] getCapabilities result received", capabilities);
  if (!capabilities) {
    const state: ZillowConnectionReadinessState = "supportedExtensionDetected";
    console.log("[Zillow detection] readiness state calculated", state);
    debugLog(debug, "chosen state", state);
    return {
      state,
      browser,
      ping,
      capabilities: null,
      message: "Extension detected. You can try connecting or use a manual pairing code.",
    };
  }

  if (capabilities.directHandshakeSupported) {
    const state: ZillowConnectionReadinessState = "supportedDirectHandshakeReady";
    console.log("[Zillow detection] readiness state calculated", state);
    debugLog(debug, "chosen state", state);
    return {
      state,
      browser,
      ping,
      capabilities,
      message: "Extension ready for direct connection.",
    };
  }

  if (capabilities.manualPairingSupported) {
    const state: ZillowConnectionReadinessState = "supportedFallbackOnly";
    console.log("[Zillow detection] readiness state calculated", state);
    debugLog(debug, "chosen state", state);
    return {
      state,
      browser,
      ping,
      capabilities,
      message: "Use a manual pairing code to connect.",
    };
  }

  const state: ZillowConnectionReadinessState = "unknownOrDegraded";
  console.log("[Zillow detection] readiness state calculated", state);
  debugLog(debug, "chosen state", state);
  return {
    state,
    browser,
    ping,
    capabilities,
    message: "Connection state unclear. You can try a manual pairing code.",
  };
}
