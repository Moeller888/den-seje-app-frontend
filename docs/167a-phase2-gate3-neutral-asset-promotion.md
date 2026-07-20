# 167A Phase-2 Gate 3 — Neutral Asset Promotion Worksheet (PR A)

Status: **✅ OWNER-COUNTERSIGNED: PASS (2026-07-18).** Date: 2026-07-18. Producer: deterministic
NON-AI tooling (chain regeneration + vendored WebP encode). Ordered by owner command 2026-07-18
("Udfør PR A: deterministisk regenerering, verifikation, WebP-encode og promotion").

**What this promotion IS:** the six owner-countersigned neutral Gate-3 layers (integration
composite worksheet §6, countersigned 2026-07-16) are regenerated from tracked inputs,
byte-verified against the countersigned candidates, encoded to production WebP with the
repo's vendored encoder, and committed as **tracked production files** under `assets/avatar-r2/`.

**What this promotion is NOT:** the app does **not** load these files yet. `R2_MANIFEST` is
untouched (no entry references any of them), `AVATAR_R2` remains `false`, no runtime code
changed, no blink wiring, no expressions. Manifest registration and render wiring are
separate, separately gated steps (PR B / PR C of the deployment-readiness plan).

## 1. Regeneration & byte-verification (proof of reproducibility)

The full deterministic chain was re-run in an **isolated detached git worktree** at commit
`61ceee5` (so the accepted gitignored candidates in the working clone were never written to),
in this authoritative order:

```
node tools/avatar/build-hair-clean.mjs        # WP0 hair (fixture-guarded)
node tools/avatar/build-eyes-clean.mjs        # WP0 eyes → eyes-neutral-fixed.png (+ iris art)
node tools/avatar/build-face-clean.mjs        # WP0 face → face-neutral-v1.png
node tools/avatar/build-hair-pl1-gapfix.mjs   # PL-1 → pl1/hair-pl1-{color,luminance}.png
node tools/avatar/build-hair-pl2-remap.mjs    # PL-2 → pl2/hair-pl2-luminance.png
node tools/avatar/build-eyes-wp2-refine.mjs   # WP2 → wp2/eyes-iris-wp2-luminance.png
node tools/avatar/build-face-plb-blush.mjs    # PL-B → plb/face-blush-multiply-v1.png
```

Every tool's own hard guards passed (gap 0, contamination 0, alpha identity 0, p50 200 in
corridor, centroids ≤ 10 px, symmetry 0.87 — matching the countersigned worksheets), and
**all six regenerated outputs are byte-identical (SHA-256) to the accepted candidates**.
The base layer is the tracked D-057 source itself (no regeneration; SHA verified against
the D-057 register value `2CB93EE0…`).

## 2. Encoder (vendored, documented)

- Encoder: **vendored libwebp `cwebp.exe` 1.5.0** (`tools/avatar/vendor/`, gitignored,
  reproducibly fetched by `node tools/avatar/fetch-cwebp.mjs`; libsharpyuv 0.4.1).
  **No new external dependency was added.**
- Wrapper: `node tools/avatar/encode-webp.mjs <src> <out> --half`
- Effective options: `-q 90 -alpha_q 100 -m 6 -metadata none -mt -resize 512 0`
  (the documented lossy production contract — `167a-master-base-extractor.md` §promote;
  `-exact` intentionally off, so RGB under fully transparent pixels is not preserved).
- **Determinism proven:** every asset was encoded twice; both encodes byte-identical.
- All six sources verified 1024×1536 RGBA; all six outputs verified **512×768 with alpha**
  (VP8X header parse). Same crop/coordinate system — `--half` is the authoritative ÷2 resize,
  no other scaling.

## 3. The six promoted production assets

