(function () {
  var KEY = "sf_consent";
  var banner = document.getElementById("consent-banner");
  if (!banner) return;

  function setConsent(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (_) {
      /* private mode */
    }
    if (typeof gtag === "function") {
      gtag("consent", "update", {
        analytics_storage: value === "granted" ? "granted" : "denied",
      });
    }
    banner.hidden = true;
  }

  var stored = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch (_) {
    /* private mode */
  }

  if (stored === "granted" || stored === "denied") {
    banner.hidden = true;
  } else {
    banner.hidden = false;
  }

  banner.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-consent]");
    if (!btn) return;
    var value = btn.getAttribute("data-consent");
    if (value === "accept") setConsent("granted");
    if (value === "decline") setConsent("denied");
  });

  document.addEventListener("click", function (event) {
    var open = event.target.closest("[data-consent-open]");
    if (!open) return;
    event.preventDefault();
    banner.hidden = false;
    var focusTarget = banner.querySelector("[data-consent]");
    if (focusTarget) focusTarget.focus();
  });
})();
