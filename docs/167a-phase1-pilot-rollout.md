# 167A — Avatar R2 Pilot Rollout (AVATAR_R2 opt-in)

Status: **`PILOT_WAVE_1_IN_PROGRESS` (2026-07-27, D-078) — 1 participant `ONBOARDED`.** The test-student
passed the full persistent-browser onboarding gate (§8) in an owner-witnessed manual run (Chrome / desktop);
Wave 1 is now in progress (1 of target 3, max 5). `AVATAR_R2 = false` by default (production unchanged); no
broad activation, no global flag-flip — R2 is on only for browsers that set the per-browser opt-in.
Originally written 2026-07-01 for Phase-1; **refreshed 2026-07-23 (D-064)** for the Phase-2 decomposed stack;
**operationalized 2026-07-26 (D-071** raster debt accepted **/ D-072** onboarding protocol + status
correction); **Wave 1 started 2026-07-27 (D-078)**. Owner: project owner.
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

## 2. Pilot group selection criteria (CORRECTED 2026-08-02, D-093)

> **This section was stale and is now corrected.** It stated that the slot-gate renders "only aura/back",
> which stopped being true at **D-079** (headwear), **D-080** (eyes/glasses), **D-081** (face/mask) and
> **D-090** (torso). Wave 1's cohort was therefore selected against a rule that had already been
> superseded — harmless in practice, because excluding cosmetics is stricter than reality, but it would
> have wrongly excluded eligible users from Wave 2. The criteria below reflect what the runtime does today.

To avoid visible cosmetic loss and inconsistent fallback, pick pilot users who are:

- **Neutral / medium avatar identity** — only `neutral`+`medium` resolves the raster stack; other
  body types / skin tones fall back to C2 (the pilot would see no change), so include only neutral-medium.
  The gate is manifest-key based, so a manipulated client cannot force R2 on an unsupported identity.
- **Cosmetics: what renders on R2 today** — `aura`, `back` (behind the figure, unchanged), `headwear`
  (D-079), `eyes`/glasses (D-080), `face`/mask (D-081), and `torso` **for `armor-knight` only** (D-090:
  that slot is gated per ITEM, and the Ridderdragt is the only item with R2 artwork).
- **What still forces the whole avatar to C2** — `neck` and `body` (no catalog items exist, D-082), and
  **any future torso item without R2 artwork**. A user who equips one of those sees the complete C2
  avatar with the item visible — never a partial stack, never a missing paid item (D-083).
- **Nothing a user owns can silently vanish.** That is the D-083 guarantee, and it is what makes it safe
  to stop screening on cosmetics: the worst case is "this user sees C2 instead of R2", not "this user
  lost an item they paid for".

A user meeting the identity criterion gets a clean experience; which cosmetics they own now changes only
**whether** they see R2, never whether they see their items.

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

**Overall pilot status: `PILOT_WAVE_1_IN_PROGRESS` — 1 participant `ONBOARDED` (2026-07-27, D-078).**
- The pilot **mechanism is ready** (per-browser opt-in, whole-stack-or-C2 fallback).
- The **raster debt is accepted** (D-071).
- **Participant #1 (test-student) is `ONBOARDED`** — the full persistent-browser gate (§8) passed in an
  owner-witnessed manual run (Chrome / desktop): opt-in survived a real browser close-and-reopen, `renderPath`
  stayed `r2` on avatar/hub/quiz with no mixed stack, and opt-out was demonstrated (see §15 row 1).
- **Wave 1 target 3, max 5** — onboard further users one at a time via the §8 gate.
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

## 7b. Wave 2 — definition (D-093, 2026-08-02)

**Status: `PILOT_WAVE_2_DEFINED — NOT STARTED`. Wave 2 does not open until Wave 1 closes (§7b.1).**

Wave 2 exists because Wave 1 **cannot answer the question that now matters**. Wave 1's cohort was
selected to own no cosmetics, so it exercises the bare figure only. Everything wired since — headwear,
glasses, masks, and above all the Ridderdragt (D-085…D-092) — is unobserved by a real user in a real
browser. Wave 2 is the cosmetic wave.

