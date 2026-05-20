// ── Avatar Layer System — Single Source of Truth ──────────────────────────────
// Import from here in avatar.html, shop.html, hub.html, and app.js.
// Never define SLOT_Z, ALL_SLOTS, or rarity constants in those files.

export const SLOTS = {
  back:     { z: -1, label: "Ryg",                emoji: "🦅", category: "Krop"   },
  body:     { z:  1, label: "Krop",               emoji: "🦎", category: "Krop"   },
  torso:    { z:  2, label: "Overkrop",            emoji: "👕", category: "Krop"   },
  neck:     { z:  3, label: "Hals",               emoji: "📿", category: "Krop"   },
  hair:     { z:  4, label: "Hår",                emoji: "💈", category: "Hoved"  },
  headwear: { z:  5, label: "Hovedbeklædning",    emoji: "🎩", category: "Hoved"  },
  face:     { z:  6, label: "Ansigt",             emoji: "🎭", category: "Hoved"  },
  eyes:     { z:  7, label: "Briller",            emoji: "👓", category: "Hoved"  },
  aura:     { z:  8, label: "Aura",               emoji: "✨", category: "Effekt" },
};

// Ordered slot list — render in this order (lowest z first = rendered behind others)
export const ALL_SLOTS = ["back", "body", "torso", "neck", "hair", "headwear", "face", "eyes", "aura"];

// Flat z-index lookup: slot name → CSS z-index value
export const SLOT_Z      = Object.fromEntries(ALL_SLOTS.map(k => [k, SLOTS[k].z]));
export const SLOT_LABELS = Object.fromEntries(ALL_SLOTS.map(k => [k, SLOTS[k].label]));
export const SLOT_EMOJIS = Object.fromEntries(ALL_SLOTS.map(k => [k, SLOTS[k].emoji]));

// Category definitions for shop tab UI — null slots means "show all"
export const SHOP_CATEGORIES = [
  { key: "alle",   label: "Alle",   slots: null },
  { key: "krop",   label: "Krop",   slots: ["back", "body", "torso", "neck"] },
  { key: "hoved",  label: "Hoved",  slots: ["hair", "headwear", "face", "eyes"] },
  { key: "effekt", label: "Effekt", slots: ["aura"] },
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
