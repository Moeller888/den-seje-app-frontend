// D-371 NH-4 — the zones on the CLEAN head layer (figure grid 1024×1536), shared by the call's guide (northstar-hair-nh4-inputs.mjs) and the
// checks after the call (northstar-hair-nh4-post.mjs). Deterministic, offline; no image call. The clean head layer and its ear-on-top mask are
// private files outside both clones (their hashes are pinned in plan-nh4-v1.json).
//   ZONE   where hair may lie: the head above the hairline, plus up to 30 px of volume over the crown that tapers to 0 at the temples' ends
//   KEEP   keep-clear: the eyes, 7 px above and 2 px round each brow, and each ear (+2 px)
//   SCALP  the scalp that must be covered: the head inside the zone, 14 px back from the face
export const HAIRLINE = Object.freeze([[386, 304], [384, 280], [388, 256], [398, 236], [430, 226], [480, 222], [530, 220], [580, 222], [612, 232], [628, 254], [634, 280], [632, 304]]);
export const TEMPLES = Object.freeze({ left: [389, 302], right: [633, 302] });
export const JUNCTIONS = Object.freeze({ left: [384, 307], right: [634, 308] });
const W = 1024, H = 1536, N = W * H;

/** The zones of the template `t` (buildTemplate()) on the clean head `base` (RGBA) with its ear-on-top mask `ear` (RGBA, alpha = ear). */
export function buildZones(t, base, ear) {
  const { z } = t;
  const dil = (m, r) => { const o = new Uint8Array(N); for (let i = 0; i < N; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) o[(y + dy) * W + x + dx] = 1; } return o; };
  const head = new Uint8Array(N); for (let i = 0; i < N; i++) if (base[i * 4 + 3] >= 128) head[i] = 1;
  const EAR = new Uint8Array(N); for (let i = 0; i < N; i++) if (ear[i * 4 + 3]) EAR[i] = 1;
  const BROWZ = new Uint8Array(N); for (let i = 0; i < N; i++) if (z.brows.left[i] || z.brows.right[i]) { const x = i % W, y = (i / W) | 0; for (let dy = -7; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) BROWZ[(y + dy) * W + x + dx] = 1; }
  const poly = [...HAIRLINE, [640, 700], [380, 700]];
  const inPoly = (x, y) => { let c = false; for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) { const [xi, yi] = poly[k], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const FACE = new Uint8Array(N); for (let y = 150; y < 520; y++) for (let x = 300; x < 730; x++) if (head[y * W + x] && inPoly(x + 0.5, y + 0.5)) FACE[y * W + x] = 1;
  const KEEP = new Uint8Array(N), earPlus = dil(EAR, 2); for (let i = 0; i < N; i++) if (z.eyesClear[i] || BROWZ[i] || earPlus[i]) KEEP[i] = 1;
  // distance outside the head (chamfer, px)
  const D = new Float32Array(N).fill(1e9); for (let i = 0; i < N; i++) if (head[i]) D[i] = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; D[i] = Math.min(D[i], D[i - 1] + 1, D[i - W] + 1, D[i - W - 1] + 1.41, D[i - W + 1] + 1.41); }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) { const i = y * W + x; D[i] = Math.min(D[i], D[i + 1] + 1, D[i + W] + 1, D[i + W + 1] + 1.41, D[i + W - 1] + 1.41); }
  const room = (y) => 30 * Math.max(0, Math.min(1, (298 - y) / 90));
  const ZONE = new Uint8Array(N); for (let i = 0; i < N; i++) { const y = (i / W) | 0; if (y > 304 || KEEP[i] || FACE[i]) continue; if (head[i] || D[i] <= room(y)) ZONE[i] = 1; }
  const nearFace = dil(FACE, 14), SCALP = new Uint8Array(N); for (let i = 0; i < N; i++) if (ZONE[i] && head[i] && !nearFace[i] && ((i / W) | 0) < 290) SCALP[i] = 1;
  return { head, EAR, BROWZ, FACE, KEEP, ZONE, SCALP };
}
