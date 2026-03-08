import { prisma } from "@/app/lib/prisma";
import {
  ZillowConnectionStatus,
  ZillowHandshakeMethod,
} from "@/app/generated/prisma";

/** Nonce TTL: 5 minutes. One-time use; short-lived. */
const NONCE_TTL_MS = 5 * 60 * 1000;

/** Parse allowlisted extension IDs from env (comma-separated). Empty = no allowlist check. */
function getAllowlistedExtensionIds(): string[] {
  const raw = process.env.ZILLOW_EXTENSION_ALLOWLIST;
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Generate a cryptographically random nonce (one-time use). */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BrowserMetadataInput = {
  userAgent?: string;
  browserFamily?: string;
  version?: string;
  platform?: string;
};

export type ExtensionMetadataInput = {
  extensionId?: string;
  extensionVersion?: string;
};

export type ConnectionSessionResult = {
  sessionId: string;
  nonce: string;
  expiresAt: Date;
};

export type ConnectionStatusResult = {
  status: ZillowConnectionStatus;
  projectId: string | null;
  verifiedAt: Date | null;
  handshakeMethod: ZillowHandshakeMethod | null;
};

// ---------------------------------------------------------------------------
// createConnectionSession
// ---------------------------------------------------------------------------

/**
 * Create a browser connection session: issue a one-time nonce bound to the
 * authenticated user and optional project. Call from an authenticated context (e.g. server action).
 */
export async function createConnectionSession(
  userId: string,
  projectId: string | null,
  browserMetadata?: BrowserMetadataInput
): Promise<ConnectionSessionResult | { error: string }> {
  if (!userId?.trim()) return { error: "userId is required" };
  if (projectId !== null && !projectId?.trim()) return { error: "projectId must be a non-empty string or null" };

  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  const nonce = generateNonce();

  const allowlist = getAllowlistedExtensionIds();
  if (allowlist.length > 0) {
    // Debug: log that we're enforcing allowlist (do not log actual IDs in prod if sensitive)
    console.debug("[ZillowBrowserConnection] createConnectionSession: extension allowlist enabled");
  }

  try {
    const session = await prisma.zillowBrowserConnection.create({
      data: {
        userId: userId.trim(),
        projectId: projectId?.trim() || null,
        status: ZillowConnectionStatus.PENDING,
        nonce,
        expiresAt,
        browserMetadata: browserMetadata
          ? (browserMetadata as object)
          : undefined,
        handshakeMethod: ZillowHandshakeMethod.DIRECT,
      },
      select: { id: true, nonce: true, expiresAt: true },
    });
    return {
      sessionId: session.id,
      nonce: session.nonce,
      expiresAt: session.expiresAt,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create connection session";
    console.error("[ZillowBrowserConnection] createConnectionSession error:", message);
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// verifyDirectHandshake
// ---------------------------------------------------------------------------

/**
 * Verify the extension's handshake: validate nonce (exists, not expired, not already used),
 * optional extension allowlist, then mark session CONNECTED and return projectId.
 * Called by the extension (unauthenticated); binding is the one-time nonce.
 */
export async function verifyDirectHandshake(
  nonce: string,
  extensionMetadata?: ExtensionMetadataInput,
  _requestOrigin?: string
): Promise<{ projectId: string } | { error: string }> {
  const trimmed = (nonce ?? "").trim();
  if (!trimmed) return { error: "Nonce is required" };

  const allowlist = getAllowlistedExtensionIds();
  if (allowlist.length > 0) {
    const extId = (extensionMetadata?.extensionId ?? "").trim().toLowerCase();
    if (!extId) {
      console.warn("[ZillowBrowserConnection] verifyDirectHandshake: extensionId missing but allowlist is set");
      return { error: "Extension ID is required" };
    }
    if (!allowlist.includes(extId)) {
      console.warn("[ZillowBrowserConnection] verifyDirectHandshake: extensionId not allowlisted");
      return { error: "Extension not allowed" };
    }
  }

  const now = new Date();
  const row = await prisma.zillowBrowserConnection.findUnique({
    where: { nonce: trimmed },
    select: {
      id: true,
      projectId: true,
      status: true,
      expiresAt: true,
      verifiedAt: true,
    },
  });

  if (!row) {
    console.debug("[ZillowBrowserConnection] verifyDirectHandshake: nonce not found");
    return { error: "Invalid or expired nonce" };
  }
  if (row.status !== ZillowConnectionStatus.PENDING) {
    console.debug("[ZillowBrowserConnection] verifyDirectHandshake: session already used or failed", { status: row.status });
    return { error: "Nonce already used or expired" };
  }
  if (now > row.expiresAt) {
    await prisma.zillowBrowserConnection.update({
      where: { id: row.id },
      data: { status: ZillowConnectionStatus.EXPIRED },
    });
    return { error: "Nonce expired" };
  }

  if (!row.projectId) {
    return { error: "Session has no project" };
  }

  try {
    await prisma.zillowBrowserConnection.update({
      where: { id: row.id },
      data: {
        status: ZillowConnectionStatus.CONNECTED,
        verifiedAt: now,
        extensionMetadata: extensionMetadata
          ? (extensionMetadata as object)
          : undefined,
      },
    });
    return { projectId: row.projectId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verification failed";
    console.error("[ZillowBrowserConnection] verifyDirectHandshake update error:", message);
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// markConnectionFailed
// ---------------------------------------------------------------------------

/**
 * Mark a connection session as failed (e.g. user gave up or timeout).
 */
export async function markConnectionFailed(
  sessionId: string
): Promise<void> {
  try {
    await prisma.zillowBrowserConnection.updateMany({
      where: { id: sessionId, status: ZillowConnectionStatus.PENDING },
      data: { status: ZillowConnectionStatus.FAILED },
    });
  } catch (e) {
    console.warn("[ZillowBrowserConnection] markConnectionFailed:", e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------------------
// getCurrentConnectionStatus
// ---------------------------------------------------------------------------

/**
 * Get current status for a session. Caller must ensure the session belongs to the authenticated user.
 */
export async function getCurrentConnectionStatus(
  sessionId: string,
  userId: string
): Promise<ConnectionStatusResult | { error: string }> {
  if (!sessionId?.trim() || !userId?.trim()) {
    return { error: "sessionId and userId are required" };
  }

  const row = await prisma.zillowBrowserConnection.findFirst({
    where: { id: sessionId, userId: userId.trim() },
    select: {
      status: true,
      projectId: true,
      verifiedAt: true,
      handshakeMethod: true,
    },
  });

  if (!row) return { error: "Session not found" };

  return {
    status: row.status,
    projectId: row.projectId,
    verifiedAt: row.verifiedAt,
    handshakeMethod: row.handshakeMethod,
  };
}
