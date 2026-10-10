// The draw-trail: one continuous thread tracing the whole page, drawn in as you scroll.
// It is the site's single authored motion moment — the "one shot" the tour promises,
// made literal as a line the visitor's own scrolling draws.
(function () {
  var root = document.querySelector(".draw-trail");
  var path = document.querySelector(".draw-trail__path");
  if (!root || !path) return;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var length = path.getTotalLength();
  path.style.strokeDasharray = String(length);

  if (reduceMotion) {
    // Reduced motion: show the line fully drawn and static, no scroll coupling.
    path.style.strokeDashoffset = "0";
    return;
  }

  path.style.strokeDashoffset = String(length);

  function setHeight() {
    var h = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
    root.style.height = h + "px";
  }

  var ticking = false;
  function draw() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? window.scrollY / max : 0;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    path.style.strokeDashoffset = String(length * (1 - p));
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(draw);
  }

  setHeight();
  draw();

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () {
    setHeight();
    draw();
  });
  window.addEventListener("load", setHeight);

  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(function () {
      setHeight();
      draw();
    });
    ro.observe(document.body);
  }
})();
