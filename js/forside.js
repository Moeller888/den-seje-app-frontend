// Lærlig front page — the two things landing.html needs beyond js/landing.js.
// ---------------------------------------------------------------------------------------------
// 1. THE FIGURE. The two [data-fs-figure] images are the North Star v2 DESIGN reference (D-124),
//    used here as a brand image and nothing more. This script does NOT render an avatar: it does
//    not import the shared R2 renderer, and the app's runtime avatar is untouched by this page. It
//    only waits for the images to decode, so `data-forside-ready` means "what you see is final".
//
// 2. THE HERO DEMO. The markup ships in its FINISHED state (answer chosen, XP awarded, next step
//    shown). Only when motion is welcome does this script rewind it and play it forward once:
//    pick → confirm → +10 XP / +5 mønter → næste skridt. Without JavaScript, with reduced motion,
//    or if anything here fails, the finished state is what the visitor sees. Deterministic: fixed
//    timings, fixed values, no randomness. It plays only once the page is visible — a background
//    tab rewinds at load and starts the moment it is first shown.
//
// Every lookup is null-checked; a missing element disables its own feature and never throws.
// Resolves once every figure image has decoded — or failed, which is reported, never thrown: the
// figure is illustrative, and a waiter on data-forside-ready must never hang on it.
function figuresDecoded() {
  const imgs = document.querySelectorAll("[data-fs-figure] img");
  if (!imgs || imgs.length === 0) return Promise.resolve();
  return Promise.all(Array.prototype.map.call(imgs, (img) => {
    if (!img || typeof img.decode !== "function") return Promise.resolve();
    return img.decode().catch(() => {
      console.warn("forside: figure image failed to load", img.currentSrc || img.src);
    });
  }));
}

function prefersReducedMotion() {
  try {
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_e) {
    return true; // when in doubt, stay still
  }
}

// Resolves when the demo has reached its final state — immediately when it does not play.
function playDemo() {
  return new Promise((resolve) => {
    const played = startDemo(resolve);
    if (!played) resolve();
  });
}

function startDemo(done) {
  const demo = document.querySelector("[data-demo]");
  if (!demo) return false;
  if (prefersReducedMotion()) return false;

  const pick = demo.querySelector("[data-demo-pick]");
  const feedback = demo.querySelector("[data-demo-feedback]");
  const gain = demo.querySelector("[data-demo-gain]");
  const next = demo.querySelector(".fs-next");
  const coins = demo.querySelector("[data-demo-coins]");
  const xp = demo.querySelector("[data-demo-xp]");
  const bar = demo.querySelector("[data-demo-xpbar]");
  if (!pick || !feedback || !gain || !next || !coins || !xp || !bar) return false;

  // Rewind to the moment before the student answers. The reward is the server's for a FIRST
  // correct answer — +10 XP, +5 coins (process_question_attempt) — not js/progression.js's stale
  // MC_CORRECT. Level 4 spans 225–350 XP (getXPProgressInLevel), so 312 XP is 87/125 = .696 of the
  // bar and 322 XP is 97/125 = .776, still level 4. Coins end at 148, so they start at 143.
  demo.classList.add("is-playing");
  coins.textContent = "143";
  xp.textContent = "312";
  bar.style.setProperty("--p", ".696");

  const steps = [
    [900,  () => pick.classList.add("is-picked")],
    [1500, () => { pick.classList.add("is-confirmed"); feedback.classList.add("is-shown"); }],
    [2000, () => {
      gain.classList.add("is-shown");
      coins.textContent = "148";
      xp.textContent = "322";
      bar.style.setProperty("--p", ".776");
    }],
    [2900, () => { next.classList.add("is-shown"); done(); }],
  ];

  // The rewind above happens at once; the PLAY waits until the page is actually visible. A page
  // opened in a background tab would otherwise run the whole demo unseen and greet the visitor with
  // its end state. Rewinding first means the first visible frame is the start, never a flash of the
  // finish. `started` makes it play exactly once: later visibility changes do nothing.
  let started = false;
  function play() {
    if (started) return;
    started = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    for (let i = 0; i < steps.length; i++) {
      window.setTimeout(steps[i][1], steps[i][0]);
    }
  }
  function onVisibilityChange() {
    if (document.visibilityState !== "hidden") play();
  }
  if (document.visibilityState === "hidden") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  } else {
    play();
  }
  return true;
}

// The page is SETTLED once every figure has decoded (or failed) and the demo has finished.
// `html[data-forside-ready]` is the one explicit signal for that — screenshots and tests wait on
// it instead of on a guessed delay. Set on success and on failure alike: a waiter never hangs.
Promise.all([playDemo(), figuresDecoded()]).then(
  () => document.documentElement.setAttribute("data-forside-ready", "1"),
  () => document.documentElement.setAttribute("data-forside-ready", "1"),
);
