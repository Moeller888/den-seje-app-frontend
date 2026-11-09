// D-363: the shared category menu over the item cards on Avatar and in Butik — the one list of categories, the mapping of every
// slot and wardrobe part, the address that keeps the category, and the wiring of both pages. The behaviour in the browser
// (filtering, keyboard, purchase and wardrobe flows, phone width) is tests/item-category-menu.spec.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => readFileSync(join(ROOT, f), "utf8");
const L = await import(pathToFileURL(join(ROOT, "js", "avatar-layers.js")).href);
const M = await import(pathToFileURL(join(ROOT, "js", "item-category-menu.js")).href);

test("one list: Overdele, Underdele, Sko, Hoved, Ansigt, Ryg, Effekter; Overdele first", () => {
  assert.deepEqual(L.ITEM_CATEGORIES.map((c) => c.label), ["Overdele", "Underdele", "Sko", "Hoved", "Ansigt", "Ryg", "Effekter"]);
  assert.equal(L.DEFAULT_ITEM_CATEGORY, "overdele");
  assert.equal(L.ITEM_CATEGORIES[0].key, L.DEFAULT_ITEM_CATEGORY);
  assert.ok(Object.isFrozen(L.ITEM_CATEGORIES) && L.ITEM_CATEGORIES.every((c) => Object.isFrozen(c) && Object.isFrozen(c.slots)));
  assert.equal(L.SHOP_CATEGORIES, undefined, "the shop's own list is replaced by the shared one");
});

test("every item slot belongs to exactly one category; the shop's kinds land where a pupil looks for them", () => {
  for (const slot of L.ALL_SLOTS) assert.equal(L.ITEM_CATEGORIES.filter((c) => c.slots.includes(slot)).length, 1, slot);
  assert.equal(L.ITEM_CATEGORIES.flatMap((c) => c.slots).length, L.ALL_SLOTS.length);
  const at = (slot) => L.itemCategoryForSlot(slot);
  assert.equal(at("torso"), "overdele");      // Ridderdragt
  assert.equal(at("headwear"), "hoved");      // hats, crowns, the bow
  assert.equal(at("hair"), "hoved");
  assert.equal(at("face"), "ansigt");         // masks
  assert.equal(at("eyes"), "ansigt");         // glasses
  assert.equal(at("back"), "ryg");            // capes, wings
  assert.equal(at("aura"), "effekter");
  for (const odd of [null, undefined, "", "tail"]) assert.equal(at(odd), "effekter", "an item without a known slot is still findable");
});

test("the wardrobe: every top — T-shirts, sweaters and tank tops — under Overdele; bottoms under Underdele; shoes under Sko", () => {
  const byWardrobe = Object.fromEntries(L.ITEM_CATEGORIES.filter((c) => c.wardrobe).map((c) => [c.wardrobe, c.key]));
  assert.deepEqual(byWardrobe, { top: "overdele", bottom: "underdele", shoes: "sko" });
  const pieces = L.northstarPieces();
  assert.equal(pieces.length, 79);
  const tops = pieces.filter((p) => p.category === "top");
  assert.equal(tops.length, 63);
  for (const kind of ["top-tee-", "top-sweater-", "top-tank-"]) assert.ok(tops.some((p) => p.item.startsWith(kind)), kind);
  assert.ok(pieces.every((p) => byWardrobe[p.category]), "every wardrobe part has a category");
  assert.ok(pieces.every((p) => (p.category === "top") === p.item.startsWith("top-")), "no top outside Overdele, nothing else in it");
});

test("the address keeps the category: #kategori=<key>, anything else falls back to Overdele", () => {
  assert.equal(M.itemCategoryHash("hoved"), "#kategori=hoved");
  for (const c of L.ITEM_CATEGORIES) assert.equal(M.itemCategoryFromHash(M.itemCategoryHash(c.key)), c.key);
  for (const bad of ["", "#", "#kategori=", "#kategori=krop", "#kategori=alle", "#x=hoved", null, undefined, 7]) assert.equal(M.itemCategoryFromHash(bad), "overdele", String(bad));
});

test("the menu is a keyboard-usable tab list that only filters", () => {
  const src = read("js/item-category-menu.js");
  for (const s of ['setAttribute("role", "tablist")', 'setAttribute("role", "tab")', "aria-selected", "tabIndex", "ArrowRight", "ArrowLeft", "Home", "End", "history.replaceState"]) assert.ok(src.includes(s), s);
  assert.ok(!/supabase|rpc\(|fetch\(|localStorage/.test(src), "the menu saves nothing and calls nothing");
  const css = read("css/item-category-menu.css");
  assert.match(css, /\.category-tabs \{[^}]*flex-wrap: wrap;/, "the buttons wrap — no horizontal scrolling on a phone");
  assert.match(css, /\.cat-tab:focus-visible/);
});

test("Butik: the shared menu directly over the cards, the old fixed tabs gone, purchase code untouched", () => {
  const H = read("shop.html");
  assert.ok(H.includes('<link rel="stylesheet" href="css/item-category-menu.css">'));
  assert.ok(/<div class="category-tabs" id="categoryTabs"><\/div>\s*<div class="shop-grid" id="shopGrid"><\/div>/.test(H), "menu directly over the grid");
  assert.ok(!H.includes('data-cat="alle"') && !H.includes('data-cat="krop"') && !H.includes("SHOP_CATEGORIES"));
  assert.ok(H.includes("mountItemCategoryMenu(document.getElementById(\"categoryTabs\")"));
  assert.ok(H.includes('id="categoryEmpty"'));
  for (const s of ["/functions/v1/buy-item", "Køb gennemført!", 'data-action="equip-now"', 'data-action="buy-later"', "price-tag", "owned-indicator"]) assert.ok(H.includes(s), s);
  assert.equal((H.match(/"avatar\.html" \+ itemCategoryHash\(activeCategory\)/g) || []).length, 2, "both links to Avatar carry the category");
});

test("Avatar: the menu directly over the wardrobe cards and the pupil's items; the wardrobe heading and status above it", () => {
  const H = read("avatar.html");
  assert.ok(H.includes('<link rel="stylesheet" href="css/item-category-menu.css">'));
  const panel = H.slice(H.indexOf('<div class="inventory-panel">'), H.indexOf('<!-- Titles panel -->'));
  const order = ['id="northstarWardrobe"', 'id="categoryTabs"', 'id="northstarWardrobeCards"', 'id="inventoryGrid"', 'id="categoryEmpty"'].map((s) => panel.indexOf(s));
  assert.ok(order.every((i) => i >= 0) && order.every((i, k) => k === 0 || i > order[k - 1]), "heading, menu, cards, empty message in that order");
  assert.ok(H.includes('cardsRoot: document.getElementById("northstarWardrobeCards")'));
  assert.ok(H.includes("card.dataset.slotType = item.slot_type"));
  assert.ok(!H.includes('id="emptyState"'), "the per-category message replaces the page-wide one");
  const panelJs = read("js/avatar-northstar-panel.js");
  assert.ok(panelJs.includes("grid.dataset.wardrobeCategory = category"));
  assert.ok(panelJs.includes("if (cardsRoot) { cardsRoot.appendChild(grid); continue; }"));
});
