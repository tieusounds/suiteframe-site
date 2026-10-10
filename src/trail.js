// Exact chalk trail: screenshot ink PNGs, landmark-aligned, obstacle-punched,
// scroll-revealed. Thank-you handwriting stays separate DOM.
(function () {
  var root = document.querySelector(".draw-trail");
  var thanks = document.querySelector(".trail-thanks");
  if (!root) return;
  if (window.getComputedStyle(root).display === "none") return;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // How far ahead of the viewport bottom the chalk is allowed to paint (px).
  var REVEAL_LEAD = 120;
  // Tight punch: only clear ink that lands ON glyphs/controls
  var PAD_DESKTOP = 6;
  var PAD_MOBILE = 4;

  var manifest = null;
  var inkImages = []; // { meta, img, ready }
  var canvas = null;
  var ctx = null;
  var reveal = 0;

  var OBSTACLE_SELECTORS = [
    ".site-nav",
    ".brand",
    ".hero__copy",
    ".statement",
    ".demo__lead",
    ".demo__sub",
    ".demo__caption",
    ".demo__thumbs img",
    ".demo__frame",
    ".how__lead",
    ".how__step",
    ".how__closer",
    ".how__cta",
    ".gallery__item",
    ".pricing-line",
    ".contact__intro",
    ".quote__field",
    ".quote__note",
    ".quote__submit",
    ".quote__honeypot",
    ".trail-thanks",
    ".site-footer",
  ];

  function assetPrefix() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || "";
      var m = src.match(/^(.*)assets\/trail\.js(?:\?.*)?$/);
      if (m) return m[1];
    }
    return "/";
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
    };
  }

  function contentBounds() {
    var bottom = 0;
    [document.querySelector("main"), document.querySelector(".site-footer"), thanks].forEach(
      function (node) {
        var b = box(node);
        if (b) bottom = Math.max(bottom, b.bottom);
      }
    );
    return {
      docW: document.documentElement.clientWidth || window.innerWidth,
      docH: Math.max(bottom + 16, window.innerHeight),
    };
  }

  function collectObstacles(pad) {
    var out = [];
    OBSTACLE_SELECTORS.forEach(function (sel) {
      els(sel).forEach(function (node) {
        var b = box(node);
        if (!b) return;
        // Never punch media frames — chalk is authored to frame them and
        // punching their boxes shreds the loops. Text/controls only.
        if (node.matches("img, video, .demo__frame, .gallery__item, .demo__thumbs img")) {
          return;
        }
        out.push({
          left: b.left - pad,
          top: b.top - pad,
          width: b.width + pad * 2,
          height: b.height + pad * 2,
        });
      });
    });
    return out;
  }

  function ensureCanvas() {
    if (canvas) return;
    // Replace legacy layers markup if present
    root.innerHTML = "";
    canvas = document.createElement("canvas");
    canvas.className = "draw-trail__canvas";
    canvas.setAttribute("aria-hidden", "true");
    root.appendChild(canvas);
    ctx = canvas.getContext("2d", { alpha: true });
  }

  function layoutAndPaint() {
    if (!manifest || !manifest.length) return;
    ensureCanvas();
    var bounds = contentBounds();
    var docW = bounds.docW;
    var docH = bounds.docH;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    root.style.width = docW + "px";
    root.style.height = docH + "px";
    canvas.width = Math.round(docW * dpr);
    canvas.height = Math.round(docH * dpr);
    canvas.style.width = docW + "px";
    canvas.style.height = docH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, docW, docH);

    // Draw all ink layers, landmark-aligned
    for (var i = 0; i < inkImages.length; i++) {
      var entry = inkImages[i];
      if (!entry.ready || !entry.img.naturalWidth) continue;
      var meta = entry.meta;
      var scale = docW / (meta.capture_w || meta.src_w || 1024);
      var drawW = docW;
      var drawH = (meta.src_h || entry.img.naturalHeight) * scale;
      var top = 0;
      var left = 0;
      var landmark = meta.landmark ? document.querySelector(meta.landmark) : null;
      var lb = box(landmark);
      if (lb && typeof meta.landmark_y === "number") {
        top = lb.top - meta.landmark_y * scale;
      } else if (meta.page_y != null) {
        top = meta.page_y * scale;
      }
      // Optional horizontal nudge in source pixels (negative = left)
      if (typeof meta.offset_x === "number") {
        left = meta.offset_x * scale;
      }
      ctx.drawImage(entry.img, left, top, drawW, drawH);
    }

    // Hard rule: never paint over text / media / controls.
    // Only punch TEXT/controls — media gutters must keep chalk (media already
    // excluded during extraction; punching media boxes eats the framing loops).
    var pad = window.matchMedia("(max-width: 768px)").matches ? PAD_MOBILE : PAD_DESKTOP;
    var obstacles = collectObstacles(pad);
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    for (var o = 0; o < obstacles.length; o++) {
      var r = obstacles[o];
      ctx.fillStyle = "#000";
      ctx.fillRect(r.left, r.top, r.width, r.height);
    }
    ctx.restore();

    applyReveal();
  }

  function applyReveal() {
    if (!canvas) return;
    var docH = parseFloat(root.style.height) || canvas.getBoundingClientRect().height || 1;
    var p = reduceMotion ? 1 : reveal;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    // Soft edge ~80px in document space
    var soft = Math.min(0.04, 80 / docH);
    var a = Math.max(0, (p - soft) * 100);
    var b = p * 100;
    var mask =
      "linear-gradient(to bottom, #000 0%, #000 " +
      a.toFixed(2) +
      "%, transparent " +
      Math.min(100, b).toFixed(2) +
      "%)";
    canvas.style.webkitMaskImage = mask;
    canvas.style.maskImage = mask;
  }

  function setThanks(p) {
    if (!thanks) return;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    thanks.style.opacity = String(p);
    thanks.style.transform = "translateY(" + ((1 - p) * 10).toFixed(1) + "px)";
  }

  function draw() {
    var bounds = contentBounds();
    var docH = bounds.docH || 1;
    var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    if (reduceMotion) {
      reveal = 1;
      applyReveal();
      setThanks(1);
      return;
    }

    // Reveal chalk down to just past the viewport — not a fraction of the
    // whole page (that clipped mid-section loops while you were looking at them).
    var revealY = window.scrollY + window.innerHeight + REVEAL_LEAD;
    reveal = Math.min(1, Math.max(0, revealY / docH));

    var p = maxScroll > 0 ? window.scrollY / maxScroll : 1;
    var thanksP = p < 0.9 ? 0 : (p - 0.9) / 0.1;
    applyReveal();
    setThanks(thanksP);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      draw();
      ticking = false;
    });
  }

  var layoutTimer = 0;
  function scheduleLayout() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(layoutAndPaint, 80);
  }

  function mount(data) {
    manifest = data;
    inkImages = [];
    var prefix = assetPrefix();
    var pending = data.length;

    function maybeReady() {
      pending -= 1;
      if (pending <= 0) layoutAndPaint();
    }

    data.forEach(function (meta) {
      var img = new Image();
      img.decoding = "async";
      var entry = { meta: meta, img: img, ready: false };
      inkImages.push(entry);
      img.onload = function () {
        entry.ready = true;
        maybeReady();
      };
      img.onerror = function () {
        maybeReady();
      };
      img.src = prefix + meta.file.replace(/^\//, "");
    });

    if (!data.length) layoutAndPaint();
  }

  if (thanks) {
    thanks.style.opacity = reduceMotion ? "1" : "0";
  }

  ensureCanvas();
  applyReveal();

  fetch(assetPrefix() + "assets/trail-ink/manifest.json", { credentials: "same-origin" })
    .then(function (r) {
      if (!r.ok) throw new Error("manifest " + r.status);
      return r.json();
    })
    .then(mount)
    .catch(function () {
      /* no ink */
    });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("load", scheduleLayout);

  if ("ResizeObserver" in window) {
    new ResizeObserver(scheduleLayout).observe(document.body);
  }
  Array.prototype.forEach.call(document.images, function (img) {
    if (!img.complete) img.addEventListener("load", scheduleLayout, { once: true });
  });
})();
