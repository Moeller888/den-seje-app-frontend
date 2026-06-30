# 166A — AVATAR_V2 Activation Plan

Status: **PLAN ONLY — not executed.** AVATAR_V2 remains `false`.
Date: 2026-06-24
Owner: solo founder (pre-launch, pilot scale)

> **STATUS UPDATE — 2026-06-30 (Section 157AB): EXECUTED / HISTORICAL.** This plan **was carried
> out** — `AVATAR_V2 = true` shipped to production on 2026-06-25 (commit `52f8365`). The
> "not executed / remains `false`" status line above is the **pre-activation** record, retained for
> history. This document is now a **historical activation plan**; current avatar/activation state is
> owned by [`AVATAR_SYSTEM.md`](./AVATAR_SYSTEM.md) §2, and the next avatar work is the Master raster
> wiring in [`167a-master-asset-raster-wiring-plan.md`](./167a-master-asset-raster-wiring-plan.md).

This document is the controlled go-live plan for switching the C2 avatar render
pipeline from preview-gated to the live default. It records verified state, blast
radius, the chosen rollout, and the decision gates that must pass before a future
**execution** section flips the flag. Writing this file changes nothing at runtime.

---

## 1. Current verified state

- **Single switch:** `export const AVATAR_V2 = false` in `js/avatar-layers.js:230`.
  `isAvatarV2()` returns `AVATAR_V2 || localStorage['avatar_v2'] === '1'`. There is
  **no** per-user or server-side gating — the const is the only global control.
- **Gated surfaces (4):** `app.js:467` (quiz), `avatar.html:889`, `hub.html:1555`,
  `shop.html:473`. All switch off the one const via `isAvatarV2()`.
- **C2 assets complete:** full body_type × skin_tone matrix shipped in commit
  `53a6220` (`feat: add C2 body type base assets`):
  - `body-neutral-medium-c2.svg`, `body-neutral-dark-c2.svg`
  - `body-male-medium-c2.svg`, `body-male-dark-c2.svg`
  - `body-female-medium-c2.svg`, `body-female-dark-c2.svg`
- **Resolver:** `baseSrcForC2(identity)` resolves body_type × skin_tone with defensive
  fallbacks (unknown body_type → neutral, unknown skin_tone → medium, null → neutral
  medium). Verified deterministically + via the real renderer for all 6 combinations.
- **Preview verification done (this work-stream):**
  - All 6 combinations rendered clean via the real `mountC2Avatar()` (synthetic
    identities, no DB): correct base path, base loaded, inline hair, eyes overlay,
    no broken images, no console errors. Skin tones and body silhouettes differ
    correctly.
  - Live AVATAR_V2 preview (localStorage override) on the test student
    (neutral/medium) verified clean on quiz/hub/avatar/shop.
- **Repo model:** root + `den-seje-app-frontend/` are two clones of the same GitHub
  repo. Push from one, ff-pull the other. Tests run against the live Vercel URL, so
  the order is push → Vercel deploy → run suite.

---

## 2. Blast radius

Flipping the flag changes both the **rendered DOM** and the **pixels** on every
avatar surface. Under V2:
- the base body becomes a `*-c2.svg` asset,
- hair becomes an **inline `<svg>`** (token-recolored), not an `<img>`,
- cosmetics composite via the C2 z-model,
- the expression/eyes overlay is managed per surface.

**The dominant cost is the test suite, not the one-line flip.** Affected committed
golden baselines (chromium-win32), all captured on the **legacy** render:

| Spec | Golden baselines | Legacy-DOM functional assertions also present |
|---|---|---|
| `avatar-cosmetics.spec.ts` | 5 | yes (equip → `<img>` layers) |
| `avatar-hair-decoupling.spec.ts` | 5 | yes (hair as `<img>`, "four surfaces") |
| `avatar-hairstyle-expansion.spec.ts` | 6 | yes (`img[src*="hair-*.svg"]`) |
| `avatar-hairstyle.spec.ts` | 5 | yes |
| `avatar-identity-onboarding.spec.ts` | 2 | yes |
| `avatar-skin-tone.spec.ts` | 4 | yes (`img[src*="body-*-dark.svg"]`) |
| **Total** | **27 golden PNGs** | + functional selectors assume legacy DOM |

**Key insight:** activation is a **test-contract migration across 6 spec files**, not
just a pixel re-baseline. Functional assertions that query `img[src*="hair-default.svg"]`,
legacy body paths, etc. will fail under V2 because hair is inline and the base path
changes.

### Affected files / specs / goldens
- Runtime flip (1 line): `js/avatar-layers.js` (`AVATAR_V2 = true`).
- Test specs to migrate (6): the rows above.
- Golden baselines to regenerate (27 PNGs) in the matching `*-snapshots/` dirs.
- No DB / migration / RPC / Supabase function / asset changes required to activate.

---

## 3. Rollout choice — Option A (big-bang flip)

**Decision: Option A.** Set `AVATAR_V2 = true`, migrate tests + regenerate goldens in
the same commit, one deploy, all 4 surfaces at once.

Rationale: the flag is a single global const; per-surface staging (Option B) or %
canary (Option C) would require new gating code that does not exist and is
over-engineered for pilot scale. Rollback is a one-line revert + redeploy.

