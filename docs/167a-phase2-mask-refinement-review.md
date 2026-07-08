# 167A Phase-2 — D-042 Neutral-Outfit Mask-Refinement Tooling Review / Sign-off

**Status: TOOLING REVIEW — PASS / owner-review-ready.** _(assistant review 2026-07-08)_

> **This is a TOOLING review only. It is NOT a Gate-2 pass.** Gate 2 remains **REOPENED / UNDER
> RECOVERY** and is **NOT satisfied**. Gate 3 remains **PAUSED**. **No AI / ComfyUI was run. No neutral
> outfit was executed. No completed/final base exists.** The masks are **refined review-only proposals**
> (gitignored), still human-review-gated before any masked edit. No runtime promotion, no
> `assets/avatar-r2/` write, no `R2_MANIFEST` change, `AVATAR_R2` = `false`.

_Review of the merged tool (`tools/avatar/build-neutral-outfit-mask-refinement.mjs`, PR #29), run fresh on
`main` via `npm run avatar:mask-refinement` (exit 0). Documentation only._
_Plan: [`167a-phase2-neutral-outfit-base-assembly-plan.md`](./167a-phase2-neutral-outfit-base-assembly-plan.md).
Predecessor tooling: [`167a-phase2-base-assembly-masks-review.md`](./167a-phase2-base-assembly-masks-review.md)
(the approximate proposals this tool refines). Policy: **D-042** (`project-state.md`)._

---

## 1. What this tool is

Deterministic, **NON-AI** refinement of the **approximate** outfit mask proposals from
`build-base-assembly-masks.mjs` (PR #26) into **edit-ready** masks + a per-region **prompt pack** for the
*later, separately-approved* AI-assisted **masked** edit (D-042). It runs no AI/ComfyUI, executes no neutral
outfit, and produces no completed base. It directly closes the base-assembly review's §6 caveat (the star /
cuff-stripe / cargo-pocket / dark line-art **gaps** in the colour-based proposals).

**Method (per garment region):** colour seed → morphological **close** (`closeIters=6`, swallows the interior
gaps) → **hole-fill** (clipped to the below-seam Master body) → **connected-components keep**
(`keepMinPx=200`, drops speckles) → **feather** dilation (`featherIters=4`, inpaint blend band). All garment
masks are clipped to the **below-seam body**, where Strategy-B sources every garment pixel from the Master;
the above-seam recovery head/neck is **protected** and reconciled only by the neck-seam feather band.

## 2. Report metrics (from `mask-refinement-report.json`)

| Metric | Value | Assessment |
|---|---|---|
| Seeds (approximate) | sweater **99,116** · navy cargo **75,479** · shoes-zone **52,779** px | ✅ inherited from the reviewed base-assembly logic |
| Top edit mask | **96,171 px**, bounds x315–709 y560–906 | ✅ sweater body, star swallowed, below the seam |
| Underarm reconstruct mask | **29,677 px**, x308–714 y756–944 | ✅ forearm/lower-sleeve band (own sub-gate) |
| Trousers edit mask | **100,045 px**, x358–661 y850–1303 | ✅ cargo pocket swallowed by hole-fill |
| Shoes edit mask | **53,584 px**, x310–704 y1296–1510 | ✅ feet zone, footprint = Master |
| Outfit-edit union | **273,197 px** | ✅ solid, gap-free, feathered |
| Protect mask (identity-lock) | **115,660 px** | ✅ head/face/scalp/ears/neck + hands/skin |
| Neck-seam feather band | **12,963 px** (y540–580) | ✅ grey-on-grey collar/neck blend |
| Identity-lock | outfit-edit ∩ head zone = **0 px** (tool refuses otherwise) | ✅ hard-asserted clean |
| Figure partition | protect 115,660 + outfit 273,197 = **388,857 px** | ✅ **exactly** the base-assembly figure (master 296,520 + head 92,337) |
| Master sha guard | `2ca10ef8…` asserted (D-032) | ✅ canonical datum preserved |
| `AVATAR_R2` (read-only) | **false (unchanged)** | ✅ |

## 3. Generated review-only artifacts (gitignored, `tools/avatar/build/phase2/mask-refinement/`)

`top-edit-mask.png` · `trousers-edit-mask.png` · `shoes-edit-mask.png` · `underarm-reconstruct-mask.png` ·
`outfit-edit-mask.png` (union) · **`protect-mask.png`** (identity-lock) · `neck-seam-feather-mask.png` ·
`outfit-edit-over-master.png` · `protect-over-master.png` · `mask-refinement-report.json` ·
**`d042-neutral-outfit-prompt-pack.md`** (per-region prompts + identity-lock + workflow).

## 4. Visual evaluation

- **`outfit-edit-over-master`** — the green *top* mask covers the whole sweater body and has **swallowed the
  interior orange star** (the colour proposal missed it; the hole-fill captures it). The blue *trousers* mask
  has **swallowed the cargo pocket**. Orange marks the forearm reconstruction band on both arms; magenta the
  shoes. Solid, gap-free regions — the intended improvement over the approximate proposals. ✅
- **`protect-over-master`** — head, face, and **both hands** render green (frozen); only the garments are red
  (editable). The identity-lock is visually correct: nothing the edit may touch overlaps the head or hands. ✅
- **Seam handling** — garments start at the seam (y560); the y540–580 feather band bridges to the protected
  recovery neck. No garment mask intrudes the head zone (0 px, asserted). ✅

## 5. Validation checklist

- [x] `node --check` OK; `npm run avatar:mask-refinement` exit 0 (re-run on `main`, deterministic — identical
      px counts across runs)
- [x] All 11 artifacts present under `tools/avatar/build/phase2/mask-refinement/`
- [x] Artifacts **gitignored and unstaged** (`git status -- tools/avatar/build/` empty)
- [x] Report + prompt-pack exist and contain the required fields (method/params, seeds, per-mask bounds/px,
      identity-lock, underarm risk note, reference statement, guardrails, gate status)
- [x] Master sha-guard enforced (D-032); both inputs validated 1024×1536; reference files unread for geometry
- [x] **Identity-lock hard-asserted:** outfit-edit ∩ head = 0 px (the tool refuses on any intrusion)
- [x] No runtime files changed · no `assets/avatar-r2/` · no `R2_MANIFEST` · `AVATAR_R2 = false`
- [x] `build-face-clean.mjs` / `wip/save-build-face-clean` not used; Gate 3 untouched (head stays bald + blank)
- [x] Gate 2 remains REOPENED / UNDER RECOVERY (not satisfied); Gate 3 remains PAUSED

## 6. Verdict

**Tooling review: PASS — owner-review-ready.** The refinement behaves exactly as the plan and D-042 require:
it turns the approximate colour proposals into solid, gap-filled, feathered edit masks; adds an explicit,
hard-asserted **identity-lock** (protect mask + 0-px head intrusion) that operationalises D-042's masking
constraint; and emits a per-region prompt pack for the later masked edit. Metrics and visuals agree; the
figure partition matches the base-assembly figure exactly; every guardrail held.

## 7. Risks / caveats

- **Masks are refined review-only proposals, NOT final** — human confirmation is still required before any
  masked edit.
- **Underarm reconstruction stays the highest-risk sub-area** (invented forearm skin under the short-sleeve
  tee) and keeps its **own sub-gate** in the later implementation. The underarm band position is inherited
  from the base-assembly approximate constants.
- Minor colour-boundary noise may remain at garment edges (the connected-components keep drops speckles
  ≥200 px, not sub-threshold edge irregularities).
- The prompt pack **executes nothing** — it is deterministic PREP for a later, separately-approved AI step.

## 8. Next step (after owner accepts this tooling review)

**AI-assisted masked neutral-outfit candidate execution** (D-042; masked edits only, protect-mask enforced,
identity preserved), starting from these refined masks — including the **underarm sub-gate** — followed by the
fresh **164B.3** review + composed **visual sign-off** (Gate 5) that could let Gate 2 pass. **Not**
face/eyes/eyelid/hair (Gate 3 stays PAUSED until Gate 2 is resolved).

## 9. CI note (out of scope for D-042)

While landing PR #29, CI's `npm ci` step was found broken repo-wide since 2026-07-06 (the lockfile predated the
`tools/*` workspaces). That was fixed at the root cause in **PR #30** (`package-lock.json` sync; no dependency
version change). The **remaining** red check — `global-setup: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing
in .env` — is a **pre-existing, owner-only infra/security decision** (GitHub Actions secrets are not
provisioned), **unrelated to the D-042 mask-refinement code**, and is deliberately **not** addressed in this
task. It requires a separate owner-level decision to provision `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
