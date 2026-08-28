// Guards for the alpha-cleanup tool's WRITE CONTRACT and its FAIL-CLOSED postconditions, plus a
// real end-to-end run of the candidate gate at 1024×1536.
//
// These exist because the first version of this tool got both wrong:
//   * it used a blacklist, which allowed docs/, index.html, package.json and paths outside the
//     repository entirely, and would then overwrite its own PNG with the JSON sidecar whenever the
//     output name did not end in .png;
//   * it wrote the PNG and exited 0 even when the cleaned result still blew the orphan budget.
//
// Everything here writes only inside a throwaway directory under the tool's own allowlisted build
// folder, and cleans up after itself. No real project file is ever a write target.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  run, cleanAlpha, checkWritePath, isAllowedWritePath, sidecarPathFor,
  WRITE_ROOT, SIDECAR_SUFFIX, REPO_ROOT, ALPHA_FLOOR, SRC_W, SRC_H,
} from "../../tools/avatar/clean-r2-hair-alpha.mjs";
import {
  analyse, gates, isOrphanSoft, countOrphanSoft, ALPHA_INK, run as verifyCandidate,
  HALO_TOLERANCE_AUTHORING, HALO_TOLERANCE_SERVED,
} from "../../tools/avatar/check-r2-hair-candidate.mjs";
import { downscaleHalf } from "../../tools/avatar/promote-r2-torso-asset.mjs";
import { encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SANDBOX = mkdtempSync(join(REPO_ROOT, WRITE_ROOT, "t-"));
after(() => rmSync(SANDBOX, { recursive: true, force: true }));
const sandboxed = (name) => join(SANDBOX, name);

// ── the shared definition ─────────────────────────────────────────────────────────────────────

test("countOrphanSoft always equals analyse().orphanSoft — one definition, no copy", () => {
  const W = 48, H = 72;
  for (const seed of [1, 7, 13, 29]) {
    const b = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const a = (i * seed) % 200;                       // a mix of 0, soft and ink
      if (a === 0) continue;
      b[i * 4] = 128; b[i * 4 + 1] = 128; b[i * 4 + 2] = 128; b[i * 4 + 3] = a;
    }
    assert.equal(countOrphanSoft(b, W, H), analyse(b, W, H).orphanSoft, `seed ${seed}`);
  }
});

test("the shared definition is four-neighbour and soft-only, unchanged", () => {
  const W = 8, H = 8;
  const b = Buffer.alloc(W * H * 4);
  const set = (x, y, a) => { const i = (y * W + x) * 4; b[i] = 128; b[i + 1] = 128; b[i + 2] = 128; b[i + 3] = a; };
  set(4, 4, 255);                       // ink
  set(5, 4, 50);                        // orthogonal to ink → not orphan
  set(5, 5, 50);                        // diagonal only → orphan
  set(1, 1, 255);                       // ink is never orphan
  assert.equal(isOrphanSoft(b, W, H, 5, 4), false);
  assert.equal(isOrphanSoft(b, W, H, 5, 5), true);
  assert.equal(isOrphanSoft(b, W, H, 4, 4), false, "ink must never count as orphan-soft");
  assert.equal(isOrphanSoft(b, W, H, 0, 0), false, "alpha 0 must never count");
});

// ── the positive write allowlist ──────────────────────────────────────────────────────────────

test("the allowlist admits exactly one directory", () => {
  assert.equal(WRITE_ROOT.replace(/\\/g, "/"), "tools/avatar/build/alpha-cleanup");
  assert.equal(isAllowedWritePath(join(WRITE_ROOT, "afro.after.png")), true);
  assert.equal(isAllowedWritePath(join(WRITE_ROOT, "nested", "afro.after.png")), true);
});

test("every previously-allowed dangerous target is now refused", () => {
  const denied = [
    "docs/review.png", "index.html", "package.json", "README.md",
    "assets/avatar-r2/hair/hair-afro-v1.png", "assets/avatar/hair/x.png",
    "js/avatar-layers.js", "supabase/migrations/x.sql",
    "tools/avatar/fixtures/r2-torso/x.png",
    "tools/avatar/build/other-dir/x.png",
    "../outside.png", "../../outside.png",
    join("..", "DEN SEJE APP-sibling", "tools", "avatar", "build", "alpha-cleanup", "x.png"),
    join(WRITE_ROOT, "..", "..", "..", "..", "escape.png"),
  ];
  for (const p of denied) {
    assert.equal(isAllowedWritePath(p), false, `${p} must be refused`);
    assert.match(checkWritePath(p), /outside the only writable directory/);
  }
});

test("an absolute path outside the repository is refused", () => {
  const abs = process.platform === "win32" ? "C:\\Windows\\Temp\\x.png" : "/tmp/x.png";
  assert.equal(isAllowedWritePath(abs), false);
});