Rejected:
- **Option B (per-surface flags):** needs new code (`AVATAR_V2_QUIZ`, …) + multiple
  deploys. Not worth it now.
- **Option C (% canary):** needs server-side/user-hash gating that doesn't exist.

---

## 4. R3 — live coverage plan (deferred, NOT in this section)

Gap: male/female + dark have been verified via the synthetic renderer + direct
render + neutral/medium live, but **never on a logged-in student with a non-neutral
identity end-to-end**.

**Decision:** close R3 using a **preview/throwaway student** OR a **deliberate,
immediately-reverted** `set_avatar_identity` change — performed in its **own future
section**, not here. That section will:
1. Set a non-neutral identity (male/dark, female/dark) on a disposable/preview
   student (or temporarily on the test student, then revert).
2. Log in live with AVATAR_V2 preview (localStorage) and verify all 4 surfaces.
3. Revert the identity change; confirm no residual DB state.

This is the only remaining real coverage gap and is a **prerequisite gate** for the
execution flip.

---

## 5. Test / golden migration strategy

Executed in the **same commit as the flip** so `main` is never red:
1. **Functional assertions first:** update the 6 specs to the V2 DOM contract —
   inline hair (`[data-c2-layer="hair"] svg`), base path `*-c2.svg`, C2 z-model
   for cosmetics. Keep assertions meaningful (stable selectors, no weakening).
2. **Re-baseline goldens:** regenerate the 27 PNGs under V2 with
   `--update-snapshots`. **Visually verify each** new baseline (body + hair + eyes +
   cosmetics correct per identity) — do not blind-accept.
3. **Convert to deterministic capture:** migrate the relevant avatar screenshot
   goldens from `expect(buffer).toMatchSnapshot(...)` to
   `await expect(locator).toHaveScreenshot(name, { maxDiffPixels: N, animations: "disabled" })`.
   This locks determinism (see the shop-preview flake fix, commit `eb19254`) and
   reuses the same baseline path/name. **Keep existing `maxDiffPixels` tolerances —
   do not loosen to mask diffs.**

---

## 6. Activation sequence (for the future execution section)

1. Pre-flight: both clones on the same HEAD, clean tree, suite green on legacy.
2. **Gate R3 closed** (Section 4) — non-neutral identities verified live.
3. Migrate the 6 avatar specs to the V2 DOM contract (functional assertions).
4. Regenerate + visually verify the 27 goldens under V2; convert to
   `toHaveScreenshot({ animations: "disabled" })`.
5. Flip `AVATAR_V2 = true` (one line, `js/avatar-layers.js`).
6. Run the full suite **locally** (against current production it still tests legacy,
   so the authoritative run is post-deploy). Commit flip + test migration + new
   goldens as ONE revertable commit.
7. Push from root → wait for Vercel deploy (poll a marker string) → run full suite
   against production (all 3 browsers) → ff-pull the frontend clone.
8. Manual smoke on all 4 surfaces, medium + dark.

---

## 7. Validation gates (must be green before/at execution)
- **Gate 1 (R3):** non-neutral identities verified live on all 4 surfaces.
- **Gate 2:** full suite green locally after spec migration + re-baseline.
- **Gate 3:** full suite green against deployed production (Chromium, Firefox, WebKit).
- **Gate 4:** manual smoke quiz/hub/avatar/shop, medium + dark, no console errors.

---

## 8. Rollback plan
- Revert the single activation commit (flip + test migration + goldens) → push →
  Vercel redeploys legacy. Because the flip and the test/golden migration are one
  commit, reverting restores a self-consistent green legacy state in one step.
- A student mid-session keeps old JS until reload (acceptable; no data risk).
- No DB/migration involved, so there is no data rollback to perform.

---

## 9. Explicit non-actions (what this plan does NOT do)
- Does **not** set `AVATAR_V2 = true`.
- Does **not** modify DB, migrations, RPC, or Supabase functions.
- Does **not** call `set_avatar_identity` or create any student.
- Does **not** modify runtime code, assets, tests, or snapshots.
- Does **not** stage `.claude/settings.local.json` or the `den-seje-app-frontend`
  gitlink.

---

## 10. Decision gates before execution
1. **R3 live coverage** completed and reverted (its own section) — REQUIRED.
2. Confirm the re-baseline + spec migration will land in the **same commit** as the
   flip (agreed: yes).
3. Confirm Option A big-bang is still desired at execution time (agreed: yes).
4. Optional: decide whether to also re-baseline the standalone `tests/c2-golden/`
   sheets (not part of the Playwright suite) for documentation parity.

---

## Appendix — open risk register
- **R1 (high):** suite red on flip if goldens + functional selectors not migrated
  together → mitigated by single-commit migration.
- **R2 (med):** golden flakiness → mitigated by `toHaveScreenshot` + `animations: "disabled"`.
- **R3 (med):** non-neutral live coverage gap → closed in the dedicated R3 section.
- **R4 (low):** CDN/session staleness → reload picks up new JS.
- **R5 (low):** `avatar.html` async render phasing (base→hair→eyes) → cosmetic,
  resolves to a complete render.
