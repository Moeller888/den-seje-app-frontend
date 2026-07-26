# 167A — Avatar R2 Pilot Rollout (AVATAR_R2 opt-in)

Status: **`AUTHORIZED_BUT_NOT_STARTED` (2026-07-26, D-072).** The pilot mechanism is ready and R2 is
**live-verified technically** on production, but **no user is yet documented as a persistent pilot
participant** — Wave 1 begins only after the persistent-browser onboarding gate (§8). `AVATAR_R2 = false`
by default (production unchanged); no broad activation. Originally written 2026-07-01 for Phase-1;
**refreshed 2026-07-23 (D-064)** for the Phase-2 decomposed stack; **operationalized 2026-07-26 (D-071**
raster debt accepted **/ D-072** onboarding protocol + status correction). Owner: project owner.
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
  — but the re-audit triggers in §14 are binding pilot guardrails.

## 7. Pilot GO — authorization, status & Wave 1 scope (D-071 / D-072)

**Overall pilot status: `AUTHORIZED_BUT_NOT_STARTED`.**
- The pilot **mechanism is ready** (per-browser opt-in, whole-stack-or-C2 fallback).
- R2 is **live-verified technically** on production (see §15 row 1) — this is a technical render proof, **not**
  onboarding.
- The **raster debt is accepted** (D-071).
- **No user is yet documented as a persistent pilot participant.**
- **Wave 1 begins only after** the persistent-browser onboarding gate (§8).
- **`AVATAR_R2 = false`** — no broad activation.

**Live verification ≠ onboarding (D-072).** A live R2 render proven in an **ephemeral, automated browser
context** — with no persistent profile and no evidence the opt-in survives a browser restart — is classified
**`LIVE_VERIFIED_IN_EPHEMERAL_TEST_BROWSER`**. It is **not** `ONBOARDED` and **not** real pilot participation.

**Still forbidden (unchanged guardrails, §6):** do **not** flip `AVATAR_R2 = true`; do **not** ship a UI
toggle; no DB cohort / percentage rollout. Those belong to the separate **broad R2 activation** track.

**Wave 1 scope:**
- **Target 3** pilot users; **maximum 5** without a new owner decision.
- **One primary browser/device per user** in the first wave.
- Users onboarded **one at a time**, each confirmed against the §2 eligibility criteria (neutral-medium
  identity, no gated head/face/eye/clothing cosmetics) **before** onboarding.
- **No whole class, no public rollout, no automatic cohort.** Prefer **internal test accounts or closely
  supervised users**.
- The **test-student may be participant #1**, but only **after** it passes the persistent-browser gate (§8).
- **Grow only on clean signal:** expand toward the maximum only after the current cohort reports clean (§10).

## 8. Persistent-browser onboarding gate (D-072) — binding

A user may be classified **`ONBOARDED`** only after **all** of the following are performed in the **actual
persistent browser profile that will be used during the pilot**. An **automated Playwright verification does
not by itself satisfy this gate.** **Copy-ready procedure (D-073):**
[167a-persistent-browser-onboarding-kit.md](./167a-persistent-browser-onboarding-kit.md) — the manual,
step-by-step execution of this gate (Fase A, the persistence-gate, the opt-out demo, and the `ONBOARDED`
decision box).

1. Eligibility verified (§2).
2. The user signs in to the **persistent pilot browser**.
3. The existing **enable** command is applied (§4).
4. The page is reloaded.
5. R2 is verified on **avatar, hub and quiz**.
6. The browser is **fully closed**.
7. The browser is **reopened with the same profile**.
8. The user signs in again if necessary.
9. The **opt-in is confirmed still present**.
10. **`renderPath=r2`** is confirmed.
11. **No mixed C2/R2 stack** is confirmed.
12. The **opt-out** procedure is demonstrated.
13. The onboarding is recorded **without personal/sensitive data** (§11 / §12 rules).

Until steps 6–10 pass, the user's status is at most **`PERSISTENT_ONBOARDING_PENDING`**.

## 9. Duration & minimum exposure

- **7 calendar days** per first pilot wave.
- **≥ 3 real app sessions** per user.
- **≥ 1 observed session on quiz**, **≥ 1 on hub**, **≥ 1 on the avatar page**.
- **≥ 1 desktop observation**; **mobile observation** when the user normally uses mobile.
- Seven days **without real use does not count** as a completed pilot.

## 10. Success criteria

Technical **and** operational success requires **active observation or concrete feedback** — the **absence of
error reports alone does NOT count as success**. Minimum requirements:
- persistent opt-in works **after a browser restart**;
- R2 renders on **avatar, hub and quiz**;
- **no mixed C2/R2 stack**;
- **no broken mandatory layers**;
- **correct, consistent avatar identity**;
- **neutral, proud, curious, focused and determined** expressions work when triggered;
- **blink** works; **breathing** works; expression / blink / breathing **do not visually conflict**;
- **whole-stack-or-C2 fallback** works;
- **D-071 raster residuals are not visible** in normal use;
- **no user-blocking layout faults**;
- **opt-out verified** on at least one pilot browser;
- **user / observer feedback recorded**.

## 11. Feedback log template (data-minimal)