### 7b.1 Entry condition — binding

Wave 2 **may not begin** until **all** of:

1. Wave 1 reaches a **§13 final classification** of `PILOT_PASS` or `PILOT_PASS_WITH_DEBT`.
   (Today: `PILOT_WAVE_1_IN_PROGRESS`, **1 participant of target 3** — Wave 1 is not complete.)
2. Wave 1's §9 exposure is met by its participants: 7 calendar days, ≥3 real sessions, ≥1 observed
   session each on quiz, hub and avatar.
3. **No open `BLOCKING` finding and no unresolved `MAJOR` finding** from Wave 1.
4. The owner records the Wave-1 classification and an explicit **Wave 2 GO** in §15.

A `PILOT_FAIL` or an active §12 abort **closes the track**; Wave 2 does not follow automatically.

### 7b.2 Scope

- **Target 3 participants; maximum 5** without a new owner decision — the same shape as Wave 1,
  deliberately not larger. Wave 2 adds a new *dimension* (cosmetics), not a new *scale*.
- **One primary browser/device per user.**
- Onboarded **one at a time** via the §8 persistent-browser gate (D-073 kit), each recorded in §15.
- **At least one participant must own and equip the Ridderdragt** — otherwise Wave 2 fails to test the
  thing it exists for. If no eligible student owns it, the owner may use an internal test account.
- **At least one participant should own a headwear/eyes/face item**, so the re-seated slots are observed
  alongside the swapped-asset slot.
- Prefer **internal test accounts or closely supervised users**. No whole class, no public rollout.

### 7b.3 What Wave 2 must observe (in addition to §10)

- The **Ridderdragt renders on the R2 figure** on avatar, hub and quiz — not the C2 SVG.
- **No mixed stack** with the garment equipped.
- **Equip / unequip** the armour repeatedly: R2 returns cleanly, no sticky layer.
- The garment reads correctly at the user's **real surface sizes**, including the smallest — the
  D-091 observation (at small sizes the armour approaches the base tee) is a **known, accepted**
  characteristic; record whether real users notice it, but it is **not** a defect.
- **Other cosmetics** (hat / glasses / mask) render together with the armour, correct z-order.
- If a user equips a `neck`/`body` item or a future unwired torso item: the **whole avatar falls to C2
  with the item visible** (D-083). Observing this once is valuable; it is correct behaviour, not a fault.

### 7b.4 Wave-2-specific abort triggers (in addition to §12)

Pause immediately on: an **R2 figure rendering without an equipped item** (the D-082 defect returning) ·
the armour rendering on the **wrong anatomy** or clipping the arms · a **partial** stack with any
cosmetic equipped · the garment failing to load without the whole avatar falling back · **equip/unequip
leaving a stale layer**.

### 7b.5 Mechanism — unchanged, and deliberately so

- **Per-browser opt-in only** (`localStorage.avatar_r2 = "1"`), exactly as Wave 1.
- **`AVATAR_R2` stays `false`.** Flipping it is **not** a way to run a wave: it enables R2 for every
  eligible browser at once (§6), which is broad activation, not a pilot.
- **No allowlist** — `NO_ALLOWLIST_FOR_PILOT` (D-075) still holds. A client-side UID list would ship
  children's identifiers to the public bundle. If central enablement is ever wanted, it is a
  **server-side eligibility flag** and its own audited track.
- No UI toggle, no DB cohort, no percentage rollout.

### 7b.6 Owner decisions still open

These are **not** set by this definition and must be recorded in §15 before Wave 2 starts:

| decision | default proposed here |
|---|---|
| Wave 1 final classification | — (owner) |
| Wave 2 GO | — (owner) |
| Participant count | target 3, max 5 |
| Duration | 7 calendar days (as §9) |
| Who supplies a Ridderdragt-owning participant | — (owner) |

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

