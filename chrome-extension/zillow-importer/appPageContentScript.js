/**
 * Content script that runs on the proposal app origin (e.g. localhost:3000).
 * 1) Reads the direct-handshake nonce from the page and stores it for the popup (fallback).
 * 2) postMessage bridge: page can send ZILLOW_EXTENSION_REQUEST; we forward to background and post back ZILLOW_EXTENSION_RESPONSE.
 */
(function () {
  var STORAGE_KEYS = {
    pendingDirectNonce: "pendingDirectNonce",
    pendingDirectSessionId: "pendingDirectSessionId",
    pendingDirectOrigin: "pendingDirectOrigin",
    pendingDirectAt: "pendingDirectAt",
  };
  var PAGE_REQUEST_TYPE = "ZILLOW_EXTENSION_REQUEST";
  var PAGE_RESPONSE_TYPE = "ZILLOW_EXTENSION_RESPONSE";
  var DEBUG_STORAGE_KEY = "zillowImportDebug";
  var ALLOWED_METHODS = { ping: 1, getCapabilities: 1, beginHandshake: 1, openZillowForAddress: 1 };

  var POLL_MS = 500;
  var MAX_AGE_MS = 6 * 60 * 1000; // ignore nonces older than 6 min

  function debugLog() {
    try {
      chrome.storage.local.get([DEBUG_STORAGE_KEY], function (res) {
        if (res[DEBUG_STORAGE_KEY] === "true" || res[DEBUG_STORAGE_KEY] === true) {
          var args = ["[ZI appPage]"].concat(Array.prototype.slice.call(arguments));
          console.log.apply(console, args);
        }
      });
    } catch (e) {}
  }

  function readHandshakeFromPage() {
    var el = document.getElementById("zillow-connection-handshake");
    if (!el) return null;
    var nonce = el.getAttribute("data-nonce");
    var sessionId = el.getAttribute("data-session-id");
    if (!nonce || !sessionId) return null;
    return { nonce: nonce.trim(), sessionId: sessionId.trim() };
  }

  function storePending(data) {
    var origin = window.location.origin;
    chrome.storage.local.set({
      [STORAGE_KEYS.pendingDirectNonce]: data.nonce,
      [STORAGE_KEYS.pendingDirectSessionId]: data.sessionId,
      [STORAGE_KEYS.pendingDirectOrigin]: origin,
      [STORAGE_KEYS.pendingDirectAt]: Date.now(),
    });
  }

  function clearPending() {
    chrome.storage.local.remove([
      STORAGE_KEYS.pendingDirectNonce,
      STORAGE_KEYS.pendingDirectSessionId,
      STORAGE_KEYS.pendingDirectOrigin,
      STORAGE_KEYS.pendingDirectAt,
    ]);
  }

  function poll() {
    var data = readHandshakeFromPage();
    if (data) {
      storePending(data);
      return;
    }
    chrome.storage.local.get([STORAGE_KEYS.pendingDirectAt], function (res) {
      var at = res[STORAGE_KEYS.pendingDirectAt];
      if (at && Date.now() - at > MAX_AGE_MS) {
        clearPending();
      }
    });
  }

  var intervalId = setInterval(poll, POLL_MS);
  poll();

  // When the handshake element is removed (e.g. modal closed), clear pending after a short delay.
  var observer = new MutationObserver(function () {
    if (!readHandshakeFromPage()) {
      setTimeout(clearPending, 1000);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // --- postMessage bridge: page -> content script -> background -> response -> page ---
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.type !== PAGE_REQUEST_TYPE) return;
    console.log("[ZI appPage] listener entered", data.method);
    var requestId = data.requestId;
    var method = data.method;
    var params = data.params || {};
    if (!requestId || !method || !ALLOWED_METHODS[method]) {
      console.log("[ZI appPage] invalid request", requestId, method);
      debugLog("invalid request", data);
      window.postMessage({
        type: PAGE_RESPONSE_TYPE,
        requestId: requestId || "",
        error: "invalid_request",
        message: "Missing requestId or unsupported method",
      }, window.location.origin);
      return;
    }
    var origin = window.location.origin;
    var payload = { type: method, origin: origin };
    if (method === "beginHandshake") {
      payload.nonce = params.nonce;
      payload.sessionId = params.sessionId;
      payload.origin = params.origin || origin;
      if (params.metadata) payload.metadata = params.metadata;
    }
    if (method === "openZillowForAddress") {
      payload.address = typeof params.address === "string" ? params.address : "";
    }
    console.log("[ZI appPage] forwarding to background", method);
    chrome.runtime.sendMessage({ type: "ZILLOW_EXTENSION_FORWARD", payload: payload }, function (response) {
      if (chrome.runtime.lastError) {
        console.warn("[ZI appPage] response error", chrome.runtime.lastError.message);
        window.postMessage({
          type: PAGE_RESPONSE_TYPE,
          requestId: requestId,
          error: "extension_error",
          message: chrome.runtime.lastError.message || "Extension not available",
        }, window.location.origin);
        return;
      }
      console.log("[ZI appPage] response received from background", method);
      try {
        window.postMessage({
          type: PAGE_RESPONSE_TYPE,
          requestId: requestId,
          result: response != null ? response : { ok: false, error: "No response", code: "timeout" },
        }, window.location.origin);
        console.log("[ZI appPage] postMessage sent to page");
      } catch (e) {
        console.warn("[ZI appPage] error posting to page", e);
        window.postMessage({
          type: PAGE_RESPONSE_TYPE,
          requestId: requestId,
          error: "bridge_error",
          message: e && e.message ? e.message : "Failed to send response",
        }, window.location.origin);
      }
    });
  });
})();
