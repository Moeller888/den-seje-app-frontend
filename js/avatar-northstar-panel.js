// D-242: the local opt-in panel of the Northstar wardrobe on avatar.html. Shown ONLY in a browser that
// opted in (localStorage avatar_northstar = "1", or avatar.html?northstar=1; ?northstar=0 removes the
// opt-in and the stored outfit). Lists the 19 ready K outfits; the choice is stored in this browser
// only — no database, catalog, purchase or ownership change — and the page reloads so every surface
// and engine starts on the chosen path. "Nuværende avatar" removes the stored outfit.
// D-275: a second row offers the 16 owner-approved print tees (D-274) for the outfits whose top is the
// cream tee (K01–K09); stored the same way (avatar_northstar_tee), ignored for every other outfit.
import { NORTHSTAR_OUTFITS, NORTHSTAR_OPT_IN_KEY, NORTHSTAR_OUTFIT_KEY, NORTHSTAR_TEE_KEY, NORTHSTAR_PRINT_TEES, isNorthstarWardrobeOn, northstarSelectedOutfit, northstarSelectedTee, northstarTeeAllowed } from "./avatar-layers.js";

function store(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); return true; } catch (_e) { return false; }
}

export function applyNorthstarUrlOptIn(search) {
  let v = null;
  try { v = new URLSearchParams(search || "").get("northstar"); } catch (_e) { v = null; }
  if (v === "1") store(NORTHSTAR_OPT_IN_KEY, "1");
  else if (v === "0") { store(NORTHSTAR_OPT_IN_KEY, null); store(NORTHSTAR_OUTFIT_KEY, null); store(NORTHSTAR_TEE_KEY, null); }
  return v;
}

export function mountNorthstarPanel(panel, preview) {
  if (!panel || !isNorthstarWardrobeOn()) return false;
  const current = northstarSelectedOutfit(), tee = northstarSelectedTee(), teeOk = northstarTeeAllowed(current), shown = teeOk && tee ? tee : null;
  panel.textContent = "";
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "Northstar-garderobe (lokal test)";
  const status = document.createElement("p");
  status.className = "northstar-status";
  status.setAttribute("role", "status");
  const pick = (key, value) => { if (store(key, value)) location.reload(); else status.textContent = "Valget kunne ikke gemmes i denne browser."; };
  const row = (cls) => { const d = document.createElement("div"); d.className = "northstar-outfits " + cls; return d; };
  const button = (list, label, key, value, on, disabled) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "northstar-outfit";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(on));
    if (disabled) b.disabled = true;
    else b.addEventListener("click", () => pick(key, value));
    list.appendChild(b);
  };
  const list = row("northstar-outfit-list");
  for (const k of Object.keys(NORTHSTAR_OUTFITS)) button(list, k, NORTHSTAR_OUTFIT_KEY, k, k === current, false);
  button(list, "Nuværende avatar", NORTHSTAR_OUTFIT_KEY, null, current === null, false);
  const teeTitle = document.createElement("div");
  teeTitle.className = "northstar-subtitle";
  teeTitle.textContent = "T-shirt med tryk (til K01–K09)";
  const tees = row("northstar-tee-list");
  for (const [id, t] of Object.entries(NORTHSTAR_PRINT_TEES)) button(tees, t.label, NORTHSTAR_TEE_KEY, id, id === shown, !teeOk);
  button(tees, "Outfittets egen T-shirt", NORTHSTAR_TEE_KEY, null, teeOk && !shown, !teeOk);
  const what = () => (current ? current + (shown ? " med " + NORTHSTAR_PRINT_TEES[shown].label : "") : "");
  const describe = () => {
    const path = preview && preview.dataset ? preview.dataset.avatarRenderPath : null;
    if (!current) status.textContent = "Vælg et outfit for at se den nye figur. Valget gemmes kun i denne browser.";
    else if (path === "northstar") status.textContent = what() + " vises. Figuren blinker ikke endnu og har et neutralt udtryk." + (teeOk ? "" : " T-shirts med tryk kan vælges til K01–K09.");
    else if (path) status.textContent = what() + " er valgt, men den nuværende avatar vises: noget af dit udstyr passer ikke til den nye figur endnu, eller et lag kunne ikke hentes.";
  };
  describe();
  if (preview && typeof MutationObserver !== "undefined") new MutationObserver(describe).observe(preview, { attributes: true, attributeFilter: ["data-avatar-render-path"] });
  panel.appendChild(title);
  panel.appendChild(list);
  panel.appendChild(teeTitle);
  panel.appendChild(tees);
  panel.appendChild(status);
  panel.hidden = false;
  return true;
}
