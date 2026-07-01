// ── C2 Avatar Render Pipeline (Section 155G) ──────────────────────────────────
// The SINGLE shared C2 render path. Every surface (avatar.html, hub.html,
// app.js, shop.html) MUST mount the C2 avatar through mountC2Avatar() so the
// surfaces can never diverge. Gated by isAvatarV2() at each call site — when the
// flag is OFF, none of this runs and the legacy render is unchanged.
//
// Implements Hair Color Technical Decision v1.0: the hair layer is the only
// INLINE-rendered layer. Its SVG uses fill="var(--hair-base)"/"var(--hair-shadow)";
// this module inlines the SVG and sets those two CSS variables from the identity's
// resolved token pair. All other layers stay <img> (sandboxed, no recolor needed).

import { baseLayersForC2, hairColorTokensFor, C2_LAYER_Z, C2_BASE_Z, isAvatarR2, baseSrcForR2, hasR2BaseFor, isR2Phase1SafeSlot } from "./avatar-layers.js";
import { cdnUrl } from "./cloudinary.js";

// In-memory cache of fetched hair SVG text (keyed by src). Hair files are static
// local assets — safe to cache for the session.
const _hairTextCache = new Map();

async function fetchSvgText(src) {
  if (_hairTextCache.has(src)) return _hairTextCache.get(src);
  const res = await fetch(src);
  if (!res.ok) throw new Error(`C2 hair fetch failed: ${src} (${res.status})`);
  const txt = await res.text();
  _hairTextCache.set(src, txt);
  return txt;
}

// Resolve equipped cosmetics into C2 layer descriptors (Section 159B). Legacy
// slot_type names map straight onto C2_LAYER_Z. `resolveSrc(itemId)` returns the
// asset src, or null/undefined if unknown. Defensive PARITY FALLBACK: a missing /
// invalid item, or a slot not in the C2 z-model, is SKIPPED — that slot simply
// does not render; never throws. Mirrors the legacy "if (!item) return" behaviour.
export function c2CosmeticLayers(equippedSlots, resolveSrc) {
  const out = [];
  const slots = (equippedSlots && typeof equippedSlots === "object") ? Object.keys(equippedSlots) : [];
  for (const slot of slots) {
    const z = C2_LAYER_Z[slot];
    if (z == null) continue;                          // unknown slot → skip
    const itemId = equippedSlots[slot];
    if (!itemId) continue;
    const src = (typeof resolveSrc === "function") ? resolveSrc(itemId) : null;
    if (!src) continue;                               // missing/invalid item → skip
    out.push({ slot, src, z });
  }
  return out;
}

// Pure composition: ordered C2 layer descriptors for an identity + its equipped
// cosmetics. [{ src, z, isBase, inline }] — hair carries inline:true. z-index
// governs paint order, so array order is irrelevant to compositing.
// cosmetics: [{ slot, src, z }] (resolved by the surface via c2CosmeticLayers).
export function composeC2Layers(identity, cosmetics = []) {
  const [base, hair] = baseLayersForC2(identity);
  const cos = (Array.isArray(cosmetics) ? cosmetics : [])
    .filter((c) => c && c.src && typeof c.z === "number")
    .map((c) => ({ src: c.src, z: c.z, isBase: false, inline: false }));
  return [base, ...cos, hair];
}

// 167A step 3a (Phase-1, D-040 "Master-as-is"): raster layer descriptors — the baked
// base <img> (z0) + equipped cosmetics. NO hair layer: face/eyes/hair/outfit are baked
// into the Phase-1 base. Same descriptor shape as composeC2Layers, so mountC2Avatar's
// existing loop renders it unchanged (base + cosmetics as <img>).
export function composeR2Layers(identity, cosmetics = []) {
  const base = { src: baseSrcForR2(identity), z: C2_BASE_Z, isBase: true, inline: false };
  // 167A Phase-1 slot-gate: only anchor-independent, behind-figure cosmetics (aura/back)
  // render on the baked base. Head/face/eye + clothing items misalign on the legacy
  // anchors / clash with the baked outfit → gated until Phase-2. Raster path only.
  const cos = (Array.isArray(cosmetics) ? cosmetics : [])
    .filter((c) => c && c.src && typeof c.z === "number" && isR2Phase1SafeSlot(c.slot))
    .map((c) => ({ src: c.src, z: c.z, isBase: false, inline: false }));
  return [base, ...cos];
}

// The single C2 render path. Mounts base (<img>) + hair (inline <svg>, token-
// recolored) into rootEl. Removes only prior C2 layers ([data-c2-layer]); the
// caller manages the expression overlay and blink layer (same eye anchors as the
// C2 base, so they remain compatible). Async because the inline hair SVG is
// fetched. Defensive: any failure leaves the base rendered (hair simply absent).
//
// layerClass: each surface passes its own layer CSS class (avatar.html
// "avatar-layer", hub "profile-avatar-layer", app.js "quiz-avatar-layer", shop
// "preview-layer") so positioning matches that surface. The data-c2-layer markers
// are used for cleanup/detection regardless of class.
export async function mountC2Avatar(rootEl, identity, { animate = false, layerClass = "avatar-layer", cosmetics = [] } = {}) {
  if (!rootEl) return rootEl;

  // 167A step 3a: use the raster base ONLY when AVATAR_R2 is on AND a Phase-1 base exists
  // for this identity; otherwise the existing C2/SVG path (byte-for-byte). Default off → C2.
  const useR2 = isAvatarR2() && hasR2BaseFor(identity);
  const layers = useR2 ? composeR2Layers(identity, cosmetics) : composeC2Layers(identity, cosmetics);
  const tokens = hairColorTokensFor(identity);
  const cls = (kind) => layerClass + (animate ? " layer-fade-in" : "");

  // Remove previously mounted C2 layers (idempotent re-render).
  rootEl.querySelectorAll("[data-c2-layer]").forEach((n) => n.remove());

  for (const layer of layers) {
    if (layer.inline) {
      const wrap = document.createElement("div");
      wrap.setAttribute("data-c2-layer", "hair");
      wrap.className = cls("hair");
      wrap.style.zIndex = String(layer.z);
      // Token flow: identity.hair_color → {base, shadow} → CSS vars on the wrapper,
      // inherited by the inline hair SVG's fill="var(--hair-base|shadow)".
      wrap.style.setProperty("--hair-base", tokens.base);
      wrap.style.setProperty("--hair-shadow", tokens.shadow);
      try {
        wrap.innerHTML = await fetchSvgText(layer.src);
        rootEl.appendChild(wrap);
      } catch (_e) {
        // Fail-soft: skip hair, keep the base. Never throw out of render.
      }
    } else {
      const img = document.createElement("img");
      img.setAttribute("data-c2-layer", layer.isBase ? "base" : "cosmetic");
      img.className = cls("base");
      // 157G: optional Cloudinary delivery for RASTER layers. Default-off + raster-only
      // → returns layer.src unchanged today (all current layers are SVG). Fail-soft.
      img.src = cdnUrl(layer.src);
      img.alt = "";
      img.style.zIndex = String(layer.z);
      rootEl.appendChild(img);
    }
  }

  return rootEl;
}
