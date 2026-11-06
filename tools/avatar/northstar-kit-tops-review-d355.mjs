// D-355 — two bounded checks of the prepared package (phases of northstar-kit-tops-d355.mjs; no image call; nothing published):
//   armedge — the tee's arm edge. The runtime draws top-body BEFORE C's arms and the sleeves AFTER them (northstarPlanFor), so where C's arm
//             is soft (alpha 1..127) inside the tee, the pixel's layer decides what is seen: in top-body (split at 128, D-354's renderings)
//             C's soft arm edge is drawn over the fabric — the warm dotted line of U-343-1; in sleeves (split at 1, D-349's rule, the
//             published tees and D-355) the fabric is drawn over that edge. For the 11 tees: the staged layers are D-349's rule on the
//             approved layer with C's PUBLISHED arm layer (figure-arms-v1) byte for byte; the dotted-line pixels (top-body over arm alpha
//             1..127) are 0; D-354's approved rendering against D-355's runtime rendering, light and dark: every changed pixel is a moved
//             one, no alpha lower (no hole), none darker (no heavier contour); per side; and the private sheets (both arm edges at 1:1,
//             magnified and at app size, with the changed pixels marked).
//   lists   — the proposed list explained: each cut's pairs with their source, the pairs allowed against those selectable in the panel
//             (the browser's own functions), the pairs left out because no outfit can show them (NOT_SHOWN), and that no restriction of a
//             family is widened.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import { splitLayers } from "./northstar-longsleeve-master-v2.mjs";
import { FROM_ARM_ALPHA } from "./northstar-tee-armline-d349.mjs";
import { flat, crop, grid, down } from "./northstar-wardrobe-poc.mjs";

const { W, N } = WR, H = N / W, LIGHT = [236, 233, 226], DARK = [24, 26, 40], MARK = [255, 0, 200];
const luma = (p, i) => 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];

