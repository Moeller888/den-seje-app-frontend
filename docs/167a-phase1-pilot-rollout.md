# 167A Phase-1 — Pilot Rollout (AVATAR_R2 opt-in)

Status: **Opt-in mechanism live; enable per pilot user.** `AVATAR_R2 = false` by default (production
unchanged). Date: 2026-07-01. Owner: project owner.
Prereq: Phase-1 signed off PASS ([167a-phase1-visual-signoff-checklist.md](./167a-phase1-visual-signoff-checklist.md)).
Related: [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md),
[157r-feature-flags.md](./157r-feature-flags.md).

---

## 1. Mechanism (per-browser opt-in, no cohort/DB)

`isAvatarR2()` (`js/avatar-layers.js`) honours a **per-browser localStorage override**, mirroring
`AVATAR_V2`. Production stays `AVATAR_R2 = false`; a browser opts in explicitly:

- **Enable (this browser):** `localStorage.setItem("avatar_r2", "1")` then reload.
- **Disable / opt-out:** `localStorage.removeItem("avatar_r2")` (or set to anything ≠ `"1"`), reload.

No cohort logic, no DB flag, no global flip. Only browsers that set the key see the raster avatar;
everyone else renders the untouched C2/SVG avatar. Verified end-to-end: no key → C2 `.svg`; `="1"` →
raster `.png`; cleared → C2 `.svg`.

## 2. Pilot group selection criteria (choose carefully)

To avoid visible cosmetic loss and inconsistent fallback, pick pilot users who are:

- **Neutral / medium avatar identity** — only `neutral`+`medium` resolves the raster base; other
  body types / skin tones fall back to C2 (the pilot would see no change), so include only neutral-medium.
- **Not reliant on head/face/eye/clothing cosmetics** — the Phase-1 slot-gate renders **only aura/back**;
  a user who equips a hat/mask/glasses/clothing item would see it **disappear**.
- **Preferably no cosmetics, or only aura/back** — so nothing visibly vanishes.

A user meeting all three gets a clean Phase-1 experience (the Master avatar + any aura/back they own).

## 3. Known Phase-1 characteristics (by design — tell pilot users)

- Avatar art is the **North Star Master** baked base (PNG preview; WebP is the deferred production target).
- **Living face is static** in Phase-1 (expression/blink suppressed over the baked face); breathing stays.
- **Head/face/eye + clothing cosmetics are hidden** on the raster base until the Phase-2 anchor revision.
- **One fixed neutral-medium base** (per-user skin/hair variation is Phase-2).

## 4. Onboarding steps

1. Confirm the candidate is neutral-medium and low/no gated-cosmetics (§2).
2. In that user's browser console: `localStorage.setItem("avatar_r2","1")`, reload. (Or provide a
   one-line bookmarklet; do not ship a UI toggle for Phase-1.)
3. Verify: the avatar on hub/quiz/avatar pages shows the Master raster; equipped aura/back still show.

## 5. Rollback

- **Per user:** clear the key (`localStorage.removeItem("avatar_r2")`), reload → back to C2 instantly.
- **Whole pilot:** nothing to roll back globally — `AVATAR_R2` is already `false`; the feature is only
  ever on for browsers that set the key. (Reverting the override capability would be a one-line code
  change to `isAvatarR2()`, but is not needed to stop the pilot.)

## 6. Guardrails

- **Do not flip `AVATAR_R2 = true`** (that enables it for every eligible user — not a pilot).
- **No DB cohorting / no percentage rollout** in Phase-1.
- Production behaviour for non-pilot users is **unchanged**.
- This is a **preview**, not production activation of the raster avatar, and **not** Phase-2.
