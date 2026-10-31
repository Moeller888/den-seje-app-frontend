// ── Avatar Layer System — Single Source of Truth ──────────────────────────────
// Import from here in avatar.html, shop.html, hub.html, and app.js.
// Never define SLOT_Z, ALL_SLOTS, or rarity constants in those files.

export const SLOTS = {
  aura:     { z: -2, label: "Aura",               emoji: "✨", category: "Effekter" },
  back:     { z: -1, label: "Ryg",                emoji: "🦅", category: "Ryg"    },
  body:     { z:  1, label: "Krop",               emoji: "🦎", category: "Krop"   },
  torso:    { z:  2, label: "Overkrop",           emoji: "👕", category: "Krop"   },
  neck:     { z:  3, label: "Hals",               emoji: "📿", category: "Krop"   },
  hair:     { z:  4, label: "Hår",                emoji: "💈", category: "Hoved"  },
  headwear: { z:  5, label: "Hovedbeklædning",    emoji: "🎩", category: "Hoved"  },
  face:     { z:  6, label: "Ansigt",             emoji: "🎭", category: "Ansigt" },
  eyes:     { z:  7, label: "Briller",            emoji: "👓", category: "Ansigt" },
};

// Ordered slot list — render in this order (lowest z first = rendered behind others)
export const ALL_SLOTS = ["aura", "back", "body", "torso", "neck", "hair", "headwear", "face", "eyes"];

// Flat z-index lookup: slot name → CSS z-index value
export const SLOT_Z      = Object.fromEntries(ALL_SLOTS.map(k => [k, SLOTS[k].z]));
export const SLOT_LABELS = Object.fromEntries(ALL_SLOTS.map(k => [k, SLOTS[k].label]));
export const SLOT_EMOJIS = Object.fromEntries(ALL_SLOTS.map(k => [k, SLOTS[k].emoji]));

// Category definitions for shop tab UI — null slots means "show all"
export const SHOP_CATEGORIES = [
  { key: "alle",     label: "Alle",     slots: null },
  { key: "hoved",    label: "Hoved",    slots: ["hair", "headwear"] },
  { key: "ansigt",   label: "Ansigt",   slots: ["face", "eyes"] },
  { key: "ryg",      label: "Ryg",      slots: ["back"] },
  { key: "krop",     label: "Krop",     slots: ["body", "torso", "neck"] },
  { key: "effekter", label: "Effekter", slots: ["aura"] },
];

// Rarity system — fixed across all themes (never change per-theme)
export const RARITY_COLORS = {
  common:    "#757575",
  uncommon:  "#388e3c",
  rare:      "#1565c0",
  legendary: "#f57f17",
};

export const RARITY_LABELS = {
  common:    "Almindelig",
  uncommon:  "Ualmindelig",
  rare:      "Sjælden",
  legendary: "Legendarisk",
};

export const RARITY_ICONS = {
  common:    "○",
  uncommon:  "◆",
  rare:      "★",
  legendary: "✦",
};

export const RARITY_ORDER      = ["legendary", "rare", "uncommon", "common"];
export const RARITY_SORT_ORDER = { legendary: 0, rare: 1, uncommon: 2, common: 3 };

// Base body SVG — always rendered at z=0, never replaced by equipment
export const BASE_SRC = "/assets/avatar/base/body.svg";

// ── Avatar identity (Section 152A) ────────────────────────────────────────────
// profiles.avatar_identity shape v1:
//   { v: 1, body_type: 'male'|'female'|'neutral', chosen_at: timestamptz|null }
// Written only via the set_avatar_identity RPC; shape enforced by DB trigger.

export const BODY_TYPES = ["male", "female", "neutral"];

// Section 152E: skin tones. Asset-based — each (body_type × skin_tone) pair maps
// to a concrete SVG. 'medium' is the original tone (existing files, default);
// 'dark' adds the *-dark.svg variants. No runtime color manipulation.
export const SKIN_TONES = ["medium", "dark"];

// Section 152C/152E: per-body-type, per-skin-tone base files. All variants honor
// the locked geometry contract (head cx=80 cy=50 r=30, eyes cx=68/92 cy=47, arm
// rects, equipment anchors) and share the expressions + hair layer. Only the
// skin gradient + skin-shadow color differ between medium and dark.
const BODY_SRCS = {
  neutral: { medium: BASE_SRC,                              dark: "/assets/avatar/base/body-neutral-dark.svg" },
  male:    { medium: "/assets/avatar/base/body-male.svg",   dark: "/assets/avatar/base/body-male-dark.svg"   },
  female:  { medium: "/assets/avatar/base/body-female.svg", dark: "/assets/avatar/base/body-female-dark.svg" },
};

// Resolves the skin tone for an identity. Defensive: null, '{}', garbage, or an
// unknown skin_tone all resolve to 'medium' (the default) — Model B runtime
// fallback, no DB backfill required for existing profiles.
export function skinToneFor(identity) {
  const tone = (identity && typeof identity === "object") ? identity.skin_tone : null;
  if (!SKIN_TONES.includes(tone)) return "medium";
  return tone;
}

// Resolves the base body SVG for an identity. Defensive: null, '{}', garbage,
// or unknown body_type/skin_tone all resolve to the neutral-medium base — a
// broken identity can never produce a broken avatar.
export function baseSrcFor(identity) {
  const bodyType = (identity && typeof identity === "object") ? identity.body_type : null;
  const tone     = skinToneFor(identity);
  const byType   = BODY_TYPES.includes(bodyType) ? BODY_SRCS[bodyType] : BODY_SRCS.neutral;
  return byType?.[tone] ?? BASE_SRC;
}

// ── Identity hair layer (Section 152B/152D) ───────────────────────────────────
// Hair is decoupled from body.svg and the expression SVGs. It renders as an
// identity layer on the reserved hair slot z-level (z=4): above the expression
// overlay (z=0), below headwear (z=5). The hair slot has no shop items — it is
// reserved for identity.
// Section 152D: hairstyle variants. hairSrcFor() resolves per identity.hairstyle.
// Model B: absent hairstyle key → runtime fallback to "default" — no DB backfill.
export const HAIR_SRC = "/assets/avatar/hair/hair-default.svg";

const VALID_HAIRSTYLES = ["default", "braid", "short", "curly", "long", "sidecut", "buzzcut"];
const HAIR_SRCS = {
  "default":  HAIR_SRC,
  "braid":    "/assets/avatar/hair/hair-braid.svg",
  "short":    "/assets/avatar/hair/hair-short.svg",
  "curly":    "/assets/avatar/hair/hair-curly.svg",
  "long":     "/assets/avatar/hair/hair-long.svg",
  "sidecut":  "/assets/avatar/hair/hair-sidecut.svg",
  "buzzcut":  "/assets/avatar/hair/hair-buzzcut.svg",
};

export function hairSrcFor(identity) {
  const hairstyle = (identity && typeof identity === "object") ? identity.hairstyle : null;
  if (!VALID_HAIRSTYLES.includes(hairstyle)) return HAIR_SRC;
  return HAIR_SRCS[hairstyle] ?? HAIR_SRC;
}

// ── Identity hair color (Section 155E) ────────────────────────────────────────
// Hair color is IDENTITY — NOT a shop item, NOT inventory. Stored in
// profiles.avatar_identity.hair_color, written only via the set_avatar_identity
// RPC. Per Hair Color Technical Decision v1.0, hair is the only INLINE-rendered
// layer: its SVG fills reference fill="var(--hair-base)" / "var(--hair-shadow)",
// and the render surface sets those two CSS variables from the token pair
// resolved here. (Render wiring is a later section; 155E ships the data contract
// only.)
export const HAIR_COLORS = [
  "black", "dark_brown", "brown", "light_brown",
  "blonde", "red", "auburn", "fantasy_blue",
];

