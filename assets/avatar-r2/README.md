# assets/avatar-r2/ — North Star Master raster assets (167A)

Runtime home for the **raster (WebP)** North Star Master avatar layers. Created as the
Section 167A **step-1 scaffold** (`docs/167a-master-asset-raster-wiring-plan.md` §I.1).

**Status: Phase-1 base SHIPPED as a temporary PNG preview + wired (step 3a).**
`base/body-neutral-medium-v1.png` is present and registered in `R2_MANIFEST`
(`base: { "neutral-medium": { v:1, ext:"png" } }`). The render (`mountC2Avatar`) uses it **only when
`AVATAR_R2` is true** — which is **`false` by default**, so production still renders via the untouched
C2/SVG path. Flip `AVATAR_R2` locally to preview.

**⚠️ The PNG is a TEMPORARY preview/fallback. WebP is the production target** (D-013). The PNG is the
deterministic alpha-cut of the Master (`tools/avatar/extract-master-base.mjs`) — no image dependency
needed to ship it. To switch to WebP later: encode `…-v2.webp`, drop it here, and change the manifest
entry to `{ v: 2, ext: "webp" }` (new version — never mutate a shipped asset, D-018).

**WebP encoder AVAILABLE (2026-07-18; supersedes the 2026-07-01 "no encoder" deferral).**
The repo has a **vendored libwebp `cwebp.exe` 1.5.0** (`tools/avatar/vendor/`, gitignored,
reproducibly fetched by `node tools/avatar/fetch-cwebp.mjs`) plus the deterministic wrapper
`tools/avatar/encode-webp.mjs` (q90 / alpha_q100 / -m6 / -metadata none, `--half` → 512×768).
**No external npm/system dependency was added.** Status:
- **The Phase-1 PNG (`…-v1.png`, ~244 KB) is still the manifest-registered runtime base** —
  swapping it remains a separate, gated wiring step (D-018: new version, never mutate).
- The **Phase-2 neutral layer set is encoded and promoted as tracked WebP files** (see
  `docs/167a-phase2-gate3-neutral-asset-promotion.md`) — present here but **NOT registered
  in `R2_MANIFEST` and not loaded by the app** until the separately gated manifest/wiring PRs.

**Execution path LOCKED (2026-07-01): D-040 Phase-1 "Master-as-is"** (163F Phase-2 decomposition
deferred). The base is the **full Master avatar baked** (skin+body+face+eyes+hair+outfit) — mechanical /
geometry-preserving, **not** AI regeneration and **not** the D-033 manual paint-over (that governs the
deferred Phase-2 *decomposed* base). Wiring detail: `../../docs/167a-step3-render-wiring-plan.md` §4/§15.

## Expected layout & naming (ADR-163D/163F, §C of the 167A plan)

Served WebP at **512×768** (from the 1024×1536 master), transparent background, full-canvas:

```
assets/avatar-r2/
  base/    body-{body_type}-{skin_tone}-v{n}.webp   (per skin tone)
  face/    face-{expression}-v{n}.webp              (shared)
  eyes/    eyes-{set}-{iris|fixed}-v{n}.webp         (shared)
  eyelid/  eyelid-{skin_tone}-v{n}.webp             (per skin tone)
  hair/    hair-northstar-v{n}.webp                 (shared)
```

When a layer is produced: drop the WebP here and register its version in `R2_MANIFEST`
(and bump `version`). The matching resolver (`baseSrcForR2`, `faceSrcForR2`, `eyesSrcForR2`,
`eyelidSrcForR2`, `hairSrcForR2`) then returns a real path — ready for step-3 render wiring.
Assets are immutable + versioned by filename (D-018); never mutate a shipped asset.
