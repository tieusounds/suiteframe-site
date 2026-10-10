// Suiteframe scroll line — handoff geometry mapped by shape, not bbox-stretch.
// Source: src/trail/suiteframe-line-coordinates.json (CURSOR-HANDOFF.md).
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
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
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

  // Stretch into a thin empty lane (left gutter / vertical gutter). Independent axes OK here.
  function mapGutterRibbon(srcPoints, lane) {
    if (!srcPoints.length || !lane) return [];
    var ref = bboxOf(srcPoints);
    var out = [];
    for (var i = 0; i < srcPoints.length; i++) {
      var nx = (srcPoints[i][0] - ref.left) / ref.width;
      var ny = (srcPoints[i][1] - ref.top) / ref.height;
      out.push({
        x: lane.left + nx * lane.width,
        y: lane.top + ny * lane.height,
      });
    }
    return out;
  }

  // Closed oval/lasso: uniform scale, centered on anchor, inflated until every point
  // clears the padded anchor box (AABB fit alone is not enough for organic loops).
  function fitGroupLoop(srcPoints, anchor, marginPx) {
    if (!srcPoints.length || !anchor) return [];
    var ref = bboxOf(srcPoints);
    var pad = marginPx == null ? 28 : marginPx;
    var clear = {
      left: anchor.left - pad,
      top: anchor.top - pad,
      right: anchor.right + pad,
      bottom: anchor.bottom + pad,
    };
    var needW = clear.right - clear.left;
    var needH = clear.bottom - clear.top;
    var scale = Math.max(needW / ref.width, needH / ref.height);

    function pointInside(x, y, box) {
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    }

    function anyInside(s) {
      for (var i = 0; i < srcPoints.length; i++) {
        var x = anchor.cx + (srcPoints[i][0] - ref.cx) * s;
        var y = anchor.cy + (srcPoints[i][1] - ref.cy) * s;
        if (pointInside(x, y, clear)) return true;
      }
      return false;
    }

    var guard = 0;
    while (anyInside(scale) && guard < 40) {
      scale *= 1.06;
      guard++;
    }

    var out = [];
    for (var j = 0; j < srcPoints.length; j++) {
      out.push({
        x: anchor.cx + (srcPoints[j][0] - ref.cx) * scale,
        y: anchor.cy + (srcPoints[j][1] - ref.cy) * scale,
      });
    }
    return out;
  }

  // Open transit: similarity transform pinning ends to live from/to points.
  function mapAcrossGutter(srcPoints, fromPt, toPt) {
    if (!srcPoints.length || !fromPt || !toPt) return [];
    if (srcPoints.length === 1) {
      return [{ x: fromPt.x, y: fromPt.y }];
    }
    var sx = srcPoints[0][0];
    var sy = srcPoints[0][1];
    var ex = srcPoints[srcPoints.length - 1][0];
    var ey = srcPoints[srcPoints.length - 1][1];
    var rdx = ex - sx;
    var rdy = ey - sy;
    var rlen = Math.hypot(rdx, rdy) || 1;
    var ldx = toPt.x - fromPt.x;
    var ldy = toPt.y - fromPt.y;
    var llen = Math.hypot(ldx, ldy) || 1;
    var scale = llen / rlen;
    var ang = Math.atan2(ldy, ldx) - Math.atan2(rdy, rdx);
    var cos = Math.cos(ang);
    var sin = Math.sin(ang);
    var out = [];
    for (var i = 0; i < srcPoints.length; i++) {
      var rx = srcPoints[i][0] - sx;
      var ry = srcPoints[i][1] - sy;
      out.push({
        x: fromPt.x + (rx * cos - ry * sin) * scale,
        y: fromPt.y + (rx * sin + ry * cos) * scale,
      });
    }
    return out;
  }

  function sortTilesIntoRows(tiles) {
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
    return rows;
  }

  // Build a live gutter polyline from tile boxes, then reproject ref points by arc-length.
  function routeGalleryGutters(srcPoints, tiles) {
    if (!srcPoints.length) return [];
    if (!tiles || tiles.length < 2) {
      // Fallback: thin left-to-right ribbon under whatever we have
      var u = tiles && tiles[0];
      if (!u) return [];
      return mapGutterRibbon(srcPoints, {
        left: u.left - 20,
        top: u.top - 20,
        width: Math.max(40, u.width + 40),
        height: Math.max(40, u.height + 40),
      });
    }

    var rows = sortTilesIntoRows(tiles);
    var poly = [];

    if (rows.length >= 2 && rows[0].length >= 3 && rows[1].length >= 2) {
      // Desktop 3-col: down col2|col3, across row gutter, down col1|col2
      var r0 = rows[0];
      var r1 = rows[1];
      var vxRight = (r0[1].right + r0[2].left) / 2;
      var hy = (r0[0].bottom + r1[0].top) / 2;
      var vxLeft = (r1[0].right + r1[1].left) / 2;
      var yTop = Math.min(r0[0].top, r0[1].top, r0[2].top) - 8;
      var yBot = Math.max(r1[0].bottom, r1[1].bottom) + 8;
      poly = [
        { x: vxRight, y: yTop },
        { x: vxRight, y: hy },
        { x: vxLeft, y: hy },
        { x: vxLeft, y: yBot },
      ];
    } else if (rows.length >= 2 && rows[0].length >= 2) {
      // 2-col: down right gutter of first gap, across, down
      var a0 = rows[0];
      var a1 = rows[1];
      var vx = (a0[0].right + a0[1].left) / 2;
      var hy2 = (a0[0].bottom + a1[0].top) / 2;
      var vx2 =
        a1.length >= 2 ? (a1[0].right + a1[1].left) / 2 : a1[0].left - 12;
      poly = [
        { x: vx, y: a0[0].top - 8 },
        { x: vx, y: hy2 },
        { x: vx2, y: hy2 },
        { x: vx2, y: a1[0].bottom + 8 },
      ];
    } else {
      // Stacked: weave left of each tile
      var gutter = 14;
      rows.forEach(function (row) {
        row.forEach(function (t) {
          poly.push({ x: t.left - gutter, y: t.top - 6 });
          poly.push({ x: t.left - gutter, y: t.bottom + 6 });
        });
      });
    }

    if (poly.length < 2) return [];

    // Arc-length parametrize live poly
    var seg = [0];
    var total = 0;
    for (var i = 1; i < poly.length; i++) {
      total += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
      seg.push(total);
    }
    if (total < 1) total = 1;

    function atFrac(f) {
      var d = Math.min(1, Math.max(0, f)) * total;
      for (var j = 1; j < seg.length; j++) {
        if (d <= seg[j] || j === seg.length - 1) {
          var t = (d - seg[j - 1]) / Math.max(1e-6, seg[j] - seg[j - 1]);
          return {
            x: poly[j - 1].x + (poly[j].x - poly[j - 1].x) * t,
            y: poly[j - 1].y + (poly[j].y - poly[j - 1].y) * t,
          };
        }
      }
      return { x: poly[poly.length - 1].x, y: poly[poly.length - 1].y };
    }

    // Arc-length of reference points
    var rseg = [0];
    var rtot = 0;
    for (var k = 1; k < srcPoints.length; k++) {
      rtot += Math.hypot(
        srcPoints[k][0] - srcPoints[k - 1][0],
        srcPoints[k][1] - srcPoints[k - 1][1]
      );
      rseg.push(rtot);
    }
    if (rtot < 1) rtot = 1;

    var out = [];
    for (var p = 0; p < srcPoints.length; p++) {
      out.push(atFrac(rseg[p] / rtot));
    }
    return out;
  }

  // Short seam blend only — chunks should already nearly meet.
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
      var blend = Math.max(2, Math.min(8, Math.floor(chunk.length * 0.04)));
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

  function clampMapped(points, docW, docH) {
    var minX = 2;
    var maxX = Math.max(minX + 8, docW - 2);
    var maxY = Math.max(docH, 1);
    for (var i = 0; i < points.length; i++) {
      if (points[i].x < minX) points[i].x = minX;
      if (points[i].x > maxX) points[i].x = maxX;
      if (points[i].y < 0) points[i].y = 0;
      if (points[i].y > maxY) points[i].y = maxY;
    }
    return points;
  }

  // Nudge path centerline out of a rect toward the nearest edge (narrow stacked grazes).
  function excludeRect(points, rect, pad) {
    if (!rect || !points.length) return;
    var box = {
      left: rect.left + pad,
      top: rect.top + pad,
      right: rect.right - pad,
      bottom: rect.bottom - pad,
    };
    if (box.right <= box.left || box.bottom <= box.top) return;
    for (var i = 0; i < points.length; i++) {
      var x = points[i].x;
      var y = points[i].y;
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
      var dl = x - box.left;
      var dr = box.right - x;
      var dt = y - box.top;
      var db = box.bottom - y;
      var m = Math.min(dl, dr, dt, db);
      if (m === dl) points[i].x = box.left - pad;
      else if (m === dr) points[i].x = box.right + pad;
      else if (m === dt) points[i].y = box.top - pad;
      else points[i].y = box.bottom + pad;
    }
  }

  function liveContext(narrow) {
    var docW = document.documentElement.clientWidth || window.innerWidth;
    var gutter = Math.max(14, Math.min(36, docW * 0.028));
    var hero = box(el(".hero"));
    var what = box(el('[data-trail="what"]'));
    var photos = box(el('[data-trail="photos"]')) || box(el(".demo__thumbs"));
    var video = box(el('[data-trail="video"]')) || box(el(".demo__frame"));
    var demoGrid = box(el(".demo__grid"));
    var how = box(el(".how"));
    var howCta = box(el('[data-trail="how-cta"]'));
    var howCloser = box(el(".how__closer"));
    var gallery = box(el('[data-trail="gallery"]')) || box(el(".gallery"));
    var tiles = els('[data-trail="tile"]').map(box).filter(Boolean);
    var pricing = box(el('[data-trail="pricing"]'));
    var contact = box(el('[data-trail="contact"]')) || box(el(".contact"));
    var quote = box(el(".quote")) || box(el("#quote-form"));
    var thanksB = box(thanks);

    var pageBottom = Math.max(
      document.documentElement.scrollHeight,
      thanksB ? thanksB.bottom + 24 : 0,
      contact ? contact.bottom + 24 : 0
    );

    // Keep the left ribbon strictly left of content (what/photos/gallery/pricing all ~51px).
    var contentLeft = Math.min.apply(
      null,
      [what, photos, video, pricing, gallery, quote]
        .filter(Boolean)
        .map(function (b) {
          return b.left;
        })
        .concat([docW * 0.04])
    );
    var leftRight = Math.max(18, Math.min(contentLeft - 10, gutter + 4));
    var leftLane = {
      left: Math.max(4, Math.min(10, leftRight - 22)),
      top: 0,
      width: Math.max(16, leftRight - Math.max(4, Math.min(10, leftRight - 22))),
      height: pageBottom,
      right: leftRight,
      bottom: pageBottom,
      cx: 0,
      cy: pageBottom / 2,
    };
    leftLane.cx = leftLane.left + leftLane.width / 2;

    // Right gutter beside the quote form (contact tail stays off fields).
    // On narrow, fields are nearly full-bleed — prefer a thin right strip, else left lane.
    var rightLane = null;
    if (quote) {
      var rlLeft = quote.right + (narrow ? 6 : 18);
      if (rlLeft > docW - 14) {
        rightLane = {
          left: leftLane.left,
          top: quote.bottom + 12,
          width: leftLane.width,
          height: Math.max(60, (thanksB ? thanksB.bottom + 12 : pageBottom - 20) - (quote.bottom + 12)),
          right: leftLane.right,
          bottom: 0,
          cx: leftLane.cx,
          cy: 0,
        };
        rightLane.bottom = rightLane.top + rightLane.height;
        rightLane.cy = rightLane.top + rightLane.height / 2;
      } else {
        rightLane = {
          left: rlLeft,
          top: contact ? contact.top - 10 : quote.top - 40,
          width: Math.max(12, docW - rlLeft - 6),
          height: Math.max(
            80,
            (thanksB ? thanksB.bottom + 20 : pageBottom - 40) -
              (contact ? contact.top - 10 : quote.top - 40)
          ),
        };
        rightLane.right = rightLane.left + rightLane.width;
        rightLane.bottom = rightLane.top + rightLane.height;
        rightLane.cx = rightLane.left + rightLane.width / 2;
        rightLane.cy = rightLane.top + rightLane.height / 2;
      }
    }

    // Vertical gutter between photos and video (desktop). On stacked/narrow, stay in the left lane.
    var vGutter = null;
    if (photos && video && !narrow && video.left > photos.right + 8) {
      var mid = (photos.right + video.left) / 2;
      var top = Math.min(photos.top, video.top) - 12;
      var bot = Math.max(photos.bottom, video.bottom) + 12;
      vGutter = {
        left: mid - 10,
        top: top,
        width: 20,
        height: Math.max(40, bot - top),
        right: mid + 10,
        bottom: bot,
        cx: mid,
        cy: (top + bot) / 2,
      };
    } else if (video) {
      vGutter = {
        left: leftLane.left,
        top: video.top - 8,
        width: leftLane.width,
        height: video.height + 16,
        right: leftLane.right,
        bottom: video.bottom + 8,
        cx: leftLane.cx,
        cy: video.cy,
      };
    }

    var heroLane = {
      left: leftLane.left,
      top: hero ? Math.max(0, hero.top) : 0,
      width: leftLane.width,
      height: hero
        ? Math.max(80, (what ? what.top - 24 : hero.bottom) - Math.max(0, hero.top))
        : window.innerHeight,
    };
    heroLane.right = heroLane.left + heroLane.width;
    heroLane.bottom = heroLane.top + heroLane.height;
    heroLane.cx = heroLane.left + heroLane.width / 2;
    heroLane.cy = heroLane.top + heroLane.height / 2;

    return {
      docW: docW,
      pageBottom: pageBottom,
      gutter: gutter,
      narrow: narrow,
      leftLane: leftLane,
      rightLane: rightLane,
      heroLane: heroLane,
      vGutter: vGutter,
      what: what,
      photos: photos,
      video: video,
      demoGrid: demoGrid,
      how: how,
      howCta: howCta,
      howCloser: howCloser,
      gallery: gallery,
      tiles: tiles,
      pricing: pricing,
      contact: contact,
      quote: quote,
      thanks: thanksB,
      anchors: {
        hero: hero,
        what: what,
        photos: photos,
        video: video,
        how: how,
        gallery: gallery,
        pricing: pricing,
        contact: contact,
        thanks: thanksB,
      },
    };
  }

  // Shape-matched sub-chunks. Indices refined against the handoff page-shot.
  var REGION_DEFS = [
    { id: "hero-gutter", i0: 0, i1: 89, map: "ribbon", lane: "heroLane" },
    { id: "what-oval", i0: 90, i1: 202, map: "loop", target: "what", margin: 44 },
    { id: "what-exit", i0: 203, i1: 248, map: "ribbon", lane: "leftLane" },
    { id: "demo-lead", i0: 249, i1: 278, map: "ribbon", lane: "leftLane" },
    {
      id: "demo-top-transit",
      i0: 279,
      i1: 323,
      map: "transit",
      from: "demoTopFrom",
      to: "demoTopTo",
    },
    { id: "demo-video-loop", i0: 324, i1: 500, map: "loop", target: "video", margin: 28 },
    {
      id: "demo-return-transit",
      i0: 501,
      i1: 527,
      map: "transit",
      from: "demoReturnFrom",
      to: "demoReturnTo",
    },
    { id: "demo-vgutter", i0: 528, i1: 560, map: "ribbon", lane: "vGutter" },
    {
      id: "demo-bottom-transit",
      i0: 561,
      i1: 598,
      map: "transit",
      from: "demoBotFrom",
      to: "demoBotTo",
    },
    { id: "demo-exit", i0: 599, i1: 610, map: "ribbon", lane: "leftLane" },
    { id: "how-ribbon", i0: 611, i1: 710, map: "ribbon", lane: "leftLane" },
    {
      id: "how-sweep",
      i0: 711,
      i1: 804,
      map: "transit",
      from: "howSweepFrom",
      to: "howSweepTo",
    },
    { id: "gallery-gutters", i0: 805, i1: 920, map: "gallery" },
    {
      id: "gallery-exit",
      i0: 921,
      i1: 979,
      map: "transit",
      from: "galleryExitFrom",
      to: "galleryExitTo",
    },
    { id: "pricing-oval", i0: 980, i1: 1090, map: "loop", target: "pricing", margin: 32 },
    {
      id: "pricing-sweep",
      i0: 1091,
      i1: 1239,
      map: "transit",
      from: "priceSweepFrom",
      to: "priceSweepTo",
    },
    { id: "contact-tail", i0: 1240, i1: 1358, map: "ribbon", lane: "rightLane" },
  ];

  function resolvePoint(ctx, key) {
    var video = ctx.video;
    var photos = ctx.photos;
    var grid = ctx.demoGrid;
    var lane = ctx.leftLane;
    var vg = ctx.vGutter;
    var howCta = ctx.howCta;
    var howCloser = ctx.howCloser;
    var tiles = ctx.tiles;
    var pricing = ctx.pricing;
    var contact = ctx.contact;
    var quote = ctx.quote;
    var thanksB = ctx.thanks;

    function galleryEntry() {
      if (!tiles.length) {
        return { x: ctx.docW * 0.55, y: ctx.gallery ? ctx.gallery.top - 18 : lane.cy };
      }
      var rows = sortTilesIntoRows(tiles);
      var r0 = rows[0];
      var top = Math.min.apply(
        null,
        r0.map(function (t) {
          return t.top;
        })
      );
      if (r0.length >= 3) {
        return { x: (r0[1].right + r0[2].left) / 2, y: top - 14 };
      }
      if (r0.length >= 2) {
        return { x: (r0[0].right + r0[1].left) / 2, y: top - 14 };
      }
      return { x: r0[0].left - 14, y: top - 14 };
    }

    function galleryExit() {
      if (!tiles.length) {
        return { x: lane.cx, y: ctx.gallery ? ctx.gallery.bottom + 12 : lane.cy };
      }
      var rows = sortTilesIntoRows(tiles);
      var last = rows[rows.length - 1];
      var bot = Math.max.apply(
        null,
        last.map(function (t) {
          return t.bottom;
        })
      );
      if (last.length >= 2) {
        return { x: (last[0].right + last[1].left) / 2, y: bot + 14 };
      }
      return { x: last[0].left - 14, y: bot + 14 };
    }

    switch (key) {
      case "demoTopFrom":
        return {
          x: lane.cx,
          y: photos ? photos.top - 18 : video ? video.top - 18 : lane.top + 200,
        };
      case "demoTopTo":
        return video
          ? { x: video.left - 8, y: video.top - 22 }
          : { x: lane.cx + 40, y: lane.top + 400 };
      case "demoReturnFrom":
        return video
          ? { x: video.left + video.width * 0.35, y: video.top - 22 }
          : { x: lane.cx + 80, y: lane.cy };
      case "demoReturnTo":
        return vg
          ? { x: vg.cx, y: video ? video.top - 8 : vg.top }
          : { x: lane.cx + 60, y: video ? video.top : lane.cy };
      case "demoBotFrom":
        return vg
          ? { x: vg.cx, y: grid ? grid.bottom + 16 : vg.bottom }
          : { x: lane.cx + 80, y: grid ? grid.bottom + 16 : 0 };
      case "demoBotTo":
        return {
          x: lane.cx,
          y: grid ? grid.bottom + 28 : lane.cy,
        };
      case "howSweepFrom":
        if (howCta) return { x: Math.max(lane.cx, howCta.left - 8), y: howCta.bottom + 18 };
        if (howCloser) return { x: lane.cx, y: howCloser.bottom + 18 };
        return { x: lane.cx, y: ctx.how ? ctx.how.bottom - 20 : lane.cy };
      case "howSweepTo":
        return galleryEntry();
      case "galleryExitFrom":
        return galleryExit();
      case "galleryExitTo":
        return pricing
          ? { x: pricing.left - 16, y: pricing.top - 24 }
          : { x: lane.cx, y: lane.cy };
      case "priceSweepFrom":
        // Oval exits on the left; pin the sweep there so stitch cannot drag it through the copy.
        return pricing
          ? { x: Math.max(lane.cx, pricing.left - 14), y: pricing.bottom + 22 }
          : { x: lane.cx, y: lane.cy };
      case "priceSweepTo":
        if (ctx.rightLane) {
          return { x: ctx.rightLane.cx, y: Math.max(ctx.rightLane.top + 12, pricing ? pricing.bottom + 80 : 0) };
        }
        if (quote) return { x: quote.right + 24, y: quote.top - 10 };
        return { x: ctx.docW - 40, y: contact ? contact.top + 40 : lane.cy };
      default:
        return null;
    }
  }

  function mapChunk(def, srcPoints, ctx) {
    if (def.map === "ribbon") {
      var lane = ctx[def.lane] || ctx.leftLane;
      if (def.lane === "vGutter" && !ctx.vGutter) lane = ctx.leftLane;
      if (def.lane === "rightLane" && !ctx.rightLane) {
        lane = {
          left: ctx.docW - 36,
          top: ctx.contact ? ctx.contact.top : 0,
          width: 28,
          height: Math.max(120, ctx.pageBottom - (ctx.contact ? ctx.contact.top : 0)),
        };
        lane.right = lane.left + lane.width;
        lane.bottom = lane.top + lane.height;
        lane.cx = lane.left + lane.width / 2;
        lane.cy = lane.top + lane.height / 2;
      }
      if (def.id === "hero-gutter") lane = ctx.heroLane;

      // Never stretch a short ribbon across the full page — slice left/right lanes to content.
      var topHint = null;
      var botHint = null;
      if (def.id === "what-exit" && ctx.what) {
        topHint = ctx.what.bottom - 20;
        botHint = ctx.photos ? ctx.photos.top - 40 : topHint + 200;
      } else if (def.id === "demo-lead") {
        topHint = ctx.photos ? ctx.photos.top - 80 : ctx.what ? ctx.what.bottom + 40 : 0;
        botHint = ctx.photos ? ctx.photos.top - 10 : topHint + 160;
      } else if (def.id === "demo-exit") {
        topHint = ctx.demoGrid ? ctx.demoGrid.bottom + 10 : 0;
        botHint = ctx.how ? ctx.how.top + 40 : topHint + 120;
      } else if (def.id === "how-ribbon") {
        topHint = ctx.how ? ctx.how.top - 10 : 0;
        botHint = ctx.howCta
          ? ctx.howCta.bottom + 10
          : ctx.how
            ? ctx.how.bottom
            : topHint + 400;
      } else if (def.id === "contact-tail") {
        topHint = ctx.rightLane
          ? ctx.rightLane.top
          : ctx.quote
            ? ctx.quote.top - 20
            : ctx.contact
              ? ctx.contact.top
              : 0;
        botHint = ctx.thanks
          ? ctx.thanks.bottom + 12
          : ctx.pageBottom - 20;
      }
      if (
        topHint != null &&
        botHint != null &&
        botHint > topHint &&
        (def.lane === "leftLane" || def.lane === "rightLane" || !def.lane)
      ) {
        var base = def.lane === "rightLane" && ctx.rightLane ? ctx.rightLane : ctx.leftLane;
        lane = {
          left: base.left,
          top: topHint,
          width: base.width,
          height: botHint - topHint,
          right: base.right,
          bottom: botHint,
          cx: base.cx,
          cy: (topHint + botHint) / 2,
        };
      }
      if (def.id === "demo-vgutter" && ctx.vGutter) {
        lane = ctx.vGutter;
      }
      return mapGutterRibbon(srcPoints, lane);
    }

    if (def.map === "loop") {
      var anchor = ctx[def.target];
      if (!anchor) return mapGutterRibbon(srcPoints, ctx.leftLane);
      var loopMargin = def.margin;
      if (def.id === "demo-video-loop" && ctx.narrow) loopMargin = Math.max(loopMargin, 18);
      var loopPts = fitGroupLoop(srcPoints, anchor, loopMargin);
      // Desktop only: keep the video lasso out of the side-by-side photo grid.
      if (
        def.id === "demo-video-loop" &&
        ctx.photos &&
        ctx.video &&
        !ctx.narrow &&
        ctx.video.left > ctx.photos.right + 8
      ) {
        var minLoopX = ctx.photos.right + 10;
        for (var li = 0; li < loopPts.length; li++) {
          if (loopPts[li].x < minLoopX) loopPts[li].x = minLoopX;
        }
      }
      // Hard-exclude mapped loop points from the live anchor (stroke centerline clearance).
      if (anchor && loopPts.length) {
        var clearPad = Math.max(6, (loopMargin || 24) * 0.35);
        var inner = {
          left: anchor.left + clearPad,
          top: anchor.top + clearPad,
          right: anchor.right - clearPad,
          bottom: anchor.bottom - clearPad,
        };
        for (var lj = 0; lj < loopPts.length; lj++) {
          var px = loopPts[lj].x;
          var py = loopPts[lj].y;
          if (px >= inner.left && px <= inner.right && py >= inner.top && py <= inner.bottom) {
            var dl = px - inner.left;
            var dr = inner.right - px;
            var dt = py - inner.top;
            var db = inner.bottom - py;
            var m = Math.min(dl, dr, dt, db);
            if (m === dl) loopPts[lj].x = inner.left - clearPad;
            else if (m === dr) loopPts[lj].x = inner.right + clearPad;
            else if (m === dt) loopPts[lj].y = inner.top - clearPad;
            else loopPts[lj].y = inner.bottom + clearPad;
          }
        }
      }
      return loopPts;
    }

    if (def.map === "transit") {
      // Narrow: keep pricing→contact travel in the left lane so the sweep cannot cross the form.
      if (ctx.narrow && def.id === "pricing-sweep") {
        var psTop = ctx.pricing ? ctx.pricing.bottom + 10 : 0;
        var psBot = ctx.quote ? ctx.quote.top - 12 : psTop + 160;
        return mapGutterRibbon(srcPoints, {
          left: ctx.leftLane.left,
          top: psTop,
          width: ctx.leftLane.width,
          height: Math.max(40, psBot - psTop),
          right: ctx.leftLane.right,
          bottom: psBot,
          cx: ctx.leftLane.cx,
          cy: (psTop + psBot) / 2,
        });
      }
      var fromPt = resolvePoint(ctx, def.from);
      var toPt = resolvePoint(ctx, def.to);
      if (!fromPt || !toPt) return mapGutterRibbon(srcPoints, ctx.leftLane);
      return mapAcrossGutter(srcPoints, fromPt, toPt);
    }

    if (def.map === "gallery") {
      return routeGalleryGutters(srcPoints, ctx.tiles);
    }

    return [];
  }

  function buildMapped(points, ctx) {
    var chunks = [];
    var meta = [];
    for (var r = 0; r < REGION_DEFS.length; r++) {
      var def = REGION_DEFS[r];
      var slice = points.slice(def.i0, Math.min(def.i1 + 1, points.length));
      if (!slice.length) continue;
      var mappedChunk = mapChunk(def, slice, ctx);
      chunks.push(mappedChunk);
      meta.push({
        id: def.id,
        i0: def.i0,
        i1: def.i1,
        map: def.map,
        live: null,
        startIndex: 0,
        endIndex: 0,
      });
    }
    var joined = stitch(chunks);
    // Final centerline clearance — loops/ribbons should already be outside; this catches grazes.
    if (ctx.what) excludeRect(joined, ctx.what, 3);
    if (ctx.pricing) excludeRect(joined, ctx.pricing, 3);
    if (ctx.photos) excludeRect(joined, ctx.photos, 3);
    if (ctx.video) excludeRect(joined, ctx.video, 3);
    if (ctx.quote) excludeRect(joined, ctx.quote, 3);
    if (ctx.tiles && ctx.tiles.length) {
      for (var ti = 0; ti < ctx.tiles.length; ti++) excludeRect(joined, ctx.tiles[ti], 2);
    }
    joined = clampMapped(joined, ctx.docW, ctx.pageBottom);
    var cursor = 0;
    for (var m = 0; m < meta.length; m++) {
      var n = chunks[m].length;
      meta[m].startIndex = cursor;
      meta[m].endIndex = cursor + Math.max(0, n - 1);
      if (n) {
        var xs = chunks[m].map(function (p) {
          return p.x;
        });
        var ys = chunks[m].map(function (p) {
          return p.y;
        });
        meta[m].live = {
          left: Math.min.apply(null, xs),
          top: Math.min.apply(null, ys),
          right: Math.max.apply(null, xs),
          bottom: Math.max.apply(null, ys),
          width: 0,
          height: 0,
        };
        meta[m].live.width = meta[m].live.right - meta[m].live.left;
        meta[m].live.height = meta[m].live.bottom - meta[m].live.top;
      }
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

  function paintDebug(ctx) {
    if (!debug || !debugLayer) return;
    while (debugLayer.firstChild) debugLayer.removeChild(debugLayer.firstChild);
    Object.keys(ctx.anchors).forEach(function (key) {
      var b = ctx.anchors[key];
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
    if (ctx.vGutter) {
      var vg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      vg.setAttribute("x", String(ctx.vGutter.left));
      vg.setAttribute("y", String(ctx.vGutter.top));
      vg.setAttribute("width", String(ctx.vGutter.width));
      vg.setAttribute("height", String(ctx.vGutter.height));
      vg.setAttribute("class", "draw-trail__debug-region");
      debugLayer.appendChild(vg);
    }
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
    var globalT = Math.min(1, window.scrollY / (maxScroll * 0.88));
    if (globalT >= 0.98) return 1;

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
    var ctx = liveContext(narrow);
    var built = buildMapped(coords.points, ctx);
    mapped = built.points;
    regions = built.regions;

    var measured = measureRegions(mapped, regions);
    regionLens = measured.regions;
    pathLength = measured.total;

    var docH = Math.max(ctx.pageBottom, window.innerHeight);
    root.style.width = ctx.docW + "px";
    root.style.height = docH + "px";
    svg.setAttribute("viewBox", "0 0 " + ctx.docW + " " + docH);
    svg.setAttribute("width", String(ctx.docW));
    svg.setAttribute("height", String(docH));

    pathEl.setAttribute("d", pointsToD(mapped));
    revealFn = preparePath(pathEl);
    pathLength = revealFn.length;
    paintDebug(ctx);
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
        ".demo__frame",
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
