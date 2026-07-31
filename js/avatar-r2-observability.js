// ── Avatar R2 pilot observability (D-076) ────────────────────────────────────
// CONSOLE_ONLY_PILOT_OBSERVABILITY (owner-confirmed design D-074).
//
// Advisory, pilot-gated, fail-soft render signal: on an R2-opt-in browser it emits ONE
// structured console line per avatar root per page load telling whether the shared render
// path mounted R2, cleanly fell back to C2, or hit a render failure. It is NOT a condition
// for rendering and must never affect it.
//
// HARD BOUNDARIES (see docs/167a-r2-pilot-observability-design.md):
//   • console only — no backend, beacon, network, database, persistence, buffer, retry;
//   • pilot-gated on the EXPLICIT per-browser opt-in localStorage.avatar_r2 === "1"
//     (AVATAR_R2=true alone must NOT trigger it);
//   • no PII whatsoever — the payload is exactly {event,version,surface,result,reason};
//     no uid/email/token/session/error/stack/timestamp/localStorage contents;
//   • fail-soft — this helper can NEVER throw and can never change rendering;
//   • dedup via a module-local WeakSet of roots → at most one final result per root per load.

// Module-local dedup set. Resets naturally on full navigation/reload (module re-init).
// Holds only root elements (or, in unit tests, plain objects) — never user data.
const _emittedRoots = new WeakSet();

const _RESULTS = ["r2", "c2_fallback", "render_failed"];
const _SURFACES = ["avatar", "hub", "quiz"];
// v1 reason vocabulary. `unsupported_cosmetic_equipped` was ADDED in D-082 option B (an equipped
// cosmetic whose slot the R2 stack cannot render — today only `torso` — drops the WHOLE avatar to C2
// so the paid item stays visible). The event schema itself is unchanged: `reason` is still one
// string field, so `version` stays 1; an unknown reason still degrades to "unknown".
const _REASONS = ["unknown", "required_asset_failed", "identity_ineligible", "forced_c2", "unsupported_cosmetic_equipped", "render_exception"];

// Emit at most one observability event for `root` this page load. Silent (no event, no
// dedup mark) when the browser is not R2-opted-in, or when surface/result/root are invalid.
// Never throws.
export function emitR2RenderObservability({ surface, result, reason, root } = {}) {
  try {
    // Pilot gate — read the EXPLICIT opt-in here, at emission time (never cached pre-render).
    let optedIn = false;
    try {
      optedIn = typeof localStorage !== "undefined" && localStorage.getItem("avatar_r2") === "1";
    } catch (_e) {
      return; // localStorage unavailable/throws → silent, never affect rendering
    }
    if (!optedIn) return; // normal C2 (no opt-in) stays completely silent

    // Validate surface/result — invalid → silent (do NOT rewrite surface to "unknown").
    if (_SURFACES.indexOf(surface) === -1) return;
    if (_RESULTS.indexOf(result) === -1) return;

    // Validate reason — invalid → "unknown"; render_exception only valid with render_failed.
    let r = _REASONS.indexOf(reason) === -1 ? "unknown" : reason;
    if (r === "render_exception" && result !== "render_failed") r = "unknown";

    // Dedup needs a valid object root; mark ONLY here, immediately before a valid emission,
    // so a prior not-opted-in / invalid call never blocks a later valid event on the same root.
    if (!root || typeof root !== "object") return;
    if (_emittedRoots.has(root)) return;
    _emittedRoots.add(root);

    const payload = Object.freeze({ event: "avatar_r2_render", version: 1, surface, result, reason: r });

    // c2_fallback is the designed whole-stack-or-C2 behaviour — NOT an error → never console.error.
    if (result === "render_failed") console.warn("[avatar-r2-observability]", payload);
    else console.info("[avatar-r2-observability]", payload);
  } catch (_e) {
    // Fail-soft: swallow everything. Observability must never break rendering.
  }
}