test("the writable directory itself is not a valid output path", () => {
  assert.equal(isAllowedWritePath(WRITE_ROOT), false);
});

// ── the run() path contract ───────────────────────────────────────────────────────────────────

// A valid 1024×1536 candidate: a solid block plus scattered sub-floor dust.
function candidatePng({ dust = 400, dustAlpha = 3 } = {}) {
  const rgba = Buffer.alloc(SRC_W * SRC_H * 4);
  const set = (x, y, a, v = 128) => {
    const i = (y * SRC_W + x) * 4;
    rgba[i] = v; rgba[i + 1] = v; rgba[i + 2] = v; rgba[i + 3] = a;
  };
  for (let y = 300; y < 700; y++) for (let x = 380; x < 660; x++) set(x, y, 255);
  let made = 0;
  for (let y = 20; y < 280 && made < dust; y += 3) {
    for (let x = 20; x < SRC_W - 20 && made < dust; x += 7) { set(x, y, dustAlpha); made++; }
  }
  return encodePngRGBA(SRC_W, SRC_H, rgba);
}

function writeInput(name, buf) {
  const p = sandboxed(name);
  writeFileSync(p, buf);
  return p;
}

test("input equal to output is refused", () => {
  const p = writeInput("same.png", candidatePng());
  assert.throws(() => run(p, p), /input and output are the same file/i);
});

test("an output without a .png extension is refused", () => {
  const src = writeInput("in-noext.png", candidatePng());
  assert.throws(() => run(src, sandboxed("out.bin")), /must end in \.png/i);
  assert.throws(() => run(src, sandboxed("out")), /must end in \.png/i);
});

test("the .png check is case-insensitive", () => {
  const src = writeInput("in-case.png", candidatePng());
  const out = sandboxed("OUT-CASE.PNG");
  const r = run(src, out);
  assert.equal(r.pass, true);
  assert.ok(existsSync(out));
  assert.ok(existsSync(sidecarPathFor(out)));
});

test("writing outside the allowlist is refused before anything is read", () => {
  const src = writeInput("in-outside.png", candidatePng());
  for (const bad of ["docs/x.png", "index.png", "../escape.png"]) {
    assert.throws(() => run(src, bad), /REFUSED: output outside the only writable directory/);
  }
});

test("an existing PNG or an existing sidecar refuses the run — no implicit overwrite", () => {
  const src = writeInput("in-exists.png", candidatePng());

  const outA = sandboxed("taken.png");
  writeFileSync(outA, "not a png");
  assert.throws(() => run(src, outA), /output already exists/i);

  const outB = sandboxed("free.png");
  writeFileSync(sidecarPathFor(outB), "{}");
  assert.throws(() => run(src, outB), /sidecar already exists/i);
  assert.equal(existsSync(outB), false, "the PNG must not have been created");
});

test("the sidecar is a distinct path ending in the required suffix", () => {
  const p = join(WRITE_ROOT, "a.png");
  assert.notEqual(sidecarPathFor(p), p);
  assert.ok(sidecarPathFor(p).endsWith(SIDECAR_SUFFIX));
});

test("a wrong canvas size is refused", () => {
  const small = encodePngRGBA(64, 96, Buffer.alloc(64 * 96 * 4));
  const src = writeInput("in-small.png", small);
  assert.throws(() => run(src, sandboxed("out-small.png")), /expected 1024x1536/);
});

// ── fail-closed: a rejected run writes nothing ────────────────────────────────────────────────

test("a candidate that still blows the authoring budget is refused and writes NO files", () => {
  // Dust at alpha 200 is above the floor, so cleanup cannot remove it; 400 orphans >> 64.
  const src = writeInput("in-toomuch.png", candidatePng({ dust: 400, dustAlpha: 200 }));
  const out = sandboxed("out-toomuch.png");
  assert.throws(() => run(src, out), /postcondition failed, nothing written/);
  assert.equal(existsSync(out), false, "PNG was written despite the refusal");
  assert.equal(existsSync(sidecarPathFor(out)), false, "sidecar was written despite the refusal");
});

test("the refusal names the failing postcondition", () => {
  const src = writeInput("in-named.png", candidatePng({ dust: 400, dustAlpha: 200 }));
  assert.throws(() => run(src, sandboxed("out-named.png")),
    /authoringWithinBudget|servedWithinBudget/);
});

test("no stray files are left behind by any refusal", () => {
  const before = readdirSync(SANDBOX).length;
  const src = writeInput("in-stray.png", candidatePng({ dust: 400, dustAlpha: 200 }));
  assert.throws(() => run(src, sandboxed("out-stray.png")));
  // exactly one new file: the input we just wrote
  assert.equal(readdirSync(SANDBOX).length, before + 1);
});

