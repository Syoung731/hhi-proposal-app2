/**
 * Zillow Import popup — pairing, capture, open photo picker.
 * Capture result is stored for the Photo Picker page; popup shows compact status only.
 */
(function () {
  var STORAGE_KEYS = {
    appBaseUrl: "appBaseUrl",
    pairedProjectId: "pairedProjectId",
    pairedAt: "pairedAt",
    // pairCodeLastUsed and pairedNonce are the bearer credentials photo-picker
    // sends on /api/extension/import-zillow-photos. Server validates whichever
    // is present against a 24h post-pair session window.
    pairCodeLastUsed: "pairCodeLastUsed",
    pairedNonce: "pairedNonce",
    zillowLatestCapture: "zillowLatestCapture",
    pendingDirectNonce: "pendingDirectNonce",
    pendingDirectOrigin: "pendingDirectOrigin",
    pendingDirectSessionId: "pendingDirectSessionId",
    pendingDirectAt: "pendingDirectAt",
    zillowImportDebug: "zillowImportDebug",
  };
  var PENDING_MAX_AGE_MS = 6 * 60 * 1000;

  var DEFAULT_APP_URL = "https://app.hhi-builders.com";

  var appUrlEl = document.getElementById("app-url");
  var pairCodeEl = document.getElementById("pair-code");
  var pairBtn = document.getElementById("pair-btn");
  var clearBtn = document.getElementById("clear-btn");
  var statusEl = document.getElementById("status");
  var captureGalleryBtnEl = document.getElementById("capture-gallery-btn");
  var captureProgressEl = document.getElementById("capture-progress");
  var photosStatusEl = document.getElementById("photos-status");
  var openPickerBtnEl = document.getElementById("open-picker-btn");

  var captureInProgress = false;

  function setStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = "status " + (type || "");
  }

  function normalizeAppUrl(url) {
    var trimmed = (url || "").trim();
    if (!trimmed) return "";
    try {
      var u = new URL(trimmed);
      return u.origin;
    } catch (e) {
      return trimmed;
    }
  }

  function showPairedState(projectId) {
    setStatus("Paired to project: " + projectId, "success");
    clearBtn.style.display = "inline-block";
    pairCodeEl.value = "";
    pairCodeEl.disabled = false;
  }

  function showUnpairedState() {
    setStatus("Not paired", "pending");
    clearBtn.style.display = "none";
  }

  function showError(message) {
    setStatus(message || "Something went wrong", "error");
  }

  function setPhotosStatus(text) {
    if (photosStatusEl) photosStatusEl.textContent = text || "";
  }

  function setCaptureProgress(current, target) {
    if (!captureProgressEl) return;
    captureProgressEl.textContent = "Capturing gallery… " + current + (target != null ? " / " + target : "");
    captureProgressEl.classList.remove("hidden");
  }

  function clearCaptureProgress() {
    captureInProgress = false;
    if (captureGalleryBtnEl) captureGalleryBtnEl.disabled = false;
    if (captureProgressEl) captureProgressEl.classList.add("hidden");
  }

  function applyImageResponse(response) {
    clearCaptureProgress();
    if (!response) {
      setPhotosStatus("Open Zillow's full photo gallery, then click Capture Gallery.");
      return;
    }
    var images = Array.isArray(response.images) ? response.images : [];
    var meta = response.meta && typeof response.meta === "object" ? response.meta : {};
    if (images.length === 0) {
      setPhotosStatus(meta.error ? "Error: " + meta.error : (meta.helper || "Open Zillow's full photo gallery, then click Capture Gallery."));
      return;
    }
    var payload = { images: images, meta: meta };
    chrome.storage.local.set({ [STORAGE_KEYS.zillowLatestCapture]: payload }, function () {
      setPhotosStatus(images.length + " photo" + (images.length !== 1 ? "s" : "") + " captured. Open Photo Picker to review.");
    });
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (message.type === "ZILLOW_IMAGES_FOUND") {
      applyImageResponse({ images: message.images, meta: message.meta });
    } else if (message.type === "ZILLOW_CAPTURE_PROGRESS") {
      setCaptureProgress(message.current, message.target);
    }
  });

  function loadFromStorage() {
    chrome.storage.local.get(
      [STORAGE_KEYS.appBaseUrl, STORAGE_KEYS.pairedProjectId, STORAGE_KEYS.pairedAt, STORAGE_KEYS.zillowImportDebug],
      function (data) {
        var url = data[STORAGE_KEYS.appBaseUrl] || DEFAULT_APP_URL;
        appUrlEl.value = url;
        if (data[STORAGE_KEYS.pairedProjectId]) {
          showPairedState(data[STORAGE_KEYS.pairedProjectId]);
        } else {
          showUnpairedState();
        }
        var debugEl = document.getElementById("debug-logging");
        if (debugEl) debugEl.checked = data[STORAGE_KEYS.zillowImportDebug] === "true" || data[STORAGE_KEYS.zillowImportDebug] === true;
        setPhotosStatus("Open Zillow's full photo gallery, then click Capture Gallery.");
      }
    );
  }

  var debugEl = document.getElementById("debug-logging");
  if (debugEl) {
    debugEl.addEventListener("change", function () {
      chrome.storage.local.set({ [STORAGE_KEYS.zillowImportDebug]: debugEl.checked ? "true" : "false" });
    });
  }

  function tryDirectHandshakeThenPair(cb) {
    chrome.storage.local.get(
      [STORAGE_KEYS.pendingDirectNonce, STORAGE_KEYS.pendingDirectOrigin, STORAGE_KEYS.pendingDirectAt],
      function (data) {
        var nonce = data[STORAGE_KEYS.pendingDirectNonce];
        var origin = data[STORAGE_KEYS.pendingDirectOrigin];
        var at = data[STORAGE_KEYS.pendingDirectAt];
        if (!nonce || !origin || !at || Date.now() - at > PENDING_MAX_AGE_MS) {
          cb(false);
          return;
        }
        var baseUrl = origin.replace(/\/$/, "");
        var endpoint = baseUrl + "/api/extension/connection/verify";
        var manifest = chrome.runtime.getManifest();
        var version = manifest && manifest.version ? manifest.version : "0.0.0";
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nonce: nonce,
            extensionId: chrome.runtime.id,
            extensionVersion: version,
          }),
        })
          .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
          .then(function (result) {
            if (result.ok && result.body && result.body.projectId) {
              chrome.storage.local.remove(
                [STORAGE_KEYS.pendingDirectNonce, STORAGE_KEYS.pendingDirectOrigin, STORAGE_KEYS.pendingDirectSessionId, STORAGE_KEYS.pendingDirectAt],
                function () {
                  chrome.storage.local.set({
                    [STORAGE_KEYS.appBaseUrl]: baseUrl,
                    [STORAGE_KEYS.pairedProjectId]: result.body.projectId,
                    [STORAGE_KEYS.pairedAt]: new Date().toISOString(),
                    // Persist the nonce as the bearer for subsequent /import-zillow-photos calls.
                    [STORAGE_KEYS.pairedNonce]: nonce,
                  }, function () { showPairedState(result.body.projectId); });
                }
              );
              cb(true);
            } else {
              cb(false);
            }
          })
          .catch(function () { cb(false); });
      }
    );
  }

  pairBtn.addEventListener("click", function () {
    var baseUrl = normalizeAppUrl(appUrlEl.value);
    var code = (pairCodeEl.value || "").trim();
    setStatus("Pairing...", "pending");
    pairBtn.disabled = true;
    pairCodeEl.disabled = true;

    tryDirectHandshakeThenPair(function (directOk) {
      if (directOk) {
        pairBtn.disabled = false;
        pairCodeEl.disabled = false;
        return;
      }
      if (!baseUrl) {
        showError("Please enter a valid App URL.");
        pairCodeEl.disabled = false;
        pairBtn.disabled = false;
        return;
      }
      if (!code) {
        showError("Please enter a pair code (or open the app, click Get pairing code, then click Pair here).");
        pairCodeEl.disabled = false;
        pairBtn.disabled = false;
        return;
      }
      var endpoint = baseUrl.replace(/\/$/, "") + "/api/extension/redeem-pair-code";
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase() }),
      })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (result) {
          var ok = result.ok;
          var body = result.body;
          if (ok && body.projectId) {
            chrome.storage.local.set({
              [STORAGE_KEYS.appBaseUrl]: baseUrl,
              [STORAGE_KEYS.pairedProjectId]: body.projectId,
              [STORAGE_KEYS.pairedAt]: new Date().toISOString(),
              [STORAGE_KEYS.pairCodeLastUsed]: code.toUpperCase(),
            }, function () { showPairedState(body.projectId); });
          } else {
            showError(body.error || "Pairing failed.");
            pairCodeEl.disabled = false;
          }
        })
        .catch(function (err) {
          showError(err.message || "Could not reach the app. Check the URL and try again.");
          pairCodeEl.disabled = false;
        })
        .finally(function () { pairBtn.disabled = false; });
    });
  });

  clearBtn.addEventListener("click", function () {
    chrome.storage.local.remove(
      [STORAGE_KEYS.pairedProjectId, STORAGE_KEYS.pairedAt, STORAGE_KEYS.pairCodeLastUsed, STORAGE_KEYS.pairedNonce],
      function () { showUnpairedState(); }
    );
  });

  appUrlEl.addEventListener("blur", function () {
    var baseUrl = normalizeAppUrl(appUrlEl.value);
    if (baseUrl) chrome.storage.local.set({ [STORAGE_KEYS.appBaseUrl]: baseUrl });
  });

  if (captureGalleryBtnEl) {
    captureGalleryBtnEl.addEventListener("click", function () {
      if (captureInProgress) return;
      captureInProgress = true;
      captureGalleryBtnEl.disabled = true;
      setCaptureProgress(0, null);
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        if (!tab || !tab.id) {
          clearCaptureProgress();
          setPhotosStatus("No active tab.");
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_GALLERY" }, function (response) {
          if (chrome.runtime.lastError) {
            clearCaptureProgress();
            setPhotosStatus("Capture failed. Open a Zillow listing and try again.");
            return;
          }
          applyImageResponse(response != null ? response : { images: [], meta: {} });
        });
      });
    });
  }

  if (openPickerBtnEl) {
    openPickerBtnEl.addEventListener("click", function () {
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI popup] open photo picker clicked");
      }
      chrome.tabs.create({ url: chrome.runtime.getURL("photo-picker.html") });
    });
  }

  loadFromStorage();
})();
