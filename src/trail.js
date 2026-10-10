// Choreographed draw-trail: one hand-drawn stroke measured from live layout,
// revealed as you scroll. Tip tracks the bottom of the viewport.
(function () {
  var root = document.querySelector(".draw-trail");
  var svg = document.querySelector(".draw-trail__svg");
  var path = document.querySelector(".draw-trail__path");
  var thanksEl = document.querySelector(".draw-trail__thanks");
  var thanksSrc = document.getElementById("trail-thanks-src");
  // Trail hidden for screenshot path-authoring — bail before layout work.
  if (!root || !svg || !path) return;
  if (window.getComputedStyle(root).display === "none") return;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var pathLength = 0;
  var thanksLength = 0;
  // Path draws through most of the scroll; thank-you stroke finishes the last beat.
  var PATH_SHARE = 0.9;

  function el(sel) {
    return document.querySelector(sel);
  }

  function box(node) {
    if (!node) return null;
    var r = node.getBoundingClientRect();
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

  function leftGutter(docW) {
    var pad = Math.max(14, Math.min(48, docW * 0.028));
    return pad;
  }

  function rightGutter(docW) {
    return docW - leftGutter(docW);
  }

  // Hand-drawn orbit around a box — edge midpoints + soft corners, not a hard rect.
  function orbit(b, pad, exitSide) {
    if (!b) return [];
    var x0 = b.left - pad;
    var y0 = b.top - pad;
    var x1 = b.right + pad;
    var y1 = b.bottom + pad;
    var mx = (x0 + x1) / 2;
    var my = (y0 + y1) / 2;
    var rx = (x1 - x0) * 0.12;
    var ry = (y1 - y0) * 0.14;
    var pts = [
      pt(x0, my - (y1 - y0) * 0.18),
      pt(x0 + rx, y0 + ry * 0.35),
      pt(mx - (x1 - x0) * 0.08, y0),
      pt(mx + (x1 - x0) * 0.1, y0 + 3),
      pt(x1 - rx, y0 + ry * 0.4),
      pt(x1, my - (y1 - y0) * 0.12),
      pt(x1 - 4, my + (y1 - y0) * 0.1),
      pt(x1 - rx * 0.8, y1 - ry * 0.35),
      pt(mx + (x1 - x0) * 0.06, y1),
      pt(mx - (x1 - x0) * 0.12, y1 - 4),
      pt(x0 + rx, y1 - ry * 0.4),
      pt(x0, my + (y1 - y0) * 0.16),
    ];
    if (exitSide === "right") {
      pts.push(pt(x1 + pad * 0.55, my + 8));
    } else if (exitSide === "left") {
      pts.push(pt(x0 - pad * 0.45, my - 6));
    } else if (exitSide === "bottom") {
      pts.push(pt(mx + 10, y1 + pad * 0.55));
    }
    return pts;
  }

  function snakeTiles(tiles) {
    var pts = [];
    if (!tiles.length) return pts;
    // Read visual row order from layout positions.
    var items = tiles
      .map(function (node) {
        return { node: node, b: box(node) };
      })
      .filter(function (t) {
        return t.b && t.b.width > 0;
      });
    items.sort(function (a, b) {
      var dy = a.b.top - b.b.top;
      if (Math.abs(dy) > 40) return dy;
      return a.b.left - b.b.left;
    });
    // Group into rows by similar top.
    var rows = [];
    items.forEach(function (item) {
      var last = rows[rows.length - 1];
      if (!last || Math.abs(item.b.top - last[0].b.top) > 48) {
        rows.push([item]);
      } else {
        last.push(item);
      }
    });
    rows.forEach(function (row, ri) {
      row.sort(function (a, b) {
        return a.b.left - b.b.left;
      });
      if (ri % 2 === 1) row = row.slice().reverse();
      row.forEach(function (item, ii) {
        var b = item.b;
        // Small swirl into each tile center.
        if (ii === 0 && ri === 0) {
          pts.push(pt(b.left + b.width * 0.15, b.top - 10));
        }
        pts.push(pt(b.cx - b.width * 0.18, b.cy - b.height * 0.12));
        pts.push(pt(b.cx + b.width * 0.16, b.cy + b.height * 0.1));
        pts.push(pt(b.cx, b.cy + b.height * 0.28));
      });
    });
    return pts;
  }

  function pathThrough(points) {
    if (!points.length) return "";
    var d = "M" + points[0].x.toFixed(1) + "," + points[0].y.toFixed(1);
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1];
      var b = points[i];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len;
      var ny = dx / len;
      var amp = Math.min(22, len * 0.1);
      var j = Math.sin(i * 2.17 + a.x * 0.01) * amp;
      var j2 = Math.cos(i * 1.63 + a.y * 0.01) * amp * 0.65;
      var c1x = a.x + dx * 0.32 + nx * j;
      var c1y = a.y + dy * 0.32 + ny * j;
      var c2x = a.x + dx * 0.68 + nx * j2;
      var c2y = a.y + dy * 0.68 + ny * j2;
      d +=
        " C" +
        c1x.toFixed(1) +
        "," +
        c1y.toFixed(1) +
        " " +
        c2x.toFixed(1) +
        "," +
        c2y.toFixed(1) +
        " " +
        b.x.toFixed(1) +
        "," +
        b.y.toFixed(1);
    }
    return d;
  }

  function contentBounds() {
    // Measure real page content — never document.scrollHeight, which the
    // absolute SVG overlay can inflate and desync from scroll.
    var main = el("main");
    var footer = el(".site-footer");
    var thanksSlot = el('[data-trail="thanks"]');
    var bottom = 0;
    [main, footer, thanksSlot].forEach(function (node) {
      var b = box(node);
      if (b) bottom = Math.max(bottom, b.bottom);
    });
    var docW = document.documentElement.clientWidth || window.innerWidth;
    var docH = Math.max(bottom + 24, window.innerHeight);
    return { docW: docW, docH: docH };
  }

  function buildPoints() {
    var bounds = contentBounds();
    var docW = bounds.docW;
    var docH = bounds.docH;
    var lg = leftGutter(docW);
    var rg = rightGutter(docW);
    var narrow = window.matchMedia("(max-width: 768px)").matches;
    var pts = [];

    var what = box(el('[data-trail="what"]'));
    var photos = box(el('[data-trail="photos"]'));
    var video = box(el('[data-trail="video"]'));
    var howCta = box(el('[data-trail="how-cta"]'));
    var pricing = box(el('[data-trail="pricing"]'));
    var contact = box(el('[data-trail="contact"]'));
    var thanksSlot = box(el('[data-trail="thanks"]'));
    var tiles = Array.prototype.slice.call(
      document.querySelectorAll('[data-trail="tile"]')
    );

    // 1. Start at the very top, left.
    pts.push(pt(lg, 8));
    pts.push(pt(lg + 6, Math.min(docH * 0.12, what ? what.top - 40 : 200)));

    // 2. Circle the What-we-do statement.
    if (what) {
      pts = pts.concat(orbit(what, narrow ? 14 : 22, narrow ? "bottom" : "right"));
    }

    if (narrow) {
      // Simplified mobile: left → past demo → through tiles → thanks.
      if (video) {
        pts.push(pt(lg + 4, video.top));
        pts.push(pt(docW * 0.55, video.cy));
        pts.push(pt(lg + 8, video.bottom + 24));
      }
      if (howCta) {
        pts.push(pt(lg + 6, howCta.bottom + 20));
      }
      pts = pts.concat(snakeTiles(tiles));
      if (pricing) {
        pts.push(pt(rg - 8, pricing.cy));
      }
      if (contact) {
        pts.push(pt(rg - 10, contact.top + 40));
        pts.push(pt(rg - 8, contact.bottom - 20));
      }
    } else {
      // 3. Cross to right, down between photos and video.
      if (photos && video) {
        var midX = (photos.right + video.left) / 2;
        pts.push(pt(midX, Math.min(photos.top, video.top) - 12));
        pts.push(pt(midX + 8, (photos.cy + video.cy) / 2));
        pts.push(pt(midX - 4, video.top - 18));
      } else if (video) {
        pts.push(pt(rg - 10, video.top - 30));
      }

      // 4. One loop around the video.
      if (video) {
        pts = pts.concat(orbit(video, 18, "left"));
      }

      // 5. Back to left margin through How-it-works / CTA.
      if (howCta) {
        pts.push(pt(lg + 4, howCta.top - 30));
        pts.push(pt(lg + 10, howCta.cy));
        pts.push(pt(lg + 6, howCta.bottom + 36));
      } else if (video) {
        pts.push(pt(lg + 6, video.bottom + 80));
      }

      // 6. Center: swirl through gallery tiles.
      var galleryPts = snakeTiles(tiles);
      if (galleryPts.length) {
        pts.push(pt(docW * 0.5, galleryPts[0].y - 28));
        pts = pts.concat(galleryPts);
      }

      // 7. At pricing, shift left → right.
      if (pricing) {
        pts.push(pt(lg + 8, pricing.top - 24));
        pts.push(pt(pricing.cx, pricing.cy));
        pts.push(pt(rg - 12, pricing.bottom + 20));
      }

      // 8. Down the right side beside the left-aligned form.
      if (contact) {
        pts.push(pt(rg - 14, contact.top + 30));
        pts.push(pt(rg - 10, contact.cy));
        pts.push(pt(rg - 16, contact.bottom - 10));
      }
    }

    // 9. Center bottom → arrive just above the thank-you line (text draws next).
    var thanksY = thanksSlot
      ? thanksSlot.cy
      : contact
        ? contact.bottom + 72
        : docH - 80;
    pts.push(pt(docW * 0.62, thanksY - 36));
    pts.push(pt(docW * 0.5, thanksY - 18));

    return { points: pts, docW: docW, docH: docH, thanksY: thanksY };
  }

  function layout() {
    var built = buildPoints();
    var d = pathThrough(built.points);
    svg.setAttribute("viewBox", "0 0 " + built.docW + " " + built.docH);
    svg.setAttribute("width", String(built.docW));
    svg.setAttribute("height", String(built.docH));
    root.style.width = built.docW + "px";
    root.style.height = built.docH + "px";
    path.setAttribute("d", d);

    pathLength = path.getTotalLength();
    path.style.strokeDasharray = String(pathLength);

    if (thanksEl && thanksSrc) {
      var label = (thanksSrc.textContent || "").trim();
      thanksEl.textContent = label;
      thanksEl.setAttribute("x", String(built.docW * 0.5));
      thanksEl.setAttribute("y", String(built.thanksY));
      // Wait a frame so font metrics settle.
      thanksLength = thanksEl.getComputedTextLength
        ? thanksEl.getComputedTextLength()
        : label.length * 14;
      if (thanksLength < 1) thanksLength = label.length * 14;
      thanksEl.style.strokeDasharray = String(thanksLength);
    }

    draw();
  }

  function setPathReveal(p) {
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    path.style.strokeDashoffset = String(pathLength * (1 - p));
  }

  function setThanksReveal(p) {
    if (!thanksEl) return;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    thanksEl.style.strokeDashoffset = String(thanksLength * (1 - p));
    thanksEl.style.opacity = p > 0.02 ? "1" : "0";
  }

  function draw() {
    var maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    // Progress from scroll position (0 at top → 1 at bottom), not tip/docH,
    // so the overlay's own box cannot desync the reveal.
    var p = maxScroll > 0 ? window.scrollY / maxScroll : 1;
    if (p < 0) p = 0;
    if (p > 1) p = 1;

    if (reduceMotion) {
      setPathReveal(1);
      setThanksReveal(1);
      return;
    }

    var pathP = Math.min(1, p / PATH_SHARE);
    var thanksP = p <= PATH_SHARE ? 0 : (p - PATH_SHARE) / (1 - PATH_SHARE);
    setPathReveal(pathP);
    setThanksReveal(thanksP);
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
    layoutTimer = setTimeout(layout, 60);
  }

  if (reduceMotion) {
    layout();
    setPathReveal(1);
    setThanksReveal(1);
  } else {
    setPathReveal(0);
    setThanksReveal(0);
    layout();
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("load", function () {
    layout();
  });

  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(scheduleLayout);
    ro.observe(document.body);
  }

  // Late-loading images shift anchors — rebuild once they settle.
  Array.prototype.forEach.call(document.images, function (img) {
    if (!img.complete) {
      img.addEventListener("load", scheduleLayout, { once: true });
    }
  });
})();