**Optional observability (designed D-074, IMPLEMENTED D-076).** A privacy-safe, console-only, pilot-gated
render signal (R2 / C2-fallback / render-failed) is designed in
[167a-r2-pilot-observability-design.md](./167a-r2-pilot-observability-design.md) and shipped in D-076. It is
**advisory only**: manual onboarding (§8, D-073) can be completed **without** it, and it must **never** be a
condition for R2 rendering. (During the D-078 onboarding it emitted the expected `avatar_r2_render` events on
the opt-in browser.) `AVATAR_R2` stays `false`.

**Allowlist enablement (audited — DEFER for the pilot, D-075).** Central per-account enablement was audited in
[167a-r2-pilot-allowlist-design.md](./167a-r2-pilot-allowlist-design.md). Recommendation:
**`NO_ALLOWLIST_FOR_PILOT`** — for Wave 1, keep the per-browser opt-in via the D-073 kit (zero PII, no code
change). A client-side student-UID list is **rejected** (it would ship children's identifiers to the public
bundle); if central enablement is ever needed at scale, use a **server-side eligibility flag**, never a
client UID list. `AVATAR_R2` stays `false`; pilot status unchanged.

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
| 1 | Dedicated **test-student** account (`TEST_STUDENT`, see `.env`) · browser **Chrome** · **desktop** | `body_type=neutral`, `skin_tone=medium`, `hairstyle=default` | `equipped_slots={}` (none) | ✅ neutral-medium, no gated cosmetics | ✅ **established (2026-07-27)** — full §8 persistent-browser gate passed | **`ONBOARDED` (2026-07-27, D-078).** Manual persistent-browser onboarding completed in an **owner-witnessed step-by-step run** (D-073 kit) in a **normal persistent Chrome profile on desktop** (not incognito/guest). Proof: **browser-local opt-in activated**; **Fase A** — `renderPath=r2` with no C2 `.svg` mixing and no broken images on **avatar, hub and quiz**; **persistence gate** — the browser was **fully closed (normal, not forced)** and the **same profile reopened**, and the **browser-local opt-in persisted after the full browser restart** with `renderPath` still `r2` on all three surfaces; **opt-out demonstrated and opt-in restored** (the avatar fell back to the C2 render, the app stayed functional, then R2 was restored). **No code, backend, database, account-profile or user-record changes; only browser-local pilot opt-in state was changed.** No account identifiers were recorded. _Earlier: `LIVE_VERIFIED_IN_EPHEMERAL_TEST_BROWSER` (2026-07-26, D-072); ✅ 2026-07-01 (Phase-1, historical); re-verified 2026-07-22 via the fixture-intercepted activation-readiness audit._ |

_The opt-in remains per-browser `localStorage` (no server-side state). A user reaches `ONBOARDED` only via
the §8 persistent-browser gate. Add a row per user using the §11 data-minimal fields; keep Wave 1 to §7/§9._

**Next concrete step:** Wave 1 is in progress with participant #1 (`ONBOARDED`, D-078). Onboard up to the
target of 3 (max 5) further users **one at a time** via the §8 persistent-browser gate (D-073 kit), each
recorded here with the §11 data-minimal fields; observe against the §10 success criteria and §9/§12 exposure
& duration, and pause on any §12 abort trigger. `AVATAR_R2` stays `false` (per-browser opt-in only).

**Wave 2 is DEFINED but NOT STARTED (§7b, D-093).** It is the cosmetic wave — Wave 1's cohort owns no
cosmetics, so the Ridderdragt and the re-seated slots are still unobserved by a real user. Wave 2 opens
only after Wave 1 reaches a §13 classification of `PILOT_PASS` / `PILOT_PASS_WITH_DEBT` with its §9
exposure met and no open BLOCKING/MAJOR finding, and only on an explicit owner GO recorded here.

**Wave 2 GO log** (fill in when Wave 1 closes):

| field | value |
|---|---|
| Wave 1 final classification (§13) | _(pending)_ |
| Wave 1 exposure met (§9) | _(pending)_ |
| Open BLOCKING / MAJOR findings | _(pending)_ |
| Wave 2 GO | ☐ GO · ☐ NO-GO — _(owner, date)_ |
| Participant count agreed | _(pending — proposed: target 3, max 5)_ |
| Ridderdragt-owning participant | _(pending)_ |