| # | Layer (z) | Blend mode | Approved source (countersign) | Producer tool | Source PNG SHA-256 | Destination (tracked) | WebP SHA-256 | Size |
|---|---|---|---|---|---|---|---|---|
| 1 | base (z0) | normal | `assets/avatar/reference/neutral-base-v1-gate2-d053.png` — tracked D-057 (D-056/D-057) | Gate-2 chain (tracked source) | `2CB93EE00BE89D16D1B1E9CAE9781B596F931A52FD6F667238C9E9BDA38AFE4B` | `assets/avatar-r2/base/body-neutral-medium-v2.webp` | `0DEA234893361A1D143636178643C3BD8119F1861F398438654E980BD8AC7182` | 23,594 B |
| 2 | blush (z2) | **multiply** (tone-agnostic component) | `plb/face-blush-multiply-v1.png` (PL-B, #83) | `build-face-plb-blush.mjs` | `A13AE58E25E91F32F872ACF350E6978E212E84B263EA3E8CBD237C6C7B3F93DC` | `assets/avatar-r2/face/face-blush-multiply-v1.webp` | `56FEB92524AEB95F95C28E1218CCB93A84A75034EDE9E1159B3685828FA55107` | 1,990 B |
| 3 | face-neutral (z3) | normal | `face-neutral-v1.png` (WP3, #81) | `build-face-clean.mjs` (audited by WP3) | `618FB2815090F1FC0948FCE336639574D2810D17FC82D014AAB727E8F1BF9E21` | `assets/avatar-r2/face/face-neutral-v1.webp` | `BA2B17C3F73F36A19364A4C9C652A9A361FC8C6A9926133D724E506B29547725` | 2,618 B |
| 4 | eyes-fixed (z4) | normal | `eyes-neutral-fixed.png` (WP2, #79; = tracked fixture, byte-identical) | `build-eyes-clean.mjs` | `DECA2C84477F45361E3151A8301CF03592ED3B7976C7C861611BAF57C4D3D585` | `assets/avatar-r2/eyes/eyes-neutral-fixed-v1.webp` | `2B36B88234E65F9C70E5748DEAA1477775E8A15A8B96B98EFD573AEFAB112A99` | 3,922 B |
| 5 | iris luminance (z4) | **multiply × eye token** (D-031) | `wp2/eyes-iris-wp2-luminance.png` (WP2, #79) | `build-eyes-wp2-refine.mjs` | `3969428B6C142D71AA1CFBBBC07B481DE741283EA81227AD6EE180BFB7C013DE` | `assets/avatar-r2/eyes/eyes-neutral-iris-v1.webp` | `0187788C8D2203AA733AEBC18E2F9FD8B6AF6D171D352C8F6A428B12A5D9F1D7` | 1,560 B |
| 6 | hair runtime (z40) | **multiply × `--hair-base` token** (D-031) | `pl2/hair-pl2-luminance.png` (WP1-RR, #77) | `build-hair-pl1-gapfix.mjs` → `build-hair-pl2-remap.mjs` | `89DA08E96668B04266D72FEFF741A6D8F21BFB2A2EEBF7499F0FC6BB4F00FD8B` | `assets/avatar-r2/hair/hair-northstar-v1.webp` | `3EDC70BCC4420516B7B9A17E577147CB4F3A23411111899382F2041E25199055` | 6,626 B |

> **HISTORICAL NOTE — row 1 (base) hash superseded in production (2026-07-20, D-059).**
> The WebP SHA-256 `0DEA2348…` / 23,594 B recorded for
> `assets/avatar-r2/base/body-neutral-medium-v2.webp` above is the **hash of the asset as
> countersigned at Gate-3 promotion**. It is **retained unchanged as historical record** —
> this table documents what was countersigned and must not be rewritten.
> The **current production hash** for that file is
> `3A30D8C7BC29A4813E9F4F2902FED26235B3458A56F733C11067559968DA4F37` / 66,526 B,
> registered in **D-059** (`docs/project-state.md`), which removed an opaque matte rim,
> partial-alpha contamination and detached debris from the runtime asset and re-encoded it
> `-lossless -exact`. **The countersigned source PNG (`2CB93EE0…`, D-057) is unchanged**, as
> are all five other rows. `AVATAR_R2` remains `false`. D-059 is a **temporary runtime
> remediation**; the permanent source-art fix is later 167a work.

All six are **runtime-role** assets. The hair **identity** reference `pl1/hair-pl1-color.png`
(SHA `3FCD7717DE099C1E42CA8686A08790172BE8331D2ECDB092E6CA2EDF0A38A45D`) was used for chain
verification only and is **NOT promoted** (identity/QA reference per the integration
countersign; kept gitignored/regenerable). Master, D-057/D-058 sources, protect mask,
integration composites, heatmaps, tint matrices, small-size previews, eyelid previews, edit
masks and all other review outputs are untouched and not promoted. No source was mutated
or deleted.

**Lossy distortion measured** (same options + `-print_psnr`, informational — the q90 contract
promises no pixel identity): Y/U/V/All-PSNR base 51.8/54.9/55.2/52.6 dB · blush 69.5/70.2/71.1/69.8 ·
face 64.6/65.0/65.2/64.7 · eyes-fixed 62.1/63.2/63.3/62.4 · iris 65.6/—/—/67.3 · hair 55.6/—/—/57.4;
alpha PSNR 99.0 dB (near-lossless alpha) on all six. (The lower RGB-composite figures reported
by cwebp include RGB under fully transparent pixels, which `-exact`-off intentionally discards.)

**Performance (ADR-163D/D-019 budget: total avatar < ~350 KB):** the six WebP files total
**40,310 B (≈ 39.4 KB)** — ~11 % of budget. Per-layer ≤ ~50 KB (D-037): largest layer 23.0 KB. ✔

**Version note (D-018, immutable):** the base is **v2** because `base/body-neutral-medium-v1.png`
(Phase-1 baked Master) is already shipped and must never be mutated; all other files are first
versions (v1) of their names. The Phase-1 v1 PNG remains in place and remains the manifest's
registered base until the separately gated wiring step.

## 4. Owner decisions bound into this promotion

### U1 — neutral default iris = measured Master-brown

**Measured value: `#A34A0F` (rgb 163, 74, 15).** Method (deterministic, reproducible):
least-squares multiply token over the 4,460 countersigned iris pixels —
`token_c = Σ(orig_c · m) / Σ(m²)` with `m` = WP2 luminance map ∕ 255 and `orig` = the WP0
Master-brown iris art (tracked fixture `tools/avatar/fixtures/face-clean/eyes-neutral-iris.png`);
alpha sets are countersigned identical (0 mismatch). Mean reconstruction residual 9.17/255
per channel. This is the token that best reconstructs the Master's own iris through the
D-031 multiply model — i.e. the *measured* Master-brown, registered here **for the later
runtime-wiring step**. No general or user-selectable `EYE_COLOR` token system is created;
the WP2 6-color preview set (incl. preview brown `#6B4226`) remains a proposal only.

### U2 — identity compatibility (exact, no aliasing)

Avatar R2 supports **exactly one** identity combination — the one the owner-countersigned
Master base represents: **`body_type: "neutral"` × `skin_tone: "medium"`** (the literal enum
values in `js/avatar-layers.js`: `BODY_TYPES = ["male","female","neutral"]`,
`SKIN_TONES = ["medium","dark"]`; manifest key `neutral-medium`). **No aliases**: `male`/`female`
body types and the `dark` skin tone are **not** mapped onto this base. All other combinations
must **fail soft to the C2/SVG path** at the later wiring step (the existing per-identity
resolver-null → C2 fallback already has this shape; no fallback code is written in this task).

### U4 — blush production name

`assets/avatar-r2/face/face-blush-multiply-v1.webp`, as ordered. **Contract note (gap, not
conflict):** the §C naming scheme (`assets/avatar-r2/README.md`) predates the PL-B decision to
deliver blush as a **separate multiply component** and therefore lists no blush name
(`face/face-{expression}-vN` only; the asset brief §4.2 folded blush into the face layer).
No authoritative contract requires a different name — the §C naming table should gain a
`face/face-blush-multiply-vN.webp` row in the manifest/loader step (PR B).

## 5. Boundaries (binding)

**No runtime change · no manifest entry · `R2_MANIFEST` untouched · `AVATAR_R2` = `false` ·
no expressions (D-042 producer merged but never run; external-image-API owner decision still
outstanding) · no blink wiring · no cosmetics/anchor change · nothing loaded by the app.**
Promotion here means tracked production files exist and are owner-reviewable — activation
requires the separately gated PR B (manifest/loader) and PR C (render stack) with their own
owner commands.

## 6. Owner review checklist

- [x] §1 chain regeneration: all guards green; 6/6 byte-identical to countersigned candidates.
- [x] §3 hash table: source and WebP SHA-256 values accepted.
- [x] §3 budget: 39.4 KB total accepted (≤ 350 KB, per-layer ≤ 50 KB).
- [x] §4 U1: `#A34A0F` registered as the measured Master-brown default iris (wiring-time value).
- [x] §4 U2: only `neutral` × `medium` supported; everything else → C2 fail-soft at wiring.
- [x] §4 U4: blush name accepted; §C naming row to be added in PR B.
- [x] Verdict: PASS.

## 7. Verdict

**Owner verdict: PASS · Date: 2026-07-18 · countersigned via owner command (verbatim:
"Countersign promotion-worksheetet: PASS — udfør derefter PR B").**

The six neutral WebP production assets (§3), the U1 measured Master-brown default iris
(`#A34A0F`), the U2 identity restriction (`neutral` × `medium` only, all else C2 fail-soft
at wiring) and the U4 blush name are accepted as promoted. The countersign changes nothing
at runtime: `R2_MANIFEST` registration is the next gated step (**PR B, ordered by the same
owner command**), render wiring is PR C — each with its own green-CI merge gate.
`AVATAR_R2` stays `false`; expressions remain unproduced (D-042 path unchanged).