// First palette (Section 155E). Each color = a {base, shadow} token pair.
// 'shadow' doubles as the hair outline stroke (see the Section 155D hair assets,
// whose strokes use var(--hair-shadow)). Values are locked, flat hex (R1–R5).
export const HAIR_COLOR_TOKENS = {
  black:        { base: "#2B2622", shadow: "#141110" },
  dark_brown:   { base: "#3F2A1B", shadow: "#271A10" },
  brown:        { base: "#5A3D28", shadow: "#3C2818" },
  light_brown:  { base: "#8A5E3B", shadow: "#5F3F26" },
  blonde:       { base: "#C99A5B", shadow: "#9C7038" },
  red:          { base: "#A8442A", shadow: "#732A19" },
  auburn:       { base: "#803A24", shadow: "#561F13" },
  fantasy_blue: { base: "#4A78C8", shadow: "#2F5090" },
};

// Model B default: existing profiles with no hair_color key render 'brown'.
// No DB backfill required.
export const DEFAULT_HAIR_COLOR = "brown";

// Resolves the hair color KEY for an identity. Defensive: null, '{}', garbage,
// or an unknown hair_color all resolve to DEFAULT_HAIR_COLOR — a broken identity
// can never produce a broken render. Mirrors skinToneFor / hairSrcFor.
export function hairColorFor(identity) {
  const c = (identity && typeof identity === "object") ? identity.hair_color : null;
  if (!HAIR_COLORS.includes(c)) return DEFAULT_HAIR_COLOR;
  return c;
}

// Resolves the {base, shadow} token PAIR for an identity. The render surface
// sets --hair-base / --hair-shadow from this. Always returns a valid pair.
export function hairColorTokensFor(identity) {
  return HAIR_COLOR_TOKENS[hairColorFor(identity)] ?? HAIR_COLOR_TOKENS[DEFAULT_HAIR_COLOR];
}

// ── C2 hairstyle alignment (Section 155F) ─────────────────────────────────────
// The C2 render path uses the NEW C2 hairstyle assets (Section 155D). To stay
// backward-compatible, EVERY stored hairstyle value — legacy or C2 — maps to a
// valid C2 asset here; legacy-only keys are aliased to the nearest C2 style.
// No DB backfill: existing profiles keep their legacy value and render via these
// aliases once the C2 render path is wired (a later section).
//
// IMPORTANT: the legacy resolver hairSrcFor() above is UNCHANGED and still drives
// the current live render against the legacy assets. hairSrcForC2() is additive
// and used ONLY by the future C2 render path.
export const C2_HAIRSTYLES = ["short", "tousled", "curly", "long", "ponytail", "buzz", "afro"];
export const DEFAULT_HAIRSTYLE_C2 = "short";

// Union (legacy ∪ C2) → C2 asset path. Legacy keys aliased to the nearest C2 style:
//   default → short · braid → ponytail · sidecut → buzz · buzzcut → buzz
const HAIR_SRCS_C2 = {
  // C2-native
  "short":    "/assets/avatar/hair/hair-short-c2.svg",
  "tousled":  "/assets/avatar/hair/hair-tousled-c2.svg",
  "curly":    "/assets/avatar/hair/hair-curly-c2.svg",
  "long":     "/assets/avatar/hair/hair-long-c2.svg",
  "ponytail": "/assets/avatar/hair/hair-ponytail-c2.svg",
  "buzz":     "/assets/avatar/hair/hair-buzz-c2.svg",
  "afro":     "/assets/avatar/hair/hair-afro-c2.svg",
  // legacy aliases → nearest C2 style
  "default":  "/assets/avatar/hair/hair-short-c2.svg",
  "braid":    "/assets/avatar/hair/hair-ponytail-c2.svg",
  "sidecut":  "/assets/avatar/hair/hair-buzz-c2.svg",
  "buzzcut":  "/assets/avatar/hair/hair-buzz-c2.svg",
};

export const HAIR_SRC_C2_DEFAULT = HAIR_SRCS_C2[DEFAULT_HAIRSTYLE_C2];

// Resolves the C2 hair asset for an identity. Defensive: null, '{}', garbage,
// unknown, or any legacy key all resolve to a valid C2 asset (alias or default).
// Never returns undefined. Mirrors hairSrcFor (legacy) but for the C2 asset set.
export function hairSrcForC2(identity) {
  const hairstyle = (identity && typeof identity === "object") ? identity.hairstyle : null;
  return HAIR_SRCS_C2[hairstyle] ?? HAIR_SRC_C2_DEFAULT;
}

// The identity base of every avatar render: body + hair, z-ascending.
// ALL render surfaces (avatar.html, hub.html, app.js, shop.html) must build
// their layer stack from this helper so the surfaces can never diverge.
export function baseLayersFor(identity) {
  return [
    { src: baseSrcFor(identity), z: 0,            isBase: true  },
    { src: hairSrcFor(identity), z: SLOT_Z.hair,  isBase: false },
  ];
}

// ── Avatar V2 feature flag + C2 render resolvers (Section 155G) ────────────────
// AVATAR_V2 is the master switch for the C2 render pipeline. DEFAULT OFF — the
// legacy render path is the runtime default and is never touched while OFF.
export const AVATAR_V2 = true;

// Runtime check with an optional per-session localStorage override for testing /
// staged rollout WITHOUT a code change: localStorage.setItem('avatar_v2','1').
// Production default stays OFF. Returns false on any error (no localStorage etc.).
export function isAvatarV2() {
  if (AVATAR_V2) return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("avatar_v2") === "1";
  } catch (_e) {
    return false;
  }
}

// ── Shared upper-body framing flag (D-195) ─────────────────────────────────────
// One framing for every hairstyle and render path on the two small surfaces (quiz
// #avatar-display, hub .profile-avatar): the surface adds AVATAR_FRAMING_CLASS to
// its avatar root and that page's CSS grows every layer box 1.5× about the box's
// top centre and clips below the hips. Layer transforms are relative to their own
// box, so they stay aligned. DEFAULT OFF — while off no class is added and the
// surfaces render exactly as before. Per-browser opt-in for review WITHOUT a code
// change: localStorage.setItem('avatar_framing','upper'). Returns false on any
// error (no localStorage etc.).
export const AVATAR_FRAMING_UPPER = false;
export const AVATAR_FRAMING_CLASS = "avatar-framing-upper";
export function isAvatarFramingUpper() {
  if (AVATAR_FRAMING_UPPER) return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("avatar_framing") === "upper";
  } catch (_e) {
    return false;
  }
}

// D-196: the framing adapts to what the avatar WEARS. Items in these slots are drawn across the
// whole canvas width (wings 0–100 %) or down to the feet (capes), so ANY shared zoom cuts them
// (D-195 measured up to 72 % of a wing lost at 1.5×). When one of them is equipped the figure keeps
// today's whole-canvas view — nothing of the item is lost; the face simply stays at today's size.
// The decision is per SLOT, never per item, and the figure is never scaled per layer.
export const AVATAR_FRAMING_WIDE_SLOTS = Object.freeze(["back"]);
// Should this surface frame the avatar? The flag (or opt-in) AND no wide-slot item equipped.
// equippedSlots: { slot: itemId } as the surfaces already hold it; anything else counts as empty.
export function avatarFramingOnFor(equippedSlots) {
  if (!isAvatarFramingUpper()) return false;
  const slots = (equippedSlots && typeof equippedSlots === "object") ? equippedSlots : {};
  return !AVATAR_FRAMING_WIDE_SLOTS.some((s) => !!slots[s]);
}