Record per pilot user using only these data-minimal fields (see §12 privacy rules):
anonymous pilot-id · onboarding date · browser · device type · desktop/mobile · eligibility verified ·
persistent onboarding verified · browser-restart verified · R2 on avatar · R2 on hub · R2 on quiz ·
expressions observed · blink observed · breathing observed · fallback observed · visual issues ·
functional issues · user's short assessment · observer's assessment · severity · opt-out verified ·
session count · final status · follow-up needed.

**Severity vocabulary (only):** `INFO` · `MINOR` · `MAJOR` · `BLOCKING`.

**The log must NEVER contain:** full name · email · UID · passwords · tokens · `localStorage` contents ·
any unnecessary personal data.

**Optional observability (designed, NOT implemented — D-074).** A privacy-safe, console-only, pilot-gated
render signal (R2 / C2-fallback / render-failed) is **designed** in
[167a-r2-pilot-observability-design.md](./167a-r2-pilot-observability-design.md) and awaits an owner
decision. It is **advisory only**: manual onboarding (§8, D-073) can be completed **without** it, and it must
**never** be a condition for R2 rendering. Pilot status stays `AUTHORIZED_BUT_NOT_STARTED`; the test-student
stays `LIVE_VERIFIED_IN_EPHEMERAL_TEST_BROWSER`; `AVATAR_R2` stays `false`.

## 12. Abort criteria

Pause the pilot **immediately** on any of: a mixed C2/R2 stack · wrong avatar identity · broken/missing
mandatory layers · rendering that blocks the quiz, hub or avatar page · persistent opt-in not working · the
user cannot opt out · repeated unexpected fallback · material performance regression · material visual
regression · raster fringe becoming visible at 100 % · a privacy/security issue · the user or the
responsible party wanting to stop · a `BLOCKING` finding · repeated `MAJOR` findings.

**On abort:** (1) stop new onboarding; (2) disable the opt-in on affected browsers; (3) confirm C2;
(4) document the incident data-minimally; (5) open a separate defect track; (6) **do not restart the pilot
without a new owner decision.**

## 13. Final classifications

- **`PILOT_PASS`** — no BLOCKING findings; no unresolved MAJOR findings; opt-out works; persistent
  onboarding works; R2 works on all required surfaces; active feedback predominantly positive or neutral.
- **`PILOT_PASS_WITH_DEBT`** — no BLOCKING findings; minor issues documented; normal use not degraded; a
  concrete follow-up plan exists.
- **`PILOT_PAUSED`** — insufficient exposure; insufficient feedback; ambiguous results; the pilot must **not**
  be expanded.
- **`PILOT_FAILED`** — a BLOCKING issue; repeated MAJOR issues; an identity issue; a fallback issue; a
  persistent-onboarding issue; an opt-out issue; a privacy/security issue.

**No classification may automatically set `AVATAR_R2 = true`.**

## 14. Re-audit triggers (D-071 guardrails)

Any of the following **reopens the raster track** (pause onboarding + re-audit at real render scale, using
real app render size as the primary basis): an avatar surface wider than **≈180 CSS-px** · a fullscreen/hero
avatar · a higher actual render/display scale · a dark theme where edges become visible at 100 % · a change
to base/hair/shoe assets · a pilot user seeing fringe in normal use · a device-pixel/render-strategy change.

## 15. Pilot log

| # | Pilot-id | Identity | Cosmetics | Eligibility | Persistent onboarding | Status |
|---|---|---|---|---|---|---|
| 1 | Dedicated **test-student** account (`TEST_STUDENT`, see `.env`) | `body_type=neutral`, `skin_tone=medium`, `hairstyle=default` (read live 2026-07-26) | `equipped_slots={}` (none) | ✅ neutral-medium, no gated cosmetics (from the live profile 2026-07-26) | ⏳ **not established** — persistent-browser gate (§8) steps 6–10 not performed | **`LIVE_VERIFIED_IN_EPHEMERAL_TEST_BROWSER` (2026-07-26, D-072).** R2 was **live-verified on production**: on **avatar, hub and quiz** — `renderPath=r2` (no C2 fallback), base = `…-r2/base/body-neutral-medium-v2.webp`, all six layers present (`base·blush·face·iris·eyes·hair-r2`), no broken images, no C2 `.svg` mixing; neutral-medium eligibility verified. **But** the check ran in a **temporary automated browser context** — **no persistent browser profile was created or documented**, and the `localStorage` opt-in **was not documented to survive a browser close-and-reopen**. Persistent onboarding is therefore **not proven** (this does **not** assert the key was deleted). No user data was changed; no quiz answer was submitted. The account is therefore **not yet an active pilot participant**. _Earlier: ✅ 2026-07-01 (Phase-1 baked base, historical); re-verified 2026-07-22 via the fixture-intercepted activation-readiness audit._ |

_The opt-in remains per-browser `localStorage` (no server-side state). A user reaches `ONBOARDED` only via
the §8 persistent-browser gate. Add a row per user using the §11 data-minimal fields; keep Wave 1 to §7/§9._

**Next concrete step:** run the manual persistent-browser onboarding kit
([167a-persistent-browser-onboarding-kit.md](./167a-persistent-browser-onboarding-kit.md), D-073) for the
test-student in a real persistent browser profile. Until that completes, pilot status stays
`AUTHORIZED_BUT_NOT_STARTED` and the test-student stays `LIVE_VERIFIED_IN_EPHEMERAL_TEST_BROWSER`.
