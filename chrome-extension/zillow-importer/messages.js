/**
 * Zillow Import extension – message contract for web-page ↔ extension communication.
 * Used by: background.js (external + internal messages), appPageContentScript.js (bridge).
 *
 * @typedef {'ping'|'getCapabilities'|'beginHandshake'} ExtensionMethod
 *
 * @typedef {Object} PingRequest
 * @property {'ping'} type
 *
 * @typedef {Object} PingResponse
 * @property {boolean} installed - always true when extension responds
 * @property {string} extensionVersion
 * @property {string} supportedHandshakeVersion
 * @property {boolean} scraperReady - Zillow scraper content script is part of extension
 *
 * @typedef {Object} GetCapabilitiesRequest
 * @property {'getCapabilities'} type
 *
 * @typedef {Object} GetCapabilitiesResponse
 * @property {boolean} directHandshakeSupported
 * @property {boolean} manualPairingSupported
 * @property {string[]} supportedOrigins
 * @property {string} extensionVersion
 *
 * @typedef {Object} BeginHandshakeRequest
 * @property {'beginHandshake'} type
 * @property {string} nonce - one-time nonce from app server
 * @property {string} sessionId - session id from app server
 * @property {string} origin - app origin (must match allowed list)
 * @property {Object} [metadata] - optional { userAgent?, etc. }
 *
 * @typedef {Object} BeginHandshakeSuccess
 * @property {true} success
 * @property {string} projectId
 *
 * @typedef {Object} BeginHandshakeError
 * @property {false} success
 * @property {string} error - human-readable message
 * @property {string} code - one of: unsupported_origin | bad_payload | duplicate_handshake | expired_nonce | verify_failed | already_paired
 *
 * @typedef {BeginHandshakeSuccess|BeginHandshakeError} BeginHandshakeResponse
 */

/** Message type for requests from web page (via externally_connectable or postMessage bridge). */
var MSG_PING = "ping";
var MSG_GET_CAPABILITIES = "getCapabilities";
var MSG_BEGIN_HANDSHAKE = "beginHandshake";
var MSG_OPEN_ZILLOW_FOR_ADDRESS = "openZillowForAddress";

/** Used by app page postMessage bridge: page sends this, content script forwards to background. */
var PAGE_REQUEST_TYPE = "ZILLOW_EXTENSION_REQUEST";
/** Content script posts this back to the page with result. */
var PAGE_RESPONSE_TYPE = "ZILLOW_EXTENSION_RESPONSE";

/** Handshake protocol version returned in ping/getCapabilities. */
var SUPPORTED_HANDSHAKE_VERSION = "1";

/** Error codes for beginHandshake (structured errors). */
var HANDSHAKE_ERROR = {
  UNSUPPORTED_ORIGIN: "unsupported_origin",
  BAD_PAYLOAD: "bad_payload",
  DUPLICATE_HANDSHAKE: "duplicate_handshake",
  EXPIRED_NONCE: "expired_nonce",
  VERIFY_FAILED: "verify_failed",
  ALREADY_PAIRED: "already_paired",
};
