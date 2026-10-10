// Brush trail: one continuous hand-drawn stroke (from authored screenshots),
// obstacle-aware, variable-width ribbon, scroll-revealed. Thank-you handwriting
// is separate DOM, not part of the path.
(function () {
  var root = document.querySelector(".draw-trail");
  var svg = document.querySelector(".draw-trail__svg");
  var ribbon = document.querySelector(".draw-trail__ribbon");
  var guide = document.querySelector(".draw-trail__guide");
  var maskBg = document.querySelector(".draw-trail__mask-bg");
  var thanks = document.querySelector(".trail-thanks");
  if (!root || !svg || !ribbon || !guide) return;
  if (window.getComputedStyle(root).display === "none") return;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var guideLength = 0;
  var PATH_SHARE = 0.88;

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
    return Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453 % 1;
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
        // Extra clearance on interactive controls / media
        var extra =
          node.matches("img, video, .demo__frame, .gallery__item, .quote__submit, .how__cta, .hero__cta")
            ? pad * 0.65
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
    for (var dist = 4; dist <= 80; dist += 4) {
      for (var d = 0; d < dirs.length; d++) {
        var nx = x + dirs[d][0] * dist;
        var ny = y + dirs[d][1] * dist;
        if (!hits(obstacles, nx, ny)) return pt(nx, ny);
      }
    }
    return pt(x, y);
  }

  function orbitOutside(b, pad, startAngle, endAngle, steps) {
    // Angles in turns (0 = east, clockwise-ish from top via parametric oval)
    var pts = [];
    var rx = b.width / 2 + pad;
    var ry = b.height / 2 + pad;
    var n = steps || 28;
    for (var i = 0; i <= n; i++) {
      var t = startAngle + ((endAngle - startAngle) * i) / n;
      var ang = t * Math.PI * 2 - Math.PI / 2; // 0 = top
      pts.push(pt(b.cx + Math.cos(ang) * rx, b.cy + Math.sin(ang) * ry));
    }
    return pts;
  }

  function gapX(leftBox, rightBox) {
    if (!leftBox || !rightBox) return null;
    return (leftBox.right + rightBox.left) / 2;
  }

  function gapY(topBox, bottomBox) {
    if (!topBox || !bottomBox) return null;
    return (topBox.bottom + bottomBox.top) / 2;
  }

  function buildSpine(docW, docH, obstacles) {
    var narrow = window.matchMedia("(max-width: 768px)").matches;
    var lg = Math.max(16, Math.min(42, docW * 0.03));
    var rg = docW - lg;
    var pts = [];

    function add(x, y, prefer) {
      var p = pushFree(obstacles, x, y, prefer);
      // light organic pre-wobble so no dead-straight authoring
      var j = (noise(pts.length, 1.7) - 0.5) * 3.2;
      var j2 = (noise(pts.length, 4.1) - 0.5) * 2.4;
      pts.push(pt(p.x + j, p.y + j2));
    }

    function addMany(list) {
      list.forEach(function (p) {
        add(p.x, p.y);
      });
    }

    var what = box(el('[data-trail="what"]'));
    var photos = box(el('[data-trail="photos"]'));
    var video = box(el('[data-trail="video"]'));
    var howCta = box(el('[data-trail="how-cta"]'));
    var howLead = box(el(".how__lead"));
    var pricing = box(el('[data-trail="pricing"]'));
    var contact = box(el('[data-trail="contact"]'));
    var submit = box(el(".quote__submit"));
    var listing = box(el("#quote-listing"));
    var thanksB = box(thanks);
    var tiles = els('[data-trail="tile"]').map(box).filter(Boolean);
    var demoLead = box(el(".demo__lead"));

    // —— 1. Hero left gutter down into what ——
    add(lg, 6);
    var heroBottom = box(el(".hero"));
    var yWhat = what ? what.top - 36 : docH * 0.45;
    add(lg + 4, (heroBottom ? heroBottom.bottom * 0.55 : yWhat * 0.5));
    add(lg + 2, yWhat);

    // —— 2. Full loop around What-we-do (screenshot 1) ——
    if (what) {
      addMany(orbitOutside(what, narrow ? 20 : 28, 0.92, 0.92 + 1.05, 36));
    }

    // —— 3. Demo: under lead → between columns → orbit video → under photos (screenshot 2) ——
    if (demoLead) {
      add(lg + 8, demoLead.bottom + 18);
      add(docW * 0.45, demoLead.bottom + 22);
      add(docW * 0.72, demoLead.bottom + 16);
    }

    if (photos && video && !narrow) {
      var mid = gapX(photos, video);
      add(mid, Math.min(photos.top, video.top) - 10);
      add(mid + 3, (photos.cy + video.cy) / 2);
      add(mid - 2, video.bottom - video.height * 0.15);
      // Orbit video outside (clockwise from left)
      addMany(orbitOutside(video, 22, 0.75, 0.75 + 1.08, 34));
      // Under photos, exit down-left
      add(photos.cx, photos.bottom + 18);
      add(photos.left + 20, photos.bottom + 28);
      add(lg + 6, photos.bottom + 48);
    } else if (video) {
      add(lg + 6, video.top - 12);
      addMany(orbitOutside(video, 16, 0.85, 0.85 + 0.9, 24));
      add(lg + 8, video.bottom + 30);
    }

    // —— 4. How section left gutter, then horizontal above gallery (screenshot 3) ——
    if (howLead) {
      add(lg + 4, howLead.top - 8);
      add(lg + 6, howLead.bottom + 10);
    }
    if (howCta) {
      add(lg + 8, howCta.cy);
      add(lg + 6, howCta.bottom + 22);
    }

    var galTop = tiles.length ? Math.min.apply(null, tiles.map(function (t) { return t.top; })) : null;
    if (galTop != null) {
      add(lg + 10, galTop - 18);
      add(docW * 0.35, galTop - 14);
      add(docW * 0.62, galTop - 16);
      add(docW * 0.85, galTop - 12);
    }

    // —— 5. Gallery seams (screenshot 4): down between mid/right, left in mid row gap, down between left/mid ——
    if (tiles.length >= 6 && !narrow) {
      // sort into rows
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
        add(vx, r0[0].top - 8);
        add(vx + 2, r0[0].cy);
        if (rows[1] && rows[1].length >= 2) {
          var r1 = rows[1];
          var hy = gapY(r0[0], r1[0]);
          add(vx, hy);
          add(gapX(r1[0], r1[1]), hy + 2);
          var vx2 = gapX(r1[0], r1[1]);
          add(vx2 - 2, r1[0].cy);
          add(vx2, r1[0].bottom + 16);
        } else {
          add(vx, r0[0].bottom + 20);
        }
      }
      // Sweep down-left toward pricing
      var galBottom = Math.max.apply(null, tiles.map(function (t) { return t.bottom; }));
      add(docW * 0.28, galBottom + 28);
      add(lg + 20, galBottom + 50);
    } else if (tiles.length) {
      tiles.forEach(function (t, i) {
        if (i === 0) add(lg + 8, t.top - 10);
        add(lg + 6, t.bottom + 8);
      });
    }

    // —— 6. Orbit pricing, cross right, S-curve down form right (screenshot 5) ——
    if (pricing) {
      add(pricing.left - 18, pricing.top + 8);
      addMany(orbitOutside(pricing, narrow ? 18 : 26, 0.85, 0.85 + 1.05, 32));
      add(pricing.right + 30, pricing.bottom + 8);
      add(docW * 0.55, pricing.bottom + 36);
      add(rg - 18, pricing.bottom + 48);
    }

    if (contact) {
      add(rg - 14, contact.top + 40);
      add(rg - 22, contact.cy);
      add(rg - 16, contact.bottom - 80);
    }

    // —— 7. Stay in the right gutter, pass under the submit, then into thanks ——
    // (never through the button — densified chords would otherwise clip it)
    if (submit) {
      add(rg - 18, submit.top - 24);
      add(rg - 14, submit.cy);
      add(rg - 16, submit.bottom + 22);
      add(submit.right + 20, submit.bottom + 28);
      add(submit.cx, submit.bottom + 38);
      add(Math.max(lg + 24, submit.left - 12), submit.bottom + 44);
    } else if (listing) {
      add(rg - 18, listing.bottom + 20);
    }

    if (thanksB) {
      add(thanksB.left + 48, thanksB.top - 10);
      add(thanksB.left + 28, thanksB.top + 4);
    } else {
      add(docW * 0.35, docH - 100);
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
        // Catmull-Rom-ish with neighbors when available
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
      out.push(pt(p.x + nx * n1 * a + nx * n2 * a * 0.35, p.y + ny * n1 * a + ny * n2 * a * 0.35));
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
        var bump = (noise(i, 3.3) - 0.5) * 5;
        mid.x += (-dy / len) * bump;
        mid.y += (dx / len) * bump;
        out.push(mid);
      }
      out.push(b);
    }
    return out;
  }

  function projectChain(points, obstacles) {
    return points.map(function (p, i) {
      return pushFree(obstacles, p.x, p.y);
    });
  }

  function ribbonPath(points, halfMin, halfMax) {
    if (points.length < 2) return "";
    var left = [];
    var right = [];
    var total = 0;
    var seg = [0];
    for (var i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      seg.push(total);
    }
    if (total < 1) total = 1;

    for (var i = 0; i < points.length; i++) {
      var prev = points[Math.max(0, i - 1)];
      var next = points[Math.min(points.length - 1, i + 1)];
      var dx = next.x - prev.x;
      var dy = next.y - prev.y;
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len;
      var ny = dx / len;
      var s = seg[i] / total;
      // Pressure envelope + local brush pulse
      var pressure =
        0.55 +
        0.45 * Math.sin(s * Math.PI) * (0.7 + 0.3 * Math.sin(s * 18.0)) +
        0.2 * Math.sin(s * 41.0 + 1.2);
      var half = lerp(halfMin, halfMax, Math.max(0, Math.min(1, pressure)));
      half *= 0.75 + 0.5 * noise(i, 6.6);
      left.push(pt(points[i].x + nx * half, points[i].y + ny * half));
      right.push(pt(points[i].x - nx * half, points[i].y - ny * half));
    }

    function poly(arr, start) {
      var d = start + arr[0].x.toFixed(2) + "," + arr[0].y.toFixed(2);
      for (var i = 1; i < arr.length; i++) {
        d += " L" + arr[i].x.toFixed(2) + "," + arr[i].y.toFixed(2);
      }
      return d;
    }
    var d = poly(left, "M");
    for (var r = right.length - 1; r >= 0; r--) {
      d += " L" + right[r].x.toFixed(2) + "," + right[r].y.toFixed(2);
    }
    return d + " Z";
  }

  function centerlinePath(points) {
    if (!points.length) return "";
    var d = "M" + points[0].x.toFixed(2) + "," + points[0].y.toFixed(2);
    for (var i = 1; i < points.length; i++) {
      d += " L" + points[i].x.toFixed(2) + "," + points[i].y.toFixed(2);
    }
    return d;
  }

  function layout() {
    var bounds = contentBounds();
    var docW = bounds.docW;
    var docH = bounds.docH;
    var pad = window.matchMedia("(max-width: 768px)").matches ? 10 : 14;
    var obstacles = collectObstacles(pad);

    var spine = buildSpine(docW, docH, obstacles);
    spine = densify(spine, 10);
    spine = wobble(spine, 2.4);
    spine = breakStraights(spine, 18);
    spine = densify(spine, 8);
    spine = wobble(spine, 1.1);
    spine = projectChain(spine, obstacles);

    svg.setAttribute("viewBox", "0 0 " + docW + " " + docH);
    svg.setAttribute("width", String(docW));
    svg.setAttribute("height", String(docH));
    root.style.width = docW + "px";
    root.style.height = docH + "px";
    if (maskBg) {
      maskBg.setAttribute("width", String(docW));
      maskBg.setAttribute("height", String(docH));
    }

    var narrow = window.matchMedia("(max-width: 768px)").matches;
    ribbon.setAttribute("d", ribbonPath(spine, narrow ? 0.4 : 0.55, narrow ? 1.85 : 2.55));
    guide.setAttribute("d", centerlinePath(spine));
    guide.style.strokeWidth = String(narrow ? 7 : 10);

    guideLength = guide.getTotalLength();
    guide.style.strokeDasharray = String(guideLength);

    draw();
  }

  function setReveal(p) {
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    guide.style.strokeDashoffset = String(guideLength * (1 - p));
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
