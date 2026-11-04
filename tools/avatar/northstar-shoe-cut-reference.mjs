// D-319 — THE LAYOUT REFERENCE (Image 1) FOR A SHOE CUT'S SOURCE CALL, built from the cut's reference item (offline; writes outside the
// repository). The reference item of the ankle boot has exactly the defects the new source must avoid (stroke tips at the shaft's corners,
// skin specks along the shaft top), so Image 1 is made from a GUIDE LAYER: the published layer with ONE general rule applied in the
// opening band only — every opaque run at most spurMaxRunPx wide (a stroke tip) and every light, saturated, orange pixel (a skin speck, GUIDE_SKIN_RULE) is made transparent.
// The guide is GUIDANCE for the model (geometry, construction, outline style), not finished image quality, and is never an item.
// What Image 1 fixes and what the prompt changes is documented in D-319.
// Usage: node tools/avatar/northstar-shoe-cut-reference.mjs --cut ankle-boot --out <dir outside the repository> --dwebp <dwebp.exe>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./r3-hair-tool-v2.mjs";
import * as WR from "./northstar-wardrobe.mjs";
import * as SM from "./northstar-shoe-master.mjs";
import * as SS from "./northstar-shoe-source.mjs";
import * as KIT from "./northstar-shoe-cut-kit.mjs";
import { ACCEPT, spurs } from "./northstar-shoe-cut-evaluate.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", ".."), { W, N } = WR;
const sha = (b) => createHash("sha256").update(b).digest("hex");
/** A pixel is a skin speck in the guide when it is light (OKLab L > 0.70), saturated (chroma > 0.075) and orange-hued (hue 1.0–1.5 rad):
 *  the old boot's specks lie at L 0.73–0.90, chroma 0.085–0.092; beige shoe colours have chroma ≤ 0.03 and are kept; the dark boot's
 *  material and outlines never match. Limit (D-319): a LIGHT tan reference item would match too — this guide rule is for dark references. */
export const GUIDE_SKIN_RULE = Object.freeze({ minL: 0.7, minChroma: 0.075, hue: Object.freeze([1.0, 1.5]) });
/** The guide layer: stroke tips and skin-coloured pixels removed in the opening band (rows zone.y0 − 6 … zone.y1 + 4); nothing else. */
export function guideLayer(layer, cut) {
  const o = Uint8ClampedArray.from(layer), sp = spurs(layer, cut), Z = cut.opening.zone, removed = { tips: 0, skin: 0 };
  for (const [x, y, n] of [...sp.left, ...sp.right]) for (let k = 0; k < n; k++) { o[(y * W + x + k) * 4 + 3] = 0; removed.tips++; }
  for (let y = Z.y0 - 6; y < Z.y1 + ACCEPT.openingBandExtraPx; y++) for (let x = cut.source.crop.x0; x < cut.source.crop.x0 + cut.source.crop.w; x++) { const i = (y * W + x) * 4; if (!o[i + 3]) continue; const p = SM.oklab([o[i], o[i + 1], o[i + 2]]); const R = GUIDE_SKIN_RULE, h = Math.atan2(p[2], p[1]); if (p[0] > R.minL && Math.hypot(p[1], p[2]) > R.minChroma && h > R.hue[0] && h < R.hue[1]) { o[i + 3] = 0; removed.skin++; } }
  return { layer: o, removed };
}
async function main() {
  const args = process.argv.slice(2), at = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), OUT = at("--out"), r = relative(ROOT, resolve(OUT || "."));
  if (!OUT || !(r.startsWith("..") || isAbsolute(r))) throw new Error("--out must be outside the repository"); mkdirSync(OUT, { recursive: true });
  const cut = KIT.loadCut(at("--cut") || "ankle-boot"), tmp = join(OUT, "tmp-decode.png"); execFileSync(at("--dwebp"), ["-quiet", join(ROOT, "assets", "avatar-northstar", cut.referenceItem + "-shoes-v1.webp"), "-o", tmp]);
  const pub = Uint8ClampedArray.from(decodePng(readFileSync(tmp)).px), g = guideLayer(pub, cut), img = KIT.layoutCanvas(g.layer, cut), old = KIT.layoutCanvas(pub, cut);
  const f = join(OUT, cut.id + "-layout-image-1.png"), b = Buffer.from(encodePng(img.w, img.h, img.px)); writeFileSync(f, b);
  const fo = join(OUT, cut.id + "-old-source-enlarged.png"), bo = Buffer.from(encodePng(old.w, old.h, old.px)); writeFileSync(fo, bo);
  writeFileSync(join(OUT, cut.id + "-guide-layer.png"), encodePng(W, N / W, g.layer));
  console.log(JSON.stringify({ image1: { file: f, bytes: b.length, sha256: sha(b) }, oldSourceEnlarged: { file: fo, sha256: sha(bo), use: "the generalprøve's stand-in source (the old drawing enlarged; it must fail the detail rule)" }, removed: g.removed }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("REFUSED: " + e.message); process.exit(1); });
