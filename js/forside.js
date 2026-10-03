// Lærlig front page — the two things landing.html needs beyond js/landing.js.
// ---------------------------------------------------------------------------------------------
// 1. THE REAL AVATAR. Every [data-fs-avatar] gets the live default figure, mounted through the
//    ONE shared render path every app surface uses (js/avatar-render-c2.js → mountC2Avatar). No
//    copy of the layer stack lives here, so the front page can never drift from what a student
//    actually sees. The identity is `{}` — the documented default (neutral body, medium skin,
//    default hair and hair colour). No Supabase client, no session, no user data: the module
//    graph is avatar-render-c2.js → avatar-layers.js / cloudinary.js / avatar-r2-observability.js,
//    none of which makes a network request beyond the static assets under /assets.
//    No surface name is passed, so the D-076 pilot observability helper stays silent.
//
// 2. THE HERO DEMO. The markup ships in its FINISHED state (answer chosen, XP awarded, next step
//    shown). Only when motion is welcome does this script rewind it and play it forward once:
//    pick → confirm → +2 XP / +2 mønter → næste skridt. Without JavaScript, with reduced motion,
//    or if anything here fails, the finished state is what the visitor sees. Deterministic: fixed
//    timings, fixed values, no randomness.
//
// Every lookup is null-checked; a missing element disables its own feature and never throws.
import { mountC2Avatar } from "./avatar-render-c2.js";

const DEFAULT_IDENTITY = Object.freeze({});

async function mountAvatars() {
  const roots = document.querySelectorAll("[data-fs-avatar]");
  if (!roots || roots.length === 0) return;
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    if (!root) continue;
    try {
      const path = await mountC2Avatar(root, DEFAULT_IDENTITY, { layerClass: "fs-avatar-layer" });
      root.setAttribute("data-avatar-path", String(path));
    } catch (err) {
      // The figure is illustrative on this page. A failed render leaves the empty stage in place
      // (no broken image, no layout shift) and says so in the console for whoever is debugging.
      root.setAttribute("data-avatar-path", "failed");
      console.warn("forside: avatar render failed", err && err.message ? err.message : err);
    }
  }
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

  // Rewind to the moment before the student answers. Level 4 spans 225–350 XP, so 312 XP is
  // 87/125 = .696 of the bar, and the +2 XP of a correct answer brings it to 314 = .712.
  demo.classList.add("is-playing");
  coins.textContent = "146";
  xp.textContent = "312";
  bar.style.setProperty("--p", ".696");

  const steps = [
    [900,  () => pick.classList.add("is-picked")],
    [1500, () => { pick.classList.add("is-confirmed"); feedback.classList.add("is-shown"); }],
    [2000, () => {
      gain.classList.add("is-shown");
      coins.textContent = "148";
      xp.textContent = "314";
      bar.style.setProperty("--p", ".712");
    }],
    [2900, () => { next.classList.add("is-shown"); done(); }],
  ];
  for (let i = 0; i < steps.length; i++) {
    window.setTimeout(steps[i][1], steps[i][0]);
  }
  return true;
}

// The page is SETTLED once every avatar has mounted (or failed) and the demo has finished.
// `html[data-forside-ready]` is the one explicit signal for that — screenshots and tests wait on
// it instead of on a guessed delay. Set on success and on failure alike: a waiter never hangs.
Promise.all([playDemo(), mountAvatars()]).then(
  () => document.documentElement.setAttribute("data-forside-ready", "1"),
  () => document.documentElement.setAttribute("data-forside-ready", "1"),
);
