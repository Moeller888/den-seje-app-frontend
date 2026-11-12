// D-371 NH-4 — the call's own input images, built from the CLEAN head layer in its original coordinates (the D-371 square: figure x 256…767,
// y 0…511, ×2 nearest = 1024×1024). Deterministic, offline; no image call. Image 2 (style) is D-371's existing reference, reused unchanged.
//   Image 1  northstar-nh4-clean-head-1024.png  the clean head on transparency — the image the model edits
//   Image 3  northstar-nh4-guide-1024.png       the clean head faded; the zone hair may fill (blue), the target hairline and the temples' ends
//                                                (dark blue), and keep-clear marks on brows, eyes and both ear junctions (red)
// The face, brows, ears and skin of the final composite always come from the clean head layer itself (northstar-hair-nh4-post.mjs).
// Usage: node tools/avatar/northstar-hair-nh4-inputs.mjs --base <clean head png> --ear <ear-on-top mask png> --out <empty dir outside the repository>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import * as T from "./northstar-hair-template-d371.mjs";
import { encodePng, decodePng, pixelSha256 } from "./r3-hair-tool-v2.mjs";
import { buildZones, HAIRLINE, TEMPLES, JUNCTIONS } from "./northstar-hair-nh4-zones.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const W = 1024, H = 1536, N = W * H;
export const NAMES = Object.freeze({ head: "northstar-nh4-clean-head-1024.png", guide: "northstar-nh4-guide-1024.png" });
export const COLOURS = Object.freeze({ zone: [120, 160, 225], keep: [225, 50, 50], line: [30, 50, 140], junction: [200, 20, 20], zoneAlpha: 0.42, keepAlpha: 0.6, fade: 0.4 });

/** Image 1 and Image 3 (1024×1024 RGBA each) from the template, the clean head and its ear mask. */
export function inputImages(t, base, ear) {
  const Z = buildZones(t, base, ear), K = COLOURS;
  const G = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) { const a = base[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) { const v = base[i * 4 + c] * a + 255 * (1 - a); G[i * 4 + c] = Math.round(255 - (255 - v) * K.fade); } G[i * 4 + 3] = 255; }
  const tint = (m, rgb, k) => { for (let i = 0; i < N; i++) if (m[i]) for (let c = 0; c < 3; c++) G[i * 4 + c] = Math.round(G[i * 4 + c] * (1 - k) + rgb[c] * k); };
  tint(Z.ZONE, K.zone, K.zoneAlpha); tint(Z.KEEP, K.keep, K.keepAlpha);
  const dot = (cx, cy, r, rgb) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) G.set([...rgb, 255], (y * W + x) * 4); };
  for (let k = 1; k < HAIRLINE.length; k++) { const [x0, y0] = HAIRLINE[k - 1], [x1, y1] = HAIRLINE[k], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2); for (let s = 0; s <= n; s++) dot(Math.round(x0 + (x1 - x0) * s / n), Math.round(y0 + (y1 - y0) * s / n), 1, K.line); }
  for (const p of Object.values(TEMPLES)) dot(...p, 4, K.line); for (const p of Object.values(JUNCTIONS)) dot(...p, 3, K.junction);
  return { head: T.cropOut(base, 2), guide: T.cropOut(G, 2) };
}

function main() {
  const args = process.argv.slice(2), arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null), outside = (d) => { if (!d) return false; const r = relative(ROOT, resolve(d)); return r.startsWith("..") || isAbsolute(r); };
  const BASE = arg("--base"), EAR = arg("--ear"), OUT = arg("--out");
  if (!BASE || !EAR || !OUT) throw new Error("--base <clean head png> --ear <ear mask png> --out <empty dir outside the repository>");
  for (const f of [BASE, EAR, OUT]) if (!outside(f)) throw new Error("the clean head, its mask and the output stay outside the repository: " + f);
  if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("output directory not empty"); mkdirSync(OUT, { recursive: true });
  const img = inputImages(T.buildTemplate(), decodePng(readFileSync(BASE)).px, decodePng(readFileSync(EAR)).px);
  for (const [k, px] of Object.entries(img)) { writeFileSync(join(OUT, NAMES[k]), encodePng(1024, 1024, px)); console.log(NAMES[k], pixelSha256(px)); }
}
if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
