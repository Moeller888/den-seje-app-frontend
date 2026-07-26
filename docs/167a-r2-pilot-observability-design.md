# 167A — Avatar R2 pilot observability (design, D-074)

**Status:** `DESIGN_READY_AWAITING_OWNER_DECISION`
**Type:** read-only audit + design. **Nothing is implemented.** No runtime/asset/test/golden/workflow change.
**Related:** D-071 (raster debt accepted), D-072 (pilot protocol + status), D-073 (manual onboarding kit).
**Pilot status (unchanged):** `AUTHORIZED_BUT_NOT_STARTED`. **Test-student (unchanged):**
`LIVE_VERIFIED_IN_EPHEMERAL_TEST_BROWSER`. **`AVATAR_R2 = false`.**

---

## 1. Scope & goal

Determine the **least-risky** way to observe whether an R2-opt-in browser actually renders R2, cleanly falls
back to C2, or hits a render failure — **without collecting user data and without affecting rendering.**
Observability is **advisory**: it must never be a condition for R2 rendering, and a real pilot user can be
onboarded (D-073) with no observability at all.

This document **audits, designs and documents** the preferred model and sets an explicit **owner decision
gate** for a later runtime PR. It does **not** add any code, console log, or telemetry.

---

## 2. Current-state audit (what the code already gives us)

Verified read-only against `js/avatar-render-c2.js`, `js/avatar-layers.js` and the three surface call-sites.
Each item is tagged **[direct]** (proven by code), **[inference]** (reasonable, not proven), or **[unknown]**
(needs a runtime test).

- **Single shared render path [direct].** All three surfaces mount through `mountC2Avatar(rootEl, identity,
  opts)` (`avatar-render-c2.js:157`): quiz `app.js:502`, avatar `avatar.html:979`, hub `hub.html:1580`. One
  central hook there covers all three.
- **Return value already carries the result [direct].** `mountC2Avatar` returns `"r2" | "c2" | "aborted"`
  and stamps `rootEl.dataset.avatarRenderPath` (`:200/:211`). No API change is needed to know the result.
- **Opt-in signal [direct].** `isAvatarR2()` → `localStorage.avatar_r2 === "1"`.
- **Identity eligibility [direct].** `composeR2Layers(identity)` returns `null` when `r2StackSrcsFor(identity)`
  is null (identity not neutral-medium / incomplete manifest) → C2 fallback at `:169`.
- **Atomic mandatory-asset gate [direct].** `:179-185` preloads+decodes every mandatory layer; on any
  failure (HTTP, decode, zero-width, empty URL — **collapsed into one catch**) it sets `r2Layers = null` and
  already logs `console.warn("avatar-r2: mandatory layer failed to load → C2 fallback")`. This is the
  whole-stack-or-C2 contract (D-062).
- **Optional overlay drop [direct].** `:190-193` drops only a failed safe overlay (base survives), with its
  own warn. **Not** a fallback.
- **Superseded mount [direct].** Returns `"aborted"` (`:186/:194`) — must **not** emit.
- **`render_failed` is NOT currently produced [direct].** `mountC2Avatar` has no overall try/catch (only the
  hair loop is locally fail-soft); an exception propagates to the caller and is **not classified**. No
  call-site wraps the call in try/catch. → producing `render_failed` requires a guarded wrapper added by the
  impl PR.
- **Render-complete signal [direct].** `data-avatar-rendered="1"` set by `markAvatarRendered(rootEl)`
  (`:302`), called by the **caller** after `mountC2Avatar`, not inside it.
- **Existing console.\* [direct].** Two fallback `console.warn`s in the render (fire only in opt-in browsers,
  since `r2Layers` is only non-null when `isAvatarR2()`); `avatar-expression-engine.js:342` logs a raw error
  on the C2 overlay path. **No structured success/result event exists.**
- **Double-event surfaces [direct].** blink/breathing/expression-swap/cosmetics-preview do **not** call
  `mountC2Avatar`; only **re-render** and **fallback** re-enter it → dedup needed.
