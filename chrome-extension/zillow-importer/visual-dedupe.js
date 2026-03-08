/**
 * Lightweight perceptual clustering using average hash (8x8 grayscale).
 * Groups visually similar images; does NOT remove any. Preserves input order.
 * First occurrence in order = representative for each cluster.
 */
(function (global) {
  var SIZE = 8;
  var HAMMING_THRESHOLD = 6;
  var MAX_CANDIDATES = 120;

  function hammingDistance(a, b) {
    if (!a || !b || a.length !== b.length) return 999;
    var d = 0;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) d++;
    }
    return d;
  }

  /**
   * Compute average hash from image URL: load into canvas 8x8 grayscale, compare to average.
   * Returns hash string (64 chars "0"/"1") or null on failure (e.g. CORS tainted).
   */
  function computeAverageHash(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onerror = function () { resolve(null); };
      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          var ctx = canvas.getContext("2d");
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0, SIZE, SIZE);
          var data = ctx.getImageData(0, 0, SIZE, SIZE);
          var pixels = data.data;
          var sum = 0;
          var n = SIZE * SIZE;
          for (var i = 0; i < n; i++) {
            var r = pixels[i * 4];
            var g = pixels[i * 4 + 1];
            var b = pixels[i * 4 + 2];
            sum += (0.299 * r + 0.587 * g + 0.114 * b);
          }
          var avg = sum / n;
          var bits = "";
          for (var j = 0; j < n; j++) {
            var gray = (0.299 * pixels[j * 4] + 0.587 * pixels[j * 4 + 1] + 0.114 * pixels[j * 4 + 2]);
            bits += gray >= avg ? "1" : "0";
          }
          resolve(bits);
        } catch (e) {
          resolve(null);
        }
      };
      img.src = url;
    });
  }

  /**
   * Run visual clustering on list of image URLs (Zillow/gallery order preserved).
   * - Processes in original order (no sort by width).
   * - Each image is assigned to a cluster: same hash (Hamming <= threshold) => same cluster.
   * - Representative = first image in Zillow order for that cluster; others are variants.
   * - Returns { clusters: [ { representative, variants }, ... ], rawCount, processedCount, durationMs, bundledCount }.
   */
  function runVisualClustering(urls) {
    var start = Date.now();
    var rawCount = urls.length;
    var inputCount = Math.min(urls.length, MAX_CANDIDATES);
    var toProcess = urls.slice(0, inputCount);
    var rest = urls.length > MAX_CANDIDATES ? urls.slice(MAX_CANDIDATES) : [];

    var clusters = [];
    var repHashes = [];

    function processNext(index) {
      if (index >= toProcess.length) {
        var durationMs = Date.now() - start;
        var bundledCount = 0;
        for (var c = 0; c < clusters.length; c++) {
          bundledCount += clusters[c].variants.length;
        }
        clusters = clusters.concat(rest.map(function (url) {
          return { representative: url, variants: [] };
        }));

        var totalInClusters = clusters.length;
        var totalPhotos = rawCount;
        var avgSize = totalInClusters > 0 ? (totalPhotos / totalInClusters) : 0;
        var first10Sizes = clusters.slice(0, 10).map(function (c) {
          return 1 + c.variants.length;
        });

        if (typeof console !== "undefined" && console.log) {
          console.log("[Zillow Import] visual clustering: raw photo count", rawCount);
          console.log("[Zillow Import] visual clustering: number of clusters", totalInClusters);
          console.log("[Zillow Import] visual clustering: average cluster size", avgSize.toFixed(2));
          console.log("[Zillow Import] visual clustering: photos bundled (variants)", bundledCount);
          console.log("[Zillow Import] visual clustering: first 10 cluster sizes", first10Sizes);
          console.log("[Zillow Import] visual clustering: duration ms", durationMs);
        }

        return Promise.resolve({
          clusters: clusters,
          rawCount: rawCount,
          processedCount: inputCount,
          durationMs: durationMs,
          bundledCount: bundledCount,
        });
      }

      var url = toProcess[index];
      return computeAverageHash(url).then(function (hash) {
        if (!hash) {
          clusters.push({ representative: url, variants: [] });
          repHashes.push("nohash-" + index);
        } else {
          var found = false;
          for (var k = 0; k < repHashes.length; k++) {
            if (repHashes[k] && hammingDistance(hash, repHashes[k]) <= HAMMING_THRESHOLD) {
              clusters[k].variants.push(url);
              found = true;
              break;
            }
          }
          if (!found) {
            clusters.push({ representative: url, variants: [] });
            repHashes.push(hash);
          }
        }
        return new Promise(function (resolve) {
          setTimeout(function () {
            processNext(index + 1).then(resolve);
          }, 0);
        });
      });
    }

    return processNext(0);
  }

  global.VisualDedupe = {
    run: runVisualClustering,
    MAX_CANDIDATES: MAX_CANDIDATES,
    HAMMING_THRESHOLD: HAMMING_THRESHOLD,
  };
})(typeof window !== "undefined" ? window : this);
