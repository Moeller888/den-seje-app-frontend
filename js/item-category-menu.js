// D-363: the shared category menu over the item cards on Avatar (avatar.html) and in Butik (shop.html).
// The menu only decides which cards are shown; it never equips, buys or saves anything. The chosen category lives in the
// address (#kategori=<key>), so a reload after a wardrobe choice or a purchase keeps the pupil in the same category, and a link
// from Butik to Avatar can carry it along.
import { ITEM_CATEGORIES, DEFAULT_ITEM_CATEGORY } from "./avatar-layers.js";

const HASH_KEY = "kategori";

/** The category key named in a location hash ("#kategori=hoved"), or the default when it names none. */
export function itemCategoryFromHash(hash) {
  const m = typeof hash === "string" ? /(?:^#|&)kategori=([a-z]+)/.exec(hash) : null;
  return m && ITEM_CATEGORIES.some((c) => c.key === m[1]) ? m[1] : DEFAULT_ITEM_CATEGORY;
}

/** The hash that names a category. */
export function itemCategoryHash(key) {
  return "#" + HASH_KEY + "=" + key;
}

/**
 * Builds the menu in `root` as a tab list: one button per category, the chosen one marked (aria-selected and .cat-tab--active).
 * Arrow keys, Home and End move between the categories (and choose); Tab leaves the menu. `onSelect(key)` is called on every change.
 * Returns { select(key) } or null when root is missing.
 */
export function mountItemCategoryMenu(root, { active = DEFAULT_ITEM_CATEGORY, onSelect } = {}) {
  if (!root) return null;
  root.textContent = "";
  root.classList.add("category-tabs");
  root.setAttribute("role", "tablist");
  root.setAttribute("aria-label", "Kategorier");
  const buttons = ITEM_CATEGORIES.map((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cat-tab";
    b.id = "cat-tab-" + c.key;
    b.dataset.cat = c.key;
    b.setAttribute("role", "tab");
    b.textContent = c.label;
    root.appendChild(b);
    return b;
  });
  let current = null;
  const select = (key, { focus = false } = {}) => {
    const b = buttons.find((x) => x.dataset.cat === key) || buttons[0];
    for (const x of buttons) {
      const on = x === b;
      x.classList.toggle("cat-tab--active", on);
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.tabIndex = on ? 0 : -1;
    }
    if (focus) b.focus();
    if (b.dataset.cat === current) return;
    const first = current === null;
    current = b.dataset.cat;
    // the address is written only when the pupil changes category, so an ordinary visit keeps its plain address
    if (!first) try { history.replaceState(null, "", itemCategoryHash(current)); } catch (_e) { /* the menu still works without the address */ }
    if (typeof onSelect === "function") onSelect(current);
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".cat-tab[data-cat]");
    if (b) select(b.dataset.cat);
  });
  root.addEventListener("keydown", (e) => {
    const i = buttons.findIndex((x) => x.dataset.cat === current);
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % buttons.length
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + buttons.length) % buttons.length
      : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    select(buttons[to].dataset.cat, { focus: true });
  });
  select(active);
  return { select };
}