- **CSP [direct].** console-only output performs no network request → CSP does not affect it.
- **Existing helpers not to repurpose [direct].** `js/supabase.js` (DB client) must not be used;
  `js/avatar-debug.js` exists but must not be turned into telemetry without a separate decision.

**Fallback reasons directly distinguishable at a central emission point (within an opt-in browser):**
`required_asset_failed` (the mandatory catch, via a local boolean), `identity_ineligible` (`composeR2Layers`
null and not `forceC2`), `forced_c2` (`forceC2` true — shop only, never on pilot surfaces), else `unknown`.
Splitting `required_asset_failed` into "missing" vs "decode" is **not** reliable without inspecting
`err.message` (brittle + contains an asset URL) → **[inference]**, deferred.

---

## 3. Surfaces & hook-points

| Surface | File | Init call-site | Root selector | Render-path attr |
|---|---|---|---|---|
| avatar | `avatar.html` | `:979` `mountC2Avatar(preview, …)` | `#avatar-preview` | `dataset.avatarRenderPath` |
| hub | `hub.html` | `:1580` `mountC2Avatar(avatarEl, …, { layerClass: "profile-avatar-layer" })` | `#profileAvatar` | `dataset.avatarRenderPath` |
| quiz | `app.js` | `:502` `mountC2Avatar(avatarDisplay, …, { layerClass: "quiz-avatar-layer" })` | `#avatar-display` | `dataset.avatarRenderPath` |

The same function serves all three, so **one central emission point** inside `mountC2Avatar` is possible.
The **surface name is not currently passed**; it can be inferred from `layerClass`
(`avatar-layer`/`profile-avatar-layer`/`quiz-avatar-layer`) but that is fragile. **Preferred:** add an
explicit optional `surface` option to `mountC2Avatar` in the impl PR (additive, default derivable/`unknown`),
which is the least-fragile mapping and does not change existing behaviour.

---

## 4. Privacy & security boundary (binding)

The observability payload must **never** contain: full name · email · UID · account-id · Supabase user-id ·
session-id · auth-token · browser fingerprint · IP · quiz question · quiz answer · progression · XP · coins ·
class · school · teacher name · full avatar-profile data · cosmetics list · localStorage contents · raw error
objects (may carry env/asset data) · stack traces · URL query params · referrer · user-agent · identifying
timestamps · persistent event history.

- The browser console **by itself sends data nowhere** — console-only observability makes no network request.
- **However**, console output is visible to anyone with access to that browser's DevTools, so the payload
  must **still be data-minimal** — a fixed event name, a version, a surface enum, a result enum, and a
  bounded reason code. Nothing user-identifying, ever.

---

## 5. Design options

### A. Console-only, local, pilot-gated — **RECOMMENDED**
Structured `console.info`, emitted **only** when `localStorage.avatar_r2 === "1"`, no backend, no persistence,
no identifier, read manually by the supervisor.
- **Value for Wave 1:** high — directly answers "did this opt-in browser get R2, fall back, or fail?" during
  a supervised manual pilot (D-073). **Implementation risk:** low (one helper + one central call).
  **Privacy risk:** minimal (no PII, no network). **Runtime risk:** minimal (fail-soft, no await).
  **Performance risk:** negligible (one small object, once per root/load). **Test burden:** low-moderate
  (unit + one Playwright console-capture). **Reversibility:** trivial (delete helper + one call). **Double
  events:** avoided via central hook + dedup. **False signals:** low (uses the known render result).
  **DB/API:** none. **User id:** none. **Affects rendering:** no. **Needs protocol change:** no (advisory).

### B. In-memory debug buffer
Events kept only in page memory, read via a test/debug handle, cleared on navigation/reload; no backend, no
persistence.
- **Value:** modest beyond A (structured retrieval), but the supervised pilot reads the console directly
  anyway. **Implementation risk/complexity:** higher (buffer + handle + reset semantics). **Privacy:** same
  as A if data-minimal. **Reversibility:** still easy but larger surface. **DB/API:** none. Not needed for
  Wave 1; can be layered on later if a structured read is ever required.

