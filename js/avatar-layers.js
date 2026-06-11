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

// Resolves the base body SVG for an identity. Defensive: null, '{}', garbage,
// or unknown body_type all resolve to the neutral base — a broken identity can
// never produce a broken avatar.
// Section 152A: every body type resolves to the shared base (no visual change).
// Section 152C swaps per-body-type files HERE — the single switch point.
export function baseSrcFor(identity) {
  const bodyType = (identity && typeof identity === "object") ? identity.body_type : null;
  if (!BODY_TYPES.includes(bodyType)) return BASE_SRC;
  return BASE_SRC;
}
