// Analytics layer for the game directory. The build only loads this file on
// pages built with a GA4 measurement ID (see src/build.mjs), so the early
// return below just guards odd states (e.g. a stale cached page).
//
// Consent: gtag.js runs under Google Consent Mode v2, denied by default.
// The banner offers accept/decline and stores the choice in localStorage
// ("rol-consent": "granted" | "denied"). Declined visits are still counted
// in aggregate (cookieless pings) — no cookies, no identifiers.
(function () {
  if (typeof window.gtag !== "function") return;

  var CONSENT_KEY = "rol-consent";

  function choice() {
    try {
      return localStorage.getItem(CONSENT_KEY);
    } catch (e) {
      return null;
    }
  }

  /* ---------- consent banner ---------- */

  if (!choice()) {
    var bar = document.createElement("div");
    bar.className = "consent-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Analytics consent");
    bar.innerHTML =
      '<p>This site uses Google Analytics to count visits and game-link clicks. No ads, no profiles. <a href="/privacy">Read the privacy page</a>.</p>' +
      '<div class="consent-actions">' +
      '<button type="button" class="btn btn-primary" data-consent="granted">Accept</button>' +
      '<button type="button" class="btn btn-ghost" data-consent="denied">Decline</button>' +
      "</div>";
    bar.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-consent]");
      if (!btn) return;
      var value = btn.getAttribute("data-consent");
      try {
        localStorage.setItem(CONSENT_KEY, value);
      } catch (e) {
        /* private mode: choice applies to this page view only */
      }
      if (value === "granted") {
        window.gtag("consent", "update", { analytics_storage: "granted" });
      }
      bar.remove();
    });
    document.body.appendChild(bar);
  }

  function track(name, params) {
    window.gtag("event", name, params);
  }

  /* ---------- game_outbound_click ---------- */
  // One event per click on a game's original-project link. The build marks
  // those anchors with data-rol-outbound plus game metadata; the listener is
  // delegated, so it fires exactly once per click gesture anywhere in the
  // body, including keyboard activation.
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest ? ev.target.closest("a[data-rol-outbound]") : null;
    if (!a) return;
    var url;
    try {
      url = new URL(a.href);
    } catch (e) {
      return;
    }
    track("game_outbound_click", {
      game_slug: a.getAttribute("data-game-slug") || "(unknown)",
      game_category: a.getAttribute("data-game-category") || "(unknown)",
      destination_domain: url.hostname.replace(/^www\./, ""),
      click_location: a.getAttribute("data-click-location") || "(unknown)",
    });
  });

  /* ---------- game_search ---------- */
  // Not per keystroke: fires once per distinct query after typing pauses
  // (or on Enter / blur), with the number of directory cards it matched.
  // app.js keeps the match count in the input's data-results attribute.
  var search = document.getElementById("game-search");
  if (search) {
    var timer = null;
    var lastTerm = null;
    function send() {
      timer = null;
      var term = search.value.trim().toLowerCase().slice(0, 100);
      if (term.length < 2 || term === lastTerm) return;
      lastTerm = term;
      track("game_search", {
        search_term: term,
        result_count: parseInt(search.dataset.results || "", 10) || 0,
      });
    }
    search.addEventListener("input", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(send, 1200);
    });
    search.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        if (timer) clearTimeout(timer);
        send();
      }
    });
    search.addEventListener("blur", send);
  }

  /* ---------- game_filter_use ---------- */
  // One event per chip click: which filter group changed and to what.
  document.addEventListener("click", function (ev) {
    var chip = ev.target.closest ? ev.target.closest(".chip") : null;
    if (!chip) return;
    track("game_filter_use", {
      filter_group: chip.getAttribute("data-group") || "(unknown)",
      filter_value: chip.getAttribute("data-value") || "(unknown)",
    });
  });
})();