### C. Fail-soft beacon / backend event
Central collection via an endpoint/analytics.
- Requires endpoint or analytics infra **plus** privacy, retention, auth, RLS and abuse design. **Privacy
  risk:** high. **Reversibility:** low (server + schema). **DB/API:** yes. **Must not be recommended as the
  first pilot version** without a strong, documented reason — none exists for a ≈3–5 user supervised pilot.

**Recommendation:** **A (console-only, pilot-gated)** — the code confirms a stable central emission point, a
reliable opt-in gate, no PII, no network, and a fail-soft/dedup design are all achievable.

---

## 6. Event schema (design only — do not add code)

```js
{
  event: "avatar_r2_render",
  version: 1,
  surface: "avatar" | "hub" | "quiz",
  result: "r2" | "c2_fallback" | "render_failed",
  reason: "<bounded reason-code>"   // see §9
}
```

- **eventname:** `avatar_r2_render`; **version:** `1`.
- **surface values:** `avatar` · `hub` · `quiz` (`unknown` allowed only if a surface cannot be mapped).
- **result values:** `r2` · `c2_fallback` · `render_failed`.
- **reason:** a bounded code (§9); on a successful `r2` result `reason` is `unknown` (or omitted — see below).
- **`reason` = `unknown`** whenever the control flow cannot distinguish a specific cause safely.
- **`reason` may be omitted** on `result: "r2"` (success needs no reason); it is **required** on
  `c2_fallback` and `render_failed` (value may be `unknown`).
- **console prefix:** `[avatar-r2-observability]`. **log level:** see §10.
- **freeze the payload** (`Object.freeze`) so a consumer cannot mutate shared state.
- **No error text** in the payload (no `err.message`, no stack). **No explicit timestamp** — the browser
  console already timestamps each line; add one only if a concrete need appears (none today).

Preferred console form (to be added only by the impl PR):

```js
console.info("[avatar-r2-observability]", {
  event: "avatar_r2_render", version: 1, surface, result, reason
});
```

---

## 7. Pilot gating

- **Emit only when `localStorage.getItem("avatar_r2") === "1"`.** A normal C2 browser without opt-in stays
  **completely silent** (no new logs).
- Consequence matrix (opt-in browser only):
  - clean R2 render → may emit `result: "r2"`.
  - opt-in but clean C2 fallback → may emit `result: "c2_fallback"`.
  - opt-in but a real render failure → may emit `result: "render_failed"` (once the impl PR adds a guarded
    wrapper, §8).
- **Read the gate once, at emission time** (not cached from before render), so a mid-load state change cannot
  produce a false event. Reading it only at emission is simplest and avoids a stale pre-render snapshot; this
  is the recommended single read.

---

## 8. Emission timing

- Emit **only after the result is known**: after the atomic asset gate resolves, after `path` is set, after
  `dataset.avatarRenderPath` is stamped, and after the DOM commit of the chosen stack — i.e. **at the end of
  `mountC2Avatar`, immediately before `return path`**, and **only** when `path` is `"r2"` or `"c2"` and the
  mount is still current (never on `"aborted"`, never when `rootEl` is null).
