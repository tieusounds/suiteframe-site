// The draw-trail: one continuous thread tracing the whole page, drawn in as you scroll.
// It is the site's single authored motion moment — the "one shot" the tour promises,
// made literal as a line the visitor's own scrolling draws.
(function () {
  var root = document.querySelector(".draw-trail");
  var svg = document.querySelector(".draw-trail__svg");
  if (!root || !svg) return;

  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setHeight() {
    var h = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
    root.style.height = h + "px";
  }

  // Reveal from the top of the page down to `pct` (0–100).
  // Set in JS so we never depend on CSS custom-property calc inside clip-path.
  function setReveal(pct) {
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    svg.style.clipPath = "inset(0 0 " + (100 - pct) + "% 0)";
  }

  if (reduceMotion) {
    setHeight();
    setReveal(100);
    return;
  }

  var ticking = false;
  function draw() {
    var docH = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
      1
    );
    // Tip tracks the bottom of the viewport: as you scroll, the thread
    // draws downward in lockstep — top → bottom, never lagging behind.
    var tip = window.scrollY + window.innerHeight;
    setReveal((tip / docH) * 100);
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
  window.addEventListener("load", function () {
    setHeight();
    draw();
  });

  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(function () {
      setHeight();
      draw();
    });
    ro.observe(document.body);
  }
})();
