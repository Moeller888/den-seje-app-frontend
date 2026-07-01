# assets/avatar-r2/ — North Star Master raster assets (167A)

Runtime home for the **raster (WebP)** North Star Master avatar layers. Created as the
Section 167A **step-1 scaffold** (`docs/167a-master-asset-raster-wiring-plan.md` §I.1).

**Status: EMPTY / awaiting art.** No WebP has been produced yet. The Master raster base
is a **human paint-over deliverable** (decision D-033 — AI generation is rejected) and
**gates the visual migration** (167A step 2). Until the art ships and the manifest in
`js/avatar-layers.js` (`R2_MANIFEST`) is populated, the raster resolvers return `null` and
the avatar renders via the existing C2/SVG path. Raster is **off** (`AVATAR_R2 = false`).

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
