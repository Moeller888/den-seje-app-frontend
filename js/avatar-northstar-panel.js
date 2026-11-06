// D-242: the local opt-in panel of the Northstar wardrobe on avatar.html. Shown ONLY in a browser that
// opted in (localStorage avatar_northstar = "1", or avatar.html?northstar=1; ?northstar=0 removes the
// opt-in and the stored outfit). Lists the 19 ready K outfits; the choice is stored in this browser
// only — no database, catalog, purchase or ownership change — and the page reloads so every surface
// and engine starts on the chosen path. "Nuværende avatar" removes the stored outfit.
// D-275: a second row offers the 16 owner-approved print tees (D-274) for the outfits whose top is the
// cream tee (K01–K09); stored the same way (avatar_northstar_tee), ignored for every other outfit.
// D-283: a third row offers the 2 owner-approved solid trousers (D-281) in place of the outfit's bottom wherever the top and shoes are
// a pair D-281 checked; stored the same way (avatar_northstar_pants). "Outfittets egen underdel" returns to the outfit's own bottom.
// D-308: a fourth row offers the 4 owner-approved SV1-V5 shoes (D-305) only where the whole effective outfit is one of the 21 approved
// combinations; an unavailable shoe is disabled and the reason is written under the row. Stored the same way (avatar_northstar_shoes);
// "Outfittets egne sko" returns to the outfit's own shoes. D-314: the list now holds 326 combinations (also the blue tee and the 16 print
// tees); the reasons name what is still not approved. D-331: the row also offers the 2 owner-approved AB-1 ankle boots (D-326), each
// against its own list of 180 combinations; the same rule, store and fallback.
// D-337: a fifth row offers the 6 owner-approved sweaters (D-336) only where the whole effective outfit with the sweater is one of the
// approved combinations (D-336's 30 with the beige sneakers, D-340's 240 with the other shoes); stored the same way (avatar_northstar_sweater); "Outfittets egen top" returns.
// D-348: the row (now "Overdel") also offers the 6 owner-approved tank tops (D-345/D-348), each against its own list of 264 combinations;
// the same store, so at most one sweater or tank top is chosen; the same rule and fallback.
// D-357: the panel is every pupil's wardrobe. With saveChoice (avatar.html) a choice is saved on the pupil's account and the labels are
// words, not K numbers; without it (the opt-in with the flag off, the verifiers) it is stored in this browser as before.
import { northstarChoiceWith, NORTHSTAR_OUTFITS, NORTHSTAR_OPT_IN_KEY, NORTHSTAR_OUTFIT_KEY, NORTHSTAR_TEE_KEY, NORTHSTAR_PANTS_KEY, NORTHSTAR_SHOES_KEY, NORTHSTAR_PRINT_TEES, NORTHSTAR_SOLID_PANTS, NORTHSTAR_SHOE_CHOICES, NORTHSTAR_SWEATER_KEY, NORTHSTAR_LS2_SWEATERS, NORTHSTAR_TANKS, NORTHSTAR_TOP_CHOICES, isNorthstarWardrobeOn, northstarSelectedOutfit, northstarSelectedTee, northstarSelectedPants, northstarSelectedShoe, northstarTeeAllowed, northstarPantsAllowed, northstarShoeAllowed, northstarSelectedSweater, northstarSweaterAllowed, northstarOutfitFor } from "./avatar-layers.js";

function store(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); return true; } catch (_e) { return false; }
}

export function applyNorthstarUrlOptIn(search) {
  let v = null;
  try { v = new URLSearchParams(search || "").get("northstar"); } catch (_e) { v = null; }
  if (v === "1") store(NORTHSTAR_OPT_IN_KEY, "1");
  else if (v === "0") { store(NORTHSTAR_OPT_IN_KEY, null); store(NORTHSTAR_OUTFIT_KEY, null); store(NORTHSTAR_TEE_KEY, null); store(NORTHSTAR_PANTS_KEY, null); store(NORTHSTAR_SHOES_KEY, null); store(NORTHSTAR_SWEATER_KEY, null); }
  return v;
}

// The words for one K outfit: its top, bottom and shoes.
const NAMES = Object.freeze({
  "top-tee-hip-cream": "Creme T-shirt", "top-tee-hip-blue": "Blå T-shirt",
  "bottom-skirt-sand": "sandfarvet nederdel", "bottom-shorts-navy": "marineblå shorts", "bottom-capri-lightblue": "lyseblå capribukser", "bottom-trousers-square-olive": "olivengrønne bukser",
  "shoes-sneakers-beige": "beige sneakers", "shoes-boots-laceup-black": "sorte snørestøvler", "shoes-sneakers-white": "hvide sneakers", "shoes-ankleboots-brown": "brune støvletter",
});
export function northstarOutfitLabel(key) {
  const o = typeof key === "string" && Object.prototype.hasOwnProperty.call(NORTHSTAR_OUTFITS, key) ? NORTHSTAR_OUTFITS[key] : null;
  return o ? NAMES[o.top] + ", " + NAMES[o.bottom] + ", " + NAMES[o.shoes] : "";
}

