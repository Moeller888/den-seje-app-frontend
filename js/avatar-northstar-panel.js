// D-242: the local opt-in panel of the Northstar wardrobe on avatar.html. Shown ONLY in a browser that
// opted in (localStorage avatar_northstar = "1", or avatar.html?northstar=1; ?northstar=0 removes the
// opt-in and the stored outfit). Lists the 19 ready K outfits; the choice is stored in this browser
// only — no database, catalog, purchase or ownership change — and the page reloads so every surface
// and engine starts on the chosen path. "Nuværende avatar" removes the stored outfit.
import { NORTHSTAR_OUTFITS, NORTHSTAR_OPT_IN_KEY, NORTHSTAR_OUTFIT_KEY, isNorthstarWardrobeOn, northstarSelectedOutfit } from "./avatar-layers.js";

function store(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); return true; } catch (_e) { return false; }
}

export function applyNorthstarUrlOptIn(search) {
  let v = null;
  try { v = new URLSearchParams(search || "").get("northstar"); } catch (_e) { v = null; }
  if (v === "1") store(NORTHSTAR_OPT_IN_KEY, "1");
  else if (v === "0") { store(NORTHSTAR_OPT_IN_KEY, null); store(NORTHSTAR_OUTFIT_KEY, null); }
  return v;
}

export function mountNorthstarPanel(panel, preview) {
  if (!panel || !isNorthstarWardrobeOn()) return false;
  const current = northstarSelectedOutfit();
  panel.textContent = "";
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "Northstar-garderobe (lokal test)";
  const status = document.createElement("p");
  status.className = "northstar-status";
  status.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "northstar-outfits";
  const pick = (key) => { if (store(NORTHSTAR_OUTFIT_KEY, key)) location.reload(); else status.textContent = "Valget kunne ikke gemmes i denne browser."; };
  const button = (label, key, on) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "northstar-outfit";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(on));
    b.addEventListener("click", () => pick(key));
    list.appendChild(b);
  };
  for (const k of Object.keys(NORTHSTAR_OUTFITS)) button(k, k, k === current);
  button("Nuværende avatar", null, current === null);
  const describe = () => {
    const path = preview && preview.dataset ? preview.dataset.avatarRenderPath : null;
    if (!current) status.textContent = "Vælg et outfit for at se den nye figur. Valget gemmes kun i denne browser.";
    else if (path === "northstar") status.textContent = current + " vises. Figuren blinker ikke endnu og har et neutralt udtryk.";
    else if (path) status.textContent = current + " er valgt, men den nuværende avatar vises: noget af dit udstyr passer ikke til den nye figur endnu, eller et lag kunne ikke hentes.";
  };
  describe();
  if (preview && typeof MutationObserver !== "undefined") new MutationObserver(describe).observe(preview, { attributes: true, attributeFilter: ["data-avatar-render-path"] });
  panel.appendChild(title);
  panel.appendChild(list);
  panel.appendChild(status);
  panel.hidden = false;
  return true;
}
