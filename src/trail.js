// Suiteframe scroll line — handoff SVG centerline mapped to live DOM anchors.
// Geometry: src/trail/suiteframe-line-coordinates.json (CURSOR-HANDOFF.md).
// Thank-you handwriting stays separate DOM (.trail-thanks).
(function () {
  var root = document.querySelector(".draw-trail");
  var thanks = document.querySelector(".trail-thanks");
  if (!root) return;
  if (window.getComputedStyle(root).display === "none") return;

  var motionQuery =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  function prefersReducedMotion() {
    return !!(motionQuery && motionQuery.matches);
  }
  var debug =
    /(?:\?|&)trailDebug=1(?:&|$)/.test(window.location.search) ||
    window.localStorage.getItem("sf_trail_debug") === "1";

  var REF_W = 2048;
  var REF_H = 7811;
  var REVEAL_LEAD = 160;

  var svg = null;
  var pathEl = null;
  var debugLayer = null;
  var pathLength = 1;
  var regionLens = [];
  var mapped = [];
  var regions = [];
  var coords = null;
  var revealFn = null;
  var layoutTimer = 0;
  var ticking = false;

  function el(sel) {
    return document.querySelector(sel);
  }

  function els(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }

  function box(node) {
    if (!node) return null;
    var r = node.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return null;
    return {
      left: r.left + window.scrollX,
      top: r.top + window.scrollY,
      right: r.right + window.scrollX,
      bottom: r.bottom + window.scrollY,
      width: r.width,
      height: r.height,
      cx: r.left + window.scrollX + r.width / 2,
      cy: r.top + window.scrollY + r.height / 2,
    };
  }

  function unionBoxes(list) {
    var out = null;
    list.forEach(function (b) {
      if (!b) return;
      if (!out) {
        out = {
          left: b.left,
          top: b.top,
          right: b.right,
          bottom: b.bottom,
        };
        return;
      }
      out.left = Math.min(out.left, b.left);
      out.top = Math.min(out.top, b.top);
      out.right = Math.max(out.right, b.right);
      out.bottom = Math.max(out.bottom, b.bottom);
    });
    if (!out) return null;
    out.width = out.right - out.left;
    out.height = out.bottom - out.top;
    out.cx = out.left + out.width / 2;
    out.cy = out.top + out.height / 2;
    return out;
  }

  function padBox(b, pad) {
    if (!b) return null;
    var p = pad || 0;
    return {
      left: b.left - p,
      top: b.top - p,
      right: b.right + p,
      bottom: b.bottom + p,
      width: b.width + p * 2,
      height: b.height + p * 2,
      cx: b.cx,
      cy: b.cy,
    };
  }

  function bboxOf(points) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < points.length; i++) {
      var x = points[i][0];
      var y = points[i][1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }

  function assetUrl(name) {
    var script = document.querySelector('script[src*="trail.js"]');
    var src = script && script.getAttribute("src");
    if (src) {
      return src.replace(/trail\.js(?:\?.*)?$/, "trail/" + name);
    }
    return "/assets/trail/" + name;
  }

  function ensureSvg() {
    if (svg) return;
    root.innerHTML = "";
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "draw-trail__svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("id", "suiteframe-scroll-line");
    pathEl.setAttribute("class", "draw-trail__path");
    pathEl.setAttribute("fill", "none");
    pathEl.setAttribute("stroke-linecap", "round");
    pathEl.setAttribute("stroke-linejoin", "round");
    svg.appendChild(pathEl);

    if (debug) {
      debugLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      debugLayer.setAttribute("class", "draw-trail__debug");
      svg.appendChild(debugLayer);
    }

    root.appendChild(svg);
  }

  function preparePath(path) {
    var length = path.getTotalLength();
    if (!isFinite(length) || length < 1) length = 1;
    path.style.strokeDasharray = length + " " + length;
    return {
      length: length,
      set: function (progress) {
        var p = Math.min(1, Math.max(0, progress));
        path.style.strokeDashoffset = String(length * (1 - p));
        path.style.opacity = p === 0 ? "0" : "1";
      },
    };
  }

  function pointsToD(points) {
    if (!points.length) return "";
    var parts = ["M", points[0].x.toFixed(2), points[0].y.toFixed(2)];
    for (var i = 1; i < points.length; i++) {
      parts.push("L", points[i].x.toFixed(2), points[i].y.toFixed(2));
    }
    return parts.join(" ");
  }

  function mapPortion(srcPoints, live) {
    if (!srcPoints.length || !live) return [];
    var ref = bboxOf(srcPoints);
    var out = [];
    for (var i = 0; i < srcPoints.length; i++) {
      var nx = (srcPoints[i][0] - ref.left) / ref.width;
      var ny = (srcPoints[i][1] - ref.top) / ref.height;
      out.push({
        x: live.left + nx * live.width,
        y: live.top + ny * live.height,
      });
    }
    return out;
  }

  // Meet prior endpoint, then fade the correction so the rest stays on the live target box.
  function stitch(chunks) {
    var out = [];
    for (var c = 0; c < chunks.length; c++) {
      var chunk = chunks[c];
      if (!chunk.length) continue;
      if (!out.length) {
        for (var a = 0; a < chunk.length; a++) out.push(chunk[a]);
        continue;
      }
      var prev = out[out.length - 1];
      var dx = prev.x - chunk[0].x;
      var dy = prev.y - chunk[0].y;
      var blend = Math.max(10, Math.floor(chunk.length * 0.2));
      for (var i = 0; i < chunk.length; i++) {
        var w = i < blend ? 1 - i / blend : 0;
        out.push({
          x: chunk[i].x + dx * w,
          y: chunk[i].y + dy * w,
        });
      }
    }
    return out;
  }

  function liveTargets(narrow) {
    var docW = document.documentElement.clientWidth || window.innerWidth;
    var gutter = Math.max(14, Math.min(36, docW * 0.028));
    var hero = box(el(".hero"));
    var what = box(el('[data-trail="what"]'));
    var photos = box(el('[data-trail="photos"]')) || box(el(".demo__thumbs"));
    var video = box(el('[data-trail="video"]')) || box(el(".demo__frame"));
    var demoGrid = box(el(".demo__grid")) || unionBoxes([photos, video]);
    var demoLead = box(el(".demo__lead"));
    var how = box(el(".how")) || unionBoxes([box(el(".how__lead")), box(el('[data-trail="how-cta"]'))]);
    var gallery = box(el('[data-trail="gallery"]')) || box(el(".gallery"));
    var tiles = els('[data-trail="tile"]').map(box).filter(Boolean);
    var pricing = box(el('[data-trail="pricing"]')) || box(el(".pricing"));
    var contact = box(el('[data-trail="contact"]')) || box(el(".contact"));
    var quote = box(el(".quote")) || box(el("form.quote"));
    var thanksB = box(thanks);

    var pageBottom = Math.max(
      document.documentElement.scrollHeight,
      thanksB ? thanksB.bottom + 24 : 0,
      contact ? contact.bottom + 24 : 0
    );

    var heroLive = hero
      ? {
          left: gutter - 4,
          top: Math.max(0, hero.top),
          width: Math.max(28, gutter + 18),
          height: Math.max(80, hero.height),
          right: 0,
          bottom: 0,
          cx: 0,
          cy: 0,
        }
      : {
          left: gutter,
          top: 0,
          width: 40,
          height: window.innerHeight,
        };
    heroLive.right = heroLive.left + heroLive.width;
    heroLive.bottom = heroLive.top + heroLive.height;

    var whatPad = narrow ? 28 : 52;
    var whatLive = padBox(what, whatPad) || {
      left: gutter,
      top: heroLive.bottom,
      width: docW * 0.72,
      height: 180,
      right: gutter + docW * 0.72,
      bottom: heroLive.bottom + 180,
    };

    var demoPad = narrow ? 16 : 22;
    var demoCore = demoGrid || unionBoxes([photos, video, demoLead]);
    var demoLive = padBox(demoCore, demoPad) || whatLive;
    // Wide demo loop in the reference spans nearly the full page width
    if (!narrow && demoLive) {
      demoLive.left = Math.min(demoLive.left, gutter);
      demoLive.right = Math.max(demoLive.right, docW - gutter);
      demoLive.width = demoLive.right - demoLive.left;
    }

    var howPad = narrow ? 20 : 36;
    var howLive = padBox(how, howPad) || {
      left: gutter,
      top: demoLive.bottom,
      width: docW - gutter * 2,
      height: 280,
      right: docW - gutter,
      bottom: demoLive.bottom + 280,
    };

    var galPad = narrow ? 12 : 18;
    var galCore =
      gallery ||
      (tiles.length
        ? unionBoxes(tiles)
        : null);
    var galLive = padBox(galCore, galPad) || howLive;
    if (!narrow && galLive) {
      galLive.left = Math.min(galLive.left, gutter);
      galLive.right = Math.max(galLive.right, docW - gutter);
      galLive.width = galLive.right - galLive.left;
    }

    var pricePad = narrow ? 24 : 40;
    var priceLive = padBox(pricing, pricePad) || {
      left: gutter,
      top: galLive.bottom + 20,
      width: docW - gutter * 2,
      height: 160,
      right: docW - gutter,
      bottom: galLive.bottom + 180,
    };

    var contactCore = unionBoxes([contact, quote, thanksB]);
    var contactPad = narrow ? 18 : 32;
    var contactLive = padBox(contactCore, contactPad) || {
      left: gutter,
      top: priceLive.bottom,
      width: docW - gutter * 2,
      height: 420,
      right: docW - gutter,
      bottom: pageBottom,
    };

    // Narrow: compress horizontal span so stacked gallery still gets a readable route
    if (narrow) {
      [whatLive, demoLive, howLive, galLive, priceLive, contactLive].forEach(function (b) {
        var maxW = docW - gutter * 2;
        if (b.width > maxW) {
          b.left = gutter;
          b.width = maxW;
          b.right = b.left + b.width;
        }
      });
    }

    return {
      docW: docW,
      pageBottom: pageBottom,
      gutter: gutter,
      hero: heroLive,
      what: whatLive,
      demo: demoLive,
      how: howLive,
      gallery: galLive,
      pricing: priceLive,
      contact: contactLive,
      anchors: {
        hero: hero,
        what: what,
        photos: photos,
        video: video,
        how: how,
        gallery: galCore,
        pricing: pricing,
        contact: contact,
        thanks: thanksB,
      },
    };
  }

  // Index ranges into coordinates.points (includes interpreted join samples).
  var REGION_DEFS = [
    { id: "hero", i0: 0, i1: 89, target: "hero" },
    { id: "what", i0: 90, i1: 248, target: "what" },
    { id: "demo", i0: 249, i1: 610, target: "demo" },
    { id: "how", i0: 611, i1: 804, target: "how" },
    { id: "gallery", i0: 805, i1: 948, target: "gallery" },
    { id: "pricing", i0: 949, i1: 1239, target: "pricing" },
    { id: "contact", i0: 1240, i1: 1358, target: "contact" },
  ];

  function clampMapped(points, docW) {
    var minX = 4;
    var maxX = Math.max(minX + 8, docW - 4);
    for (var i = 0; i < points.length; i++) {
      if (points[i].x < minX) points[i].x = minX;
      if (points[i].x > maxX) points[i].x = maxX;
      if (points[i].y < 0) points[i].y = 0;
    }
    return points;
  }

  function buildMapped(points, targets) {
    var chunks = [];
    var meta = [];
    for (var r = 0; r < REGION_DEFS.length; r++) {
      var def = REGION_DEFS[r];
      var slice = points.slice(def.i0, def.i1 + 1);
      var live = targets[def.target];
      var mappedChunk = mapPortion(slice, live);
      chunks.push(mappedChunk);
      meta.push({
        id: def.id,
        i0: def.i0,
        i1: def.i1,
        live: live,
        startIndex: 0,
        endIndex: 0,
      });
    }
    var joined = clampMapped(stitch(chunks), targets.docW);
    // Recompute region index ranges on the joined polyline
    var cursor = 0;
    for (var m = 0; m < meta.length; m++) {
      var n = chunks[m].length;
      meta[m].startIndex = cursor;
      meta[m].endIndex = cursor + Math.max(0, n - 1);
      cursor += n;
    }
    return { points: joined, regions: meta };
  }

  function measureRegions(points, regionMeta) {
    var seg = [0];
    var total = 0;
    for (var i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      seg.push(total);
    }
    if (total < 1) total = 1;
    var lens = regionMeta.map(function (r) {
      var a = seg[Math.min(r.startIndex, seg.length - 1)] || 0;
      var b = seg[Math.min(r.endIndex, seg.length - 1)] || a;
      return {
        id: r.id,
        startLen: a,
        endLen: b,
        startFrac: a / total,
        endFrac: b / total,
        live: r.live,
      };
    });
    return { seg: seg, total: total, regions: lens };
  }

  function paintDebug(targets) {
    if (!debug || !debugLayer) return;
    while (debugLayer.firstChild) debugLayer.removeChild(debugLayer.firstChild);
    Object.keys(targets.anchors).forEach(function (key) {
      var b = targets.anchors[key];
      if (!b) return;
      var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(b.left));
      rect.setAttribute("y", String(b.top));
      rect.setAttribute("width", String(b.width));
      rect.setAttribute("height", String(b.height));
      rect.setAttribute("class", "draw-trail__debug-anchor");
      debugLayer.appendChild(rect);
      var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(b.left + 4));
      label.setAttribute("y", String(b.top + 14));
      label.setAttribute("class", "draw-trail__debug-label");
      label.textContent = key;
      debugLayer.appendChild(label);
    });
    REGION_DEFS.forEach(function (def, idx) {
      var live = targets[def.target];
      if (!live) return;
      var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(live.left));
      rect.setAttribute("y", String(live.top));
      rect.setAttribute("width", String(live.width));
      rect.setAttribute("height", String(live.height));
      rect.setAttribute("class", "draw-trail__debug-region");
      rect.setAttribute("data-region", def.id);
      debugLayer.appendChild(rect);
    });
  }

  function sectionProgress() {
    if (!regionLens.length) return 0;
    if (prefersReducedMotion()) return 1;

    var viewTop = window.scrollY;
    var viewBottom = window.scrollY + window.innerHeight + REVEAL_LEAD;
    var viewMid = window.scrollY + window.innerHeight * 0.55;
    var maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    );
    // Finish slightly before the theoretical max scroll (some engines stop early).
    var globalT = Math.min(1, window.scrollY / (maxScroll * 0.88));
    if (globalT >= 0.98) return 1;

    // Path-length windows per section; advance while that live band is in view
    // (needed for loops that travel upward — not a Y clip mask).
    var best = 0;
    for (var i = 0; i < regionLens.length; i++) {
      var r = regionLens[i];
      var live = r.live;
      if (!live) continue;
      var bandTop = live.top;
      var bandBottom = live.bottom;
      var bandH = Math.max(1, bandBottom - bandTop);

      var local = (viewMid - bandTop) / bandH;
      local = Math.min(1, Math.max(0, local));
      var frac = r.startFrac + (r.endFrac - r.startFrac) * local;

      if (viewBottom > bandTop) {
        best = Math.max(best, frac);
      }
      if (viewTop + window.innerHeight * 0.35 > bandBottom) {
        best = Math.max(best, r.endFrac);
      }
    }

    // Monotonic global floor so the stroke always finishes by page end
    return Math.min(1, Math.max(best, globalT));
  }

  function setThanks(p) {
    if (!thanks) return;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    thanks.style.opacity = String(p);
    thanks.style.transform = "translateY(" + ((1 - p) * 10).toFixed(1) + "px)";
  }

  function draw() {
    if (!revealFn) return;
    var p = sectionProgress();
    revealFn.set(p);
    var maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight
    );
    var scrollP = window.scrollY / maxScroll;
    setThanks(scrollP < 0.9 ? 0 : (scrollP - 0.9) / 0.1);
  }

  function layout() {
    if (!coords || !coords.points) return;
    ensureSvg();
    var narrow = window.matchMedia("(max-width: 768px)").matches;
    var targets = liveTargets(narrow);
    var built = buildMapped(coords.points, targets);
    mapped = built.points;
    regions = built.regions;

    var measured = measureRegions(mapped, regions);
    regionLens = measured.regions;
    pathLength = measured.total;

    var docH = Math.max(targets.pageBottom, window.innerHeight);
    root.style.width = targets.docW + "px";
    root.style.height = docH + "px";
    svg.setAttribute("viewBox", "0 0 " + targets.docW + " " + docH);
    svg.setAttribute("width", String(targets.docW));
    svg.setAttribute("height", String(docH));

    pathEl.setAttribute("d", pointsToD(mapped));
    revealFn = preparePath(pathEl);
    pathLength = revealFn.length;
    paintDebug(targets);
    draw();
  }

  function scheduleLayout() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(layout, 80);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      draw();
      ticking = false;
    });
  }

  function boot(data) {
    coords = data;
    REF_W = data.width || REF_W;
    REF_H = data.height || REF_H;
    if (thanks) {
      thanks.style.opacity = prefersReducedMotion() ? "1" : "0";
    }
    layout();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", scheduleLayout);
    window.addEventListener("load", layout);
    if (motionQuery && motionQuery.addEventListener) {
      motionQuery.addEventListener("change", function () {
        layout();
      });
    }
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(scheduleLayout);
      ro.observe(document.body);
      [
        ".hero",
        '[data-trail="what"]',
        ".demo__grid",
        ".how",
        ".gallery",
        '[data-trail="pricing"]',
        '[data-trail="contact"]',
        ".trail-thanks",
      ].forEach(function (sel) {
        var node = el(sel);
        if (node) ro.observe(node);
      });
    }
    Array.prototype.forEach.call(document.images, function (img) {
      if (!img.complete) img.addEventListener("load", scheduleLayout, { once: true });
    });
  }

  fetch(assetUrl("suiteframe-line-coordinates.json"))
    .then(function (res) {
      if (!res.ok) throw new Error("trail coordinates HTTP " + res.status);
      return res.json();
    })
    .then(boot)
    .catch(function (err) {
      console.warn("[suiteframe trail]", err);
    });
})();
