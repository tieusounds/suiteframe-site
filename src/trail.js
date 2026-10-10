// One continuous chalk stroke, redrawn from live layout boxes.
// Gesture follows the authored drawings; coordinates come from the page, not PNGs.
// Thank-you handwriting stays separate DOM.
(function () {
  var root = document.querySelector(".draw-trail");
  var thanks = document.querySelector(".trail-thanks");
  if (!root) return;
  if (window.getComputedStyle(root).display === "none") return;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var REVEAL_LEAD = 140;
  var canvas = null;
  var ctx = null;
  var spine = [];
  var segLens = [];
  var totalLen = 0;
  var reveal = 0;

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

  function pt(x, y) {
    return { x: x, y: y };
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function noise(i, salt) {
    var n = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  function contentBounds() {
    var bottom = 0;
    [el("main"), el(".site-footer"), thanks].forEach(function (node) {
      var b = box(node);
      if (b) bottom = Math.max(bottom, b.bottom);
    });
    return {
      docW: document.documentElement.clientWidth || window.innerWidth,
      docH: Math.max(bottom + 16, window.innerHeight),
    };
  }

  function collectObstacles(pad) {
    var selectors = [
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
    var out = [];
    selectors.forEach(function (sel) {
      els(sel).forEach(function (node) {
        var b = box(node);
        if (!b) return;
        var extra = node.matches(
          "img, video, .demo__frame, .gallery__item, .quote__submit, .how__cta, .hero__cta"
        )
          ? pad * 0.55
          : 0;
        out.push({
          left: b.left - pad - extra,
          top: b.top - pad - extra,
          right: b.right + pad + extra,
          bottom: b.bottom + pad + extra,
        });
      });
    });
    return out;
  }

  function hits(obstacles, x, y) {
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (x >= o.left && x <= o.right && y >= o.top && y <= o.bottom) return o;
    }
    return null;
  }

  function pushFree(obstacles, x, y, prefer) {
    if (!hits(obstacles, x, y)) return pt(x, y);
    var dirs = prefer || [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    for (var dist = 4; dist <= 96; dist += 4) {
      for (var d = 0; d < dirs.length; d++) {
        var nx = x + dirs[d][0] * dist;
        var ny = y + dirs[d][1] * dist;
        if (!hits(obstacles, nx, ny)) return pt(nx, ny);
      }
    }
    return pt(x, y);
  }

  function gapX(a, b) {
    if (!a || !b) return null;
    return (a.right + b.left) / 2;
  }

  function gapY(a, b) {
    if (!a || !b) return null;
    return (a.bottom + b.top) / 2;
  }

  // Choreography from the hand drawings, resolved against live boxes.
  function buildSpine(docW, docH, obstacles) {
    var narrow = window.matchMedia("(max-width: 768px)").matches;
    var lg = Math.max(14, Math.min(36, docW * 0.028));
    var rg = docW - lg;
    var pts = [];

    function add(x, y, prefer, free) {
      // free=true: keep authored gutter points (no obstacle shove → no zig-zag spikes)
      var p = free ? pt(x, y) : pushFree(obstacles, x, y, prefer);
      var j = (noise(pts.length, 1.7) - 0.5) * 2.2;
      var j2 = (noise(pts.length, 4.1) - 0.5) * 1.8;
      pts.push(pt(p.x + j, p.y + j2));
    }

    var what = box(el('[data-trail="what"]'));
    var photos = box(el('[data-trail="photos"]'));
    var video = box(el('[data-trail="video"]'));
    var howCta = box(el('[data-trail="how-cta"]'));
    var howLead = box(el(".how__lead"));
    var howCloser = box(el(".how__closer"));
    var pricing = box(el('[data-trail="pricing"]'));
    var contact = box(el('[data-trail="contact"]'));
    var submit = box(el(".quote__submit"));
    var thanksB = box(thanks);
    var tiles = els('[data-trail="tile"]').map(box).filter(Boolean);
    var demoLead = box(el(".demo__lead"));
    var demoSub = box(el(".demo__sub"));
    var hero = box(el(".hero"));

    // 1. Left gutter from top → into What (gutter stays free — no shove spikes)
    add(lg, 8, null, true);
    if (hero) {
      add(lg + 2, hero.top + hero.height * 0.55, null, true);
      add(lg + 2, hero.bottom - 8, null, true);
    }
    if (what) {
      // Open loop around the statement — one stroke, not a closed picture-frame
      var wp = narrow ? 20 : 28;
      add(lg + 4, what.top - 24, null, true);
      add(what.left - wp, what.top - 10);
      add(what.left - wp - 4, what.cy);
      add(what.left - wp, what.bottom + 10);
      add(what.cx, what.bottom + wp);
      add(what.right + wp * 0.55, what.bottom + 6);
      add(what.right + wp, what.top + what.height * 0.35);
      add(lg + 10, what.bottom + 36, null, true);
    }

    // 2. Demo: one continuous wind around photos then video (not two closed frames)
    var underDemo =
      demoSub && demoSub.bottom
        ? demoSub.bottom + 14
        : demoLead
          ? demoLead.bottom + 18
          : null;
    if (underDemo != null) {
      add(lg + 8, underDemo);
    }

    var thumbs = box(el(".demo__thumbs"));
    var frame = box(el(".demo__frame")) || video;
    var photoBlock = thumbs || photos;
    if (photoBlock && frame && !narrow) {
      var mid = gapX(photoBlock, frame);
      var padP = 14;
      var padV = 16;
      // Stay under copy, then wind around thumbs → gutter → video frame
      var yEnter = underDemo != null ? underDemo : photoBlock.top - 14;
      add(lg + 8, yEnter, null, true);
      add(photoBlock.left - padP, yEnter);
      add(photoBlock.left - padP - 2, photoBlock.cy);
      add(photoBlock.left - padP, photoBlock.bottom + padP);
      add(photoBlock.cx, photoBlock.bottom + padP + 2);
      add(mid - 2, photoBlock.bottom + 8);
      add(mid, (photoBlock.cy + frame.cy) / 2);
      add(mid + 2, frame.top - padV);
      add(frame.cx, frame.top - padV - 2);
      add(frame.right + padV, frame.top - 6);
      add(frame.right + padV + 2, frame.cy);
      add(frame.right + padV, frame.bottom + 8);
      add(frame.cx, frame.bottom + padV);
      add(mid + 2, frame.bottom + 10);
      add(photoBlock.left + 20, photoBlock.bottom + 40);
      add(lg + 8, photoBlock.bottom + 56, null, true);
    } else if (frame) {
      add(lg + 8, frame.top - 14, null, true);
      add(frame.left - 12, frame.top - 10);
      add(frame.right + 14, frame.top - 8);
      add(frame.right + 14, frame.bottom + 10);
      add(lg + 8, frame.bottom + 28, null, true);
    }

    // 3. How: left margin past lead/steps, under closer+CTA, then across above gallery
    if (howLead) {
      add(lg + 5, howLead.top - 10);
      add(lg + 4, howLead.bottom + 12);
    }
    if (howCloser) {
      add(lg + 8, howCloser.top - 8);
      add(lg + 10, howCloser.bottom + 10);
    }
    if (howCta) {
      add(lg + 12, howCta.cy);
      add(lg + 8, howCta.bottom + 20);
    }

    var galTop = tiles.length
      ? Math.min.apply(
          null,
          tiles.map(function (t) {
            return t.top;
          })
        )
      : null;
    if (galTop != null) {
      add(lg + 10, galTop - 20);
      add(docW * 0.34, galTop - 14);
      add(docW * 0.58, galTop - 16);
      add(docW * 0.82, galTop - 12);
    }

    // 4. Gallery seams (iPad drawing: down mid/right gutter, across, down left/mid)
    if (tiles.length >= 6 && !narrow) {
      var sorted = tiles.slice().sort(function (a, b) {
        var dy = a.top - b.top;
        if (Math.abs(dy) > 40) return dy;
        return a.left - b.left;
      });
      var rows = [];
      sorted.forEach(function (t) {
        var last = rows[rows.length - 1];
        if (!last || Math.abs(t.top - last[0].top) > 48) rows.push([t]);
        else last.push(t);
      });
      rows.forEach(function (row) {
        row.sort(function (a, b) {
          return a.left - b.left;
        });
      });
      if (rows[0] && rows[0].length >= 3) {
        var r0 = rows[0];
        var vx = gapX(r0[1], r0[2]);
        add(vx, r0[0].top - 6);
        add(vx + 2, r0[0].cy);
        if (rows[1] && rows[1].length >= 2) {
          var r1 = rows[1];
          var hy = gapY(r0[0], r1[0]);
          add(vx, hy);
          var vx2 = gapX(r1[0], r1[1]);
          add(vx2, hy + 2);
          add(vx2 - 2, r1[0].cy);
          add(vx2, r1[0].bottom + 14);
        } else {
          add(vx, r0[0].bottom + 18);
        }
      }
      var galBottom = Math.max.apply(
        null,
        tiles.map(function (t) {
          return t.bottom;
        })
      );
      add(docW * 0.3, galBottom + 26);
      add(lg + 22, galBottom + 48);
    } else if (tiles.length) {
      tiles.forEach(function (t, i) {
        if (i === 0) add(lg + 8, t.top - 10);
        add(lg + 6, t.bottom + 8);
      });
    }

    // 5. Open loop past pricing, sweep right, S toward form gutter
    if (pricing) {
      var pp = narrow ? 18 : 26;
      add(pricing.left - pp, pricing.top - 4);
      add(pricing.left - pp - 2, pricing.cy);
      add(pricing.left - 8, pricing.bottom + pp);
      add(pricing.cx, pricing.bottom + pp + 2);
      add(pricing.right + pp, pricing.bottom + 6);
      add(pricing.right + pp + 4, pricing.cy);
      add(pricing.right + 20, pricing.top - 6);
      add(docW * 0.58, pricing.bottom + 32);
      add(rg - 20, pricing.bottom + 44);
    }

    if (contact) {
      add(rg - 16, contact.top + 36);
      add(rg - 22, contact.cy);
    }

    // 6. Right gutter past submit → into thanks (handwriting is separate)
    if (submit) {
      add(rg - 18, submit.top - 28);
      add(rg - 14, submit.bottom + 18);
      add(submit.right + 18, submit.bottom + 26);
      add(Math.max(lg + 28, submit.left - 8), submit.bottom + 40);
    }

    if (thanksB) {
      add(thanksB.left + 40, thanksB.top - 12);
      add(thanksB.left + 22, thanksB.top + 2);
    } else {
      add(docW * 0.32, docH - 90);
    }

    return pts;
  }

  function densify(points, step) {
    if (points.length < 2) return points.slice();
    var out = [points[0]];
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1];
      var b = points[i];
      var dist = Math.hypot(b.x - a.x, b.y - a.y);
      var n = Math.max(1, Math.ceil(dist / step));
      for (var k = 1; k <= n; k++) {
        var t = k / n;
        var p0 = points[Math.max(0, i - 2)];
        var p1 = a;
        var p2 = b;
        var p3 = points[Math.min(points.length - 1, i + 1)];
        var t2 = t * t;
        var t3 = t2 * t;
        var x =
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        var y =
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        out.push(pt(x, y));
      }
    }
    return out;
  }

  function wobble(points, amp) {
    var out = [];
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      var prev = points[Math.max(0, i - 1)];
      var next = points[Math.min(points.length - 1, i + 1)];
      var dx = next.x - prev.x;
      var dy = next.y - prev.y;
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len;
      var ny = dx / len;
      var n1 = (noise(i, 2.2) - 0.5) * 2;
      var n2 = (noise(i, 9.7) - 0.5) * 2;
      var a = amp * (0.55 + 0.45 * Math.sin(i * 0.37));
      out.push(
        pt(p.x + nx * n1 * a + nx * n2 * a * 0.35, p.y + ny * n1 * a + ny * n2 * a * 0.35)
      );
    }
    return out;
  }

  function breakStraights(points, maxStraight) {
    var out = [points[0]];
    for (var i = 1; i < points.length; i++) {
      var a = out[out.length - 1];
      var b = points[i];
      var dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist > maxStraight) {
        var mid = pt((a.x + b.x) / 2, (a.y + b.y) / 2);
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var len = Math.hypot(dx, dy) || 1;
        var bump = (noise(i, 3.3) - 0.5) * 5.5;
        mid.x += (-dy / len) * bump;
        mid.y += (dx / len) * bump;
        out.push(mid);
      }
      out.push(b);
    }
    return out;
  }

  function projectChain(points, obstacles, gutterX) {
    return points.map(function (p) {
      if (!hits(obstacles, p.x, p.y)) return p;
      // Prefer staying in the left/right gutters when shoving
      var prefer =
        p.x < gutterX * 2.5
          ? [
              [-1, 0],
              [0, 1],
              [0, -1],
              [-1, 1],
              [-1, -1],
            ]
          : null;
      return pushFree(obstacles, p.x, p.y, prefer);
    });
  }

  function measure(points) {
    segLens = [0];
    totalLen = 0;
    for (var i = 1; i < points.length; i++) {
      totalLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      segLens.push(totalLen);
    }
    if (totalLen < 1) totalLen = 1;
  }

  function ensureCanvas() {
    if (canvas) return;
    root.innerHTML = "";
    canvas = document.createElement("canvas");
    canvas.className = "draw-trail__canvas";
    canvas.setAttribute("aria-hidden", "true");
    root.appendChild(canvas);
    ctx = canvas.getContext("2d", { alpha: true });
  }

  function widthAt(s, narrow) {
    var base = narrow ? 1.35 : 2.05;
    var pulse =
      0.62 +
      0.38 * Math.sin(s * Math.PI) * (0.75 + 0.25 * Math.sin(s * 17)) +
      0.18 * Math.sin(s * 39 + 0.8);
    return base * pulse;
  }

  function paintChalk(uptoLen) {
    if (!ctx || spine.length < 2) return;
    var narrow = window.matchMedia("(max-width: 768px)").matches;
    var bounds = contentBounds();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    root.style.width = bounds.docW + "px";
    root.style.height = bounds.docH + "px";
    canvas.width = Math.round(bounds.docW * dpr);
    canvas.height = Math.round(bounds.docH * dpr);
    canvas.style.width = bounds.docW + "px";
    canvas.style.height = bounds.docH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, bounds.docW, bounds.docH);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    var end = uptoLen;
    if (end <= 0) return;

    // Soft under-stroke
    ctx.beginPath();
    var started = false;
    for (var i = 0; i < spine.length; i++) {
      if (segLens[i] > end) break;
      if (!started) {
        ctx.moveTo(spine[i].x, spine[i].y);
        started = true;
      } else {
        ctx.lineTo(spine[i].x, spine[i].y);
      }
    }
    if (started) {
      ctx.strokeStyle = "rgba(245, 242, 235, 0.28)";
      ctx.lineWidth = (narrow ? 3.2 : 4.4);
      ctx.stroke();
    }

    // Variable-pressure main stroke (one continuous polyline)
    for (var j = 1; j < spine.length; j++) {
      if (segLens[j] > end) break;
      var s = (segLens[j - 1] + segLens[j]) / (2 * totalLen);
      var wob = (noise(j, 3.1) - 0.5) * 0.7;
      ctx.beginPath();
      ctx.moveTo(spine[j - 1].x, spine[j - 1].y);
      ctx.lineTo(spine[j].x + wob, spine[j].y + wob * 0.6);
      ctx.strokeStyle = "rgba(250, 248, 242, 0.82)";
      ctx.lineWidth = widthAt(s, narrow);
      ctx.stroke();
    }
  }

  function revealLength() {
    if (!spine.length) return 0;
    if (reduceMotion) return totalLen;
    var revealY = window.scrollY + window.innerHeight + REVEAL_LEAD;
    // Tip of chalk follows the farthest spine point still above revealY
    var best = 0;
    for (var i = 0; i < spine.length; i++) {
      if (spine[i].y <= revealY) best = segLens[i];
      else break;
    }
    // Also advance with overall scroll so long horizontal runs keep drawing
    var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var scrollP = maxScroll > 0 ? window.scrollY / maxScroll : 1;
    var byScroll = totalLen * Math.min(1, scrollP / 0.92);
    return Math.max(best, byScroll * 0.35 + best * 0.65);
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
    var len = revealLength();
    reveal = len / totalLen;
    paintChalk(len);
    setThanks(p < 0.9 ? 0 : (p - 0.9) / 0.1);
  }

  function layout() {
    ensureCanvas();
    var bounds = contentBounds();
    var pad = window.matchMedia("(max-width: 768px)").matches ? 10 : 14;
    var obstacles = collectObstacles(pad);

    var raw = buildSpine(bounds.docW, bounds.docH, obstacles);
    raw = densify(raw, 11);
    raw = wobble(raw, 2.6);
    raw = breakStraights(raw, 16);
    raw = densify(raw, 7);
    raw = wobble(raw, 1.15);
    var gutterX = Math.max(14, Math.min(36, bounds.docW * 0.028));
    spine = projectChain(raw, obstacles, gutterX);
    measure(spine);
    draw();
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

  if (thanks) {
    thanks.style.opacity = reduceMotion ? "1" : "0";
  }

  layout();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("load", layout);

  if ("ResizeObserver" in window) {
    new ResizeObserver(scheduleLayout).observe(document.body);
  }
  Array.prototype.forEach.call(document.images, function (img) {
    if (!img.complete) img.addEventListener("load", scheduleLayout, { once: true });
  });
})();
