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
import { emitR2RenderObservability } from "./avatar-r2-observability.js";

// In-memory cache of fetched hair SVG text (keyed by src). Hair files are static
// local assets — safe to cache for the session.
const _hairTextCache = new Map();

// Per-element mount generation. Every mountC2Avatar call bumps this; after each
// await the call checks it still owns the element and aborts (without touching the
// DOM) if a newer mount superseded it — so a stale/aborted load can never overwrite
// a newer render (activation-audit F1, race contract §5).
const _mountGen = new WeakMap();

// Preload + decode one image URL off-DOM. Resolves only when the bitmap is fully
// decoded; rejects on HTTP error, decode failure, empty/invalid URL, or a
// zero-width result. This is the atomic gate: the visible R2 stack is only mounted
// once EVERY mandatory layer has resolved here (no partial-R2 flash, F1/§4).
function preloadDecode(url) {
  return new Promise((resolve, reject) => {
    if (typeof url !== "string" || url.length === 0) { reject(new Error("empty url")); return; }
    if (typeof Image === "undefined") { resolve(); return; } // non-DOM env (unit tests) → skip gate
    const img = new Image();
    img.onerror = () => reject(new Error("load error: " + url));
    img.src = url;
    const done = () => {
      if (!img.naturalWidth) { reject(new Error("zero-width: " + url)); return; }
      resolve();
    };
    if (typeof img.decode === "function") {
      img.decode().then(done, () => reject(new Error("decode failed: " + url)));
    } else if (img.complete) {
      done();
    } else {
      img.onload = done;
    }
  });
}

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
// forceC2: explicit renderer override — the caller demands the WHOLE C2/SVG path
// even when the R2 stack would be active (shop preview fix: a non-R2-safe item
// must render complete-C2 so the item stays visible on its proven C2 anchors,
// never an R2 avatar without the item). Default false → behaviour unchanged.
// Which R2 layers are MANDATORY (whole-stack-atomic unit): the base + the neutral
// stack markers. Safe cosmetic overlays (aura/back) are OPTIONAL — a failure there
// drops only that overlay, never the base to C2 (activation-audit F1 / §3).
const _R2_MANDATORY_MARKERS = new Set(["base", "blush", "face", "iris", "eyes", "hair-r2"]);
function _isMandatoryR2(layer) {
  return !!layer && (layer.isBase === true || _R2_MANDATORY_MARKERS.has(layer.marker));
}