/** ctx: { A, AL, M (staging manifest), STAGED, px(file) (staged or published, decoded), approvedLayer(c), itemOf(c), ART354, loadPx, TOP_SPLIT } */
export function phaseArmEdge(OUT, ctx) {
  const { A, AL, M, px, approvedLayer, itemOf, ART354, loadPx, TOP_SPLIT, contour } = ctx, V = join(OUT, "armedge"); mkdirSync(V, { recursive: true });
  if (TOP_SPLIT["tee-hip-v2"] !== FROM_ARM_ALPHA) throw new Error("the tee's split is not D-349's");
  const arms = px("figure-arms-v1.webp"), base = { arms }, res = {}, overview = [];
  for (const c of A.approved.filter((a) => a.cut === "tee-hip-v2")) {
    const item = itemOf(c), L = approvedLayer(c), tb = px(item + "-top-body-v1.webp"), sl = px(item + "-sleeves-v1.webp");
    const d349 = splitLayers(L, base, FROM_ARM_ALPHA), d354 = splitLayers(L, base, 128); let ruleDiff = 0; for (let i = 0; i < N * 4; i++) if (d349.layers.topBody[i] !== tb[i] || d349.layers.sleeves[i] !== sl[i]) ruleDiff++;
    const soft = (i) => arms[i * 4 + 3] > 0 && arms[i * 4 + 3] < 128; let dottedNow = 0, dottedD354 = 0, movedPx = 0; const moved = new Uint8Array(N);
    for (let i = 0; i < N; i++) { if (tb[i * 4 + 3] && soft(i)) dottedNow++; if (d354.layers.topBody[i * 4 + 3] && soft(i)) dottedD354++; if (d354.layers.topBody[i * 4 + 3] && !tb[i * 4 + 3]) { moved[i] = 1; movedPx++; } }
    const plan = AL.northstarPlanFor({ top: item, bottom: "bottom-skirt-sand", shoes: "shoes-sneakers-white" }, { ...AL.NORTHSTAR_ITEMS, ...M.itemTable }).map((s) => s.src.split("/").pop());
    const order = { topBody: plan.indexOf(item + "-top-body-v1.webp"), arms: plan.indexOf("figure-arms-v1.webp"), sleeves: plan.indexOf(item + "-sleeves-v1.webp") };
    const r = { item, d349RuleBytesDiffering: ruleDiff, dottedLinePxNow: dottedNow, dottedLinePxInD354Split: dottedD354, movedPx, drawOrder: order, tones: {} };
    const bbox = (side) => { let x0 = W, y0 = H, x1 = 0, y1 = 0; for (let i = 0; i < N; i++) if (moved[i] && (side === "left" ? i % W < W / 2 : i % W >= W / 2)) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return x1 ? [x0 - 10, y0 - 10, x1 + 11, y1 + 11] : null; };
    const boxes = { left: bbox("left"), right: bbox("right") }; r.boxes = boxes; const rows = [];
    for (const [tone, bg] of [["light", LIGHT], ["dark", DARK]]) { const u = JSON.parse(readFileSync(join(ART354, "units", c.id + "--" + tone + ".json"), "utf8")), ref = loadPx(join(ART354, "full", c.id + "--" + tone + ".png"));
      const got = AL.northstarCompose(AL.northstarPlanFor({ top: item, bottom: u.pair.bottom, shoes: u.pair.shoes }, { ...AL.NORTHSTAR_ITEMS, ...M.itemTable }), px, N);
      let changed = 0, outside = 0, alphaLower = 0, darker = 0, lighter = 0, ownLayerPx = 0, inkPx = 0, darkerOnInk = 0, armInkUnder = 0, onContour = 0, darkerOnContour = 0, lumBefore = 0, lumAfter = 0, lumElse = 0, nElse = 0; const side = { left: 0, right: 0 }, mask = new Uint8Array(N);
      for (let i = 0; i < N; i++) { if (![0, 1, 2, 3].some((k) => got[i * 4 + k] !== ref[i * 4 + k])) continue; changed++; mask[i] = 1; if (!moved[i]) outside++; side[i % W < W / 2 ? "left" : "right"]++;
        if (got[i * 4 + 3] < ref[i * 4 + 3]) alphaLower++; const d = luma(got, i) - luma(ref, i); if (d < -2) darker++; else if (d > 2) lighter++;
        // what the pixel shows now: the approved layer's own pixel (opaque) — the garment's fabric or its own contour ink; what it showed: C's soft arm edge over it
        if (L[i * 4 + 3] === 255 && [0, 1, 2].every((k) => got[i * 4 + k] === L[i * 4 + k])) ownLayerPx++; const ink = luma(L, i) < 90; if (ink) { inkPx++; if (d < -2) darkerOnInk++; } if (luma(arms, i) < 90) armInkUnder++; if (contour[i * 4 + 3] >= 128) { onContour++; if (d < -2) darkerOnContour++; lumBefore += luma(ref, i); lumAfter += luma(got, i); } }
      // the tee's contour elsewhere (unchanged pixels of the cut's contour ink on the tee): how dark the outline is where nothing moved
      for (let i = 0; i < N; i++) if (!mask[i] && contour[i * 4 + 3] >= 128 && got[i * 4 + 3] === 255) { lumElse += luma(got, i); nElse++; }
      r.tones[tone] = { pair: u.pair, changedPx: changed, outsideMoved: outside, perSide: side, alphaLower, darker, lighter, nowTheApprovedLayerPx: ownLayerPx, onGarmentInk: inkPx, darkerOnGarmentInk: darkerOnInk, armInkUnderneath: armInkUnder, onCutContour: onContour, darkerOnCutContour: darkerOnContour, contourLumaBefore: onContour ? +(lumBefore / onContour).toFixed(1) : null, contourLumaAfter: onContour ? +(lumAfter / onContour).toFixed(1) : null, contourLumaElsewhere: +(lumElse / nElse).toFixed(1) };
      const a = flat(ref, bg), b = flat(got, bg), m = Uint8ClampedArray.from(b); for (let i = 0; i < N; i++) if (mask[i]) m.set(MARK, i * 4);
      for (const s of ["left", "right"]) { const bx = boxes[s]; if (!bx) continue; const k = Math.max(3, Math.min(8, Math.floor(420 / (bx[3] - bx[1]))));
        rows.push(crop(a, bx, 1), crop(b, bx, 1), crop(m, bx, 1), crop(a, bx, k), crop(b, bx, k), crop(m, bx, k)); }
      const sa = down(a, 300, 450), sb = down(b, 300, 450), blank = { w: 1, h: 1, px: new Uint8ClampedArray([255, 255, 255, 255]) }; rows.push(sa, sb, blank, blank, blank, blank); overview.push(down(a, 150, 225), down(b, 150, 225)); }
    const g = grid(rows, 6, 8); writeFileSync(join(V, "armedge--" + c.id + ".png"), encodePng(g.w, g.h, g.px)); res[c.id] = r; console.log(c.id, JSON.stringify({ rule: ruleDiff, dottedNow, dottedD354, movedPx, light: r.tones.light, dark: r.tones.dark })); }
  const g = grid(overview, 4, 6); writeFileSync(join(V, "armedge--overview--app.png"), encodePng(g.w, g.h, g.px));
  const all = Object.values(res), summary = { tees: all.length, d349RuleExact: all.filter((r) => !r.d349RuleBytesDiffering).length, dottedLinePxNow: all.reduce((s, r) => s + r.dottedLinePxNow, 0), dottedLinePxInD354Split: all.reduce((s, r) => s + r.dottedLinePxInD354Split, 0),
    changedOutsideMoved: all.reduce((s, r) => s + r.tones.light.outsideMoved + r.tones.dark.outsideMoved, 0), alphaLower: all.reduce((s, r) => s + r.tones.light.alphaLower + r.tones.dark.alphaLower, 0), darker: all.reduce((s, r) => s + r.tones.light.darker + r.tones.dark.darker, 0),
    changed: all.reduce((s, r) => s + r.tones.light.changedPx + r.tones.dark.changedPx, 0), nowTheApprovedLayerPx: all.reduce((s, r) => s + r.tones.light.nowTheApprovedLayerPx + r.tones.dark.nowTheApprovedLayerPx, 0), darkerOnGarmentInk: all.reduce((s, r) => s + r.tones.light.darkerOnGarmentInk + r.tones.dark.darkerOnGarmentInk, 0), armInkUnderneath: all.reduce((s, r) => s + r.tones.light.armInkUnderneath + r.tones.dark.armInkUnderneath, 0), onCutContour: all.reduce((s, r) => s + r.tones.light.onCutContour + r.tones.dark.onCutContour, 0), darkerOnCutContour: all.reduce((s, r) => s + r.tones.light.darkerOnCutContour + r.tones.dark.darkerOnCutContour, 0), contourLuma: all.map((r) => [r.tones.light.contourLumaBefore, r.tones.light.contourLumaAfter, r.tones.light.contourLumaElsewhere]),
    changedPerOutfit: [Math.min(...all.flatMap((r) => [r.tones.light.changedPx, r.tones.dark.changedPx])), Math.max(...all.flatMap((r) => [r.tones.light.changedPx, r.tones.dark.changedPx]))], drawOrderSleevesAfterArms: all.every((r) => r.drawOrder.topBody < r.drawOrder.arms && r.drawOrder.arms < r.drawOrder.sleeves) };
  writeFileSync(join(OUT, "armedge.json"), JSON.stringify({ decision: "D-355", what: "the tee's arm edge: D-354's approved rendering (split 128) against D-355's runtime rendering (split 1, D-349)", summary, tees: res }, null, 2) + "\n"); console.log(JSON.stringify(summary));
}

