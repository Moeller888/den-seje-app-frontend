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
// these ONLY when `AVATAR_R2` is true (default false → C2/SVG path, byte-for-byte).
//
// Guardrail (docs/167a-architecture-preservation-report.md): 167A is an ASSET migration.
// This block adds resolvers + a manifest; identity model, z-model, engines, render entry
// point and existing public interfaces are untouched.

// Master raster render switch — DEFAULT OFF. `AVATAR_R2` stays false in production; the C2/SVG path
// is the untouched fallback. `isAvatarR2()` also honours a per-browser OPT-IN override
// (`localStorage.avatar_r2 = "1"`) — the mechanism for the small Phase-1 PILOT (167A), mirroring
// `AVATAR_V2`. No cohort/DB targeting; enabled per browser only. Pilot selection criteria +
// enable/disable steps: docs/167a-phase1-pilot-rollout.md.
export const AVATAR_R2 = false;
export function isAvatarR2() {
  if (AVATAR_R2) return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("avatar_r2") === "1";
  } catch (_e) {
    return false;
  }
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
  hair:     { "northstar": 1 },   // hair/hair-northstar-v1.webp (z40, multiply × hair token)
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

export function hairSrcForR2(identity) {
  const e = r2Entry(R2_MANIFEST.hair["northstar"]);
  return e ? r2Path("hair", "hair-northstar", e) : null;
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
// is unchanged. Default AVATAR_R2 false → always false in production.
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