// C2 base bodies — full body_type × skin_tone matrix. Each pair maps to a concrete
// flat C2 SVG honoring the locked C2 geometry contract (head cx=80 cy=50 r=30, eyes
// cx=68/92 cy=47, ears, neck, arm rects, hand anchors). Only the torso/shirt/shorts
// silhouette differs by body type; only the skin tokens differ by skin tone. Mirrors
// the legacy BODY_SRCS shape so the two render paths resolve identity the same way.
const BODY_SRCS_C2 = {
  neutral: { medium: "/assets/avatar/base/body-neutral-medium-c2.svg", dark: "/assets/avatar/base/body-neutral-dark-c2.svg" },
  male:    { medium: "/assets/avatar/base/body-male-medium-c2.svg",    dark: "/assets/avatar/base/body-male-dark-c2.svg"    },
  female:  { medium: "/assets/avatar/base/body-female-medium-c2.svg",  dark: "/assets/avatar/base/body-female-dark-c2.svg"  },
};

// Resolves the C2 base body SVG for an identity. Defensive (mirrors baseSrcFor):
// unknown/missing body_type → neutral, unknown/missing skin_tone → medium (via
// skinToneFor), missing identity → neutral medium. Never returns undefined.
export function baseSrcForC2(identity) {
  const bodyType = (identity && typeof identity === "object") ? identity.body_type : null;
  const tone     = skinToneFor(identity);
  const byType   = BODY_TYPES.includes(bodyType) ? BODY_SRCS_C2[bodyType] : BODY_SRCS_C2.neutral;
  return byType?.[tone] ?? BODY_SRCS_C2.neutral.medium;
}

// ── C2 layer z-model (Section 159B) ───────────────────────────────────────────
// Deterministic, collision-free z for the full C2 render stack. Legacy cosmetic
// slots keep their RELATIVE order (aura<back<base<body<torso<neck<hair<headwear<
// face<eyes) but are spread out so they never collide with the C2 base /
// expression / hair / blink layers. Expression is set to z=3 by the surfaces; the
// blink engine keeps its own z=5 (unchanged). Both sit on the head only, below
// hair and above the base — so cosmetics on the torso never interact with them.
//   Collisions resolved vs the legacy SLOT_Z (where headwear==blink==5,
//   body==1==near expr): here headwear=45, blink=5, body=10, expr=3 — all unique.
export const C2_BASE_Z = 0;
export const C2_HAIR_Z = 40;
export const C2_LAYER_Z = {
  aura:     -30,
  back:     -20,
  body:      10,
  torso:     20,
  neck:      30,
  hair:      40,
  headwear:  45,
  face:      50,
  eyes:      55,
};

// The C2 identity base: body (img) + hair (INLINE, token-recolored), positioned
// per the C2 z-model. Blink (engine z=5) and expression (surface z=3) sit between.
export function baseLayersForC2(identity) {
  return [
    { src: baseSrcForC2(identity), z: C2_BASE_Z, isBase: true,  inline: false },
    { src: hairSrcForC2(identity), z: C2_HAIR_Z, isBase: false, inline: true  },
  ];
}

// ── North Star Master raster (167A) — r2 resolvers + manifest ─────────────────
// Step 1 scaffold (docs/167a-master-asset-raster-wiring-plan.md §I.1) + step 3a wiring:
// the r2 manifest + resolvers live ALONGSIDE the existing C2/SVG resolvers (unchanged).
// Phase-1 (D-040 "Master-as-is") is active: `R2_MANIFEST.base` holds the baked base as a
// **temporary PNG preview** (WebP = production target). The render (mountC2Avatar) consults
// these ONLY when `AVATAR_R2` is true — the default since D-101. A browser opted out with
// `localStorage.avatar_r2 = "0"`, or any identity the manifest does not cover, still takes the
// untouched C2/SVG path, byte-for-byte.
//
// Guardrail (docs/167a-architecture-preservation-report.md): 167A is an ASSET migration.
// This block adds resolvers + a manifest; identity model, z-model, engines, render entry
// point and existing public interfaces are untouched.

// Master raster render switch — DEFAULT ON since D-101 (2026-08-08). The owner ended the 167A
// pilot by decision and accepted the current R2 build after a manual check; the remaining §9
// exposure was WAIVED, not passed (docs/167a-phase1-pilot-rollout.md §16). R2 is now the default
// render for every browser; no opt-in is required.
//
// ROLLBACK, two levels, both without a database or user-record change:
//   1. PER BROWSER  — `localStorage.avatar_r2 = "0"` → that browser renders C2. Survives reloads;
//                     clear the key to return to the default.
//   2. GLOBAL       — set `AVATAR_R2 = false` below and redeploy → every browser renders C2,
//                     including ones carrying a stale key (see below).
//
// KEY SEMANTICS ARE DELIBERATELY ASYMMETRIC. Only the exact string "0" is honoured, and only ever
// to force C2. The legacy Phase-1 pilot value "1" is now INERT: it falls through to the default
// like any other value. That is what makes the global rollback absolute — a pilot browser cannot
// pin itself to R2 while the flag says C2 (activation contract: no stale local state may hold a
// user on an outdated variant). Missing, empty, malformed or unreadable storage also falls
// through to the default, so the choice is deterministic and this never throws.
//
// This switch decides ELIGIBILITY only. `isAvatarR2ActiveFor()` still requires the complete
// manifest stack to resolve, and `mountC2Avatar` still runs the D-062 atomic asset gate — an
// unsupported identity (anything but neutral × medium) or a failed mandatory layer renders the
// complete C2 avatar exactly as before.
export const AVATAR_R2 = true;
export function isAvatarR2() {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("avatar_r2") === "0") return false;
  } catch (_e) {
    // storage blocked/unavailable → fall through to the default; never throw
  }
  return AVATAR_R2;
}

// Served raster root + canonical served dimensions (ADR-163D: 1024×1536 master → 512×768).
export const R2_BASE_PATH = "/assets/avatar-r2";
export const R2_SERVED = { width: 512, height: 768 };

