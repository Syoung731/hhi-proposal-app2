/**
 * Zillow Import — Photo Picker (large review page).
 * Loads latest capture from storage. Select All / Clear All / Import Selected.
 */
(function () {
  var STORAGE_KEY_LATEST_CAPTURE = "zillowLatestCapture";
  var STORAGE_KEYS = {
    appBaseUrl: "appBaseUrl",
    pairedProjectId: "pairedProjectId",
    // Bearer credentials persisted by background.js (direct handshake) or
    // popup.js (pair-code path). Server requires one of these on every
    // /api/extension/import-zillow-photos call.
    pairedNonce: "pairedNonce",
    pairCodeLastUsed: "pairCodeLastUsed",
  };
  var DEFAULT_APP_URL = "https://app.hhi-builders.com";

  var pickerMetaEl = document.getElementById("picker-meta");
  var pickerSourceEl = document.getElementById("picker-source");
  var pickerZillowSaysEl = document.getElementById("picker-zillow-says");
  var pickerLoadedItemsEl = document.getElementById("picker-loaded-items");
  var pickerCapturedEl = document.getElementById("picker-captured");
  var pickerAutoScrollEl = document.getElementById("picker-auto-scroll");
  var pickerSelectedEl = document.getElementById("picker-selected");
  var pickerHelperEl = document.getElementById("picker-helper");
  var pickerControlsEl = document.getElementById("picker-controls");
  var pickerMainEl = document.getElementById("picker-main");
  var pickerEmptyEl = document.getElementById("picker-empty");
  var previewImgEl = document.getElementById("preview-img");
  var imageGridEl = document.getElementById("image-grid");
  var selectAllBtnEl = document.getElementById("select-all-btn");
  var clearAllBtnEl = document.getElementById("clear-all-btn");
  var importSelectedBtnEl = document.getElementById("import-selected-btn");
  var importSelectedCountEl = document.getElementById("import-selected-count");
  var pickerImportStatusEl = document.getElementById("picker-import-status");
  var pickerImportResultEl = document.getElementById("picker-import-result");
  var pickerPairErrorEl = document.getElementById("picker-pair-error");

  var currentImages = [];
  var selectedUrls = new Set();
  var previewUrl = null;
  var meta = {};
  var pairedProjectId = null;
  var pairedNonce = null;
  var pairedPairCode = null;
  var appBaseUrl = DEFAULT_APP_URL;
  var importing = false;

  function isReasonableImageUrl(url) {
    if (!url || typeof url !== "string") return false;
    var t = url.trim();
    return t.length >= 20 && (t.indexOf("http://") === 0 || t.indexOf("https://") === 0);
  }

  function renderMeta() {
    var source = meta.source;
    var sourceLabel = "Source: ";
    if (source === "modal-wall") sourceLabel += "Zillow modal wall";
    else if (source === "listing-preview") sourceLabel += "Listing page preview only";
    else sourceLabel += source || "—";
    pickerSourceEl.textContent = sourceLabel;
    pickerSourceEl.classList.remove("hidden");

    if (meta.targetPhotoCount != null && pickerZillowSaysEl) {
      pickerZillowSaysEl.textContent = "Zillow says: " + meta.targetPhotoCount + " photo" + (meta.targetPhotoCount !== 1 ? "s" : "");
      pickerZillowSaysEl.classList.remove("hidden");
    } else if (pickerZillowSaysEl) {
      pickerZillowSaysEl.classList.add("hidden");
    }

    if (meta.loadedGalleryItemCount != null && pickerLoadedItemsEl) {
      pickerLoadedItemsEl.textContent = "Loaded gallery items: " + meta.loadedGalleryItemCount;
      pickerLoadedItemsEl.classList.remove("hidden");
    } else if (pickerLoadedItemsEl) {
      pickerLoadedItemsEl.classList.add("hidden");
    }

    pickerCapturedEl.textContent = "Captured unique photos: " + currentImages.length;

    if (meta.loadedViaAutoScroll === true && pickerAutoScrollEl) {
      pickerAutoScrollEl.textContent = "Loaded via auto-scroll: yes";
      pickerAutoScrollEl.classList.remove("hidden");
    } else if (meta.loadedViaAutoScroll === false && pickerAutoScrollEl) {
      pickerAutoScrollEl.textContent = "Loaded via auto-scroll: no";
      pickerAutoScrollEl.classList.remove("hidden");
    } else if (pickerAutoScrollEl) {
      pickerAutoScrollEl.classList.add("hidden");
    }

    pickerSelectedEl.textContent = "Selected: " + selectedUrls.size;
    if (importSelectedCountEl) importSelectedCountEl.textContent = String(selectedUrls.size);
    updateImportSelectedButton();
  }

  function updateImportSelectedButton() {
    if (!importSelectedBtnEl) return;
    var noPair = !pairedProjectId;
    var noneSelected = selectedUrls.size === 0;
    importSelectedBtnEl.disabled = noPair || noneSelected || importing;
    if (pickerPairErrorEl) {
      pickerPairErrorEl.classList.toggle("hidden", !!pairedProjectId);
    }
  }

  function renderGrid() {
    imageGridEl.innerHTML = "";
    imageGridEl.classList.remove("empty");
    if (!currentImages.length) return;

    for (var i = 0; i < currentImages.length; i++) {
      (function (url) {
        var tile = document.createElement("div");
        tile.className = "image-tile";
        if (url === previewUrl) tile.classList.add("image-preview-active");
        if (selectedUrls.has(url)) tile.classList.add("image-selected");
        tile.setAttribute("role", "listitem");
        tile.dataset.url = url;
        var img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", function () {
          tile.classList.add("image-tile-error");
          img.classList.add("hidden");
          var ph = document.createElement("div");
          ph.className = "image-tile-placeholder";
          ph.setAttribute("aria-hidden", "true");
          tile.appendChild(ph);
        });
        var check = document.createElement("div");
        check.className = "checkbox-overlay";
        check.setAttribute("aria-hidden", "true");
        tile.appendChild(img);
        tile.appendChild(check);
        tile.addEventListener("click", function () {
          previewUrl = url;
          previewImgEl.src = url;
          previewImgEl.alt = "";
          document.querySelectorAll(".image-tile.image-preview-active").forEach(function (t) {
            t.classList.remove("image-preview-active");
          });
          tile.classList.add("image-preview-active");
          if (selectedUrls.has(url)) {
            selectedUrls.delete(url);
            tile.classList.remove("image-selected");
          } else {
            selectedUrls.add(url);
            tile.classList.add("image-selected");
          }
          renderMeta();
        });
        imageGridEl.appendChild(tile);
      })(currentImages[i]);
    }
    renderMeta();
  }

  function loadFromStorage() {
    chrome.storage.local.get(
      [
        STORAGE_KEY_LATEST_CAPTURE,
        STORAGE_KEYS.appBaseUrl,
        STORAGE_KEYS.pairedProjectId,
        STORAGE_KEYS.pairedNonce,
        STORAGE_KEYS.pairCodeLastUsed,
      ],
      function (data) {
        pairedProjectId = data[STORAGE_KEYS.pairedProjectId] || null;
        pairedNonce = data[STORAGE_KEYS.pairedNonce] || null;
        pairedPairCode = data[STORAGE_KEYS.pairCodeLastUsed] || null;
        appBaseUrl = (data[STORAGE_KEYS.appBaseUrl] || DEFAULT_APP_URL).replace(/\/$/, "");

        var payload = data[STORAGE_KEY_LATEST_CAPTURE];
        if (!payload || !Array.isArray(payload.images) || payload.images.length === 0) {
          pickerMetaEl.classList.add("hidden");
          pickerControlsEl.classList.add("hidden");
          pickerMainEl.classList.add("hidden");
          pickerEmptyEl.classList.remove("hidden");
          updateImportSelectedButton();
          return;
        }
        currentImages = payload.images.filter(isReasonableImageUrl);
        meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
        selectedUrls = new Set();
        previewUrl = currentImages[0] || null;

        pickerEmptyEl.classList.add("hidden");
        pickerMetaEl.classList.remove("hidden");
        pickerControlsEl.classList.remove("hidden");
        pickerMainEl.classList.remove("hidden");

        if (meta.helper) {
          pickerHelperEl.textContent = meta.helper;
          pickerHelperEl.classList.remove("hidden");
        } else {
          pickerHelperEl.classList.add("hidden");
        }

        previewImgEl.src = previewUrl || "";
        previewImgEl.alt = "";
        renderGrid();
        updateImportSelectedButton();
      }
    );
  }

  if (selectAllBtnEl) {
    selectAllBtnEl.addEventListener("click", function () {
      for (var i = 0; i < currentImages.length; i++) {
        selectedUrls.add(currentImages[i]);
      }
      var tiles = imageGridEl.querySelectorAll(".image-tile");
      for (var j = 0; j < tiles.length; j++) {
        tiles[j].classList.add("image-selected");
      }
      renderMeta();
    });
  }

  if (clearAllBtnEl) {
    clearAllBtnEl.addEventListener("click", function () {
      selectedUrls.clear();
      var tiles = imageGridEl.querySelectorAll(".image-tile");
      for (var k = 0; k < tiles.length; k++) {
        tiles[k].classList.remove("image-selected");
      }
      renderMeta();
    });
  }

  if (importSelectedBtnEl) {
    importSelectedBtnEl.addEventListener("click", function () {
      if (importing || !pairedProjectId || selectedUrls.size === 0) return;
      var urls = Array.from(selectedUrls);
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI picker] import selected clicked");
        console.log("[ZI picker] importing " + urls.length + " photos to project " + pairedProjectId);
      }
      importing = true;
      updateImportSelectedButton();
      if (pickerImportStatusEl) {
        pickerImportStatusEl.textContent = "Importing " + urls.length + " photo(s)…";
        pickerImportStatusEl.classList.remove("hidden");
      }
      if (pickerImportResultEl) {
        pickerImportResultEl.classList.add("hidden");
        pickerImportResultEl.classList.remove("success", "error");
      }

      var endpoint = appBaseUrl + "/api/extension/import-zillow-photos";
      // Send whichever pairing bearer was issued. The direct-handshake nonce
      // takes precedence if both happen to be set (most recent pairing wins).
      var importBody = { projectId: pairedProjectId, imageUrls: urls };
      if (pairedNonce) importBody.nonce = pairedNonce;
      else if (pairedPairCode) importBody.pairCode = pairedPairCode;
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importBody),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        })
        .then(function (result) {
          importing = false;
          updateImportSelectedButton();
          if (pickerImportStatusEl) pickerImportStatusEl.classList.add("hidden");

          if (result.ok && result.body && typeof result.body.imported === "number") {
            var imported = result.body.imported;
            var skipped = result.body.skipped || 0;
            var failed = result.body.failed || 0;
            if (typeof console !== "undefined" && console.log) {
              console.log("[ZI picker] import complete: imported " + imported + ", skipped " + skipped + ", failed " + failed);
            }
            var msg = "Imported " + imported + " photo(s)";
            if (skipped > 0) msg += ", skipped " + skipped + " duplicate(s)";
            if (failed > 0) msg += ", failed " + failed;
            msg += ".";
            if (pickerImportResultEl) {
              pickerImportResultEl.textContent = msg;
              pickerImportResultEl.classList.remove("hidden");
              pickerImportResultEl.classList.add(failed > 0 ? "error" : "success");
            }
            if (imported > 0 || skipped === urls.length) {
              selectedUrls.clear();
              var tiles = imageGridEl.querySelectorAll(".image-tile");
              for (var i = 0; i < tiles.length; i++) {
                tiles[i].classList.remove("image-selected");
              }
              renderMeta();
            }
          } else {
            var errMsg = (result.body && result.body.error) ? result.body.error : "Import failed.";
            if (pickerImportResultEl) {
              pickerImportResultEl.textContent = errMsg;
              pickerImportResultEl.classList.remove("hidden");
              pickerImportResultEl.classList.add("error");
            }
          }
        })
        .catch(function (err) {
          importing = false;
          updateImportSelectedButton();
          if (pickerImportStatusEl) pickerImportStatusEl.classList.add("hidden");
          var errMsg = err && err.message ? err.message : "Import failed.";
          if (pickerImportResultEl) {
            pickerImportResultEl.textContent = errMsg;
            pickerImportResultEl.classList.remove("hidden");
            pickerImportResultEl.classList.add("error");
          }
        });
    });
  }

  loadFromStorage();
})();
