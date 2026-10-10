(function () {
  function track(name, params) {
    if (typeof gtag !== "function") return;
    gtag("event", name, params || {});
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a");
    if (!link) return;

    if (link.classList.contains("hero__cta")) {
      track("cta_click", { location: "hero" });
      return;
    }

    var href = link.getAttribute("href") || "";
    if (href.indexOf("mailto:") === 0) {
      var location = link.closest("#contact")
        ? "contact"
        : link.closest(".site-footer")
          ? "footer"
          : "other";
      track("email_click", { location: location });
      return;
    }

    var lang = link.getAttribute("hreflang");
    if (lang && link.closest(".langs")) {
      track("lang_switch", {
        from: document.documentElement.lang || "en",
        to: lang,
      });
    }
  });

  // Scroll depth sentinels at 25 / 50 / 75 / 100.
  var depths = [25, 50, 75, 100];
  var seenDepth = {};
  var markers = document.createElement("div");
  markers.setAttribute("aria-hidden", "true");
  markers.style.cssText =
    "position:absolute;left:0;top:0;width:1px;height:0;pointer-events:none;overflow:hidden";
  depths.forEach(function (pct) {
    var el = document.createElement("div");
    el.dataset.depth = String(pct);
    el.style.cssText =
      "position:absolute;left:0;width:1px;height:1px;top:" + pct + "%";
    markers.appendChild(el);
  });
  document.body.appendChild(markers);

  if ("IntersectionObserver" in window) {
    var depthObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var pct = Number(entry.target.dataset.depth);
          if (!pct || seenDepth[pct]) return;
          seenDepth[pct] = true;
          track("scroll_depth", { percent: pct });
          depthObs.unobserve(entry.target);
        });
      },
      { threshold: 0 }
    );
    markers.querySelectorAll("[data-depth]").forEach(function (el) {
      depthObs.observe(el);
    });

    var sectionSeen = {};
    var sectionObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          if (!id || sectionSeen[id]) return;
          sectionSeen[id] = true;
          track("section_view", { section: id });
          sectionObs.unobserve(entry.target);
        });
      },
      { threshold: 0.35 }
    );
    ["what", "gallery", "pricing", "contact"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) sectionObs.observe(el);
    });

    var imageSeen = {};
    var imageObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var name = entry.target.getAttribute("data-image");
          if (!name || imageSeen[name]) return;
          imageSeen[name] = true;
          track("gallery_image_view", { image: name });
          imageObs.unobserve(entry.target);
        });
      },
      { threshold: 0.6 }
    );
    document.querySelectorAll(".gallery__item[data-image]").forEach(function (el) {
      imageObs.observe(el);
    });
  }

  // Engaged 30s of visible-tab time.
  var engaged = false;
  var visibleMs = 0;
  var last = performance.now();
  var tick = null;

  function loop(now) {
    if (document.visibilityState === "visible") {
      visibleMs += now - last;
      if (!engaged && visibleMs >= 30000) {
        engaged = true;
        track("engaged_30s");
      }
    }
    last = now;
    if (!engaged) tick = requestAnimationFrame(loop);
  }

  document.addEventListener("visibilitychange", function () {
    last = performance.now();
  });
  tick = requestAnimationFrame(loop);
})();