// Manifest — logical layer key → produced asset `{ v: version, ext: "webp"|"png" }`
// (a bare number is shorthand for `{ v, ext:"webp" }`). Populating an entry makes the
// matching resolver return a path — consumed by the render ONLY when `AVATAR_R2` is on.
// Naming per §C: body-{body_type}-{skin_tone}-vN · face-{expression}-vN ·
// face-blush-multiply-vN (separate multiply component, PL-B) ·
// eyes-{set}-{iris|fixed}-vN · eyelid-{skin_tone}-vN · hair-northstar-vN.
//
// PHASE-1 (D-040) PREVIEW: the base entry stays the **baked Phase-1 PNG** (`ext:"png"`,
// the deterministic alpha-cut of the Master) — today's render reads ONLY this entry.
// The Phase-2 NEUTRAL layer entries below (face/blush/eyes/hair, registered 2026-07-18
// per the countersigned promotion worksheet docs/167a-phase2-gate3-neutral-asset-
// promotion.md) resolve to the promoted WebP files but have NO consumer yet: the
// Phase-2 decomposed stack switch is the separately gated wiring step (PR C), which
// also bumps the base entry to the decomposed v2 WebP. Until then nothing loads them.
// Only body_type "neutral" × skin_tone "medium" is supported by the raster set (U2);
// every other identity stays on the C2/SVG path by resolver-null fallback.
export const R2_MANIFEST = {
  version:  5,
  base:     { "neutral-medium": 2 }, // body-neutral-medium-v2.webp — the DECOMPOSED D-057 base (no
                                     // face/eyes/hair). The Phase-1 baked v1 PNG stays on disk as the
                                     // historical/rollback asset but is no longer referenced (D-018).
  // face expressions (z3). "neutral" is the ONLY key the render resolves today (faceSrcForR2 is
  // called solely with "neutral"). The four owner-approved D-042 expression layers — proud v1,
  // curious v1, focused v2, determined v2 (docs/167a-phase2-gate3-expression-asset-promotion.md,
  // owner visual sign-off 2026-07-24) — are registered here but DORMANT: no code path requests
  // them, so they change no active behaviour until the separately gated expression-wiring step.
  // focused v1 / determined v1 were OWNER_REJECTED and are NOT promoted or registered.
  face:     { "neutral": 1, "proud": 1, "curious": 1, "focused": 2, "determined": 2 }, // face/face-{expr}-v{n}.webp (z3)
  blush:    { "multiply": 1 },    // face/face-blush-multiply-v1.webp (z2, mix-blend multiply)
  eyesIris: { "neutral": 1 },     // eyes/eyes-neutral-iris-v1.webp (z4, multiply × iris token)
  eyesFixed:{ "neutral": 1 },     // eyes/eyes-neutral-fixed-v1.webp (z4)
  eyelid:   {},                   // Option A countersigned: CSS-ellipse lid — no raster asset
  // Keyed by the identity's hairstyle, plus "northstar" — the generic hair every R2 render used
  // before any per-style asset existed, and still the fallback for a style with no asset of its
  // own (see hairSrcForR2). "afro" is the first per-style R2 asset: owner-approved at real render
  // scale 2026-08-29, produced by the runtime-asset path (downscaleHalf → cwebp -lossless -exact
  // -z 9), decoded byte-identical to its 512×768 reference.
  // "short" is the second, owner-approved at real render scale 2026-08-31 (D-119) on the same
  // path. This registration is LIVE, not dormant: `AVATAR_R2` is true (default ON since D-101),
  // so on deploy a student whose stored `hairstyle` is exactly "short" renders this asset on the
  // next load. The five styles that still have no asset keep resolving to `northstar`, the
  // hairstyle picker stays hidden on the R2 path (avatar.html's hairstyleShapesSupported() reads
  // the render path, never this manifest), and no stored identity is changed by adding a key.
  hair:     { "northstar": 1, "afro": 1, "short": 1 }, // hair/hair-{key}-v{n}.webp (z40, multiply × hair token)
  // COSMETIC garments keyed by the CATALOG ITEM (D-090). Unlike every entry above — which is part of
  // the mandatory figure — this registers a shop item's R2-SPECIFIC artwork: torso/armor-knight-r2-v1
  // .webp, the Ridderdragt re-authored for the R2 silhouette (A2, accepted D-088; promoted D-089,
  // sha 78ca7bf5…). The C2 path keeps using the existing /assets/avatar/shirt/armor-knight.svg, so
  // this is a PER-RENDER-PATH asset on the SAME `shop_items` row: same item id, same purchase, same
  // ownership, no catalog or database change (D-084 §7c).
  // A torso item that is NOT registered here has no R2 artwork and therefore still forces the whole
  // avatar to C2 via D-083 — the registration IS the renderability contract.
  torso:    { "armor-knight": 1 },// torso/armor-knight-r2-v1.webp (z1, above base, far below hair)
};

// Normalise a manifest entry → { v, ext } or null. WebP is the default/production
// format; "png" is a temporary Phase-1 preview fallback (no image dep needed to ship it).
function r2Entry(e) {
  if (typeof e === "number" && e > 0) return { v: e, ext: "webp" };
  if (e && typeof e === "object" && typeof e.v === "number" && e.v > 0) {
    return { v: e.v, ext: e.ext === "png" ? "png" : "webp" };
  }
  return null;
}

function r2Path(slot, name, entry) {
  return R2_BASE_PATH + "/" + slot + "/" + name + "-v" + entry.v + "." + entry.ext;
}

// Resolvers — mirror the C2 resolvers for the raster set. Each returns an r2 path ONLY
// when the manifest registers a produced asset, else null (→ C2/SVG fallback). Never throw.
export function baseSrcForR2(identity) {
  const bodyType = BODY_TYPES.includes(identity && identity.body_type) ? identity.body_type : "neutral";
  const tone = skinToneFor(identity);
  const key = bodyType + "-" + tone;
  const e = r2Entry(R2_MANIFEST.base[key]);
  return e ? r2Path("base", "body-" + key, e) : null;
}

export function faceSrcForR2(expression) {
  const key = (typeof expression === "string" && expression.length > 0) ? expression : "neutral";
  const e = r2Entry(R2_MANIFEST.face[key]);
  return e ? r2Path("face", "face-" + key, e) : null;
}

export function eyesSrcForR2(set) {
  const key = (typeof set === "string" && set.length > 0) ? set : "neutral";
  const ie = r2Entry(R2_MANIFEST.eyesIris[key]);
  const fe = r2Entry(R2_MANIFEST.eyesFixed[key]);
  const iris  = ie ? r2Path("eyes", "eyes-" + key + "-iris", ie) : null;
  const fixed = fe ? r2Path("eyes", "eyes-" + key + "-fixed", fe) : null;
  return (iris || fixed) ? { iris, fixed } : null;
}

export function eyelidSrcForR2(identity) {
  const tone = skinToneFor(identity);
  const e = r2Entry(R2_MANIFEST.eyelid[tone]);
  return e ? r2Path("eyelid", "eyelid-" + tone, e) : null;
}

// Blush is a SEPARATE multiply component (PL-B countersign): tone-agnostic per-channel
// factors, rendered with mix-blend-mode:multiply between base (z0) and face (z3).
// Lives in the face/ folder per the promotion worksheet (U4 naming decision).
export function blushSrcForR2() {
  const e = r2Entry(R2_MANIFEST.blush["multiply"]);
  return e ? r2Path("face", "face-blush-multiply", e) : null;
}

// The R2 hair the identity's style resolves to, or the generic `northstar` when that style has no
// asset of its own. Mirrors hairSrcForC2's shape: a table lookup with a default, defensive about a
// null or non-object identity.
//
// WHY northstar AND NOT null. Hair is a MANDATORY layer, so returning null drops the WHOLE avatar
// to C2 (r2StackSrcsFor). With one per-style asset registered that would take every student whose
// hairstyle is not `afro` off the R2 path entirely — a rollback of D-101 delivered by a resolver.
// Falling back to northstar keeps today's render exactly as it is for those students and changes
// the picture only for the style that actually has artwork. Once all seven styles are produced,
// switching this fallback to null is the honest end state and a separate decision.
//
// hasOwnProperty, not a bare lookup: `hairstyle` comes from the database, and a value like
// "constructor" would otherwise resolve to an inherited property rather than a registered asset.
export const R2_HAIR_FALLBACK = "northstar";

export function hairSrcForR2(identity) {
  const hairstyle = (identity && typeof identity === "object") ? identity.hairstyle : null;
  const key = (typeof hairstyle === "string" &&
               Object.prototype.hasOwnProperty.call(R2_MANIFEST.hair, hairstyle) &&
               r2Entry(R2_MANIFEST.hair[hairstyle]))
    ? hairstyle
    : R2_HAIR_FALLBACK;
  const e = r2Entry(R2_MANIFEST.hair[key]);
  return e ? r2Path("hair", "hair-" + key, e) : null;
}

// Torso GARMENT resolver (D-090). Keyed by the catalog item's stable asset basename — the same key
// the headwear/eyes/face transform overrides use — so no new identifier is introduced anywhere.
// Returns the R2-specific artwork ONLY for a registered item, else null. Null is meaningful here:
// it is what makes an unregistered torso item fall the whole avatar to C2 (D-083) instead of
// rendering an R2 figure with the garment missing.
export function torsoSrcForR2(itemKey) {
  const key = (typeof itemKey === "string" && itemKey.length > 0) ? itemKey : null;
  if (!key) return null;
  const e = r2Entry(R2_MANIFEST.torso[key]);
  return e ? r2Path("torso", key + "-r2", e) : null;
}

// Whether a Phase-1 raster BASE is available (base alone; face/eyes/hair are baked into
// the Master-as-is base). Used by the step-3a render branch.
export function hasR2BaseFor(identity) {
  return !!baseSrcForR2(identity);
}