/** The proposed list explained; pure (no image). */
export function lists(AL, kitTopCombos, cutPairs, NOT_SHOWN = {}) {
  const P = cutPairs(AL), C = kitTopCombos(AL), out = { cuts: {} };
  // the tee's pairs by source: the K outfit itself (its own bottom and shoes), the solid trousers (D-281/D-283), a shoe choice (D-305/D-314 SV1, D-326/D-331 AB-1)
  const teeSrc = {}; for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) { if (AL.NORTHSTAR_OUTFITS[k].top !== "top-tee-hip-cream") continue;
    for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) { const o = AL.northstarOutfitFor(k, null, p, s); if (o.top !== "top-tee-hip-cream" || !AL.northstarPlanFor(o)) continue;
      const pants = o.bottom !== AL.NORTHSTAR_OUTFITS[k].bottom, shoe = o.shoes !== AL.NORTHSTAR_OUTFITS[k].shoes, key = o.bottom + "|" + o.shoes;
      const shoeSrc = shoe ? (Object.prototype.hasOwnProperty.call(AL.NORTHSTAR_AB1_BOOTS, s) ? "AB-1-støvle (D-326/D-331)" : "SV1-sko (D-305/D-314)") : "";
      const tag = !pants && !shoe ? k + "'s egne" : [pants ? "bukser (D-281/D-283)" : "", shoeSrc].filter(Boolean).join(" + ") + " på " + k;
      (teeSrc[key] ||= new Set()).add(tag); } }
  const fam = { "tee-hip-v2": { source: "creme-T-shirtens outfits K01–K09 med de tilladte bukse- og skovalg (northstarOutfitFor); de samme 43 par som tryk-T-shirtene", of: (k) => { const t = [...teeSrc[k]], own = t.find((x) => x.endsWith("'s egne")); return own || t.sort()[0]; } },
    "sweater-long-v3": { source: "NORTHSTAR_LS2_COMBOS: D-336's par med beige sneakers og D-340's med de øvrige sko", of: (k) => (k.endsWith("|shoes-sneakers-beige") ? "D-336" : "D-340") },
    "tank-v5": { source: "NORTHSTAR_TANK_COMBOS: D-345/D-348's 44 par (T-shirt-godkendte par uden shorts og uden oliven med beige)", of: () => "D-345/D-348" } };
  const reach = new Set(); for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const s of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) for (const w of Object.keys(AL.NORTHSTAR_KIT_TOPS)) {
    if (!AL.northstarSweaterAllowed(k, t, p, s, w)) continue; const o = AL.northstarOutfitFor(k, t, p, s, w); reach.add([o.top, o.bottom, o.shoes].join("+")); }
  for (const cut of Object.keys(P)) { const omitted = NOT_SHOWN[cut] || [], pairs = [...P[cut]].filter((k) => !omitted.includes(k)).sort(), cc = C.filter((x) => x.cut === cut);
    const rows = pairs.map((k) => { const [b, s] = k.split("|"), here = cc.filter((x) => x.bottom === b && x.shoes === s), sel = here.filter((x) => reach.has([x.top, x.bottom, x.shoes].join("+"))).length; return { bottom: b, shoes: s, source: fam[cut].of(k), selectable: sel === here.length, designs: here.length }; });
    out.cuts[cut] = { source: fam[cut].source, pairs: rows.length, allowed: cc.length, selectable: cc.filter((x) => reach.has([x.top, x.bottom, x.shoes].join("+"))).length, notSelectable: rows.filter((r) => !r.selectable).map((r) => r.bottom + "+" + r.shoes), omitted: omitted.map((k) => k.replace("|", "+")), rows }; }
  // no restriction widened: each family's pair set equals its existing one; the family limits hold
  const fset = (list, item) => new Set(list.filter((k) => k.startsWith(item + "+")).map((k) => k.split("+").slice(1).join("|")));
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const checks = {
    teeEqualsPrintTeePairs: same(P["tee-hip-v2"], (() => { const s = new Set(); for (const k of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of Object.keys(AL.NORTHSTAR_PRINT_TEES)) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const sh of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) { const o = AL.northstarOutfitFor(k, t, p, sh); if (o.top === AL.NORTHSTAR_PRINT_TEES[t].item && AL.northstarPlanFor(o)) s.add(o.bottom + "|" + o.shoes); } return s; })()),
    sweaterEqualsEachApprovedSweater: Object.values(AL.NORTHSTAR_LS2_SWEATERS).every((sw) => same(P["sweater-long-v3"], fset(AL.NORTHSTAR_LS2_COMBOS, sw.item))),
    // the proposal is that list without exactly the pairs no outfit can show — and those are unreachable for the approved sweaters too
    sweaterProposalIsListMinusNotShown: same(new Set(C.filter((x) => x.cut === "sweater-long-v3").map((x) => x.bottom + "|" + x.shoes)), new Set([...P["sweater-long-v3"]].filter((k) => !(NOT_SHOWN["sweater-long-v3"] || []).includes(k)))),
    notShownUnreachableForApprovedSweaters: (NOT_SHOWN["sweater-long-v3"] || []).every((k) => { const [b, s] = k.split("|"); for (const kk of Object.keys(AL.NORTHSTAR_OUTFITS)) for (const t of [null, ...Object.keys(AL.NORTHSTAR_PRINT_TEES)]) for (const p of [null, ...Object.keys(AL.NORTHSTAR_SOLID_PANTS)]) for (const sh of [null, ...Object.keys(AL.NORTHSTAR_SHOE_CHOICES)]) for (const w of Object.keys(AL.NORTHSTAR_LS2_SWEATERS)) { const o = AL.northstarOutfitFor(kk, t, p, sh, w); if (o.bottom === b && o.shoes === s) return false; } return true; }),
    tankEqualsEachApprovedTank: Object.values(AL.NORTHSTAR_TANKS).every((tk) => same(P["tank-v5"], fset(AL.NORTHSTAR_TANK_COMBOS, tk.item))),
    noShortsOnSweaterOrTank: !C.some((x) => x.cut !== "tee-hip-v2" && x.bottom === "bottom-shorts-navy"),
    teeNeverOliveOrBrownBoots: !C.some((x) => x.cut === "tee-hip-v2" && (x.bottom === "bottom-trousers-square-olive" || x.shoes === "shoes-ankleboots-brown")),
    charcoalNeverWithTrousers: !C.some((x) => x.shoes === "shoes-sneakers-low-sv1-charcoal" && /trousers/.test(x.bottom)),
    tankNeverOliveWithBeige: !C.some((x) => x.cut === "tank-v5" && x.bottom === "bottom-trousers-square-olive" && x.shoes === "shoes-sneakers-beige"),
    existingListsUnchanged: AL.NORTHSTAR_LS2_COMBOS.length === 270 && AL.NORTHSTAR_TANK_COMBOS.length === 264 && Object.keys(AL.NORTHSTAR_TOP_CHOICES).length === 12,
  };
  out.total = { allowed: C.length, selectable: [...reach].length, notSelectable: C.length - reach.size }; out.checks = checks; return out;
}
