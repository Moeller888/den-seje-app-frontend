# 167A — Master Base Extractor (deterministic, Phase-1 / D-040)

Status: **TOOL implemented + verified.** Produces a review artifact, not a runtime asset.
Date: 2026-07-01. Owner: project owner (solo).
Tool: `tools/avatar/extract-master-base.mjs` · Run: `npm run avatar:extract-master-base`.
Feeds: the Phase-1 first asset from [167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md) §15.

---

## 1. What it does

A **deterministic, non-AI, zero-dependency** (pure Node built-ins) image op that turns the frozen
Tier-0 Master into the Phase-1 "Master-as-is" baked base:

```
assets/avatar/reference/Northstar Master.png  (1024×1536, white-matte, sha256-pinned)
  → verify sha256 (D-032 geometry contract; abort on mismatch)
  → alpha-cut: border-connected white-matte flood-fill → transparent background
               (interior whites — eye highlights, white clothing — preserved)
  → downscale ÷2 (premultiplied 2×2 box average — no edge fringe) → 512×768
  → transparent PNG  →  tools/avatar/build/r2/body-neutral-medium-v1.png  (+ .report.json)
```

It is **not** an AI regeneration and **not** the D-033 manual paint-over (that governs the deferred
Phase-2 *decomposed* base). It only alpha-cuts + downscales the existing Master — geometry preserved.

## 2. Verified

- **Deterministic:** byte-identical output across runs (same input → same PNG sha256).
- **Correct alpha:** corners transparent, figure/head opaque; ~70% of the frame becomes transparent.
- **Output:** `512×768` RGBA PNG, ~242 KB (the final WebP will be smaller).
- **Boundaries honored:** Master read-only; output to the **gitignored** `tools/avatar/build/r2/`
  (a build/review artifact); manifest/flag/runtime untouched (no auto-promote, no activation).

## 3. Why PNG (not WebP) from the tool

WebP encoding can't be done dependency-free, and neither `cwebp` nor `sharp` is installed (the repo's
avatar tooling is strictly zero-dep). So the deterministic core emits a **transparent PNG** (PNG is the
D-013 fallback / review format); the final PNG→WebP encode is a one-liner once an encoder is available.

## 4. Promote pipeline (after human visual sign-off — 167a §E)

1. **Review** `tools/avatar/build/r2/body-neutral-medium-v1.png` — onion-skin vs `Northstar Master.png`;
   check clean alpha edge / no white halo (re-run with `--white <n>` to tune the flood threshold if a
   halo or over-cut appears; default 250).
2. **Encode WebP:**
   `cwebp -q 90 -alpha_q 100 <png> -o body-neutral-medium-v1.webp` (or `sharp`).
3. **Promote** the WebP to `assets/avatar-r2/base/body-neutral-medium-v1.webp`.
4. **Register** in `js/avatar-layers.js`: `R2_MANIFEST.base = { "neutral-medium": 1 }`, `version: 1`.
5. **Wire** — execute 167A step 3a ([167a-step3-render-wiring-plan.md](./167a-step3-render-wiring-plan.md)
   §4/§15) behind `AVATAR_R2` (default-off, C2/SVG fallback intact), then validate + human QA.

## 5. Options

- `--white <0-255>` — white-matte flood threshold (default 250; lower = more aggressive cut).
- `--out <dir>` — output directory (default `tools/avatar/build/r2/`).

## 6. Non-goals

- Not a runtime asset producer (emits a review PNG, not the promoted WebP).
- No manifest registration, no `AVATAR_R2` change, no render wiring (all downstream, gated on sign-off).
- Not Phase-2 decomposition (no per-layer base/face/eyes/hair split — that's the deferred 163F path).
