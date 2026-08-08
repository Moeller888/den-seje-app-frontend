// Lærlig landing page — the only two behaviours the page needs.
// ---------------------------------------------------------------------------------------------
// 1. The sticky header's scrolled state.
// 2. An accessible mobile menu.
//
// Everything else on landing.html is static HTML and CSS. In particular the "VI LÆRER!" call to
// action is a plain <a href="login.html"> and is deliberately NOT wired here: it must keep working
// with JavaScript disabled, with middle-click, and from both `/` and `/landing.html`.
//
// No module syntax, no imports, no network. This file is loaded with `defer` from landing.html and
// runs after the document is parsed. Every lookup is null-checked: a missing element disables its
// own feature and never throws, so a partial DOM can never break the page.
(function () {
  "use strict";

  var MOBILE_BREAKPOINT = 900;   // must match the max-width in css/landing.css

  // ── 1. Header scrolled state ────────────────────────────────────────────────────────────────
  // Driven by observing a sentinel at the top of the document rather than by a scroll listener,
  // so no work happens on the scroll thread. If IntersectionObserver is unavailable the header
  // simply stays in its transparent state — readable, just not enhanced.
  function initHeaderState() {
    var header = document.getElementById("site-header");
    var sentinel = document.getElementById("top-sentinel");
    if (!header || !sentinel) return;
    if (typeof window.IntersectionObserver !== "function") return;

    var observer = new window.IntersectionObserver(function (entries) {
      if (!entries || entries.length === 0) return;
      var entry = entries[entries.length - 1];
      if (!entry) return;
      if (entry.isIntersecting) {
        header.classList.remove("is-scrolled");
      } else {
        header.classList.add("is-scrolled");
      }
    });

    observer.observe(sentinel);
  }

  // ── 2. Mobile menu ──────────────────────────────────────────────────────────────────────────
  function initMobileMenu() {
    var toggle = document.getElementById("nav-toggle");
    var menu = document.getElementById("nav-mobile");
    if (!toggle || !menu) return;

    function isOpen() {
      return toggle.getAttribute("aria-expanded") === "true";
    }

    function open() {
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Luk menu");
      menu.hidden = false;
    }

    // `returnFocus` is false for the cases where focus is moving somewhere else on purpose
    // (following a link, or the viewport growing past the breakpoint).
    function close(returnFocus) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Åbn menu");
      menu.hidden = true;
      if (returnFocus === true) toggle.focus();
    }

    toggle.addEventListener("click", function () {
      if (isOpen()) {
        close(false);
      } else {
        open();
      }
    });

    // Following an in-page anchor must close the menu, or the target scrolls under an open panel.
    var links = menu.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function () {
        close(false);
      });
    }

    // Escape closes and hands focus back to the control that opened it.
    document.addEventListener("keydown", function (event) {
      if (!event) return;
      if (event.key !== "Escape" && event.key !== "Esc") return;
      if (!isOpen()) return;
      close(true);
    });

    // Growing past the breakpoint reveals the desktop nav; an open mobile panel must not be left
    // behind in a state the user can no longer see a control for.
    window.addEventListener("resize", function () {
      if (window.innerWidth > MOBILE_BREAKPOINT && isOpen()) close(false);
    });

    // Deterministic starting state — never inherit whatever the markup happened to ship with.
    close(false);
  }

  initHeaderState();
  initMobileMenu();
}());
