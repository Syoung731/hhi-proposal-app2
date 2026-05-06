/**
 * Zillow Import - Modal-first vertical media wall scraper.
 * 1) Click "See all photos", 2) wait for modal, 3) scrape figure[data-testid^="vmw-photo-"] from modal wall.
 * No next/prev walker. Normalize URLs, dedupe by canonical key, preserve gallery order.
 */
(function () {
  /** Returns true if the extension context has been invalidated (e.g. after extension reload). */
  function isContextInvalidated() {
    try { return !chrome.runtime || !chrome.runtime.id; } catch (e) { return true; }
  }

  if (typeof console !== "undefined" && console.log) {
    console.log("[ZI] content script loaded");
  }

  var OPEN_MODAL_WAIT_MS = 5000;
  var POLL_INTERVAL_MS = 200;
  var MAX_CAPTURE = 150;
  var MAX_SCROLL_PASSES = 25;
  function getLoadPhaseTimeoutMs(targetPhotoCount) {
    if (targetPhotoCount == null) return 25000;
    if (targetPhotoCount <= 60) return 25000;
    if (targetPhotoCount <= 100) return 40000;
    return 50000;
  }
  var SCROLL_STEP_PX = 1100;
  var SCROLL_STEP_NEAR_BOTTOM_PX = 500;
  var NEAR_BOTTOM_THRESHOLD_PX = 500;
  var WAIT_AFTER_SCROLL_MS = 500;
  var NO_INCREASE_PASSES_TO_STOP = 5;
  var RECHECK_COUNT_DELAY_MS = 200;
  var FAILED_SCROLL_ATTEMPTS_BEFORE_FALLBACK = 2;
  var BOTTOM_SETTLE_WAIT_MS = 1500;
  var BOTTOM_SETTLE_MAX_PASSES = 3;

  var SIZE_VARIANTS = ["-cc_ft_192", "-cc_ft_384", "-cc_ft_576", "-cc_ft_768", "-cc_ft_960"];
  var QUALITY_ORDER = { "-cc_ft_960": 5, "-cc_ft_768": 4, "-cc_ft_576": 3, "-cc_ft_384": 2, "-cc_ft_192": 1 };
  // Showcase listings use different size suffixes; rank them for quality selection
  var SHOWCASE_SUFFIXES_RANK = {
    "-uncropped_scaled_within_1536_1024": 10,
    "-h_l": 9,
    "-p_e": 8,
    "-cc_ft_960": 5,
    "-cc_ft_768": 4,
    "-cc_ft_576": 3,
    "-cc_ft_384": 2,
    "-sc_384_256": 2,
    "-cc_ft_192": 1,
    "-sc_192_128": 1,
  };

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Open full gallery modal: click "See all photos", wait for modal.
   */
  function openFullGalleryModal() {
    var btn = document.querySelector("[data-testid=\"gallery-see-all-photos-button\"]");
    if (!btn) {
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] see-all button not found");
      }
      return Promise.resolve(false);
    }
    if (typeof console !== "undefined" && console.log) {
      console.log("[ZI] see-all button found");
    }
    try {
      btn.click();
    } catch (e) {
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] see-all button click failed", e);
      }
      return Promise.resolve(false);
    }
    var deadline = Date.now() + OPEN_MODAL_WAIT_MS;
    return new Promise(function (resolve) {
      function check() {
        var modal = document.getElementById("viw-modal");
        var wall = document.querySelector("[data-testid=\"hollywood-vertical-media-wall\"]");
        if (modal || wall) {
          if (typeof console !== "undefined" && console.log) {
            console.log("[ZI] modal opened");
          }
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        setTimeout(check, POLL_INTERVAL_MS);
      }
      setTimeout(check, POLL_INTERVAL_MS);
    });
  }

  function getModalRoot() {
    var modal = document.getElementById("viw-modal");
    if (modal) return modal;
    var wall = document.querySelector("[data-testid=\"hollywood-vertical-media-wall\"]");
    return wall ? wall.closest("[id]") || wall : null;
  }

  /**
   * Parse ordinal from data-testid (vmw-photo-0, vmw-photo-1, ...).
   */
  function parseOrdinal(testId) {
    if (!testId || typeof testId !== "string") return -1;
    var m = testId.match(/vmw-photo-(\d+)/);
    return m ? parseInt(m[1], 10) : -1;
  }

  /**
   * From a figure, get best image URL: prefer img[src], else largest from picture > source[srcset].
   */
  function getFigureImageUrl(fig) {
    if (!fig) return null;
    var img = fig.querySelector("img");
    var src = img && (img.getAttribute("src") || img.getAttribute("data-src"));
    if (src && src.indexOf("photos.zillowstatic.com") !== -1) return src;
    var sources = fig.querySelectorAll("picture source[srcset]");
    var best = null;
    var bestW = 0;
    for (var i = 0; i < sources.length; i++) {
      var srcset = sources[i].getAttribute("srcset") || "";
      var urls = srcset.split(",");
      for (var j = 0; j < urls.length; j++) {
        var part = urls[j].trim().split(/\s+/);
        var url = part[0];
        if (url.indexOf("photos.zillowstatic.com") === -1) continue;
        var w = 0;
        if (part[1] && part[1].indexOf("w") !== -1) {
          w = parseInt(part[1], 10) || 0;
        }
        if (w > bestW || (url.length > (best ? best.length : 0))) {
          bestW = w;
          best = url;
        }
      }
    }
    if (best) return best;
    return src && src.indexOf("photos.zillowstatic.com") !== -1 ? src : null;
  }

  /**
   * Extract { url, ordinal } from modal wall figures. Sort by ordinal.
   */
  function extractModalWallImages(modalRoot) {
    if (!modalRoot) return [];
    var figures = modalRoot.querySelectorAll("figure[data-testid^=\"vmw-photo-\"]");
    var list = [];
    for (var i = 0; i < figures.length; i++) {
      var fig = figures[i];
      var testId = fig.getAttribute("data-testid") || "";
      var ordinal = parseOrdinal(testId);
      var url = getFigureImageUrl(fig);
      if (url) {
        list.push({ url: url, ordinal: ordinal >= 0 ? ordinal : i });
      }
    }
    list.sort(function (a, b) { return a.ordinal - b.ordinal; });
    if (typeof console !== "undefined" && console.log) {
      console.log("[ZI] modal figures found:", list.length);
    }
    return list;
  }

  /**
   * Normalize: only photos.zillowstatic.com; strip size variants; canonical key = path stem.
   * Keep best-quality URL per canonical key; preserve first gallery position for ordering.
   */
  function normalizeZillowPhotoUrl(url) {
    if (!url || typeof url !== "string") return null;
    var u = url.trim();
    if (u.indexOf("https://photos.zillowstatic.com/") !== 0 && u.indexOf("http://photos.zillowstatic.com/") !== 0) {
      return null;
    }
    return u;
  }

  /**
   * Canonical identity key: extract the unique photo fingerprint hash from a Zillow photo URL.
   * Zillow URLs follow the pattern: .../fp/<hash>-<size_suffix>.<ext>
   * The hash is the unique photo identifier; size suffix and extension vary per variant.
   */
  function getCanonicalKey(url) {
    if (!url) return "";
    // Strip query string
    var clean = url.replace(/\?.*$/, "");
    // Extract the hash portion: everything between last "/" and the size/ext suffix
    // Pattern: /fp/<32-char-hex-hash>-<suffix>.<ext>
    var fpMatch = clean.match(/\/fp\/([a-f0-9]+)/i);
    if (fpMatch) return fpMatch[1];
    // Fallback: strip all known size suffixes and extensions
    var key = clean;
    var allSuffixes = Object.keys(SHOWCASE_SUFFIXES_RANK);
    for (var i = 0; i < allSuffixes.length; i++) {
      key = key.replace(new RegExp(allSuffixes[i].replace(/[-.]/g, "\\$&") + "(\\.webp|\\.jpg|\\.jpeg|\\.png)?$", "i"), "");
    }
    return key;
  }

  function getQualityRank(url) {
    var r = 0;
    var allSuffixes = Object.keys(SHOWCASE_SUFFIXES_RANK);
    for (var i = 0; i < allSuffixes.length; i++) {
      if (url.indexOf(allSuffixes[i]) !== -1) {
        var q = SHOWCASE_SUFFIXES_RANK[allSuffixes[i]];
        if (q > r) r = q;
      }
    }
    if (r === 0 && (url.indexOf(".webp") !== -1 || url.indexOf(".jpg") !== -1)) r = 3;
    return r;
  }

  /**
   * Dedupe by canonical key: keep best-quality URL per key, preserve first-seen order.
   */
  function normalizeAndDedupe(entries) {
    var orderKeys = [];
    var seen = Object.create(null);
    var bestByKey = Object.create(null);
    for (var i = 0; i < entries.length; i++) {
      var url = normalizeZillowPhotoUrl(entries[i].url);
      if (!url) continue;
      var key = getCanonicalKey(url);
      if (!key) continue;
      if (!seen[key]) {
        orderKeys.push(key);
        seen[key] = true;
      }
      var rank = getQualityRank(url);
      if (!bestByKey[key] || rank > getQualityRank(bestByKey[key])) {
        bestByKey[key] = url;
      }
    }
    var out = [];
    for (var j = 0; j < orderKeys.length; j++) {
      out.push(bestByKey[orderKeys[j]]);
    }
    return out;
  }

  function isScrollable(el) {
    if (!el || typeof el.scrollHeight !== "number" || typeof el.clientHeight !== "number") return false;
    return el.scrollHeight > el.clientHeight;
  }

  /**
   * Walk up from startEl and return the first ancestor that has overflow auto/scroll and scrollHeight > clientHeight.
   */
  function findNearestScrollableAncestor(startEl) {
    if (!startEl || !startEl.parentElement) return null;
    var el = startEl.parentElement;
    while (el) {
      try {
        var style = window.getComputedStyle(el);
        var overflowY = (style && style.overflowY) ? style.overflowY.toLowerCase() : "";
        var overflow = (style && style.overflow) ? style.overflow.toLowerCase() : "";
        var canScroll = (overflowY === "auto" || overflowY === "scroll" || overflow === "auto" || overflow === "scroll");
        if (canScroll && isScrollable(el)) {
          return el;
        }
      } catch (_) {}
      el = el.parentElement;
    }
    return null;
  }

  function describeElement(el) {
    if (!el) return "null";
    var tag = (el.tagName || "").toLowerCase();
    var cls = (el.className && typeof el.className === "string") ? el.className.trim().slice(0, 60) : "";
    var testId = el.getAttribute ? (el.getAttribute("data-testid") || "") : "";
    var parts = [tag];
    if (testId) parts.push("data-testid=\"" + testId + "\"");
    if (cls) parts.push("class=\"" + cls + (cls.length >= 60 ? "…" : "") + "\"");
    return parts.join(" ");
  }

  function getScrollTopFromInfo(scrollInfo) {
    if (!scrollInfo) return 0;
    if (scrollInfo.type === "window") {
      try {
        return typeof window.scrollY === "number" ? window.scrollY : (document.documentElement && document.documentElement.scrollTop) || 0;
      } catch (_) { return 0; }
    }
    var el = scrollInfo.element;
    return (el && typeof el.scrollTop === "number") ? el.scrollTop : 0;
  }

  /**
   * Detect scroll container: 1) nearest scrollable ancestor of a vmw-photo, 2) root itself, 3) known selectors, 4) window.
   * Returns { element: Element | null, type: "modal" | "window", alternateAncestor: Element | null }.
   */
  function getGalleryScrollContainer(root) {
    var alternateAncestor = null;
    var firstFigure = null;
    if (!root) {
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] scroll container: window (no root)");
      }
      return { element: null, type: "window", alternateAncestor: null };
    }
    try {
      firstFigure = root.querySelector("figure[data-testid^=\"vmw-photo-\"]");
      if (firstFigure) {
        var nearest = findNearestScrollableAncestor(firstFigure);
        if (nearest) {
          if (typeof console !== "undefined" && console.log) {
            console.log("[ZI] scroll container: modal (nearest scrollable ancestor of vmw-photo)");
            console.log("[ZI] chosen element:", describeElement(nearest));
          }
          alternateAncestor = findNearestScrollableAncestor(nearest);
          return { element: nearest, type: "modal", alternateAncestor: alternateAncestor };
        }
      }
      if (isScrollable(root)) {
        try {
          var rootStyle = window.getComputedStyle(root);
          var oy = (rootStyle && rootStyle.overflowY) ? rootStyle.overflowY.toLowerCase() : "";
          var o = (rootStyle && rootStyle.overflow) ? rootStyle.overflow.toLowerCase() : "";
          if (oy === "auto" || oy === "scroll" || o === "auto" || o === "scroll") {
            if (typeof console !== "undefined" && console.log) {
              console.log("[ZI] scroll container: modal (root)");
              console.log("[ZI] chosen element:", describeElement(root));
            }
            return { element: root, type: "modal", alternateAncestor: null };
          }
        } catch (_) {}
      }
      var wall = root.querySelector("[data-testid=\"hollywood-vertical-media-wall\"]");
      var container = root.querySelector(".hollywood-vertical-media-wall-container");
      if (container && isScrollable(container)) {
        if (typeof console !== "undefined" && console.log) {
          console.log("[ZI] scroll container: modal (hollywood-vertical-media-wall-container)");
          console.log("[ZI] chosen element:", describeElement(container));
        }
        return { element: container, type: "modal", alternateAncestor: wall && isScrollable(wall) ? wall : null };
      }
      if (wall && isScrollable(wall)) {
        if (typeof console !== "undefined" && console.log) {
          console.log("[ZI] scroll container: modal (hollywood-vertical-media-wall)");
          console.log("[ZI] chosen element:", describeElement(wall));
        }
        return { element: wall, type: "modal", alternateAncestor: null };
      }
    } catch (_) {}
    if (firstFigure) {
      alternateAncestor = findNearestScrollableAncestor(firstFigure);
    }
    if (typeof console !== "undefined" && console.log) {
      console.log("[ZI] scroll container: window (fallback)");
    }
    return { element: null, type: "window", alternateAncestor: alternateAncestor };
  }

  function isAtBottom(scrollInfo) {
    if (!scrollInfo) return true;
    if (scrollInfo.type === "window") {
      try {
        var doc = document.documentElement;
        var body = document.body;
        var scrollTop = typeof window.scrollY === "number" ? window.scrollY : (doc && doc.scrollTop) || 0;
        var docHeight = (doc && typeof doc.scrollHeight === "number") ? doc.scrollHeight : 0;
        var bodyHeight = (body && typeof body.scrollHeight === "number") ? body.scrollHeight : 0;
        var scrollHeight = Math.max(docHeight, bodyHeight);
        var clientHeight = typeof window.innerHeight === "number" ? window.innerHeight : 0;
        return scrollTop + clientHeight >= scrollHeight - 2;
      } catch (_) {
        return true;
      }
    }
    var el = scrollInfo.element;
    if (!el || typeof el.scrollHeight !== "number" || typeof el.clientHeight !== "number" || typeof el.scrollTop !== "number") {
      return true;
    }
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  }

  function isNearBottom(scrollInfo, thresholdPx) {
    var t = thresholdPx != null ? thresholdPx : NEAR_BOTTOM_THRESHOLD_PX;
    if (!scrollInfo) return false;
    if (scrollInfo.type === "window") {
      try {
        var doc = document.documentElement;
        var body = document.body;
        var scrollTop = typeof window.scrollY === "number" ? window.scrollY : (doc && doc.scrollTop) || 0;
        var scrollHeight = Math.max(
          (doc && typeof doc.scrollHeight === "number" ? doc.scrollHeight : 0),
          (body && typeof body.scrollHeight === "number" ? body.scrollHeight : 0)
        );
        var clientHeight = typeof window.innerHeight === "number" ? window.innerHeight : 0;
        return scrollTop + clientHeight >= scrollHeight - t;
      } catch (_) { return false; }
    }
    var el = scrollInfo.element;
    if (!el || typeof el.scrollTop !== "number" || typeof el.scrollHeight !== "number" || typeof el.clientHeight !== "number") return false;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - t;
  }

  function doScrollDown(scrollInfo, stepPx) {
    var step = stepPx != null ? stepPx : SCROLL_STEP_PX;
    if (!scrollInfo) return;
    var el = scrollInfo.element;
    if (el && typeof el.scrollBy === "function") {
      try {
        el.scrollBy({ top: step, behavior: "auto" });
      } catch (_) {}
    } else {
      try {
        window.scrollBy({ top: step, behavior: "auto" });
      } catch (_) {}
    }
  }

  function doScrollToBottom(scrollInfo) {
    if (!scrollInfo) return;
    var el = scrollInfo.element;
    if (el && typeof el.scrollTop !== "number") return;
    try {
      if (el) {
        var maxScroll = el.scrollHeight - el.clientHeight;
        if (typeof maxScroll === "number" && maxScroll > 0) {
          el.scrollTop = maxScroll;
        }
      } else {
        var doc = document.documentElement;
        var body = document.body;
        var sh = Math.max(
          (doc && typeof doc.scrollHeight === "number" ? doc.scrollHeight : 0),
          (body && typeof body.scrollHeight === "number" ? body.scrollHeight : 0)
        );
        var ch = typeof window.innerHeight === "number" ? window.innerHeight : 0;
        window.scrollTo(0, Math.max(0, sh - ch));
      }
    } catch (_) {}
  }

  function getScrollContainerDimensions(scrollInfo) {
    if (!scrollInfo || scrollInfo.type === "window") {
      try {
        var doc = document.documentElement;
        var body = document.body;
        return {
          scrollTop: typeof window.scrollY === "number" ? window.scrollY : (doc && doc.scrollTop) || 0,
          clientHeight: typeof window.innerHeight === "number" ? window.innerHeight : 0,
          scrollHeight: Math.max(
            (doc && typeof doc.scrollHeight === "number" ? doc.scrollHeight : 0),
            (body && typeof body.scrollHeight === "number" ? body.scrollHeight : 0)
          ),
        };
      } catch (_) {
        return { scrollTop: 0, clientHeight: 0, scrollHeight: 0 };
      }
    }
    var el = scrollInfo.element;
    if (!el) return { scrollTop: 0, clientHeight: 0, scrollHeight: 0 };
    return {
      scrollTop: typeof el.scrollTop === "number" ? el.scrollTop : 0,
      clientHeight: typeof el.clientHeight === "number" ? el.clientHeight : 0,
      scrollHeight: typeof el.scrollHeight === "number" ? el.scrollHeight : 0,
    };
  }

  /**
   * Bottom-settle phase: scrollTo(bottom), wait, re-check count up to 3 times.
   * Returns Promise<{ shouldContinue: boolean, finalCount: number, stopReason: string }>.
   */
  function runBottomSettle(modalRoot, scrollInfo, lastCount, suggestedReason) {
    var count = lastCount;
    var settlePass = 0;
    function oneSettlePass() {
      settlePass++;
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] bottom settle pass " + settlePass + " / " + BOTTOM_SETTLE_MAX_PASSES);
      }
      doScrollToBottom(scrollInfo);
      return sleep(BOTTOM_SETTLE_WAIT_MS).then(function () {
        count = modalRoot ? modalRoot.querySelectorAll("figure[data-testid^=\"vmw-photo-\"]").length : 0;
        if (typeof console !== "undefined" && console.log) {
          console.log("[ZI] loadedFigureCount after settle:", count);
        }
        if (count > lastCount) {
          if (typeof console !== "undefined" && console.log) {
            console.log("[ZI] bottom settle found more items: yes");
          }
          return { shouldContinue: true, finalCount: count, stopReason: suggestedReason };
        }
        if (settlePass >= BOTTOM_SETTLE_MAX_PASSES) {
          if (typeof console !== "undefined" && console.log) {
            console.log("[ZI] bottom settle found more items: no");
          }
          return { shouldContinue: false, finalCount: count, stopReason: suggestedReason };
        }
        return oneSettlePass();
      });
    }
    return oneSettlePass();
  }

  /**
   * Phase A — LOAD: auto-scroll until all lazy-loaded figures are visible (or stop conditions).
   * Only tracks loadedFigureCount; does not extract URLs. Returns load-phase result only.
   */
  function runLoadPhase(modalRoot, statedCount, onProgress) {
    var scrollInfo = getGalleryScrollContainer(modalRoot);
    var initialFigures = modalRoot ? modalRoot.querySelectorAll("figure[data-testid^=\"vmw-photo-\"]") : [];
    var initialCount = initialFigures.length;

    var dims = getScrollContainerDimensions(scrollInfo);
    if (typeof console !== "undefined" && console.log) {
      console.log("[ZI] load phase start");
      console.log("[ZI] targetPhotoCount:", statedCount);
      console.log("[ZI] loadedFigureCount pass 0 (initial):", initialCount);
      console.log("[ZI] chosen scroll container type:", scrollInfo.type);
      if (scrollInfo.element) {
        console.log("[ZI] chosen element:", describeElement(scrollInfo.element));
      }
      console.log("[ZI] scrollTop:", dims.scrollTop, "clientHeight:", dims.clientHeight, "scrollHeight:", dims.scrollHeight);
    }

    var lastCount = initialCount;
    var noIncreasePasses = 0;
    var pass = 0;
    var timeoutMs = getLoadPhaseTimeoutMs(statedCount);
    var deadline = Date.now() + timeoutMs;
    var stopReason = "initial";
    var scrollTopDidChange = false;
    var figureCountIncreased = false;
    var consecutiveNoScrollTopChange = 0;
    var consecutiveNoCountIncrease = 0;
    var usedFallback = false;

    function onePass() {
      var countBeforeScroll = modalRoot ? modalRoot.querySelectorAll("figure[data-testid^=\"vmw-photo-\"]").length : 0;
      var scrollTopBefore = getScrollTopFromInfo(scrollInfo);
      pass++;
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] loadedFigureCount pass " + pass + " (before scroll):", countBeforeScroll);
      }
      if (onProgress) onProgress(countBeforeScroll, statedCount);

      if (statedCount != null && countBeforeScroll >= statedCount) {
        stopReason = "target-reached";
        return Promise.resolve();
      }
      if (countBeforeScroll >= MAX_CAPTURE) {
        stopReason = "max-limit";
        return Promise.resolve();
      }

      if (pass >= MAX_SCROLL_PASSES) {
        stopReason = "max-passes";
        return Promise.resolve();
      }
      if (Date.now() >= deadline) {
        stopReason = "timeout";
        return Promise.resolve();
      }

      var dimsNow = getScrollContainerDimensions(scrollInfo);
      var nearBottom = isNearBottom(scrollInfo);
      var stepPx = nearBottom ? SCROLL_STEP_NEAR_BOTTOM_PX : SCROLL_STEP_PX;
      if (nearBottom && typeof console !== "undefined" && console.log) {
        console.log("[ZI] near-bottom detected, using smaller step:", stepPx);
      }
      doScrollDown(scrollInfo, stepPx);
      return sleep(WAIT_AFTER_SCROLL_MS).then(function () {
        var countAfterWait = modalRoot ? modalRoot.querySelectorAll("figure[data-testid^=\"vmw-photo-\"]").length : 0;
        return sleep(RECHECK_COUNT_DELAY_MS).then(function () {
          var countAfterRecheck = modalRoot ? modalRoot.querySelectorAll("figure[data-testid^=\"vmw-photo-\"]").length : 0;
          var countAfterScroll = countAfterRecheck > countAfterWait ? countAfterRecheck : countAfterWait;
          var scrollTopAfter = getScrollTopFromInfo(scrollInfo);
          var scrollTopChanged = scrollTopAfter !== scrollTopBefore;
          if (scrollTopChanged) scrollTopDidChange = true;
          if (pass > 1 && countAfterScroll > initialCount) figureCountIncreased = true;

          if (typeof console !== "undefined" && console.log) {
            console.log("[ZI] loadedFigureCount pass " + pass + " (after scroll):", countAfterScroll);
          }

          if (!scrollTopChanged && countAfterScroll === countBeforeScroll) {
            consecutiveNoScrollTopChange++;
            consecutiveNoCountIncrease++;
            if (consecutiveNoScrollTopChange >= FAILED_SCROLL_ATTEMPTS_BEFORE_FALLBACK && consecutiveNoCountIncrease >= FAILED_SCROLL_ATTEMPTS_BEFORE_FALLBACK && !usedFallback) {
              if (scrollInfo.type === "modal" && scrollInfo.element) {
                if (typeof console !== "undefined" && console.log) {
                  console.log("[ZI] scroll had no effect for 2 attempts, switching to window scroll");
                }
                scrollInfo = { element: null, type: "window", alternateAncestor: scrollInfo.alternateAncestor };
                usedFallback = true;
                consecutiveNoScrollTopChange = 0;
                consecutiveNoCountIncrease = 0;
              } else if (scrollInfo.type === "window" && scrollInfo.alternateAncestor) {
                if (typeof console !== "undefined" && console.log) {
                  console.log("[ZI] window scroll had no effect for 2 attempts, switching to alternate scrollable ancestor");
                }
                scrollInfo = { element: scrollInfo.alternateAncestor, type: "modal", alternateAncestor: null };
                usedFallback = true;
                consecutiveNoScrollTopChange = 0;
                consecutiveNoCountIncrease = 0;
              }
            }
          } else {
            consecutiveNoScrollTopChange = 0;
            consecutiveNoCountIncrease = 0;
          }

          var prevLastCount = lastCount;
          lastCount = countAfterScroll;
          if (countAfterScroll === prevLastCount) {
            noIncreasePasses++;
          } else {
            noIncreasePasses = 0;
          }
          if (noIncreasePasses >= NO_INCREASE_PASSES_TO_STOP) {
            return runBottomSettle(modalRoot, scrollInfo, lastCount, "no-increase").then(function (res) {
              if (res.shouldContinue) {
                lastCount = res.finalCount;
                noIncreasePasses = 0;
                if (onProgress) onProgress(lastCount, statedCount);
                return onePass();
              }
              stopReason = res.stopReason;
              return Promise.resolve();
            });
          }
          if (isAtBottom(scrollInfo)) {
            return runBottomSettle(modalRoot, scrollInfo, lastCount, "bottom").then(function (res) {
              if (res.shouldContinue) {
                lastCount = res.finalCount;
                noIncreasePasses = 0;
                if (onProgress) onProgress(lastCount, statedCount);
                return onePass();
              }
              stopReason = res.stopReason;
              return Promise.resolve();
            });
          }
          return onePass();
        });
      });
    }

    return sleep(150).then(onePass).then(function () {
      var figures = modalRoot ? modalRoot.querySelectorAll("figure[data-testid^=\"vmw-photo-\"]") : [];
      var loadedGalleryItemCount = figures.length;
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] load phase stop");
        console.log("[ZI] load phase stop reason:", stopReason);
        console.log("[ZI] load phase final loadedFigureCount:", loadedGalleryItemCount);
      }
      var loadedViaAutoScroll = pass > 1 && (scrollTopDidChange || figureCountIncreased);
      return {
        stopReason: stopReason,
        loadedViaAutoScroll: loadedViaAutoScroll,
        loadedGalleryItemCount: loadedGalleryItemCount,
      };
    });
  }

  /**
   * Phase B — CAPTURE: one clean extraction over all currently loaded figures.
   * No scrolling. Query figures, extract URLs in DOM order, normalize/dedupe.
   */
  function runCapturePhase(modalRoot) {
    if (typeof console !== "undefined" && console.log) {
      console.log("[ZI] capture phase start");
    }
    var entries = extractModalWallImages(modalRoot);
    var urls = normalizeAndDedupe(entries);
    if (typeof console !== "undefined" && console.log) {
      console.log("[ZI] capture phase final unique count:", urls.length);
    }
    return urls;
  }

  /**
   * Full flow: Phase A (load via scroll) then Phase B (capture once).
   */
  function extractWithLazyLoad(modalRoot, statedCount, onProgress) {
    return runLoadPhase(modalRoot, statedCount, onProgress).then(function (loadResult) {
      var urls = runCapturePhase(modalRoot);
      return {
        urls: urls,
        loadedViaAutoScroll: loadResult.loadedViaAutoScroll,
        loadedGalleryItemCount: loadResult.loadedGalleryItemCount,
        stopReason: loadResult.stopReason,
      };
    });
  }

  /**
   * Parse "See all X photos" from listing page.
   */
  function getZillowStatedCount() {
    var btn = document.querySelector("[data-testid=\"gallery-see-all-photos-button\"]");
    if (!btn) return null;
    var text = (btn.textContent || "").trim();
    var m = text.match(/(\d+)\s*photo/i) || text.match(/(\d+)/);
    if (m) {
      var n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 200) return n;
    }
    return null;
  }

  /**
   * Fallback: extract from listing page preview tile list.
   */
  function extractListingPreviewImages() {
    var list = document.querySelector("[data-testid=\"hollywood-gallery-images-tile-list\"]");
    if (!list) return [];
    var imgs = list.querySelectorAll("img");
    var seen = Object.create(null);
    var urls = [];
    for (var i = 0; i < imgs.length && urls.length < MAX_CAPTURE; i++) {
      var src = imgs[i].getAttribute("src") || imgs[i].getAttribute("data-src");
      if (!src || src.indexOf("photos.zillowstatic.com") === -1 || seen[src]) continue;
      seen[src] = true;
      urls.push(normalizeZillowPhotoUrl(src) || src);
    }
    return urls;
  }

  /**
   * GET_IMAGES: do not run extraction. Return zero images and helper.
   */
  function runExtraction() {
    return {
      images: [],
      meta: {
        source: "none",
        capturedCount: 0,
        helper: "Click Capture Gallery to capture photos from the Zillow gallery.",
      },
    };
  }

  /**
   * Detect Showcase-style listing (immersive lightbox with carousel, no vertical media wall).
   */
  function isShowcaseListing() {
    return !!document.querySelector('[data-testid="showcase-action-bar-container"]') ||
           !!document.querySelector('[data-testid="persistent-tab-photos"]');
  }

  /**
   * Extract photos from a Showcase-style listing by reading the structured
   * gdpClientCache JSON embedded in the page, which contains the authoritative
   * photo list for this property (property.photos array with URLs and mixedSources).
   * Falls back to DOM scraping if the JSON data isn't found.
   */
  function extractShowcasePhotos() {
    // 1) Try structured JSON extraction from gdpClientCache
    var jsonUrls = extractShowcasePhotosFromJSON();
    if (jsonUrls && jsonUrls.length > 0) {
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] showcase extraction (JSON): " + jsonUrls.length + " photos");
      }
      return jsonUrls;
    }

    // 2) Fallback: scrape only from the lightbox container to avoid ads/similar homes
    if (typeof console !== "undefined" && console.log) {
      console.log("[ZI] showcase JSON not found, falling back to DOM scraping");
    }
    var container = document.querySelector('[data-testid="home-detail-lightbox-container"]') || document;
    var entries = [];
    var imgs = container.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute("src") || "";
      if (src.indexOf("photos.zillowstatic.com") !== -1) {
        entries.push({ url: src, ordinal: entries.length });
      }
    }
    var sources = container.querySelectorAll("picture source[srcset]");
    for (var j = 0; j < sources.length; j++) {
      var parts = (sources[j].getAttribute("srcset") || "").split(",");
      for (var k = 0; k < parts.length; k++) {
        var url = parts[k].trim().split(/\s+/)[0];
        if (url && url.indexOf("photos.zillowstatic.com") !== -1) {
          entries.push({ url: url, ordinal: entries.length });
        }
      }
    }
    var urls = normalizeAndDedupe(entries);
    if (typeof console !== "undefined" && console.log) {
      console.log("[ZI] showcase extraction (DOM fallback): " + urls.length + " unique photos");
    }
    return urls;
  }

  /**
   * Parse the gdpClientCache from the page's embedded JSON to get the
   * property's photo list directly. Returns array of best-quality URLs
   * in gallery order, or null if the data isn't available.
   */
  function extractShowcasePhotosFromJSON() {
    try {
      var jsonScripts = document.querySelectorAll('script[type="application/json"]');
      for (var s = 0; s < jsonScripts.length; s++) {
        var text = jsonScripts[s].textContent || "";
        if (text.indexOf("gdpClientCache") === -1) continue;
        var parsed = JSON.parse(text);

        // Walk to find gdpClientCache
        var cacheStr = findNestedValue(parsed, "gdpClientCache", 4);
        if (!cacheStr) continue;
        var cache = typeof cacheStr === "string" ? JSON.parse(cacheStr) : cacheStr;

        // Find the key containing the current listing's zpid
        var zpid = extractZpidFromUrl();
        if (!zpid) continue;
        var cacheKeys = Object.keys(cache);
        var propData = null;
        for (var k = 0; k < cacheKeys.length; k++) {
          if (cacheKeys[k].indexOf(zpid) !== -1) {
            propData = cache[cacheKeys[k]];
            break;
          }
        }
        if (!propData || !propData.property) continue;

        // Traditional listings expose the photo array as `responsivePhotos`;
        // showcase listings (and some older shapes) use `photos`. Try both.
        // Each entry has the same shape: { url, mixedSources: { jpeg, webp } }.
        var photos = (Array.isArray(propData.property.responsivePhotos) && propData.property.responsivePhotos.length > 0)
          ? propData.property.responsivePhotos
          : propData.property.photos;
        if (!Array.isArray(photos) || photos.length === 0) continue;

        var urls = [];
        for (var p = 0; p < photos.length; p++) {
          var photo = photos[p];
          var bestUrl = pickBestPhotoUrl(photo);
          if (bestUrl) urls.push(bestUrl);
        }
        return urls.length > 0 ? urls : null;
      }
    } catch (e) {
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] showcase JSON parse error:", e.message || e);
      }
    }
    return null;
  }

  /** Walk object tree to find a key by name. */
  function findNestedValue(obj, key, maxDepth) {
    if (maxDepth <= 0 || !obj || typeof obj !== "object") return null;
    if (obj[key] !== undefined) return obj[key];
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var r = findNestedValue(obj[keys[i]], key, maxDepth - 1);
      if (r !== null) return r;
    }
    return null;
  }

  /** Extract zpid from the current page URL (/homedetails/..._zpid/). */
  function extractZpidFromUrl() {
    var m = window.location.href.match(/\/(\d+)_zpid/);
    return m ? m[1] : null;
  }

  /**
   * From a Zillow photo object ({url, mixedSources: {jpeg: [{url, width}], webp: [...]}})
   * pick the highest-quality URL, preferring large JPEGs.
   */
  function pickBestPhotoUrl(photo) {
    if (!photo) return null;
    // Try mixedSources.jpeg — sorted by width, pick largest
    if (photo.mixedSources) {
      var jpegs = photo.mixedSources.jpeg;
      if (Array.isArray(jpegs) && jpegs.length > 0) {
        var best = jpegs[0];
        for (var i = 1; i < jpegs.length; i++) {
          if (jpegs[i].width > best.width) best = jpegs[i];
        }
        if (best.url) return best.url;
      }
      // Fallback to webp
      var webps = photo.mixedSources.webp;
      if (Array.isArray(webps) && webps.length > 0) {
        var bestW = webps[0];
        for (var j = 1; j < webps.length; j++) {
          if (webps[j].width > bestW.width) bestW = webps[j];
        }
        if (bestW.url) return bestW.url;
      }
    }
    // Fallback to photo.url directly
    return photo.url || null;
  }

  /**
   * CAPTURE_GALLERY:
   *   0) FAST PATH — extract photos directly from the page's __NEXT_DATA__
   *      JSON cache. Works on traditional AND showcase listings, requires
   *      zero clicks, zero scrolls, zero DOM-selector matching. The JSON is
   *      server-rendered Next.js data and contains the full property photo
   *      array at max resolution before any client JS runs.
   *   1) FALLBACK — legacy "See all photos" → vertical media wall
   *      (traditional listings whose JSON shape we don't recognise).
   *   2) FALLBACK — Showcase lightbox DOM scrape.
   *   3) FALLBACK — listing-preview tile scrape (~6 photos only).
   */
  function runCaptureGallery(onProgress) {
    // 0) Fast path: __NEXT_DATA__ JSON. No modal, no scroll.
    try {
      var jsonUrls = extractShowcasePhotosFromJSON();
      if (jsonUrls && jsonUrls.length > 0) {
        var statedFast = getZillowStatedCount();
        if (typeof console !== "undefined" && console.log) {
          console.log("[ZI] json extraction:", jsonUrls.length, "photos (stated:", statedFast, ")");
        }
        return Promise.resolve({
          images: jsonUrls,
          source: "json-cache",
          capturedCount: jsonUrls.length,
          targetPhotoCount: statedFast,
          loadedViaAutoScroll: false,
        });
      }
    } catch (e) {
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] json extraction failed, falling back:", e.message || e);
      }
    }

    // 1) Try standard "See all photos" → vertical media wall (traditional listings)
    return openFullGalleryModal().then(function (opened) {
      var modalRoot = getModalRoot();
      if (opened && modalRoot) {
        var stated = getZillowStatedCount();
        if (typeof console !== "undefined" && console.log) {
          console.log("[ZI] Zillow stated count:", stated);
        }
        return extractWithLazyLoad(modalRoot, stated, onProgress).then(function (result) {
          return {
            images: result.urls,
            source: "modal-wall",
            capturedCount: result.urls.length,
            targetPhotoCount: stated,
            loadedViaAutoScroll: result.loadedViaAutoScroll,
            loadedGalleryItemCount: result.loadedGalleryItemCount,
            stopReason: result.stopReason,
          };
        });
      }

      // 2) Try Showcase extraction (immersive carousel listings — photos already in DOM)
      if (isShowcaseListing()) {
        if (typeof console !== "undefined" && console.log) {
          console.log("[ZI] showcase listing detected, using showcase extraction");
        }
        var showcaseUrls = extractShowcasePhotos();
        return Promise.resolve({
          images: showcaseUrls,
          source: "showcase",
          capturedCount: showcaseUrls.length,
          targetPhotoCount: null,
          loadedViaAutoScroll: false,
        });
      }

      // 3) Fallback: scrape listing preview tile images
      var previewUrls = extractListingPreviewImages();
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] fallback listing preview, images:", previewUrls.length);
      }
      return Promise.resolve({
        images: previewUrls,
        source: "listing-preview",
        capturedCount: previewUrls.length,
        targetPhotoCount: getZillowStatedCount(),
        loadedViaAutoScroll: false,
      });
    });
  }

  chrome.runtime.onMessage.addListener(function (message, _sender, sendResponse) {
    if (isContextInvalidated()) return false;
    if (message.type === "GET_IMAGES") {
      var result;
      try {
        result = runExtraction();
      } catch (err) {
        result = {
          images: [],
          meta: {
            source: "none",
            capturedCount: 0,
            error: String(err.message || err),
            helper: "Click Capture Gallery to capture photos from the Zillow gallery.",
          },
        };
      }
      sendResponse({
        type: "ZILLOW_IMAGES_FOUND",
        images: result.images || [],
        meta: result.meta || {},
      });
      return true;
    }

    if (message.type === "CAPTURE_GALLERY") {
      var onProgress = function (current, target) {
        try {
          chrome.runtime.sendMessage({
            type: "ZILLOW_CAPTURE_PROGRESS",
            current: current,
            target: target,
          });
        } catch (_) {}
      };

      runCaptureGallery(onProgress).then(function (result) {
        var meta = {
          source: result.source,
          capturedCount: result.capturedCount,
          targetPhotoCount: result.targetPhotoCount,
          loadedViaAutoScroll: result.loadedViaAutoScroll === true,
          loadedGalleryItemCount: result.loadedGalleryItemCount,
          stopReason: result.stopReason,
        };
        var loadedBelowTarget = result.source === "modal-wall" && result.targetPhotoCount != null &&
          ((result.loadedGalleryItemCount != null && result.loadedGalleryItemCount < result.targetPhotoCount) ||
           (result.loadedGalleryItemCount == null && result.capturedCount < result.targetPhotoCount));
        if (loadedBelowTarget) {
          meta.helper = "Only part of the Zillow gallery was loaded. Scroll further in Zillow and capture again.";
        }
        try {
          window.__ZI_LAST_RESULT__ = { images: result.images, meta: meta };
        } catch (_) {}
        sendResponse({
          type: "ZILLOW_IMAGES_FOUND",
          images: result.images || [],
          meta: meta,
        });
      }).catch(function (err) {
        sendResponse({
          type: "ZILLOW_IMAGES_FOUND",
          images: [],
          meta: {
            source: "none",
            capturedCount: 0,
            error: String(err.message || err),
            helper: "Could not capture gallery. Open a Zillow listing and click Capture Gallery.",
          },
        });
      });
      return true;
    }

    return false;
  });

  // --- Floating "Capture for HHI" button on listing pages (fallback for auto-capture) ---

  function isListingPage() {
    return window.location.href.indexOf("zillow.com/homedetails/") !== -1;
  }

  function injectCaptureButton() {
    if (!isListingPage()) return;
    if (document.getElementById("zi-capture-fab")) return;

    // Only show if paired to a project
    if (isContextInvalidated()) return;
    chrome.storage.local.get(["pairedProjectId"], function (data) {
      if (!data || !data.pairedProjectId) return;

      var btn = document.createElement("button");
      btn.id = "zi-capture-fab";
      btn.textContent = "\uD83D\uDCF7 Zillow Import";
      btn.style.cssText = [
        "position: fixed",
        "bottom: 24px",
        "right: 24px",
        "z-index: 999999",
        "padding: 12px 20px",
        "background: #1A2332",
        "color: #fff",
        "border: 2px solid #F47216",
        "border-radius: 8px",
        "font-family: system-ui, sans-serif",
        "font-size: 14px",
        "font-weight: 600",
        "cursor: pointer",
        "box-shadow: 0 4px 12px rgba(0,0,0,0.3)",
        "transition: background 0.2s",
      ].join("; ");

      btn.addEventListener("mouseenter", function () { btn.style.background = "#F47216"; });
      btn.addEventListener("mouseleave", function () { btn.style.background = "#1A2332"; });

      btn.addEventListener("click", function () {
        btn.disabled = true;
        btn.textContent = "Capturing...";
        btn.style.background = "#555";

        var onProgress = function (current, target) {
          btn.textContent = "Capturing... " + current + (target != null ? " / " + target : "");
          try {
            chrome.runtime.sendMessage({
              type: "ZILLOW_CAPTURE_PROGRESS",
              current: current,
              target: target,
            });
          } catch (_) {}
        };

        runCaptureGallery(onProgress).then(function (result) {
          var images = result.images || [];
          var meta = {
            source: result.source,
            capturedCount: result.capturedCount,
            targetPhotoCount: result.targetPhotoCount,
            loadedViaAutoScroll: result.loadedViaAutoScroll === true,
            loadedGalleryItemCount: result.loadedGalleryItemCount,
            stopReason: result.stopReason,
          };
          try { window.__ZI_LAST_RESULT__ = { images: images, meta: meta }; } catch (_) {}

          if (images.length > 0) {
            chrome.storage.local.set({ zillowLatestCapture: { images: images, meta: meta } }, function () {
              btn.textContent = images.length + " photos captured!";
              btn.style.background = "#16a34a";
              // Open Photo Picker
              chrome.runtime.sendMessage({ type: "ZILLOW_OPEN_PICKER" });
              // Reset button after a moment
              setTimeout(function () {
                btn.disabled = false;
                btn.textContent = "\uD83D\uDCF7 Zillow Import";
                btn.style.background = "#1A2332";
              }, 3000);
            });
          } else {
            btn.textContent = "No photos found";
            btn.style.background = "#dc2626";
            setTimeout(function () {
              btn.disabled = false;
              btn.textContent = "\uD83D\uDCF7 Zillow Import";
              btn.style.background = "#1A2332";
            }, 3000);
          }
        }).catch(function () {
          btn.textContent = "Capture failed";
          btn.style.background = "#dc2626";
          setTimeout(function () {
            btn.disabled = false;
            btn.textContent = "\uD83D\uDCF7 Zillow Import";
            btn.style.background = "#1A2332";
          }, 3000);
        });
      });

      document.body.appendChild(btn);
    });
  }

  // Inject button when page is ready, and on SPA navigations
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      console.log("[ZI] content script ready");
      injectCaptureButton();
    });
  } else {
    console.log("[ZI] content script ready");
    injectCaptureButton();
  }

  // Watch for SPA navigation (Zillow uses client-side routing)
  var lastUrl = window.location.href;
  var urlObserver = new MutationObserver(function () {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // Remove old button if navigating away from listing
      var old = document.getElementById("zi-capture-fab");
      if (old) old.remove();
      // Re-check after a short delay for SPA page transitions
      setTimeout(injectCaptureButton, 1000);
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });
})();
