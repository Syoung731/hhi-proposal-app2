/**
 * Service worker: handles external (web page) and internal (content script) messaging.
 * - ping: health check
 * - getCapabilities: supported features and origins
 * - beginHandshake: validate and POST to verify endpoint, return structured result
 */
importScripts("config.js", "messages.js");

(function () {
  var STORAGE_KEYS = {
    pairedProjectId: "pairedProjectId",
    appBaseUrl: "appBaseUrl",
    pairedAt: "pairedAt",
  };
  var DEBUG_STORAGE_KEY = "zillowImportDebug";

  /** In-memory set of nonces we've already sent to verify (avoids duplicate requests in same session). */
  var usedNonces = Object.create(null);
  var MAX_USED_NONCES = 100;
  var usedNonceList = [];

  function log() {
    try {
      chrome.storage.local.get([DEBUG_STORAGE_KEY], function (res) {
        if (res[DEBUG_STORAGE_KEY] === "true" || res[DEBUG_STORAGE_KEY] === true) {
          var args = ["[ZI background]"].concat(Array.prototype.slice.call(arguments));
          console.log.apply(console, args);
        }
      });
    } catch (e) {}
  }

  /**
   * Get origin from sender (external: sender.url, internal: message.origin).
   * @param {{ url?: string }} sender
   * @param {{ origin?: string }} message
   * @returns {string}
   */
  function getOriginFromSender(sender, message) {
    if (sender && sender.url) {
      try {
        return new URL(sender.url).origin;
      } catch (e) {
        return "";
      }
    }
    return (message && message.origin) ? String(message.origin) : "";
  }

  /**
   * Route and validate: only allow messages from allowed origins.
   * Every path must call sendResponse exactly once (sync or async).
   */
  function handleMessage(message, sender, sendResponse) {
    console.log("[ZI background] listener entered, message type:", message && message.type);
    var responded = false;
    function reply(payload) {
      if (responded) return;
      responded = true;
      try {
        sendResponse(payload);
        console.log("[ZI background] sendResponse called");
      } catch (e) {
        console.warn("[ZI background] sendResponse failed", e);
      }
    }

    try {
      var origin = getOriginFromSender(sender, message);
      if (!origin) {
        log("handleMessage: missing origin", sender, message);
        reply({ error: "missing_origin", code: "bad_payload" });
        return false;
      }
      if (!isOriginAllowed(origin)) {
        log("handleMessage: disallowed origin", origin);
        reply({ error: "Origin not allowed", code: HANDSHAKE_ERROR.UNSUPPORTED_ORIGIN });
        return false;
      }

      var type = message && message.type;
      if (type === MSG_PING) {
        handlePing(reply);
        return false;
      }
      if (type === MSG_GET_CAPABILITIES) {
        handleGetCapabilities(reply);
        return false;
      }
      if (type === MSG_BEGIN_HANDSHAKE) {
        handleBeginHandshake(message, origin, reply);
        return true; // async response
      }
      if (type === MSG_OPEN_ZILLOW_FOR_ADDRESS) {
        handleOpenZillowForAddress(message, reply);
        return false;
      }

      reply({ error: "Unknown message type", code: "bad_payload" });
      return false;
    } catch (err) {
      console.warn("[ZI background] error caught", err);
      reply({ ok: false, error: err && err.message ? err.message : "Background error", code: "background_failure" });
      return false;
    }
  }

  function handlePing(reply) {
    var manifest = chrome.runtime.getManifest();
    var version = (manifest && manifest.version) ? manifest.version : "0.0.0";
    var payload = {
      installed: true,
      extensionVersion: version,
      supportedHandshakeVersion: SUPPORTED_HANDSHAKE_VERSION,
      scraperReady: true,
    };
    log("ping ->", payload);
    reply(payload);
  }

  function handleGetCapabilities(reply) {
    var manifest = chrome.runtime.getManifest();
    var version = (manifest && manifest.version) ? manifest.version : "0.0.0";
    var payload = {
      directHandshakeSupported: true,
      manualPairingSupported: true,
      supportedOrigins: ALLOWED_ORIGINS.slice(),
      extensionVersion: version,
    };
    log("getCapabilities ->", payload);
    reply(payload);
  }

  /**
   * Open a new Zillow tab with search-by-address URL (usersSearchTerm).
   */
  function handleOpenZillowForAddress(message, reply) {
    var address = typeof message.address === "string" ? message.address.trim() : "";
    if (!address) {
      reply({ ok: false, error: "address is required" });
      return;
    }
    var searchQueryState = JSON.stringify({
      pagination: {},
      usersSearchTerm: address,
    });
    var url = "https://www.zillow.com/homes/for_sale/?searchQueryState=" + encodeURIComponent(searchQueryState);
    try {
      chrome.tabs.create({ url: url });
      console.log("[ZI background] Zillow tab opened");
      reply({ ok: true });
    } catch (e) {
      console.warn("[ZI background] openZillowForAddress failed", e);
      reply({ ok: false, error: (e && e.message) ? e.message : "Failed to open tab" });
    }
  }

  /**
   * Validate beginHandshake payload and call verify endpoint.
   * Must call sendResponse exactly once; do not tie it to storage.set callback (channel can close).
   */
  function handleBeginHandshake(message, origin, sendResponse) {
    var responded = false;
    function reply(payload) {
      if (responded) return;
      responded = true;
      try {
        sendResponse(payload);
      } catch (e) {
        console.warn("[ZI background] sendResponse failed", e);
      }
    }

    var nonce = typeof message.nonce === "string" ? message.nonce.trim() : "";
    var sessionId = typeof message.sessionId === "string" ? message.sessionId.trim() : "";
    var payloadOrigin = typeof message.origin === "string" ? message.origin.trim() : "";

    if (!nonce || !sessionId) {
      log("beginHandshake: missing nonce or sessionId");
      reply({ success: false, error: "nonce and sessionId are required", code: HANDSHAKE_ERROR.BAD_PAYLOAD });
      return;
    }
    var normalizedOrigin = normalizeOrigin(payloadOrigin || origin);
    if (!normalizedOrigin) {
      reply({ success: false, error: "Invalid origin", code: HANDSHAKE_ERROR.BAD_PAYLOAD });
      return;
    }
    if (!isOriginAllowed(normalizedOrigin)) {
      reply({ success: false, error: "Origin not allowed", code: HANDSHAKE_ERROR.UNSUPPORTED_ORIGIN });
      return;
    }

    if (usedNonces[nonce]) {
      log("beginHandshake: duplicate nonce");
      reply({ success: false, error: "Handshake already used", code: HANDSHAKE_ERROR.DUPLICATE_HANDSHAKE });
      return;
    }
    usedNonces[nonce] = true;
    usedNonceList.push(nonce);
    if (usedNonceList.length > MAX_USED_NONCES) {
      var old = usedNonceList.shift();
      delete usedNonces[old];
    }

    var baseUrl = normalizedOrigin.replace(/\/$/, "");
    var endpoint = baseUrl + "/api/extension/connection/verify";
    var manifest = chrome.runtime.getManifest();
    var version = (manifest && manifest.version) ? manifest.version : "0.0.0";
    var body = {
      nonce: nonce,
      extensionId: chrome.runtime.id,
      extensionVersion: version,
    };

    log("beginHandshake: POST", endpoint);

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        }).catch(function () {
          return { ok: res.ok, status: res.status, data: {} };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.projectId) {
          var projectId = result.data.projectId;
          reply({ success: true, projectId: projectId });
          chrome.storage.local.set({
            [STORAGE_KEYS.appBaseUrl]: baseUrl,
            [STORAGE_KEYS.pairedProjectId]: projectId,
            [STORAGE_KEYS.pairedAt]: new Date().toISOString(),
          }, function () {
            log("beginHandshake: success", projectId);
          });
        } else {
          var errMsg = (result.data && result.data.error) ? result.data.error : "Verification failed";
          var code = result.status === 400 && /expired|already used/i.test(errMsg)
            ? HANDSHAKE_ERROR.EXPIRED_NONCE
            : HANDSHAKE_ERROR.VERIFY_FAILED;
          log("beginHandshake: verify failed", result.status, errMsg);
          reply({ success: false, error: errMsg, code: code });
        }
      })
      .catch(function (err) {
        log("beginHandshake: fetch error", err);
        reply({
          success: false,
          error: err && err.message ? err.message : "Network error",
          code: HANDSHAKE_ERROR.VERIFY_FAILED,
        });
      })
      .then(undefined, function (err) {
        if (!responded) {
          console.warn("[ZI background] beginHandshake unhandled", err);
          reply({
            success: false,
            error: err && err.message ? err.message : "Unexpected error",
            code: HANDSHAKE_ERROR.VERIFY_FAILED,
          });
        }
      });
  }

  chrome.runtime.onMessageExternal.addListener(function (message, sender, sendResponse) {
    console.log("[ZI background] onMessageExternal received");
    return handleMessage(message, sender, sendResponse);
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    console.log("[ZI background] onMessage received", message && message.type);
    if (!message || message.type !== "ZILLOW_EXTENSION_FORWARD") {
      return false;
    }
    var inner = message.payload;
    if (!inner) {
      sendResponse({ ok: false, error: "Missing payload", code: "bad_payload" });
      return false;
    }
    var origin = (inner && inner.origin) ? inner.origin : getOriginFromSender(sender, inner);
    var fakeSender = { url: origin ? (origin + "/") : "" };
    return handleMessage(inner, fakeSender, sendResponse);
  });
})();
