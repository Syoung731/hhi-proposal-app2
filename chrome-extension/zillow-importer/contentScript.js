/**
 * Zillow Import - Modal-first vertical media wall scraper.
 * 1) Click "See all photos", 2) wait for modal, 3) scrape figure[data-testid^="vmw-photo-"] from modal wall.
 * No next/prev walker. Normalize URLs, dedupe by canonical key, preserve gallery order.
 */
(function () {
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
   * Canonical identity key: URL without size variant suffix (for dedupe).
   */
  function getCanonicalKey(url) {
    if (!url) return "";
    var key = url;
    for (var i = 0; i < SIZE_VARIANTS.length; i++) {
      key = key.replace(new RegExp(SIZE_VARIANTS[i].replace(/[-.]/g, "\\$&") + "(\\.webp|\\.jpg|\\.jpeg)?", "gi"), "");
    }
    return key.replace(/\?.*$/, "");
  }

  function getQualityRank(url) {
    var r = 0;
    for (var i = 0; i < SIZE_VARIANTS.length; i++) {
      if (url.indexOf(SIZE_VARIANTS[i]) !== -1) {
        var q = QUALITY_ORDER[SIZE_VARIANTS[i]];
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
   * CAPTURE_GALLERY: open modal, extract wall, auto-scroll to load more, normalize; else fallback to listing preview.
   */
  function runCaptureGallery(onProgress) {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (typeof console !== "undefined" && console.log) {
        console.log("[ZI] content script ready (capture on user click only)");
      }
    });
  }
})();
