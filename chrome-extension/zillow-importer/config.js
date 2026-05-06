/**
 * Extension config: allowed app origins and debug.
 * Only these origins can use externally_connectable or the postMessage bridge.
 */

/** Allowed origins for direct handshake (must match manifest externally_connectable). */
var ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://localhost:3000",
  "https://app.hhi-builders.com",
];

/** Storage key for debug logging (set to "true" to enable). */
var DEBUG_STORAGE_KEY = "zillowImportDebug";

/**
 * Normalize origin for comparison (no trailing slash, lowercase).
 * @param {string} urlOrOrigin
 * @returns {string}
 */
function normalizeOrigin(urlOrOrigin) {
  if (!urlOrOrigin || typeof urlOrOrigin !== "string") return "";
  var s = urlOrOrigin.trim().toLowerCase();
  try {
    if (s.indexOf("http") !== 0) s = "https://" + s;
    var u = new URL(s);
    return u.origin.toLowerCase();
  } catch (e) {
    return "";
  }
}

/**
 * Check if origin is in the allowed list.
 * @param {string} origin - e.g. from sender.url or message.origin
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
  var normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  for (var i = 0; i < ALLOWED_ORIGINS.length; i++) {
    if (ALLOWED_ORIGINS[i].toLowerCase() === normalized) return true;
  }
  return false;
}