// ── Phase-2 decomposed neutral stack (PR C) ───────────────────────────────────
// Binding z-order and blend modes per the countersigned integration composite
// (docs/167a-phase2-gate3-integration-composite.md §6): base 0 · blush 2 (multiply)
// · face 3 · eyes 4 (iris multiply × token, fixed on top) · hair 40 (multiply × token).
export const R2_STACK_Z = { base: 0, blush: 2, face: 3, eyes: 4, hair: 40 };

// U1 (countersigned promotion worksheet §4): the measured Master-brown default iris
// token — the ONLY iris tint in the neutral MVP. NOT a user-selectable EYE_COLOR
// system and NOT a persisted identity field; adopting one is a separate owner decision.
export const R2_IRIS_DEFAULT = "#A34A0F";

// Resolves the COMPLETE decomposed neutral stack for an identity, or null if any
// mandatory piece is missing — the render must never show a partial stack (whole
// stack or C2 fallback). U2: only the exact manifest key `neutral-medium` resolves
// (explicit male/female/dark identities miss the manifest and fall back to C2);
// absent/invalid fields default to neutral/medium, mirroring the C2 defaults.
export function r2StackSrcsFor(identity) {
  const base  = baseSrcForR2(identity);
  const blush = blushSrcForR2();
  const face  = faceSrcForR2("neutral");
  const eyes  = eyesSrcForR2("neutral");
  const hair  = hairSrcForR2(identity);
  if (!base || !blush || !face || !eyes || !eyes.iris || !eyes.fixed || !hair) return null;
  return { base, blush, face, eyesIris: eyes.iris, eyesFixed: eyes.fixed, hair };
}

// Whether the raster stack is the ACTIVE render for this identity (AVATAR_R2 on AND
// the complete decomposed stack resolves). Engine gate anchor: the face is the raster
// face layer, so SVG overlays must not render on top. The C2/SVG path (this = false)
// is unchanged, and is still what an unsupported identity or an opted-out browser renders.
export function isAvatarR2ActiveFor(identity) {
  return isAvatarR2() && !!r2StackSrcsFor(identity);
}

// Granular engine gate (PR C, blink completed by PR D):
//   - expression overlay: OFF on R2 (the neutral raster face is in the stack;
//     raster expression swaps are the future D-042 track), ON on C2 (unchanged).
//   - blink: ON everywhere since PR D — on the active R2 stack with the
//     countersigned Option-A profile, on C2 with the unchanged C2 profile.
//     Which profile applies is decided by blinkConfigFor() below.
export function r2ExpressionOverlayAllowedFor(identity) {
  return !isAvatarR2ActiveFor(identity);
}
export function r2BlinkAllowedFor(identity) {
  return true; // PR D: blink allowed on both paths; profile chosen via blinkConfigFor()
}

// PR D: the SINGLE blink decision for every surface (app.js, hub.html,
// avatar.html). Returns { allowed, mode, skinTone } for BlinkEngine:
//   new BlinkEngine(el, cfg.skinTone, { mode: cfg.mode })   — at init
//   blinkEngine.setProfile(cfg)                              — on re-render
// mode follows the ACTUALLY active render path for the identity
// (isAvatarR2ActiveFor = flag/opt-in AND the complete stack resolves), never the
// raw flag alone — an unsupported identity that falls back to the C2 render
// blinks with the C2 profile, and a missing manifest entry does the same.
// Surfaces must not duplicate R2 geometry or fills; those live in
// BLINK_PROFILES (js/avatar-blink-engine.js).
// r2ActiveOverride (optional boolean): the ACTUAL render path outcome from
// mountC2Avatar (which returns "r2"/"c2" after its atomic asset-load gate). When
// provided it decides the mode, so an asset-load fallback (manifest resolves but a
// mandatory layer failed to load → C2) never leaves R2 lids on a C2 base
// (activation-audit F1). Omitted → the manifest-based isAvatarR2ActiveFor (unchanged
// default; correct at init and for unsupported identities).
export function blinkConfigFor(identity, r2ActiveOverride) {
  const r2Active = typeof r2ActiveOverride === "boolean"
    ? r2ActiveOverride
    : isAvatarR2ActiveFor(identity);
  return {
    allowed: r2BlinkAllowedFor(identity),
    mode: r2Active ? "r2" : "c2",
    skinTone: skinToneFor(identity),
  };
}

// 167A Phase-1 cosmetic slot-gate. On the raster baked base, only cosmetics that render
// BEHIND the figure and are anchor-independent are shown. Head/face/eye items
// (headwear/face/eyes) float on the legacy anchors, and clothing (torso/body/neck) clashes
// with the baked outfit — both are GATED until the Phase-2 anchor revision. This filters
// the RASTER render only (composeR2Layers); the C2/SVG cosmetic path is unchanged. Slot
// names + z are unchanged (no z-model/anchor/shop/ownership change).
export const R2_PHASE1_SAFE_SLOTS = ["aura", "back"];
export function isR2Phase1SafeSlot(slot) {
  return R2_PHASE1_SAFE_SLOTS.indexOf(slot) !== -1;
}

// ── R2 runtime cosmetic support (Phase-2 anchor revision — ADDITIVE) ──────────
// Which cosmetic slots render on the R2 raster stack, their R2-specific z, and the wrapper transform
// that re-seats a C2-canvas asset (viewBox "0 0 160 240") onto the R2 figure. The source asset files
// are NEVER modified. This is DISTINCT from R2_PHASE1_SAFE_SLOTS (aura/back — behind the figure,
// anchor-independent, no transform), which is left byte-functionally UNCHANGED.
// Still GATED (no R2 z / transform here): neck, torso, body.
export const R2_SUPPORTED_COSMETIC_SLOTS = ["aura", "back", "headwear", "eyes", "face", "torso"];
export function isR2SupportedCosmeticSlot(slot) {
  return R2_SUPPORTED_COSMETIC_SLOTS.indexOf(slot) !== -1;
}

// ── D-090: slots whose R2 support is PER ITEM, not per slot ──────────────────
// aura/back/headwear/eyes/face re-seat the SAME C2 asset onto the R2 figure, so slot support implies
// item support: if the C2 asset exists, the R2 layer exists. `torso` is the first slot where that is
// false. The C2 armour is drawn for the C2 arm pose and lands on 0 px of the R2 figure (measured,
// D-082), so an R2 torso item needs its OWN artwork — and only `armor-knight` has any.
// Therefore support for this slot is decided by the manifest, item by item. A second torso item
// added to the shop tomorrow would have no R2 artwork and MUST keep falling back to C2 rather than
// rendering an R2 avatar in its underwear.
export const R2_ITEM_ASSET_SLOTS = ["torso"];
export function r2SlotNeedsItemAsset(slot) {
  return R2_ITEM_ASSET_SLOTS.indexOf(slot) !== -1;
}
// The R2-specific src for a cosmetic, or null when the slot re-seats the C2 asset instead.
export function r2ItemAssetSrcFor(slot, c2Src) {
  if (slot === "torso") return torsoSrcForR2(r2CosmeticBasename(c2Src));
  return null;
}
// Can THIS cosmetic entry render on the R2 stack? Slot support first, then — for the item-asset
// slots — the existence of registered R2 artwork for this exact item.
export function r2CosmeticRenderable(c) {
  if (!c || !c.src || typeof c.z !== "number") return false;   // renders on NEITHER path
  if (!isR2SupportedCosmeticSlot(c.slot)) return false;
  if (r2SlotNeedsItemAsset(c.slot)) return !!r2ItemAssetSrcFor(c.slot, c.src);
  return true;
}

