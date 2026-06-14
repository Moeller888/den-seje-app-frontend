# ADR-163B — Eye System Architecture

- **Status:** Accepted (2026-06-14)
- **Decision ID:** D-012
- **Supersedes:** Section 163A's "eyes embedded in Face/Expression layer" assumption
- **Context docs:** `docs/project-state.md`, `docs/avatar-vision.md`

## Context
The avatar is anime-styled with **large, expressive eyes as the signature feature**.
The project roadmap explicitly requires the eyes to be a customizable dimension:
multiple eye colors, eye cosmetics, glasses, sunglasses, masks, event items, rare /
magical eyes, an **eye rarity system**, blink animations, and an emotion system —
on a long-lived premium avatar system. The goal is the most robust, explicit and
future-proof architecture, not the least work now.

Three architectures were compared (Section 163B):
- **A — Eyes embedded** in the Face/Expression layer (iris/pupil/color baked in).
- **B — Separate eye layer** (face = skin/brows/mouth/blush; eyes in own layer).
- **C — Separate eye layer + iris tint/cosmetic system** (eye color = token; eye
  layer is cosmetic/rarity-capable).

## Decision
Adopt **Option C**: eyes are a **separate render layer** with a **tintable iris**
(eye color = a token, free of extra assets) and a fixed glossy highlight overlay.
The eye layer is **cosmetic- and rarity-capable** (it can be swapped or overlaid for
glasses/masks/magic/rare eyes), and carries **per-expression eye-shape variants** so
emotion lives in the eyes while color stays orthogonal.

## Why (over A)
Option A makes every eye-customization requirement a **combinatorial asset
explosion**: eye color, eye cosmetics and rare eyes each multiply the expression set
(expression × color × variant). That guarantees accumulating technical debt and a
future rewrite the first time eye colors / rarity / eye cosmetics ship. A separate
tintable layer (C) makes:
- **eye color** free (a token, like hair color),
- **eye cosmetics / rare / magic eyes** a swap or overlay (an eye slot),
- **glasses / sunglasses / masks** natural higher-z layers,
- **blink** an eyelid over the eye layer,
- **emotion** expressible via eye-shape variants, color-independent.

## Consequences
- **+** Future-proof: 1y → free eye colors; 3y → eye cosmetics + rarity in production;
  5y → stable eye platform, no rewrite. Lowest total project risk.
- **−** Higher up-front art/rendering complexity: an extra layer + an iris tint step,
  and the iris must be painted as a tintable region with the highlight kept fixed.
- **Mitigation (consistency):** cut the eye layer from the **same North Star render**
  so the eyes match the painted face; tint only the iris base; keep the highlight as
  a fixed overlay. Roll out incrementally — separate the layer first (tint-ready iris
  from day one), then enable the tint, then add the eye-cosmetic/rarity slot.

## Revised layer model (supersedes 163A)
Base body → **Face/Expression (no eyes)** → **Eyes (separate, tintable)** → Blink →
Hair → Cosmetics.

## Status of the wider system
`AVATAR_V2` remains **OFF**. No code, assets, migrations or implementation result
from this ADR — documentation only.