test("a valid cleanup writes BOTH the PNG and the sidecar, and the sidecar says pass", () => {
  const src = writeInput("in-good.png", candidatePng());
  const out = sandboxed("out-good.png");
  const r = run(src, out);
  assert.equal(r.pass, true);
  assert.ok(existsSync(out));
  assert.ok(existsSync(sidecarPathFor(out)));
  for (const [name, v] of Object.entries(r.postconditions)) {
    assert.equal(v.pass, true, `${name} was reported as passing but is ${JSON.stringify(v)}`);
  }
  assert.equal(Object.keys(r.postconditions).length, 9, "a postcondition was silently dropped");
});

test("two runs to different fresh outputs give an identical PNG hash", () => {
  const src = writeInput("in-det.png", candidatePng());
  const a = run(src, sandboxed("det-a.png"));
  const b = run(src, sandboxed("det-b.png"));
  assert.equal(a.output.sha256, b.output.sha256);
  assert.equal(a.pixelsChanged, b.pixelsChanged);
  assert.deepEqual(a.orphanSoft, b.orphanSoft);
  assert.deepEqual(a.geometry, b.geometry);
  assert.notEqual(a.output.path, b.output.path, "only the paths may differ");
});

// ── end-to-end through the REAL gate at 1024×1536 ─────────────────────────────────────────────

// Places exactly `n` served orphans using ONE authoring pixel each, spaced so no two share a 2×2
// downscale cell. One pixel at alpha 120 averages to round(120/4) = 30 in the served canvas: still
// soft, still orphaned. So authoring orphans = n as well, which keeps the authoring budget (64)
// comfortably satisfied at n = 16 and n = 17 — the served bound is then the only thing that can
// decide the gate, which is the whole point of this fixture.
function candidateWithServedOrphans(n, alpha = 120) {
  const rgba = Buffer.alloc(SRC_W * SRC_H * 4);
  const set = (x, y, a) => {
    const i = (y * SRC_W + x) * 4;
    rgba[i] = 128; rgba[i + 1] = 128; rgba[i + 2] = 128; rgba[i + 3] = a;
  };
  for (let y = 300; y < 700; y++) for (let x = 380; x < 660; x++) set(x, y, 255);
  let made = 0;
  for (let y = 10; y < 200 && made < n; y += 4) {
    for (let x = 10; x < 400 && made < n; x += 4) { set(x, y, alpha); made++; }
  }
  return rgba;
}

const servedOf = (rgba) => countOrphanSoft(downscaleHalf(SRC_W, SRC_H, rgba), SRC_W >> 1, SRC_H >> 1);

test("END-TO-END: 17 served orphans fail the alpha gate, 16 pass — with the real numbers", () => {
  const r16 = candidateWithServedOrphans(16);
  const r17 = candidateWithServedOrphans(17);
  assert.equal(servedOf(r16), 16, "fixture must produce exactly 16 served orphans");
  assert.equal(servedOf(r17), 17, "fixture must produce exactly 17 served orphans");

  const g = (rgba) => gates(analyse(rgba, SRC_W, SRC_H), "short", servedOf(rgba))
    .find((x) => x.id === "alpha-clean-no-halo");

  const g16 = g(r16), g17 = g(r17);
  assert.equal(g16.pass, true, "16 served orphans must pass");
  assert.equal(g17.pass, false, "17 served orphans must fail");

  // The detail must carry the REAL counts. If someone reintroduces `s.rgba/.w/.h` against the raw
  // Buffer these become 0 and this assertion is what catches it.
  assert.equal(g16.detail.orphanSoftServed, 16);
  assert.equal(g17.detail.orphanSoftServed, 17);
  assert.notEqual(g17.detail.orphanSoftServed, 0, "served count collapsed to zero — buffer misuse");
  assert.ok(g17.detail.orphanSoftAuthoring <= HALO_TOLERANCE_AUTHORING,
    "the authoring budget must not be what fails here");
});

test("END-TO-END: the real gate CLI path reports the same served count", () => {
  const rgba = candidateWithServedOrphans(17);
  const p = sandboxed("e2e-17.png");
  writeFileSync(p, encodePngRGBA(SRC_W, SRC_H, rgba));
  const res = verifyCandidate(p, "short");   // the real CLI entry point, decode included
  const g = res.gates.find((x) => x.id === "alpha-clean-no-halo");
  assert.equal(g.pass, false);
  assert.equal(g.detail.orphanSoftServed, 17, "the CLI path lost the served count");
});

test("the budgets themselves are the torso convention", () => {
  assert.equal(HALO_TOLERANCE_AUTHORING, 64);
  assert.equal(HALO_TOLERANCE_SERVED, 16);
  assert.equal(ALPHA_FLOOR, 24);
  assert.equal(ALPHA_INK, 128);
});