export function mountNorthstarPanel(panel, preview, { saveChoice = null } = {}) {
  if (!panel || !isNorthstarWardrobeOn()) return false;
  const current = northstarSelectedOutfit(), tee = northstarSelectedTee(), teeOk = northstarTeeAllowed(current), shown = teeOk && tee ? tee : null;
  const pants = northstarSelectedPants(), pantsOk = northstarPantsAllowed(current, shown), shownPants = pantsOk && pants ? pants : null;
  const shoe = northstarSelectedShoe(), shownShoe = shoe && northstarShoeAllowed(current, shown, shownPants, shoe) ? shoe : null;
  const sweater = northstarSelectedSweater(), shownSweater = sweater && northstarSweaterAllowed(current, shown, shownPants, shownShoe, sweater) ? sweater : null;
  panel.textContent = "";
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = saveChoice ? "Ny avatar" : "Northstar-garderobe (lokal test)";
  const status = document.createElement("p");
  status.className = "northstar-status";
  status.setAttribute("role", "status");
  const pick = async (key, value) => {
    if (!saveChoice) { if (store(key, value)) location.reload(); else status.textContent = "Valget kunne ikke gemmes i denne browser."; return; }
    const buttons = Array.from(panel.querySelectorAll("button")), was = buttons.map((b) => b.disabled);
    buttons.forEach((b) => { b.disabled = true; });
    status.textContent = "Gemmer …";
    let ok = false;
    try { ok = (await saveChoice(northstarChoiceWith(key, value))) === true; } catch (_e) { ok = false; }
    if (ok) { location.reload(); return; }
    buttons.forEach((b, i) => { b.disabled = was[i]; });
    status.textContent = "Valget kunne ikke gemmes. Prøv igen.";
  };
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
  for (const k of Object.keys(NORTHSTAR_OUTFITS)) button(list, saveChoice ? northstarOutfitLabel(k) : k, NORTHSTAR_OUTFIT_KEY, k, k === current, false);
  button(list, "Nuværende avatar", NORTHSTAR_OUTFIT_KEY, null, current === null, false);
  const teeTitle = document.createElement("div");
  teeTitle.className = "northstar-subtitle";
  teeTitle.textContent = saveChoice ? "T-shirt med tryk (til outfits med creme T-shirt)" : "T-shirt med tryk (til K01–K09)";
  const tees = row("northstar-tee-list");
  for (const [id, t] of Object.entries(NORTHSTAR_PRINT_TEES)) button(tees, t.label, NORTHSTAR_TEE_KEY, id, id === shown, !teeOk);
  button(tees, "Outfittets egen T-shirt", NORTHSTAR_TEE_KEY, null, teeOk && !shown, !teeOk);
  const pantsTitle = document.createElement("div");
  pantsTitle.className = "northstar-subtitle";
  pantsTitle.textContent = "Bukser";
  const pantsList = row("northstar-pants-list");
  for (const [id, p] of Object.entries(NORTHSTAR_SOLID_PANTS)) button(pantsList, p.label, NORTHSTAR_PANTS_KEY, id, id === shownPants, !pantsOk);
  button(pantsList, "Outfittets egen underdel", NORTHSTAR_PANTS_KEY, null, pantsOk && !shownPants, !pantsOk);
  const shoesTitle = document.createElement("div");
  shoesTitle.className = "northstar-subtitle";
  shoesTitle.textContent = "Sko";
  const shoesList = row("northstar-shoes-list"), shoeNote = document.createElement("p");
  shoeNote.className = "northstar-note";
  const blocked = [];
  for (const [id, sh] of Object.entries(NORTHSTAR_SHOE_CHOICES)) { const ok = northstarShoeAllowed(current, shown, shownPants, id); button(shoesList, sh.label, NORTHSTAR_SHOES_KEY, id, id === shownShoe, !ok); if (!ok) blocked.push(sh.label); }
  button(shoesList, "Outfittets egne sko", NORTHSTAR_SHOES_KEY, null, !!current && !shownShoe, !current);
  shoeNote.textContent = blocked.length ? blocked.join(", ") + ": ikke mulig her. " + shoeReason(current, shown, shownPants) : "";
  const sweaterTitle = document.createElement("div");
  sweaterTitle.className = "northstar-subtitle";
  sweaterTitle.textContent = "Overdel";
  const sweaterList = row("northstar-sweater-list"), sweaterNote = document.createElement("p");
  sweaterNote.className = "northstar-note";
  const topBlocked = [];
  for (const [group, choices] of [["Trøjerne", NORTHSTAR_LS2_SWEATERS], ["Tanktoppene", NORTHSTAR_TANKS]]) { let blockedHere = 0;
    for (const [id, sw] of Object.entries(choices)) { const ok = northstarSweaterAllowed(current, shown, shownPants, shownShoe, id); button(sweaterList, sw.label, NORTHSTAR_SWEATER_KEY, id, id === shownSweater, !ok); if (!ok) blockedHere++; }
    if (blockedHere) topBlocked.push(group); }
  button(sweaterList, "Outfittets egen top", NORTHSTAR_SWEATER_KEY, null, !!current && !shownSweater, !current);
  sweaterNote.textContent = topBlocked.length ? topBlocked.join(" og ") + ": ikke mulig her. " + sweaterReason(current, shown, shownPants, shownShoe) : "";
  const what = () => { const parts = [shown ? NORTHSTAR_PRINT_TEES[shown].label : null, shownPants ? NORTHSTAR_SOLID_PANTS[shownPants].label : null, shownShoe ? NORTHSTAR_SHOE_CHOICES[shownShoe].label : null, shownSweater ? NORTHSTAR_TOP_CHOICES[shownSweater].label : null].filter(Boolean);
    return current ? (saveChoice ? northstarOutfitLabel(current) : current) + (parts.length ? " med " + parts.join(" og ") : "") : ""; };
  const describe = () => {
    const path = preview && preview.dataset ? preview.dataset.avatarRenderPath : null;
    if (!current) status.textContent = "Vælg et outfit for at se den nye figur. " + (saveChoice ? "Valget gemmes på din konto, og du kan altid skifte tilbage." : "Valget gemmes kun i denne browser.");
    else if (path === "northstar") status.textContent = what() + " vises. Figuren blinker ikke endnu og har et neutralt udtryk." + (teeOk ? "" : saveChoice ? " T-shirts med tryk kan vælges til outfits med creme T-shirt." : " T-shirts med tryk kan vælges til K01–K09.");
    else if (path) status.textContent = what() + " er valgt, men den nuværende avatar vises: noget af dit udstyr passer ikke til den nye figur endnu, eller et lag kunne ikke hentes." + (saveChoice ? " Tag hat og andet udstyr af for at se figuren. Aura og ryg må blive på." : "");
  };
  describe();
  if (preview && typeof MutationObserver !== "undefined") new MutationObserver(describe).observe(preview, { attributes: true, attributeFilter: ["data-avatar-render-path"] });
  panel.appendChild(title);
  panel.appendChild(list);
  panel.appendChild(teeTitle);
  panel.appendChild(tees);
  panel.appendChild(pantsTitle);
  panel.appendChild(pantsList);
  panel.appendChild(shoesTitle);
  panel.appendChild(shoesList);
  panel.appendChild(shoeNote);
  panel.appendChild(sweaterTitle);
  panel.appendChild(sweaterList);
  panel.appendChild(sweaterNote);
  panel.appendChild(status);
  panel.hidden = false;
  return true;
}

// Why an SV1-V5 shoe cannot be chosen for this outfit (the owner approved 326 concrete combinations — the cream, blue and 16 print tees
// over the bottoms each was checked with; charcoal never with long trousers).
function shoeReason(key, tee, pants) {
  const o = northstarOutfitFor(key, tee, pants);
  if (!o) return "Vælg først et outfit.";
  if (/trousers/.test(o.bottom)) return "Koks er ikke godkendt med lange bukser.";
  return "Kombinationen er ikke godkendt.";
}

// Why a sweater cannot be chosen for this outfit (the owner approved each sweater over the skirt, capri and the olive, navy and sand
// trousers with the shoes each was checked with — never with the shorts, and the charcoal sneakers only with the skirt and capri).
// D-348: the same holds for the tank tops (and the olive trousers not with the beige sneakers).
function sweaterReason(key, tee, pants, shoe) {
  const o = northstarOutfitFor(key, tee, pants, shoe);
  if (!o) return "Vælg først et outfit.";
  if (/shorts/.test(o.bottom)) return "Trøjer og tanktoppe er ikke godkendt med shorts.";
  return "Kombinationen er ikke godkendt.";
}