// Returns the render path actually mounted: "r2" | "c2" (also stamped on
// rootEl.dataset.avatarRenderPath), or "aborted" when a newer mount superseded this
// one (DOM left untouched). Callers key the blink profile off the returned path so
// an asset-load fallback never leaves R2 lids on a C2 base.
export async function mountC2Avatar(rootEl, identity, { animate = false, layerClass = "avatar-layer", cosmetics = [], forceC2 = false, surface } = {}) {
  if (!rootEl) return "c2";

  // Race/abort contract (§5): claim this element for this mount generation.
  const myGen = (_mountGen.get(rootEl) || 0) + 1;
  _mountGen.set(rootEl, myGen);
  const isCurrent = () => _mountGen.get(rootEl) === myGen;

  // D-076 pilot observability: track WHY we fall back to C2 (only distinguishable causes).
  // Emitted once centrally before the final return; advisory + fail-soft; never on "aborted".
  let fellBackReason = null;

  // The whole render body runs under one try/catch so an otherwise-UNHANDLED exception is
  // reported as result "render_failed" then RE-THROWN unchanged (identical error/stack/rejection
  // → callers behave exactly as before). Handled C2 fallbacks return "c2" normally and are NOT
  // caught here (they are classified c2_fallback below). Observability never affects the render.
  try {
  // 167A Phase-2 (PR C): use the decomposed raster stack ONLY when AVATAR_R2 is on AND
  // the COMPLETE stack resolves for this identity (U2: neutral × medium only); any
  // missing piece → composeR2Layers returns null → the existing C2/SVG path
  // (byte-for-byte). Default off → C2. forceC2 → always the C2 path.
  let r2Layers = (!forceC2 && isAvatarR2()) ? composeR2Layers(identity, cosmetics) : null;

  // ATOMIC R2 GATE (activation-audit F1 / §3 / §4): before making the R2 stack
  // visible, preload+decode EVERY mandatory layer off-DOM. If any mandatory layer
  // fails (HTTP 4xx/5xx, onerror, decode reject, zero-width, empty URL), drop the
  // WHOLE stack to the complete C2 path — never a partial R2 stack, never a broken
  // base. Optional safe overlays that fail are dropped individually (base survives).
  if (r2Layers) {
    const mandatory = r2Layers.filter(_isMandatoryR2);
    const optional  = r2Layers.filter((l) => !_isMandatoryR2(l));
    try {
      await Promise.all(mandatory.map((l) => preloadDecode(cdnUrl(l.src))));
    } catch (err) {
      // One controlled, non-sensitive warning (§9): reason only, no identity/token.
      try { console.warn("avatar-r2: mandatory layer failed to load → C2 fallback"); } catch (_e) {}
      r2Layers = null; // atomic whole-stack fallback
      fellBackReason = "required_asset_failed"; // D-076 observability reason
    }
    if (!isCurrent()) return "aborted"; // a newer mount took over during preload — do not touch the DOM
    if (r2Layers) {
      // Preload optional overlays; keep only the ones that decoded (individual drop).
      const kept = [];
      await Promise.all(optional.map(async (l) => {
        try { await preloadDecode(cdnUrl(l.src)); kept.push(l); }
        catch (_e) { try { console.warn("avatar-r2: optional overlay dropped (load failed)"); } catch (_ee) {} }
      }));
      if (!isCurrent()) return "aborted";
      r2Layers = r2Layers.filter((l) => _isMandatoryR2(l) || kept.includes(l));
    }
  }

  const layers = r2Layers || composeC2Layers(identity, cosmetics);
  const path = r2Layers ? "r2" : "c2";
  const tokens = hairColorTokensFor(identity);
  const cls = (kind) => layerClass + (animate ? " layer-fade-in" : "");

  // Remove previously mounted C2 layers (idempotent re-render). Also clear the
  // render-complete signal so a re-render is not mistaken for the finished frame
  // (see markAvatarRendered); it is re-set once the full composite has decoded.
  // Done AFTER the atomic preload so the prior render stays visible until the new
  // complete stack is ready (no blank/partial window, §4).
  rootEl.querySelectorAll("[data-c2-layer]").forEach((n) => n.remove());
  rootEl.removeAttribute("data-avatar-rendered");
  if (rootEl.dataset) rootEl.dataset.avatarRenderPath = path; // real DOM always has dataset; guard for mocks

  // R2 only: scope the stack's mix-blend layers (blush/tints) to the avatar composite
  // so they can never blend with the page behind it. Visually inert on its own, and
  // the C2 branch is untouched (no style write on the C2 path).
  if (r2Layers) rootEl.style.isolation = "isolate";

  const tintOk = r2TintSupported();

  for (const layer of layers) {
    if (!isCurrent()) return "aborted"; // superseded mid-build → stop mutating the DOM
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
        const svgText = await fetchSvgText(layer.src);
        if (!isCurrent()) return "aborted"; // superseded during hair fetch
        wrap.innerHTML = svgText;
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

  // D-076: single central emission, only when the result is final and this mount is current.
  // Never on "aborted"/missing root; the helper is silent for a missing/invalid surface and
  // for a non-opted-in browser. Fail-soft wrapper so it can never affect the returned render.
  if (isCurrent()) {
    const result = path === "r2" ? "r2" : "c2_fallback";
    const reason = path === "r2"
      ? "unknown"
      : (fellBackReason || (forceC2 ? "forced_c2" : "identity_ineligible"));
    try { emitR2RenderObservability({ surface, result, reason, root: rootEl }); } catch (_e) {}
  }

  return path;
  } catch (err) {
    // Otherwise-unhandled render exception → advisory render_failed, then RE-THROW the identical
    // error (preserves rejection/stack/caller semantics; see the D-076 audit in the PR).
    try { emitR2RenderObservability({ surface, result: "render_failed", reason: "render_exception", root: rootEl }); } catch (_e) {}
    throw err;
  }
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
