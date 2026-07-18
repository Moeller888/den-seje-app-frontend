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

import { baseLayersForC2, hairColorTokensFor, C2_LAYER_Z, isAvatarR2, r2StackSrcsFor, R2_STACK_Z, R2_IRIS_DEFAULT, isR2Phase1SafeSlot } from "./avatar-layers.js";
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

// 167A Phase-2 (PR C): the DECOMPOSED neutral raster stack. Returns the ordered
// descriptor list, or **null when the complete stack does not resolve** — the caller
// must then fall back to the C2/SVG path (never a partial raster avatar).
// Binding order/blend (integration composite §6): base z0 (normal) · blush z2
// (mix-blend multiply, tone-agnostic) · face z3 (normal) · iris z4 (luminance map
// × R2_IRIS_DEFAULT) · eyes-fixed z4 (normal, ON TOP of the iris — same z, so DOM
// order decides: iris is emitted first, deliberately) · cosmetics (Phase-1 safe
// slots only) · hair z40 (luminance map × the identity's hair token).
export function composeR2Layers(identity, cosmetics = []) {
  const s = r2StackSrcsFor(identity);
  if (!s) return null;                                // incomplete stack → C2 fallback
  // Phase-1 cosmetic slot-gate unchanged: only anchor-independent, behind-figure
  // cosmetics (aura/back) render on the raster stack until the anchor revision.
  const cos = (Array.isArray(cosmetics) ? cosmetics : [])
    .filter((c) => c && c.src && typeof c.z === "number" && isR2Phase1SafeSlot(c.slot))
    .map((c) => ({ src: c.src, z: c.z, isBase: false, inline: false }));
  return [
    { src: s.base,      z: R2_STACK_Z.base,  isBase: true,  inline: false },
    { src: s.blush,     z: R2_STACK_Z.blush, isBase: false, inline: false, blend: "multiply", marker: "blush" },
    { src: s.face,      z: R2_STACK_Z.face,  isBase: false, inline: false, marker: "face" },
    { src: s.eyesIris,  z: R2_STACK_Z.eyes,  isBase: false, inline: false, tint: "iris", marker: "iris" },
    { src: s.eyesFixed, z: R2_STACK_Z.eyes,  isBase: false, inline: false, marker: "eyes" },
    ...cos,
    { src: s.hair,      z: R2_STACK_Z.hair,  isBase: false, inline: false, tint: "hair", marker: "hair-r2" },
  ];
}

// Feature-detect the tint mechanism (plan §6): CSS mask (confines the token fill to
// the map's alpha) + mix-blend multiply (modulates it by the map's luminance). When
// unsupported, the caller renders the untinted map instead — never fails the render.
function r2TintSupported() {
  try {
    return typeof CSS !== "undefined" && typeof CSS.supports === "function" &&
      CSS.supports("mix-blend-mode", "multiply") &&
      (CSS.supports("mask-image", 'url("x")') || CSS.supports("-webkit-mask-image", 'url("x")'));
  } catch (_e) {
    return false;
  }
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

  // 167A Phase-2 (PR C): use the decomposed raster stack ONLY when AVATAR_R2 is on AND
  // the COMPLETE stack resolves for this identity (U2: neutral × medium only); any
  // missing piece → composeR2Layers returns null → the existing C2/SVG path
  // (byte-for-byte). Default off → C2.
  const r2Layers = isAvatarR2() ? composeR2Layers(identity, cosmetics) : null;
  const layers = r2Layers || composeC2Layers(identity, cosmetics);
  const tokens = hairColorTokensFor(identity);
  const cls = (kind) => layerClass + (animate ? " layer-fade-in" : "");

  // Remove previously mounted C2 layers (idempotent re-render). Also clear the
  // render-complete signal so a re-render is not mistaken for the finished frame
  // (see markAvatarRendered); it is re-set once the full composite has decoded.
  rootEl.querySelectorAll("[data-c2-layer]").forEach((n) => n.remove());
  rootEl.removeAttribute("data-avatar-rendered");

  // R2 only: scope the stack's mix-blend layers (blush/tints) to the avatar composite
  // so they can never blend with the page behind it. Visually inert on its own, and
  // the C2 branch is untouched (no style write on the C2 path).
  if (r2Layers) rootEl.style.isolation = "isolate";

  const tintOk = r2TintSupported();

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
    } else if (layer.tint && tintOk) {
      // Phase-2 tinted luminance layer (plan §6): wrapper masked to the map's alpha,
      // background = the tint token, inner <img> (the map) multiplies over it →
      // rendered = map luminance × token, confined to the map's silhouette.
      // Tokens: hair → the identity's existing --hair-base token (155E model,
      // token-faithful default per the integration countersign §3 option a);
      // iris → R2_IRIS_DEFAULT (U1 measured Master-brown; no EYE_COLOR system).
      const src = cdnUrl(layer.src);
      const tintColor = layer.tint === "hair" ? tokens.base : R2_IRIS_DEFAULT;
      const wrap = document.createElement("div");
      wrap.setAttribute("data-c2-layer", layer.marker || "tint");
      wrap.className = cls("tint");
      wrap.style.zIndex = String(layer.z);
      wrap.style.setProperty("--hair-base", tokens.base);
      wrap.style.backgroundColor = tintColor;
      wrap.style.webkitMaskImage = 'url("' + src + '")';
      wrap.style.webkitMaskSize = "100% 100%";
      wrap.style.webkitMaskRepeat = "no-repeat";
      wrap.style.maskImage = 'url("' + src + '")';
      wrap.style.maskSize = "100% 100%";
      wrap.style.maskRepeat = "no-repeat";
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.style.cssText = "display:block;width:100%;height:100%;mix-blend-mode:multiply;";
      wrap.appendChild(img);
      rootEl.appendChild(wrap);
    } else {
      const img = document.createElement("img");
      img.setAttribute("data-c2-layer", layer.marker || (layer.isBase ? "base" : "cosmetic"));
      img.className = cls("base");
      // 157G: optional Cloudinary delivery for RASTER layers. Default-off + raster-only
      // → returns layer.src unchanged today. Fail-soft. A tint layer without tint
      // support lands here too → renders the untinted map (plan §6 fallback).
      img.src = cdnUrl(layer.src);
      img.alt = "";
      img.style.zIndex = String(layer.z);
      if (layer.blend) img.style.mixBlendMode = layer.blend;   // blush: multiply
      rootEl.appendChild(img);
    }
  }

  return rootEl;
}

// Render-complete signal for deterministic screenshots (golden tests) and any
// consumer that needs the avatar fully painted. Awaits every layer image in
// rootEl — base + cosmetics AND the expression engine's neutral face overlay,
// which is added after mountC2Avatar — to decode, then marks the container.
// Call at the END of a page's avatar render sequence (after the life engines
// have attached their overlay). Fail-soft: never throws out of a render.
export async function markAvatarRendered(rootEl) {
  if (!rootEl) return;
  try {
    const imgs = Array.from(rootEl.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) =>
        (typeof img.decode === "function" ? img.decode() : Promise.resolve()).catch(() => {})
      )
    );
  } catch (_e) {
    // ignore — mark rendered regardless so waiters never hang on a partial failure
  }
  rootEl.setAttribute("data-avatar-rendered", "1");
}
