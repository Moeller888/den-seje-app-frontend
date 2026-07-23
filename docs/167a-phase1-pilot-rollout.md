# 167A — Avatar R2 Pilot Rollout (AVATAR_R2 opt-in)

Status: **Opt-in mechanism live; enable per pilot user.** `AVATAR_R2 = false` by default (production
unchanged). Originally written 2026-07-01 for Phase-1; **refreshed 2026-07-23 (D-064) for the current
Phase-2 decomposed stack** (see the activation-readiness audit; closes finding F3). Owner: project owner.
Related: [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md),
[157r-feature-flags.md](./157r-feature-flags.md), [project-state.md](./project-state.md) (D-057…D-063).

> **What changed since the 2026-07-01 Phase-1 draft (read this first):** the opt-in avatar is no longer
> the single **baked PNG** with a static face. It is now the **Phase-2 decomposed WebP stack** — a
> `body-neutral-medium-v2.webp` base plus separate **face, eyes (+iris tint), blush and hair (tinted)**
> layers — and the **living engines are back on**: **blink is LIVE** on R2 (Option-A eyelids, D-061/D-063)
> and **breathing** stays. Only **dynamic facial expressions** are still off on R2 (the raster face is a
> fixed neutral; expression swaps are a future art track). The eligibility criteria in §2 are unchanged.

---

## 1. Mechanism (per-browser opt-in, no cohort/DB)

`isAvatarR2()` (`js/avatar-layers.js`) honours a **per-browser localStorage override**, mirroring
`AVATAR_V2`. Production stays `AVATAR_R2 = false`; a browser opts in explicitly:

- **Enable (this browser):** `localStorage.setItem("avatar_r2", "1")` then reload.
- **Disable / opt-out:** `localStorage.removeItem("avatar_r2")` (or set to anything ≠ `"1"`), reload.

No cohort logic, no DB flag, no global flip. Only browsers that set the key see the raster avatar;
everyone else renders the untouched C2/SVG avatar. Verified end-to-end: no key → C2 `.svg`; `="1"` →
the R2 decomposed **WebP** stack; cleared → C2 `.svg`.

**Whole-stack-or-C2 (D-062):** R2 only renders when the COMPLETE stack resolves AND every mandatory
layer loads. If any mandatory R2 asset 404s or fails to decode, the avatar **atomically falls back to
the complete C2 render** — never a broken/partial R2 avatar. So an opt-in browser can only ever see a
clean R2 avatar or a clean C2 avatar, never a half-rendered one.

## 2. Pilot group selection criteria (unchanged — still correct)

To avoid visible cosmetic loss and inconsistent fallback, pick pilot users who are:

- **Neutral / medium avatar identity** — only `neutral`+`medium` resolves the raster stack; other
  body types / skin tones fall back to C2 (the pilot would see no change), so include only neutral-medium.
  The gate is manifest-key based, so a manipulated client cannot force R2 on an unsupported identity.
- **Not reliant on head/face/eye/clothing cosmetics** — the slot-gate renders **only aura/back** on the
  raster stack; a user who equips a hat/mask/glasses/clothing item would see it **not render on R2** (the
  shop preview forces full C2 for those items so they stay visible in the shop).
- **Preferably no cosmetics, or only aura/back** — so nothing visibly vanishes.

A user meeting all three gets a clean experience (the decomposed R2 avatar + any aura/back they own).

## 3. Known Phase-2 characteristics (by design — tell pilot users)

- Avatar art is the **decomposed North Star neutral stack**, served as **WebP** (base `…-v2.webp` +
  face/eyes/iris/blush/hair), total ≈ **82 KB** across the six layers.
- **The face is alive:** **blink is LIVE** (Option-A eyelids, measured medium fill) and **breathing**
  runs. **Dynamic expressions (happy/sad/…) are NOT yet on R2** — the raster face is a fixed neutral;
  the expression overlay stays off on R2 (expression swaps are a later art track).
- **Head/face/eye + clothing cosmetics are hidden** on the raster stack until the anchor revision;
  **aura/back cosmetics DO render.**
