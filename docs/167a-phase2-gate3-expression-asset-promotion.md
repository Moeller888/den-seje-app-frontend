# 167A Phase-2 Gate 3 — Expression Asset Promotion Worksheet

Status: **✅ OWNER-VISUAL-ACCEPTED → PROMOTED (2026-07-24).** Producer: deterministic allowlist-based
NON-AI promotion (`tools/avatar/promote-expression-layers.mjs`) over the D-042 Master-composite
expression layers. Ordered by owner command 2026-07-24 ("Promovér præcis de fire ejer-godkendte
expression-lag til den trackede Avatar R2-assetstruktur").

**What this promotion IS:** the four **owner-visually-accepted** D-042 expression face layers are
encoded to production WebP with the repo's vendored encoder (same contract as the neutral face) and
committed as **tracked production files** under `assets/avatar-r2/face/`, then **registered in
`R2_MANIFEST`** — but **dormant** (nothing resolves them yet).

**What this promotion is NOT:** the app does **not** render expressions. `faceSrcForR2` is called
**only** with `"neutral"`, so the new entries change **no active behaviour**; `AVATAR_R2` stays
`false`; no expression-selection logic, engine, animation, eligibility or fallback changed. Expression
render wiring is a **separate, separately gated** step with its own owner command.

## 1. Owner decision (binding)

| Expression | Accepted version | Verdict | Note |
|---|---|---|---|
| **proud** | v1 | **OWNER_VISUAL_ACCEPTED** | quiet confident closed-mouth smile |
| **curious** | v1 | **OWNER_VISUAL_ACCEPTED** | *reads slightly more surprised than curious at large size* (accepted as-is) |
| **focused** | v2 | **OWNER_VISUAL_ACCEPTED** | calm friendly concentration (v1 rejected: too stern/sour/worried) |
| **determined** | v2 | **OWNER_VISUAL_ACCEPTED** | calm confident resolve (v1 rejected: too sly/aggressive, crooked smirk) |

**Never promoted:** `focused v1` (OWNER_REJECTED) · `determined v1` (OWNER_REJECTED). The promotion
tool SHA-pins the exact four approved sources and hard-fails on the rejected SHAs, so neither v1 can
be selected by directory order or timestamp.

## 2. Pipeline & encoder (same contract as the neutral face)

- Producer of the layers: **D-042 deterministic Master-composite** (`tools/avatar/build-face-expr-d042.mjs`)
  — AI output is a donor for brows/nose/mouth only; the frozen Master (D-032, `2CA10EF8…`) is
  authoritative outside the write mask (Gate A/B/D passed; owner visual sign-off on top). Model
  provenance: `gpt-image-2-2026-04-21`.
- Encoder: **vendored libwebp `cwebp.exe` 1.5.0** via `tools/avatar/encode-webp.mjs --half`
  (`-q 90 -alpha_q 100 -m 6 -metadata none -mt -resize 512 0`) — the identical lossy production
  contract used for the six neutral layers (`167a-phase2-gate3-neutral-asset-promotion.md` §2).
  `-exact` intentionally off. **No new dependency.**
- **Determinism proven:** each layer encoded twice → byte-identical. All four sources verified
  1024×1536 RGBA with alpha; all four outputs verified **512×768 with alpha**.

## 3. The four promoted production assets

| # | Expression (ver) | Accepted source (gitignored scratch, SHA-pinned) | Source PNG SHA-256 | Destination (tracked) | WebP SHA-256 | Size |
|---|---|---|---|---|---|---|
| 1 | proud (v1) | `…/expr/proud/face-proud-v1-candidate.png` | `2B8D1453AAA7088D498004DD257FA8C174BA6473E9185B0C2D2EDE3E6226B6A3` | `assets/avatar-r2/face/face-proud-v1.webp` | `8BDED8BE7E34FA32AFE707D57D012E38E4CE39B4A4BA5A25752D360331F0D9FE` | 3,336 B |
| 2 | curious (v1) | `…/expr/curious/face-curious-v1-candidate.png` | `C76F57DFE1949D7846CE9980C9E497B14F82A56C3566D71CAE5F466974D86D6B` | `assets/avatar-r2/face/face-curious-v1.webp` | `CC1CA222804AE120DABDC014BB22EF63C6F6190B728418DF8EF2D34692117A5C` | 3,848 B |
| 3 | focused (v2) | `…/expr/focused/runs/2026-07-24T17-37-59.450Z-gpt-image-2-2026-04-21-v2/face-focused-v2-candidate.png` | `C19BFF26F8C34F936BFE053B2409BA57D1E1A7076D79B3C0D8BAE62E6974D5CE` | `assets/avatar-r2/face/face-focused-v2.webp` | `D71F3FEAB0A3505AB94859AAC618072C5558DD55496B0D664C4C60D3D62E4DF9` | 2,736 B |
| 4 | determined (v2) | `…/expr/determined/runs/2026-07-24T17-38-49.052Z-gpt-image-2-2026-04-21-v2/face-determined-v2-candidate.png` | `1F7569AC7D0791ADF1A2B14E13B9BB3499EA03450B4349AE6DA3C99A8D3BA71E` | `assets/avatar-r2/face/face-determined-v2.webp` | `21F0665FBE11BA2CAD63591BC28E63167F9F9C2BA88F98862D988730C883513F` | 3,150 B |

**Budget:** four layers total **13,070 B (≈ 12.8 KB)** — well within ADR-163D (< ~350 KB total,
per-layer ≤ ~50 KB). The version numbers preserve the accepted candidates (proud/curious = v1;
focused/determined = v2); all four are first uses of their filenames (D-018 immutable — no shipped
asset mutated).

**Fidelity:** the promoted WebP is **not byte-identical** to the source — it is a deterministic
lossy (q90) + ÷2 format conversion. Alpha is near-perfectly preserved (mean |Δ| ≈ 0 vs a ÷2
reference of each accepted source); RGB feature-region delta ≈ 16–26 mean (dominated by the
resampler + q90, no re-interpretation). The layers already passed the deterministic
`validate-face-expression.mjs` gate (Gate D) at generation.

## 4. Manifest registration (dormant)

`R2_MANIFEST` (`js/avatar-layers.js`) bumped `version: 3 → 4`; `face` gained
`proud:1, curious:1, focused:2, determined:2` alongside `neutral:1`. **Dormant by construction:**
`faceSrcForR2` is called only with `"neutral"` in the render path, so the neutral stack
(`r2StackSrcsFor`) is byte-for-byte unchanged and no expression asset is ever requested until the
gated wiring step. Unit coverage: `tests/unit/avatar-r2-expressions.test.mjs` (versions, paths,
dormancy, no-v1-leak); full unit suite green (143/143).

## 5. Shared R2 raster artefacts — separate outstanding blocker (NOT addressed here)

Existing visual raster artefacts in the **shared** decomposed R2 stack — around the **eyes**,
**hair/forehead**, **arms** and **shoes** — originate in the shared base/eyes/hair layers, **not**
in these expression layers. This promotion does **not** fix them, does **not** close that separate
visual blocker track, and is **not** an approval of broad R2 activation. No image fix to those areas
was created in this task.

## 6. Small-size legibility (noted for wiring)

At small avatar sizes the facial expression is hard to read from the face alone. A later
expression-wiring step may need supplementary signals (animation, aura, pose, an icon or text
feedback) rather than relying on the face layer at small scale. Recorded here for that decision;
nothing built now.

## 7. Boundaries (binding)

**No runtime render change · no expression-selection logic · no engine/animation change · no
eligibility/fallback change · `AVATAR_R2` = `false` · Northstar Master byte-identical (`2CA10EF8…`) ·
Master/D-057/D-058 and all six neutral layers untouched · no API call · no image generation · no
manual edit/feather/recolour/re-extraction.** Activation is the separately gated expression-wiring
step with its own owner command.
