(function () {
  var form = document.getElementById("quote-form");
  if (!form) return;

  var cfg = window.__SF_FORM__ || {};
  var statusEl = document.getElementById("quote-status");
  var submitBtn = form.querySelector('[type="submit"]');
  var successEl = document.getElementById("quote-success");

  function track(name, params) {
    if (typeof gtag === "function") gtag("event", name, params || {});
  }

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.dataset.kind = kind || "";
    statusEl.hidden = !message;
  }

  function fieldError(input, message) {
    var id = input.id + "-error";
    var el = document.getElementById(id);
    if (el) el.textContent = message || "";
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function clearErrors() {
    form.querySelectorAll(".quote__error").forEach(function (el) {
      el.textContent = "";
    });
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.setAttribute("aria-invalid", "false");
    });
  }

  function value(name) {
    var el = form.elements.namedItem(name);
    return el && "value" in el ? String(el.value).trim() : "";
  }

  function isUrl(s) {
    try {
      var u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch (_) {
      return false;
    }
  }

  function validate() {
    clearErrors();
    var ok = true;
    var required = form.getAttribute("data-error-required") || "Required";
    var badEmail = form.getAttribute("data-error-email") || "Enter a valid email";
    var badUrl = form.getAttribute("data-error-url") || "Enter a valid URL";

    ["name", "email", "phone", "address", "listing_url"].forEach(function (name) {
      var input = form.elements.namedItem(name);
      if (!input) return;
      if (!value(name)) {
        fieldError(input, required);
        ok = false;
      }
    });

    var email = value("email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldError(form.elements.namedItem("email"), badEmail);
      ok = false;
    }

    var url = value("listing_url");
    if (url && !isUrl(url)) {
      fieldError(form.elements.namedItem("listing_url"), badUrl);
      ok = false;
    }

    return ok;
  }

  function mailtoFallback(payload) {
    var to = cfg.to || "customer@suiteframe.ch";
    var subject = encodeURIComponent(payload.subject);
    var body = encodeURIComponent(
      [
        "Name: " + payload.name,
        "Email: " + payload.email,
        "Phone: " + payload.phone,
        "Address: " + payload.address,
        "Listing / website: " + payload.listing_url,
        "",
        "(Sent from suiteframe.ch quote form)",
      ].join("\n")
    );
    window.location.href = "mailto:" + to + "?subject=" + subject + "&body=" + body;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    setStatus("");
    if (!validate()) {
      var firstInvalid = form.querySelector('[aria-invalid="true"]');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // Honeypot — bots fill this; humans never see it.
    if (value("company")) {
      form.hidden = true;
      if (successEl) successEl.hidden = false;
      return;
    }

    var payload = {
      name: value("name"),
      email: value("email"),
      phone: value("phone"),
      address: value("address"),
      listing_url: value("listing_url"),
      subject: form.getAttribute("data-subject") || "Suiteframe quote request",
      language: document.documentElement.lang || "en",
    };

    if (!cfg.accessKey) {
      track("quote_request", { method: "mailto" });
      mailtoFallback(payload);
      return;
    }

    var sending = form.getAttribute("data-sending") || "Sending…";
    var errMsg = form.getAttribute("data-error-send") || "Could not send. Please email us.";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.label = submitBtn.textContent;
      submitBtn.textContent = sending;
    }

    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: cfg.accessKey,
        subject: payload.subject,
        from_name: payload.name,
        email: payload.email,
        name: payload.name,
        phone: payload.phone,
        address: payload.address,
        listing_url: payload.listing_url,
        language: payload.language,
        replyto: payload.email,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok && data.success, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok) throw new Error("submit failed");
        track("quote_request", { method: "form" });
        form.hidden = true;
        if (successEl) {
          successEl.hidden = false;
          successEl.focus();
        }
      })
      .catch(function () {
        setStatus(errMsg, "error");
        track("quote_request_error");
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          if (submitBtn.dataset.label) submitBtn.textContent = submitBtn.dataset.label;
        }
      });
  });
})();