- **One fixed neutral-medium base** (per-user skin-tone variation for R2 is future work); **hair colour
  IS tinted** live from the identity token.
- **Known accepted cosmetic debt (D-061):** a faint light residual can remain along the forearms/hands
  on dark backgrounds at large sizes (owner-accepted; gone at small sizes). Trousers/shoes are clean.
- **Robustness (D-062):** any failed R2 asset → complete C2 fallback (no broken avatar). Blink lids are
  covered by goldens (D-063).

## 4. Onboarding steps

1. Confirm the candidate is neutral-medium and low/no gated-cosmetics (§2).
2. In that user's browser (on their device, while signed in) run **one** of:
   - Console: `localStorage.setItem("avatar_r2","1")` then reload.
   - Enable bookmarklet: `javascript:(function(){localStorage.setItem('avatar_r2','1');location.reload();})();`
   - Opt-out bookmarklet: `javascript:(function(){localStorage.removeItem('avatar_r2');location.reload();})();`
   - (Do **not** ship a UI toggle yet.)
3. Verify: the avatar on hub/quiz/avatar pages shows the decomposed R2 stack (base `…-r2/base/…v2.webp`),
   the eyes **blink**, and equipped aura/back still show.

> **Boundary:** the key lives in `localStorage`, which is **per-browser/per-device** — it cannot be
> set remotely. Onboarding is the pilot user running the one-liner in their own browser. There is no
> server-side pilot state.

## 5. Rollback

- **Per user:** clear the key (`localStorage.removeItem("avatar_r2")`), reload → back to C2 instantly.
- **Whole pilot:** nothing to roll back globally — `AVATAR_R2` is already `false`; the feature is only
  ever on for browsers that set the key. (Reverting the override capability would be a one-line code
  change to `isAvatarR2()`, but is not needed to stop the pilot.)
- **Bad asset shipped:** the C2 default is untouched regardless; D-062's atomic fallback means even an
  opt-in browser degrades to a clean C2 avatar until the asset is fixed.

## 6. Guardrails

- **Do not flip `AVATAR_R2 = true`** (that enables it for every eligible neutral-medium browser at once —
  not a pilot).
- **No DB cohorting / no percentage rollout** exists in code — a real allowlist/percentage rollout would
  need a code change to `isAvatarR2()`; today it is per-browser opt-in or a one-line global flip only.
- Production behaviour for non-pilot users is **unchanged** (C2/SVG, byte-for-byte).
- This is a **controlled pilot of the decomposed Phase-2 stack**, not a global production activation.
- **Activation-readiness audit:** all findings **F1–F5 are closed** (D-062 atomic fallback, D-063 blink
  goldens, D-064 doc refresh, D-065 idempotent reproducer + R2 goldens). F6 is accepted debt (D-061 faint
  arm residual), F7/F8 are LOW. No open blocker remains before a controlled student-facing pilot.

## 7. Pilot log

| # | User | Identity | Cosmetics | Eligibility | Onboarding | Status |
|---|---|---|---|---|---|---|
| 1 | Dedicated **test-student** account (`TEST_STUDENT`, see `.env`) | `body_type=neutral`, `skin_tone=medium` (default) | none equipped | ✅ qualifies (neutral-medium, no gated cosmetics) | `localStorage.avatar_r2='1'` (§4) in that account's browser | **✅ Verified 2026-07-01 (Phase-1 baked base — historical)**; **re-verified for the Phase-2 decomposed stack via the fixture-intercepted activation-readiness audit (2026-07-22): R2 renders on avatar/hub/quiz, base = `…-r2/base/body-neutral-medium-v2.webp`, blink live, no broken images, no C2 fallback.** |

_History: the 2026-07-01 verification was against the Phase-1 baked **PNG** base with a static face. The
current pilot experience is the Phase-2 decomposed **WebP** stack with live blink — verified read-only on
all three surfaces (fixture-intercepted, 0 backend contact) in the activation-readiness audit; render-scale
+ blink open/closed frames are golden-protected (F4/F5). The opt-in remains per-browser `localStorage`
(no server-side state). Add a row per additional pilot user; keep the group small and to the §2 criteria._
