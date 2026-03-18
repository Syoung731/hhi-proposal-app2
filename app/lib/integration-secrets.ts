import crypto from "crypto";

/**
 * Server-side only: encryption helpers for integration secrets.
 * Do not import this module from client components or expose decrypted values.
 *
 * Uses AES-256-GCM with a 32-byte key from env:
 * - INTEGRATION_ENCRYPTION_KEY: 32-byte key, provided as hex or base64.
 *
 * Values are stored as base64 strings in the format: iv:tag:ciphertext
 */

const RAW_KEY = process.env.INTEGRATION_ENCRYPTION_KEY;

function normalizeKey(raw: string): Buffer {
  const trimmed = raw.trim();
  // Try base64 first
  try {
    const base64Key = Buffer.from(trimmed, "base64");
    if (base64Key.length === 32) return base64Key;
  } catch {
    // ignore and try hex
  }
  // Fallback: hex
  try {
    const hexKey = Buffer.from(trimmed, "hex");
    if (hexKey.length === 32) return hexKey;
  } catch {
    // ignore
  }
  throw new Error(
    "INTEGRATION_ENCRYPTION_KEY must be a 32-byte key encoded as base64 or hex.",
  );
}

function getEncryptionKey(): Buffer {
  if (!RAW_KEY) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY is not set. Add a 32-byte key in .env.local (hex or base64) before saving or using integration secrets.",
    );
  }
  return normalizeKey(RAW_KEY);
}

export function encryptIntegrationSecret(plaintext: string): string {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty secret.");
  }
  const KEY = getEncryptionKey();
  const iv = crypto.randomBytes(12); // GCM recommended IV length
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptIntegrationSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const KEY = getEncryptionKey();
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret format.");
  }
  const [ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Alias for service layer: encrypt a secret. Do not log the result or input. */
export function encryptSecret(plainText: string): string {
  return encryptIntegrationSecret(plainText);
}

/** Alias for service layer: decrypt a secret. Throws if payload is invalid. */
export function decryptSecret(cipherText: string): string {
  const out = decryptIntegrationSecret(cipherText);
  if (out === null) throw new Error("Invalid encrypted secret format.");
  return out;
}