- One **central** emission point (not three call-sites).
- `render_failed`: since `mountC2Avatar` can currently throw unguarded, the impl PR wraps the render body in a
  `try/catch` that emits `render_failed` (reason `render_exception`) via the fail-soft helper and **re-throws**
  (preserving today's throw behaviour so callers are unaffected). This is the only added control-flow and is
  itself fail-soft.
- Observability must **not**: influence the render choice, decide fallback, block decode/DOM-commit, block
  blink/breathing/expressions, rethrow its own error, change any data-attribute, change the return value, or
  measurably change timing.

---

## 9. Result & reason taxonomy

**Results:** `r2` · `c2_fallback` · `render_failed`.

| reason-code | source in control flow | direct/inferred | privacy-safe | stable contract | v1? |
|---|---|---|---|---|---|
| `required_asset_failed` | mandatory `preloadDecode` catch (`:181`) | direct | yes | yes | **v1** |
| `identity_ineligible` | `composeR2Layers` null & not `forceC2` (`:169`) | direct | yes | yes | **v1** |
| `forced_c2` | `forceC2 === true` (shop only) | direct | yes | yes | v1 (never on pilot surfaces) |
| `render_exception` | guarded try/catch added by impl PR | direct (once added) | yes (no err text) | yes | **v1** (with the wrapper) |
| `unknown` | any case not safely distinguishable | direct | yes | yes | **v1** |
| `asset_missing` vs `asset_decode` split | `err.message` inspection | inference | risky (URL) | no | **deferred** |

It is acceptable for v1 to carry few reason-codes and otherwise `unknown`. Never claim a reason the control
flow cannot distinguish safely.

---

## 10. Console contract

- **prefix:** `[avatar-r2-observability]` (stable, exact).
- **event name:** `avatar_r2_render`; payload is **one frozen object**; message text stable.
- **`c2_fallback` is NOT an error** — it is the designed whole-stack-or-C2 behaviour; never `console.error`.
- Two candidate contracts:
  - **A:** all results via `console.info`.
  - **B:** `r2` and `c2_fallback` via `console.info`; `render_failed` via `console.warn`.
- **Recommended: B** — `render_failed` is the only genuinely abnormal case and deserves `console.warn`
  visibility, while `r2`/`c2_fallback` stay quiet `info`. Never `console.error` (avoids implying a user-facing
  crash and avoids noise). Non-opt-in users get **no** new logs under either contract.

---

## 11. Fail-soft requirements

- The emission is wrapped so observability can **never** break rendering (`try { … } catch (_e) {}`).
- Payload built **without** network; emission is **not** awaited; **no** Promise chain, retry, queue,
  persistent buffer, or global error handler; **no** catch that hides the real render error.
- An observability error is **ignored locally only**; no event may change the fallback result.
- **Acceptance:** even if the entire observability helper fails, the R2/C2 rendering and the user experience
  are **identical** to before.

---

## 12. Deduplication

- Goal: **at most one final result per avatar root per page load.**
- **Recommended:** a module-local `WeakSet` of root elements that have emitted. It adds no visible DOM
  contract, holds no user data, is not persistent, and **resets naturally on full navigation/reload** (module
  state is re-initialised), so a legitimate new event can fire after a real reload.
- blink/breathing/expression-swap never call `mountC2Avatar`, so they cannot emit. A **re-render** or
  **fallback** re-enters `mountC2Avatar`; with the WeakSet, only the **first** result per root per load is
  emitted (satisfying "≤1 per root per load"). Cosmetics preview is the shop surface (`forceC2`), outside the
  three pilot surfaces and still opt-in-gated.
- Alternatives considered and rejected as heavier or leakier: a `data-*` attribute (adds a DOM contract), a
  `Symbol` on the root (fine but less idiomatic than a WeakSet), a per-surface global flag (breaks with
  multiple roots).

---

## 13. Performance budget

No network; no `JSON.stringify` needed; one small frozen object; **at most one event per surface-root per
load**; no interval/observer/timer/polling; no extra image decode; no extra DOM traversal beyond the already
known render result (use the return value + the local fallback boolean, do not re-scan the DOM in production).

---

## 14. Golden & visual risk

Expected: **no** change to DOM (beyond the non-visible WeakSet state), layout, screenshots, animations,
goldens, data-attributes, asset-loading, or render timing. Existing goldens should remain **identical**. The
only DOM-adjacent state is the in-memory WeakSet (not attached to the DOM). Risk: none identified, provided
the helper writes nothing to the DOM and is not awaited.

---

## 15. Reversibility

One small helper + one central call-site (plus the guarded wrapper for `render_failed`). No DB migration, no
env var, no persistent storage, no server config, no user data, no change to R2 eligibility, no change to the
`localStorage` contract. A later rollback deletes the helper and the call — R2/C2 rendering is unchanged.

---

## 16. Later implementation scope (not binding, no code now)

Smallest realistic runtime scope for the impl PR:
- **New helper:** e.g. `js/avatar-r2-observability.js` — `emitR2RenderObservability({ surface, result, reason })`
  (gate check + dedup WeakSet + frozen payload + fail-soft `console.info`/`console.warn`).
- **`js/avatar-render-c2.js`** — add an optional `surface` option to `mountC2Avatar`; call the helper once at
  the end (r2/c2) and from a guarded try/catch (render_failed) before re-throwing.
- **Call-sites (only if central `surface` mapping is not added):** pass `surface` at `app.js:502`,
  `avatar.html:979`, `hub.html:1580`. Preferred: pass `surface` explicitly (still one central emit).
- **Tests:** `tests/unit/avatar-r2-observability.test.mjs` + one fixture-intercepted, self-served Playwright
  spec capturing `page.on("console")`.

---

## 17. Test strategy for the later PR (design only)

**Unit:** opt-in + R2 success → exactly one `r2`; opt-in + clean fallback → exactly one `c2_fallback`; opt-in
+ render failure → exactly one `render_failed`; **no opt-in → nothing**; a throwing observability helper does
**not** affect rendering; **no UID/email/token/raw-error** in payload; dedup works; blink/breathing/
expression-swap emit nothing; C2 default path unchanged; `AVATAR_R2=false`.

**Integration/Playwright:** per surface (avatar/hub/quiz) the correct event on R2 success and on C2 fallback;
no event without opt-in; no mixed stack; no broken images; existing goldens unchanged (unless a pure test
hook is required). Capture events via `page.on("console")`. The spec should be **self-served +
fixture-intercepted**, with **no backend contact and no shared test-student mutation** — the safest form,
matching the existing R2 golden/expression specs.

---

## 18. Acceptance criteria (for the later PR)

- No event without R2 opt-in.
- Exactly one final result per root per load.
- `result` ∈ { `r2`, `c2_fallback`, `render_failed` } only.
- No user identifier; no network; no persistence; no database.
- No change to rendering; an observability error does not affect rendering.
- C2 default path unchanged; blink/breathing/expressions emit no events.
- All three surfaces covered; tests green; goldens unchanged; `AVATAR_R2=false`.

---

## 19. Rollback plan

Delete `js/avatar-r2-observability.js`, remove the single central call + the guarded wrapper, and (if added)
the `surface` option. No data, storage, or config to unwind; R2/C2 rendering is byte-for-byte as before.

---

## 20. Non-goals

No central dashboard · no analytics platform · no Supabase table · no Edge Function · no beacon · no
retention · no user tracking · no session tracking · no browser fingerprinting · no feature-flag service · no
allowlist · no UI toggle · no automatic pilot classification · no change to pilot status · no concrete user
onboarding · no broad R2 activation.

---

## 21. Owner decision gate

Choose one:

- **`CONSOLE_ONLY_PILOT_OBSERVABILITY`** — recommended.
- `IN_MEMORY_DEBUG_BUFFER`
- `BACKEND_OBSERVABILITY`
- `NO_OBSERVABILITY_BEFORE_PILOT`

**Recommendation: `CONSOLE_ONLY_PILOT_OBSERVABILITY`.** The audit confirms all preconditions: a stable
central emission point (`mountC2Avatar` return), reliable pilot gating (`avatar_r2==="1"`), no PII, no
network, a fail-soft design, dedup (WeakSet), a full test plan, no impact on the C2 default, and no golden
impact. If any of these could not be met, the recommendation would be `NO_OBSERVABILITY_BEFORE_PILOT`; none
is blocked. **No code is written until the owner selects an option.**
