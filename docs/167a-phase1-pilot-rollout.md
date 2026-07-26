# 167A — Avatar R2 Pilot Rollout (AVATAR_R2 opt-in)

Status: **Pilot AUTHORIZED to begin (2026-07-26, D-071) — enable per pilot user.** `AVATAR_R2 = false`
by default (production unchanged). Originally written 2026-07-01 for Phase-1; **refreshed 2026-07-23
(D-064) for the current Phase-2 decomposed stack** (see the activation-readiness audit; closes finding
F3); **operationalized 2026-07-26 (D-071)** — the render-scale raster-artefact audit closed the last
open concern (§7), so this is now a live GO with defined scope + exit criteria (§8). Owner: project owner.
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
- **Render-scale raster debt accepted (D-071, 2026-07-26):** the shared R2 raster artefacts were measured
  at the app's real render sizes (avatar `180×270`, hub `110×165`/`100×150`, quiz `52×78`) and are all
  `NOT_VISIBLE_AT_REAL_SCALE`; the owner accepted the D-061 residual for this controlled pilot
  (`OWNER_ACCEPTED_FOR_PILOT_WITH_DOCUMENTED_RASTER_DEBT`). The raster artefacts are **no longer a blocker**
  — but the re-audit triggers in §8 are binding pilot guardrails.

## 7. Pilot GO — authorization & scope (D-071)

**Authorization.** The controlled pilot is **authorized to begin (2026-07-26, D-071).** All
activation-readiness findings F1–F5 are closed, F6 is accepted debt, and the render-scale audit confirmed
the shared raster artefacts are not user-visible at the app's real render sizes. This authorizes the
**per-browser opt-in pilot only** — it is **not** a global activation.

**Still forbidden (unchanged guardrails, §6):** do **not** flip `AVATAR_R2 = true`; do **not** ship a UI
toggle; no DB cohort / percentage rollout. Those belong to the separate **broad R2 activation** track, not
this pilot.

**Scope of this pilot:**
- **Start point:** the dedicated **test-student** account (already verified — §9 row 1).
- **Then:** a **small** group of real students (guideline **≈3–8**), onboarded **one at a time**, each
  confirmed against the §2 eligibility criteria (neutral-medium identity, no gated head/face/eye/clothing
  cosmetics) **before** onboarding.
- **Selection owner:** the project owner picks candidates and verifies eligibility (identity token +
  equipped slots) per user.
- **Grow only on clean signal:** expand the group only after the current cohort reports a clean experience
  (§8). Keep it time-boxed and small.

## 8. Success, observation & exit criteria

**Success signals (qualitative — there is no pilot telemetry yet; optional observability is a separate
track).** For each onboarded user, on avatar / hub / quiz:
- the **decomposed R2 stack renders** (base `…-r2/base/body-neutral-medium-v2.webp`);
- the eyes **blink** and breathing runs;
- any equipped **aura/back still shows**;
- **no broken images** and **no half-rendered avatar** (D-062 guarantees clean R2 or clean C2);
- **no report of visible arm fringe** in normal use at the real sizes above.

**Watch / re-audit triggers (binding — pause onboarding + re-audit the raster track on any of, per D-071):**
a new avatar surface wider than **≈180 CSS-px**; a fullscreen/hero avatar; a materially higher actual
display scale; a new dark theme where edges become visible at 100 %; any change to base/hair/shoe assets;
owner or pilot users observing visible fringe in normal use; a device-pixel/render-strategy change that
makes asset edges more prominent. A re-audit must again use real app render size as the primary basis.

**Feedback capture.** No telemetry exists, so collect feedback **out-of-band** (owner asks each pilot user)
and record observations as rows/notes in the §9 pilot log. A lightweight, fail-soft in-app observability
signal (R2-render vs C2-fallback) is an **optional separate track**, not part of this GO.

**Exit / rollback (see §5).**
- **Per user:** clear the key (`localStorage.removeItem("avatar_r2")`), reload → back to C2 instantly.
- **Whole pilot:** nothing global to roll back — `AVATAR_R2` is already `false`.
- **Abort criteria:** any broken-avatar report **not** explained by the D-062 C2 fallback, or **any**
  re-audit trigger firing → pause new onboarding, opt-out affected users if needed, and re-audit before
  resuming.

## 9. Pilot log

| # | User | Identity | Cosmetics | Eligibility | Onboarding | Status |
|---|---|---|---|---|---|---|
| 1 | Dedicated **test-student** account (`TEST_STUDENT`, see `.env`) | `body_type=neutral`, `skin_tone=medium`, `hairstyle=default` (identity read live 2026-07-26) | `equipped_slots={}` (none) | ✅ qualifies (neutral-medium, no gated cosmetics — confirmed from the live profile 2026-07-26) | `localStorage.avatar_r2='1'` (§4) in that account's browser | **✅ ONBOARDED — live production verification 2026-07-26 (D):** signed in as the test-student on `den-seje-app-frontend.vercel.app`, set `avatar_r2='1'`, and confirmed on **avatar + hub + quiz** that `data-avatar-render-path="r2"` (no C2 fallback), base = `…-r2/base/body-neutral-medium-v2.webp`, all six layers present (`base·blush·face·iris·eyes·hair-r2`), **no broken images**, **no C2 `.svg` mixing**. Read-only (login + profile read + render; no answer submitted). _Earlier: ✅ 2026-07-01 (Phase-1 baked base, historical); re-verified 2026-07-22 via the fixture-intercepted activation-readiness audit._ |

_History: the 2026-07-01 verification was against the Phase-1 baked **PNG** base with a static face. The
current pilot experience is the Phase-2 decomposed **WebP** stack with live blink — verified read-only on
all three surfaces (fixture-intercepted, 0 backend contact) in the activation-readiness audit; render-scale
+ blink open/closed frames are golden-protected (F4/F5). The opt-in remains per-browser `localStorage`
(no server-side state). Add a row per additional pilot user; keep the group small and to the §2 criteria._