// ── D-082 option B: NO SILENT ITEM LOSS on the R2 stack ──────────────────────
// An equipped cosmetic in a slot the R2 stack cannot render (neck/torso/body) used to be filtered
// out of composeR2Layers with NO fallback: a student who bought and equipped the Ridderdragt (the
// only live `torso` item, 300 coins) saw it on C2 and NOTHING on R2 — no layer, no warning. The
// audit (docs/167a-r2-cosmetic-slot-completion-audit.md, D-082) measured that this item cannot be
// re-seated by the wrapper-transform mechanism that carried headwear/eyes/face (all six arm-side
// elements land on 0 px of R2 figure), so wiring the slot is art production, not a config change.
// Until that art exists, the whole avatar renders C2 while such an item is equipped: the student
// always sees what they paid for, on the proven C2 anchors. Same reasoning as D-077 (shop previews).
//
// Renderability is judged with the SAME criteria composeR2Layers applies to a cosmetic entry
// (`src` present + numeric `z` — what c2CosmeticLayers already validated), so a malformed entry,
// which would not render on the C2 path either, never forces the avatar off R2.
// Returns the DISTINCT unsupported slots present, in encounter order (never throws; [] for junk).
export function r2UnrenderableCosmeticSlots(cosmetics) {
  const list = Array.isArray(cosmetics) ? cosmetics : [];
  const out = [];
  for (const c of list) {
    if (!c || !c.src || typeof c.z !== "number") continue;  // not renderable on EITHER path → ignore
    if (r2CosmeticRenderable(c)) continue;                  // supported → renders on the R2 stack
    if (out.indexOf(c.slot) === -1) out.push(c.slot);
  }
  return out;
}
// True when the WHOLE avatar must fall back to C2 because at least one equipped cosmetic cannot
// render on the R2 stack. Deterministic, pure, no side effects.
export function r2RequiresC2Fallback(cosmetics) {
  return r2UnrenderableCosmeticSlots(cosmetics).length > 0;
}
// R2 z per supported slot. aura/back keep their existing behind-base z (== C2_LAYER_Z, both < base 0,
// so they paint behind the R2 base exactly as before). headwear sits ABOVE the R2 hair
// (R2_STACK_Z.hair = 40). The eyes COSMETIC (glasses) sits at 6 — ABOVE the internal R2 eye stack
// (iris/eyes-fixed z4) and the blink lids (z5), but BELOW the hair (40, so the fringe covers the upper
// rim/temples) and below headwear (45). The face COSMETIC (mask) default sits at 8 — above the eyes
// cosmetic and the internal eye stack + blink lids, under the hair — but a full-face mask (panda) gets a
// per-item z ABOVE the hair (see R2_FACE_Z_OVERRIDES). Each cosmetic is DOM-tagged with its OWN distinct
// marker ("eyes-cosmetic" / "face-cosmetic", see composeR2Layers) so it never collides with the
// mandatory internal "eyes"/"face" layers and the blink/expression engines never touch it.
// The torso GARMENT sits at 1: immediately above the R2 base (0) — it replaces the base tee's pixels
// and its A1 mask is measured against that exact silhouette — and below every face-area layer
// (blush 2, face 3, eyes 4, blink 5, eyes-cosmetic 6, face-cosmetic 8) and far below hair 40 /
// headwear 45, per the D-084 §5 contract "above base, below hair". Nothing else paints on the body,
// so 1 is unambiguous rather than merely available.
export const R2_COSMETIC_Z = { aura: C2_LAYER_Z.aura, back: C2_LAYER_Z.back, headwear: 45, eyes: 6, face: 8, torso: 1 };
// Wrapper CSS transform (+ origin) mapping a C2-canvas headwear asset onto the R2 head. Applied to the
// cosmetic layer only (source SVG untouched). A STANDARD transform for all hats, with version-controlled
// per-item overrides keyed by the STABLE asset basename (e.g. "pirate-hat"). Calibrated against all five
// current headwear items (crown-golden/silver, hat-blue, pirate-hat, bow-yellow).
export const R2_HEADWEAR_TRANSFORM_ORIGIN = "50% 0%";
// CALIBRATED (all five current items reviewed on the R2 avatar surface): the C2-canvas hats align
// NATIVELY on the R2 head (same North Star head anchor), so the standard transform is identity. The
// mechanism is retained so a future hat that needs re-seating is a per-item, version-controlled config
// change (add an entry to R2_HEADWEAR_TRANSFORM_OVERRIDES keyed by asset basename) — never an asset edit.
export const R2_HEADWEAR_TRANSFORM_DEFAULT = "translateY(0%) scale(1)";
export const R2_HEADWEAR_TRANSFORM_OVERRIDES = {
  // e.g. "pirate-hat": "translateY(-4%) scale(1.05)"  — none needed for the current five.
};
// "/assets/avatar/hat/pirate-hat.svg" → "pirate-hat"
export function r2CosmeticBasename(src) {
  if (typeof src !== "string") return "";
  const file = src.split("/").pop() || "";
  return file.replace(/\.[a-z0-9]+$/i, "");
}
export function r2HeadwearTransformFor(src) {
  const key = r2CosmeticBasename(src);
  return {
    transform: R2_HEADWEAR_TRANSFORM_OVERRIDES[key] ?? R2_HEADWEAR_TRANSFORM_DEFAULT,
    origin: R2_HEADWEAR_TRANSFORM_ORIGIN,
  };
}

// Wrapper CSS transform (+ origin) re-seating a C2-canvas eyes/glasses asset (authored on the C2
// eye-line cy≈46–47 in the 160×240 canvas) onto the R2 figure's eye-line (measured cy≈57, iris
// centroids ~(66,57)/(91,57), spacing ≈24.7). Applied to the cosmetic layer only — the source SVG is
// untouched. transform-origin is CENTER (uniform scale about the face centre keeps both lenses on both
// eyes). The STANDARD transform is the pure vertical re-seat a correctly-proportioned front-glasses
// asset needs (C2 cy≈46 → R2 cy≈57 ≈ +4.4% of the 240-tall canvas); a version-controlled per-item
// OVERRIDE keyed by the stable asset basename handles items whose lens size/spacing also differ.
export const R2_EYES_TRANSFORM_ORIGIN = "center";
export const R2_EYES_TRANSFORM_DEFAULT = "translateY(4.4%)";
// The ONLY live eyes catalog item is "Runde Briller" (id `glasses-round`), and since migration
// 20260623000000_bind_glasses_round_basic_svg.sql its image_url is the front-only 164Z asset
// `/assets/avatar/glasses/glasses-round-basic-v1.svg` (asset-basename `glasses-round-basic-v1`). That
// asset's lens spacing (≈24) already matches the R2 eyes (≈24.7), so it needs ONLY the standard
// vertical C2→R2 eye-line re-seat (translateY(4.4%)) — NO scale. Reviewed on the R2 figure: both pupils
// centred in the lenses, reads as round glasses, the fringe covers the upper rim naturally. The
// per-item override table stays as the mechanism for a FUTURE asset whose lens size/spacing differs;
// it is currently EMPTY (the live asset uses the default). Never key it on the legacy
// `glasses-round.svg`, which the catalog no longer serves.
export const R2_EYES_TRANSFORM_OVERRIDES = {
  // e.g. "some-future-wide-glasses": "translateY(1%) scale(0.88)" — none needed for the current item.
};
export function r2EyesTransformFor(src) {
  const key = r2CosmeticBasename(src);
  return {
    transform: R2_EYES_TRANSFORM_OVERRIDES[key] ?? R2_EYES_TRANSFORM_DEFAULT,
    origin: R2_EYES_TRANSFORM_ORIGIN,
  };
}

