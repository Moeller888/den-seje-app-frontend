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
export const AVATAR_V2 = false;

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
