# assets/avatar-r2/ — North Star Master raster assets (167A)

Runtime home for the **raster (WebP)** North Star Master avatar layers. Created as the
Section 167A **step-1 scaffold** (`docs/167a-master-asset-raster-wiring-plan.md` §I.1).

**Status: EMPTY / awaiting the first asset.** No WebP produced yet. Until the manifest in
`js/avatar-layers.js` (`R2_MANIFEST`) is populated, the raster resolvers return `null` and the
avatar renders via the existing C2/SVG path. Raster is **off** (`AVATAR_R2 = false`).

**Execution path LOCKED (2026-07-01): D-040 Phase-1 "Master-as-is" first** (163F Phase-2 decomposition
deferred). The **first required asset** is the baked base:

> `base/body-neutral-medium-v1.webp` — an **alpha-cut of `../avatar/reference/Northstar Master.png`**
> (white matte → transparent), resized to **512×768**, WebP; the **full Master avatar baked**
> (skin+body+face+eyes+hair+outfit). Mechanical / geometry-preserving — **not** AI regeneration and
> **not** the D-033 manual paint-over (that governs the deferred Phase-2 *decomposed* base). Register it
> as `R2_MANIFEST.base = { "neutral-medium": 1 }`, `version: 1`. Full detail:
> `../../docs/167a-step3-render-wiring-plan.md` §15.

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