// Wrapper CSS transform (+ origin) re-seating a C2-canvas face/mask asset onto the R2 face. The three
// live masks are HETEROGENEOUS (authored on the higher C2 face): `ninja-mask` covers the lower face
// (mouth), `hero-mask` is an eye-domino, `panda-mask` is a full-face replacement — so each gets its own
// per-item transform (there is no single sensible standard; the DEFAULT is only a fallback re-seat for a
// future asset). transform-origin CENTER. The source SVGs are NEVER modified. Calibrated on the R2
// figure at avatar/hub/quiz sizes (ninja cloth over the mouth with eyes visible above; hero domino on
// the eye-line; panda full face covered).
export const R2_FACE_TRANSFORM_ORIGIN = "center";
export const R2_FACE_TRANSFORM_DEFAULT = "translateY(5%)";
export const R2_FACE_TRANSFORM_OVERRIDES = {
  "ninja-mask": "translateY(6.5%)",
  "hero-mask": "translateY(5%)",
  "panda-mask": "translateY(6%) scale(1.1)",
};
export function r2FaceTransformFor(src) {
  const key = r2CosmeticBasename(src);
  return {
    transform: R2_FACE_TRANSFORM_OVERRIDES[key] ?? R2_FACE_TRANSFORM_DEFAULT,
    origin: R2_FACE_TRANSFORM_ORIGIN,
  };
}
// Per-item z for the face COSMETIC. Default `R2_COSMETIC_Z.face` (8: above the eye stack + blink + glasses,
// UNDER the hair — for masks that leave the head silhouette, e.g. lower-face ninja, eye-domino hero). A
// full-face mask that REPLACES the whole face (panda, with its own ears/eyes/nose/mouth) must paint ABOVE
// the hair (41: over hair 40, still under headwear 45 so a hat sits on top). Keyed by asset basename.
export const R2_FACE_Z_OVERRIDES = {
  "panda-mask": 41,
};
export function r2FaceZFor(src) {
  const key = r2CosmeticBasename(src);
  return R2_FACE_Z_OVERRIDES[key] ?? R2_COSMETIC_Z.face;
}

// Shop-preview render decision. PILOT POLICY — FORCE_ALL_SHOP_PREVIEWS_TO_C2:
// EVERY shop product-card preview renders the WHOLE C2 stack — always "c2", for every slot,
// regardless of the R2 opt-in. The caller pairs this with mountC2Avatar's forceC2, so the item
// always shows on its proven C2 anchors and no card ever renders the R2 stack.
//
// Why: the grid previously rendered aura/back cards on the R2 stack while every other slot
// (headwear/face/body/…) rendered C2, so the shop grid visibly mixed two avatar styles card-to-card
// and looked unfinished. Forcing all cards to C2 keeps the grid consistent (no per-card R2 during the
// pilot). This is a SHOP-PREVIEW-ONLY policy: it does NOT touch the R2 runtime,
// isAvatarR2()/isAvatarR2ActiveFor(), the manifest, or the avatar/hub/quiz render paths — those still
// use R2 under the opt-in. `slot` is kept in the signature for the caller; `isR2Phase1SafeSlot` (used by
// the R2 runtime cosmetic gate) is unchanged.
export function shopPreviewModeFor(slot) {
  return "c2";
}

// Whether a full Phase-2 raster stack (base + hair) is available. True for the supported
// neutral identity since the 2026-07-18 manifest registration, but NOT consumed by any
// render path yet — the Phase-2 stack switch (PR C) is the separately gated wiring step.
export function hasR2StackFor(identity) {
  return !!(baseSrcForR2(identity) && hairSrcForR2(identity));
}

// ── D-242: Northstar wardrobe on the private base figure C — OFF by default ───────────────────────
// A separate figure, not a variant of R2: C's head, eyes and proportions differ from the R2 Master v1
// stack (measured, D-242), so no R2 face/eye/hair/blink layer and no calibrated head item is reused.
// The figure is composed from full-resolution layers (assets/avatar-northstar/, lossless WebP
// 1024×1536, owner-authorised exception to D-127 §2) on ONE canvas before any display scaling: layers
// scaled one by one leave light seams at the neck and between sleeve and body (measured, D-242).
// Only the 19 ready K outfits of the D-239/D-240 review can be chosen; the three known-faulty
// combinations and every untested combination are not part of this integration. The choice lives in
// this browser only (localStorage) — no database, catalog, purchase or ownership change.
// Opt-in on one browser: localStorage.setItem("avatar_northstar", "1") (or avatar.html?northstar=1),
// then pick an outfit in the panel on avatar.html.
export const AVATAR_NORTHSTAR_WARDROBE = false;
export const NORTHSTAR_OPT_IN_KEY = "avatar_northstar";
export const NORTHSTAR_OUTFIT_KEY = "avatar_northstar_outfit";
export const NORTHSTAR_BASE_PATH = "/assets/avatar-northstar";
export const NORTHSTAR_CANVAS = Object.freeze({ width: 1024, height: 1536 });
// The surfaces that show the figure; every other caller (shop previews, tests) keeps today's path.
export const NORTHSTAR_SURFACES = Object.freeze(["quiz", "hub", "avatar"]);
// aura and back paint behind the figure; every other equipped slot makes the WHOLE avatar keep
// today's path (no silent item loss, as D-082).
export const NORTHSTAR_SUPPORTED_COSMETIC_SLOTS = Object.freeze(["aura", "back"]);
// The figure's own layers (C's body with an empty torso, forearms and hands, the head).
export const NORTHSTAR_FIGURE = Object.freeze({ body: "figure-body-v1.webp", arms: "figure-arms-v1.webp", head: "figure-head-v1.webp" });
// The ten items: their layers and their skin-shadow parts (multiply; on C's body, on C's arms).
export const NORTHSTAR_ITEMS = Object.freeze({
  "top-tee-hip-cream":            { category: "top",    layers: ["top-body", "sleeves"], shadows: ["body", "arms"] },
  "top-tee-hip-blue":             { category: "top",    layers: ["top-body", "sleeves"], shadows: ["arms"] },
  "bottom-skirt-sand":            { category: "bottom", layers: ["pants"],               shadows: ["body", "arms"] },
  "bottom-shorts-navy":           { category: "bottom", layers: ["pants"],               shadows: ["body"] },
  "bottom-capri-lightblue":       { category: "bottom", layers: ["pants"],               shadows: ["body"] },
  "bottom-trousers-square-olive": { category: "bottom", layers: ["pants"],               shadows: ["body"] },
  "shoes-sneakers-beige":         { category: "shoes",  layers: ["shoes"],               shadows: ["body"], closed: true },
  "shoes-boots-laceup-black":     { category: "shoes",  layers: ["shoes"],               shadows: ["body"], closed: true },
  "shoes-sneakers-white":         { category: "shoes",  layers: ["shoes"],               shadows: ["body"], closed: true },
  "shoes-ankleboots-brown":       { category: "shoes",  layers: ["shoes"],               shadows: ["body"], closed: true },
});
// The 19 ready outfits (technically OK, no open finding; the assistant's review found them fit as a
// visual prototype and the owner approved the prototype's overall look — not production).
const _NS = (top, bottom, shoes) => Object.freeze({ top: "top-" + top, bottom: "bottom-" + bottom, shoes: "shoes-" + shoes });
export const NORTHSTAR_OUTFITS = Object.freeze({
  K01: _NS("tee-hip-cream", "skirt-sand", "sneakers-beige"),
  K02: _NS("tee-hip-cream", "skirt-sand", "boots-laceup-black"),
  K03: _NS("tee-hip-cream", "skirt-sand", "sneakers-white"),
  K04: _NS("tee-hip-cream", "shorts-navy", "sneakers-beige"),
  K05: _NS("tee-hip-cream", "shorts-navy", "boots-laceup-black"),
  K06: _NS("tee-hip-cream", "shorts-navy", "sneakers-white"),
  K07: _NS("tee-hip-cream", "capri-lightblue", "sneakers-beige"),
  K08: _NS("tee-hip-cream", "capri-lightblue", "boots-laceup-black"),
  K09: _NS("tee-hip-cream", "capri-lightblue", "sneakers-white"),
  K10: _NS("tee-hip-blue", "shorts-navy", "sneakers-beige"),
  K11: _NS("tee-hip-blue", "shorts-navy", "boots-laceup-black"),
  K12: _NS("tee-hip-blue", "shorts-navy", "sneakers-white"),
  K13: _NS("tee-hip-blue", "capri-lightblue", "sneakers-beige"),
  K14: _NS("tee-hip-blue", "capri-lightblue", "boots-laceup-black"),
  K15: _NS("tee-hip-blue", "capri-lightblue", "sneakers-white"),
  K16: _NS("tee-hip-blue", "shorts-navy", "ankleboots-brown"),
  K17: _NS("tee-hip-blue", "trousers-square-olive", "sneakers-white"),
  K18: _NS("tee-hip-blue", "trousers-square-olive", "ankleboots-brown"),
  K19: _NS("tee-hip-blue", "capri-lightblue", "ankleboots-brown"),
});
// Known fault (a double edge at the right hip): never rendered, whatever is stored.
export const NORTHSTAR_KNOWN_FAULTY = Object.freeze([
  "top-tee-hip-blue+bottom-skirt-sand+shoes-sneakers-beige",
  "top-tee-hip-blue+bottom-skirt-sand+shoes-boots-laceup-black",
  "top-tee-hip-blue+bottom-skirt-sand+shoes-sneakers-white",
]);

