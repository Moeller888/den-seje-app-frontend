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

// Section 152C: per-body-type base files. All variants honor the locked
// geometry contract (head cx=80 cy=50 r=30, eyes cx=68/92 cy=47, arm rects,
// equipment anchors, skin gradient) and share the expressions + hair layer.
const BODY_SRCS = {
  neutral: BASE_SRC,
  male:    "/assets/avatar/base/body-male.svg",
  female:  "/assets/avatar/base/body-female.svg",
};

// Resolves the base body SVG for an identity. Defensive: null, '{}', garbage,
// or unknown body_type all resolve to the neutral base — a broken identity can
// never produce a broken avatar.
export function baseSrcFor(identity) {
  const bodyType = (identity && typeof identity === "object") ? identity.body_type : null;
  if (!BODY_TYPES.includes(bodyType)) return BASE_SRC;
  return BODY_SRCS[bodyType] ?? BASE_SRC;
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

// The identity base of every avatar render: body + hair, z-ascending.
// ALL render surfaces (avatar.html, hub.html, app.js, shop.html) must build
// their layer stack from this helper so the surfaces can never diverge.
export function baseLayersFor(identity) {
  return [
    { src: baseSrcFor(identity), z: 0,            isBase: true  },
    { src: hairSrcFor(identity), z: SLOT_Z.hair,  isBase: false },
  ];
}
