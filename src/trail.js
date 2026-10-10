// Exact chalk trail from authored screenshot ink (assets/trail-ink/*).
// Pixel overlays, scroll-revealed. Thank-you handwriting stays separate DOM.
(function () {
  var root = document.querySelector(".draw-trail");
  var layers = document.querySelector(".draw-trail__layers");
  var thanks = document.querySelector(".trail-thanks");
  if (!root || !layers) return;
  if (window.getComputedStyle(root).display === "none") return;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var PATH_SHARE = 0.88;
  var manifest = null;
  var imgs = [];

  function assetPrefix() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || "";
      var m = src.match(/^(.*)assets\/trail\.js(?:\?.*)?$/);
      if (m) return m[1];
    }
    return "/";
  }

  function box(node) {
    if (!node) return null;
    var r = node.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return null;
    return {
      left: r.left + window.scrollX,
      top: r.top + window.scrollY,
      width: r.width,
      height: r.height,
    };
  }

  function contentBounds() {
    var bottom = 0;
    [document.querySelector("main"), document.querySelector(".site-footer"), thanks].forEach(
      function (node) {
        var b = box(node);
        if (b) bottom = Math.max(bottom, b.top + b.height);
      }
    );
    return {
      docW: document.documentElement.clientWidth || window.innerWidth,
      docH: Math.max(bottom + 16, window.innerHeight),
    };
  }

  function layout() {
    if (!manifest || !manifest.length) return;
    var bounds = contentBounds();
    var docW = bounds.docW;
    var docH = bounds.docH;
    root.style.width = docW + "px";
    root.style.height = docH + "px";

    for (var i = 0; i < imgs.length; i++) {
      var meta = manifest[i];
      var img = imgs[i];
      var scale = docW / (meta.capture_w || meta.src_w || 1024);
      var h = (meta.src_h || img.naturalHeight || 1) * scale;
      var top;
      var anchor = meta.anchor ? document.querySelector(meta.anchor) : null;
      var ab = box(anchor);
      if (ab) {
        top = ab.top + (meta.y_offset_frac || 0) * h;
      } else {
        top = (meta.page_y || 0) * scale;
      }
      img.style.width = docW + "px";
      img.style.height = h + "px";
      img.style.left = "0px";
      img.style.top = Math.max(0, top) + "px";
    }

    draw();
  }

  function setReveal(p) {
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    // Soft edge so the chalk doesn't hard-cut
    var soft = 2.5;
    var a = Math.max(0, p * 100 - soft);
    var b = p * 100;
    var mask =
      "linear-gradient(to bottom, #000 0%, #000 " +
      a.toFixed(2) +
      "%, transparent " +
      b.toFixed(2) +
      "%)";
    layers.style.webkitMaskImage = mask;
    layers.style.maskImage = mask;
  }

  function setThanks(p) {
    if (!thanks) return;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    thanks.style.opacity = String(p);
    thanks.style.transform = "translateY(" + ((1 - p) * 10).toFixed(1) + "px)";
  }

  function draw() {
    var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var p = maxScroll > 0 ? window.scrollY / maxScroll : 1;
    if (p < 0) p = 0;
    if (p > 1) p = 1;

    if (reduceMotion) {
      setReveal(1);
      setThanks(1);
      return;
    }

    var pathP = Math.min(1, p / PATH_SHARE);
    var thanksP = p <= PATH_SHARE ? 0 : (p - PATH_SHARE) / (1 - PATH_SHARE);
    setReveal(pathP);
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
    layoutTimer = setTimeout(layout, 80);
  }

  function mount(data) {
    manifest = data;
    layers.innerHTML = "";
    imgs = [];
    var prefix = assetPrefix();
    var pending = data.length;

    data.forEach(function (meta, index) {
      var img = document.createElement("img");
      img.className = "draw-trail__ink";
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      img.src = prefix + meta.file.replace(/^\//, "");
      img.dataset.ink = meta.id;
      img.style.position = "absolute";
      img.style.display = "block";
      img.style.pointerEvents = "none";
      img.style.userSelect = "none";
      layers.appendChild(img);
      imgs[index] = img;
      img.addEventListener(
        "load",
        function () {
          pending -= 1;
          if (pending <= 0) layout();
        },
        { once: true }
      );
      img.addEventListener(
        "error",
        function () {
          pending -= 1;
          if (pending <= 0) layout();
        },
        { once: true }
      );
    });

    if (!data.length) layout();
  }

  if (thanks) {
    thanks.style.opacity = reduceMotion ? "1" : "0";
  }

  setReveal(reduceMotion ? 1 : 0);

  fetch(assetPrefix() + "assets/trail-ink/manifest.json", { credentials: "same-origin" })
    .then(function (r) {
      if (!r.ok) throw new Error("manifest " + r.status);
      return r.json();
    })
    .then(mount)
    .catch(function () {
      // Fallback: no ink available
      layers.innerHTML = "";
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