function _nsStorage(key) {
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null; } catch (_e) { return null; }
}
// The flag, or this browser's explicit opt-in. Never throws.
export function isNorthstarWardrobeOn() {
  if (AVATAR_NORTHSTAR_WARDROBE) return true;
  return _nsStorage(NORTHSTAR_OPT_IN_KEY) === "1";
}
// The outfit stored in this browser, or null for anything that is not one of the 19 K numbers.
export function northstarSelectedOutfit() {
  const k = _nsStorage(NORTHSTAR_OUTFIT_KEY);
  return typeof k === "string" && Object.prototype.hasOwnProperty.call(NORTHSTAR_OUTFITS, k) ? k : null;
}
const _nsSrc = (file) => NORTHSTAR_BASE_PATH + "/" + file;
// The ordered canvas plan for one K outfit, or null when it is not a complete, ready outfit (top AND
// bottom are mandatory — C's body layer has an empty torso). "draw" steps are the stack, bottom first
// (figure: C's own layer; cut: what the closed shoe hides of C, cut out before drawing); "shade" steps
// are the items' skin shadows, applied after the stack in item order (top, bottom, shoes).
export function northstarCanvasPlan(key) {
  const o = typeof key === "string" && Object.prototype.hasOwnProperty.call(NORTHSTAR_OUTFITS, key) ? NORTHSTAR_OUTFITS[key] : null;
  return o ? northstarPlanFor(o) : null;
}
// D-244: the same plan for any outfit { top, bottom, shoes } over an item table of the NORTHSTAR_ITEMS shape (category, layers,
// shadows, closed) and a layer directory — what the batch export checks its layers with. Null for an incomplete outfit or a
// known-faulty combination.
export function northstarPlanFor(o, itemTable = NORTHSTAR_ITEMS, basePath = NORTHSTAR_BASE_PATH) {
  if (!o || typeof o !== "object") return null;
  const _nsSrc = (file) => basePath + "/" + file;
  const ids = [o.top, o.bottom, o.shoes], items = ids.map((id) => (typeof id === "string" && Object.prototype.hasOwnProperty.call(itemTable, id) ? itemTable[id] : null));
  if (items.some((it) => !it)) return null;
  if (items[0].category !== "top" || items[1].category !== "bottom" || items[2].category !== "shoes") return null;
  if (NORTHSTAR_KNOWN_FAULTY.indexOf(ids.join("+")) !== -1) return null;
  const cut = items[2].closed ? _nsSrc("hide-" + o.shoes + "-v1.webp") : null;
  const figure = (file) => ({ op: "draw", src: _nsSrc(file), figure: true, cut });
  const layer = (id, l) => ({ op: "draw", src: _nsSrc(id + "-" + l + "-v1.webp") });
  return [
    figure(NORTHSTAR_FIGURE.body),
    ...items[2].layers.map((l) => layer(o.shoes, l)),
    ...items[1].layers.map((l) => layer(o.bottom, l)),
    ...items[0].layers.filter((l) => l !== "sleeves").map((l) => layer(o.top, l)),
    figure(NORTHSTAR_FIGURE.arms),
    ...items[0].layers.filter((l) => l === "sleeves").map((l) => layer(o.top, l)),   // a sleeveless top has none
    { op: "draw", src: _nsSrc(NORTHSTAR_FIGURE.head) },
    ...ids.flatMap((id, k) => items[k].shadows.map((part) => ({ op: "shade", src: _nsSrc(id + "-shadow-" + part + "-v1.webp") }))),
  ];
}
// Executes a plan on straight-alpha RGBA pixel arrays of n pixels (pixelsOf(src) → Uint8ClampedArray),
// with the item pipeline's own arithmetic (D-242): the draws accumulate premultiplied and are rounded
// once (overStack); a figure layer loses every pixel its cut mask covers; then each shadow multiplies
// the composite where C's body or arms is the topmost layer with alpha ≥ 128 (applyShadow, D-214). The
// same function runs in the browser and in the build tool's equivalence check. Pure; never throws for
// a well-formed plan.
export function northstarCompose(plan, pixelsOf, n) {
  const acc = new Float64Array(n * 4), top = new Uint8Array(n);   // top: 1 = C's own layer, 2 = an item or the head
  for (const step of plan) {
    if (step.op !== "draw") continue;
    const L = pixelsOf(step.src), M = step.cut ? pixelsOf(step.cut) : null, mark = step.figure ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const j = i * 4; let a8 = L[j + 3];
      if (M && M[j + 3]) a8 = 0;
      if (!a8) continue;
      const a = a8 / 255;
      for (let c = 0; c < 3; c++) acc[j + c] = L[j + c] * a + acc[j + c] * (1 - a);
      acc[j + 3] = a + acc[j + 3] * (1 - a);
      if (a8 >= 128) top[i] = mark;
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { const j = i * 4, a = acc[j + 3]; out[j + 3] = Math.round(a * 255); if (a) for (let c = 0; c < 3; c++) out[j + c] = Math.round(acc[j + c] / a); }
  for (const step of plan) {
    if (step.op !== "shade") continue;
    const S = pixelsOf(step.src);
    for (let i = 0; i < n; i++) {
      const j = i * 4, a = S[j + 3]; if (!a || top[i] !== 1) continue;
      for (let c = 0; c < 3; c++) out[j + c] = Math.round(out[j + c] * (1 - a / 255 + (a / 255) * S[j + c] / 255));
    }
  }
  return out;
}
// What mountC2Avatar shows on the Northstar path, or null for today's path: the flag/opt-in is off,
// the surface is not one of NORTHSTAR_SURFACES, no valid K outfit is stored, or an equipped cosmetic
// sits in a slot the figure does not support. Supported cosmetics keep their src and C2 z.
export function northstarRenderFor(surface, cosmetics) {
  if (!isNorthstarWardrobeOn()) return null;
  if (NORTHSTAR_SURFACES.indexOf(surface) === -1) return null;
  const key = northstarSelectedOutfit(), plan = northstarCanvasPlan(key);
  if (!plan) return null;
  const list = Array.isArray(cosmetics) ? cosmetics : [];
  const out = [];
  for (const c of list) {
    if (!c || !c.src || typeof c.z !== "number") continue;   // renders on no path → ignored, as on R2
    if (NORTHSTAR_SUPPORTED_COSMETIC_SLOTS.indexOf(c.slot) === -1) return null;
    out.push({ src: c.src, z: C2_LAYER_Z[c.slot] ?? c.z, isBase: false, inline: false, marker: "northstar-cosmetic" });
  }
  return { key, plan, cosmetics: out };
}
