// The write contract of clean-r2-hair-alpha.mjs: where the bytes may land, and what may be left
// behind if the process dies mid-commit.
//
// Two defects motivated this file, both found by review AFTER the allowlist landed:
//
//   1. The allowlist was LEXICAL. resolve() + relative() answer a question about strings; the
//      write does not. tools/avatar/build/ is gitignored scratch that tools create and delete
//      freely, so a symlink planted inside it satisfies the string check and still redirects the
//      bytes anywhere on disk. The dangling case is sharper still: existsSync() follows the link,
//      finds nothing, and reports FALSE — so the "already exists" guard waved through exactly the
//      plant that escapes.
//
//   2. The commit was TWO unsynchronised writeFileSync calls. A crash between them left a PNG
//      with no report: an artefact that looks like a validated output while carrying no evidence
//      that a single postcondition ran.
//
// PORTABILITY, MEASURED RATHER THAN ASSUMED. Creating a symlink on Windows needs a privilege this
// developer machine does not have (EPERM), while CI runs on Linux where it works. Rather than
// assume from process.platform, the capability is probed once below. The POLICY is exercised
// everywhere through an injected realpath — a real function over a described filesystem, not a
// weakened assertion — and the genuine filesystem behaviour is asserted wherever links can
// actually be made. Nothing here is skipped for convenience.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync, mkdirSync,
  symlinkSync, readFileSync,
} from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  run, checkWritePath, isAllowedWritePath, resolveThroughLinks, pathPresent,
  sidecarPathFor, WRITE_ROOT, SIDECAR_SUFFIX, REPO_ROOT, TOOL_VERSION, SRC_W, SRC_H,
} from "../../tools/avatar/clean-r2-hair-alpha.mjs";
import { encodePngRGBA } from "../../tools/avatar/build-r2-torso-occlusion-mask.mjs";

mkdirSync(join(REPO_ROOT, WRITE_ROOT), { recursive: true });
const SANDBOX = mkdtempSync(join(REPO_ROOT, WRITE_ROOT, "w-"));
after(() => rmSync(SANDBOX, { recursive: true, force: true }));
const sandboxed = (name) => join(SANDBOX, name);

// Probe, do not assume: can this machine create a symlink at all?
const CAN_SYMLINK = (() => {
  const d = mkdtempSync(join(SANDBOX, "probe-"));
  try {
    writeFileSync(join(d, "t"), "x");
    symlinkSync(join(d, "t"), join(d, "l"));
    return true;
  } catch (err) {
    if (err.code === "EPERM" || err.code === "ENOSYS") return false;
    throw err;                                   // anything else is a real failure, not a platform gap
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
})();
const symlinkOnly = CAN_SYMLINK
  ? false
  : "symlinks cannot be created here (EPERM); the policy is covered by the injected-realpath tests";

// A candidate the tool will accept and clean: mostly opaque ink with a little removable dust.
function candidatePng() {
  const rgba = Buffer.alloc(SRC_W * SRC_H * 4);
  const set = (x, y, a) => {
    const i = (y * SRC_W + x) * 4;
    rgba[i] = 128; rgba[i + 1] = 128; rgba[i + 2] = 128; rgba[i + 3] = a;
  };
  for (let y = 300; y < 700; y++) for (let x = 380; x < 660; x++) set(x, y, 255);
  for (let n = 0; n < 12; n++) set(20 + n * 6, 40, 3);      // orphan dust, alpha 3
  return encodePngRGBA(SRC_W, SRC_H, rgba);
}

// ── 1. resolveThroughLinks ────────────────────────────────────────────────────────────────────

test("a path that does not exist yet resolves through the deepest ancestor that does", () => {
  const realpath = (p) => {
    if (p === join("/repo", "build")) return join("/elsewhere");
    if (p === "/repo") return "/repo";
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  };
  assert.equal(
    resolveThroughLinks(join("/repo", "build", "a", "b.png"), realpath),
    join("/elsewhere", "a", "b.png"),
    "the linked ancestor must be substituted and the missing tail re-attached in order",
  );
});

test("a non-ENOENT error from realpath is not swallowed", () => {
  const realpath = () => { throw Object.assign(new Error("EACCES"), { code: "EACCES" }); };
  assert.throws(() => resolveThroughLinks("/repo/x.png", realpath), /EACCES/);
});

test("when nothing on the path exists, the path is returned unchanged rather than invented", () => {
  const realpath = () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); };
  const p = resolve(sep, "nowhere", "at", "all.png");
  assert.equal(resolveThroughLinks(p, realpath), p);
});

// ── 2. the allowlist, with the filesystem described by an injected realpath ───────────────────

// resolve(), not a bare "/repo": on Windows resolve() adds the current drive letter, so a literal
// "/repo" and the tool's resolve()d form are different strings and the link table would never
// match. Anchoring here keeps the fixture describing one filesystem on both platforms.
const ROOT = resolve(sep, "repo");
const ALLOWED = join(ROOT, WRITE_ROOT);
const OUTSIDE = resolve(sep, "tmp", "attacker");

// A faithful stand-in for realpathSync over a described set of links. The real one resolves EVERY
// component, so a link on a parent rewrites the child's path too — a fake that only matched the
// exact linked path would never consult the parent and would report a pass the real filesystem
// would not. This one substitutes on any prefix and re-resolves, exactly as the kernel does.
const makeRealpath = (links) => function realpath(p) {
  for (const [from, to] of Object.entries(links)) {
    if (p === from) return realpath(to);
    if (p.startsWith(from + sep)) return realpath(join(to, relative(from, p)));
  }
  return p;
};

// Nothing on this filesystem is a link.
const plainFs = makeRealpath({});

// The escape: the allowlist directory itself is a link pointing out of the repository.
const linkedRoot = makeRealpath({ [ALLOWED]: OUTSIDE });

test("a genuine path inside the allowlist is accepted", () => {
  assert.equal(checkWritePath(join(ALLOWED, "afro.png"), ROOT, plainFs), null);
  assert.equal(isAllowedWritePath(join(ALLOWED, "nested", "afro.png"), ROOT, plainFs), true);
});

test("SYMLINK ESCAPE: a lexically-inside path whose real form is outside is REFUSED", () => {
  const p = join(ALLOWED, "afro.png");
  // The lexical half alone would pass — that is the whole point of the defect.
  assert.equal(checkWritePath(p, ROOT, plainFs), null, "lexically this path is inside");
  const why = checkWritePath(p, ROOT, linkedRoot);
  assert.ok(why, "a linked write root must be refused");
  assert.match(why, /symlinks are resolved/);
});

test("the lexical check is still enforced, so both halves must hold", () => {
  for (const p of [join(ROOT, "docs", "x.png"), join(ROOT, "index.html"), "../outside.png"]) {
    assert.equal(isAllowedWritePath(p, ROOT, plainFs), false, `${p} must be refused`);
  }
  assert.equal(isAllowedWritePath(ALLOWED, ROOT, plainFs), false, "the root itself is not a target");
});

test("a link at an INTERMEDIATE directory is caught, not only one at the root", () => {
  const viaNested = makeRealpath({ [join(ALLOWED, "nested")]: OUTSIDE });
  const why = checkWritePath(join(ALLOWED, "nested", "afro.png"), ROOT, viaNested);
  assert.ok(why, "a linked intermediate directory must be refused");
  assert.match(why, /symlinks are resolved/);
});

// ── 3. the real filesystem, where links can actually be made ─────────────────────────────────

test("pathPresent sees a dangling symlink that existsSync reports as absent", { skip: symlinkOnly }, () => {
  const link = sandboxed("dangling.png");
  symlinkSync(sandboxed("no-such-target.png"), link);
  assert.equal(existsSync(link), false, "existsSync follows the link and finds nothing — the defect");
  assert.equal(pathPresent(link), true, "lstat sees the link itself");
  rmSync(link, { force: true });
});

test("REAL FS: a dangling symlink at the output path does not redirect the write", { skip: symlinkOnly }, () => {
  const outside = join(SANDBOX, "..", "escaped-victim.png");
  const out = sandboxed("out.png");
  symlinkSync(outside, out);
  const src = sandboxed("in.png");
  writeFileSync(src, candidatePng());

  assert.throws(() => run(src, out), /REFUSED: output already exists/);
  assert.equal(existsSync(outside), false, "nothing may have been written through the link");
  rmSync(out, { force: true });
});

test("REAL FS: resolveThroughLinks follows a genuine directory link, not just an injected one", { skip: symlinkOnly }, () => {
  const elsewhere = mkdtempSync(join(SANDBOX, "elsewhere-"));
  const linkDir = sandboxed("linked-dir");
  symlinkSync(elsewhere, linkDir, "dir");
  // Lexically inside the allowlist; physically it is `elsewhere`, which is also inside the
  // sandbox — so this asserts the resolution HAPPENS, using a target we are allowed to create.
  assert.equal(
    resolveThroughLinks(join(linkDir, "x.png")),
    join(elsewhere, "x.png"),
    "the real filesystem must be followed, not just the injected one",
  );
  rmSync(linkDir, { force: true });
});

// ── 4. atomicity ─────────────────────────────────────────────────────────────────────────────

test("a successful run leaves the PNG, the sidecar, and NO temporary file", () => {
  const dir = mkdtempSync(join(SANDBOX, "ok-"));
  const src = join(dir, "in.png");
  const out = join(dir, "out.png");
  writeFileSync(src, candidatePng());

  const report = run(src, out);
  assert.equal(report.pass, true);
  assert.equal(existsSync(out), true, "the PNG must be committed");
  assert.equal(existsSync(sidecarPathFor(out)), true, "the sidecar must be committed");

  const leftovers = readdirSync(dir).filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(leftovers, [], "no staging file may survive a successful commit");
  assert.deepEqual(readdirSync(dir).sort(), ["in.png", "out.alpha-report.json", "out.png"]);
});

test("a refusal leaves the directory exactly as it was — no PNG, no sidecar, no temporary", () => {
  const dir = mkdtempSync(join(SANDBOX, "refuse-"));
  const src = join(dir, "in.png");
  writeFileSync(src, encodePngRGBA(8, 8, Buffer.alloc(8 * 8 * 4)));   // wrong canvas size

  assert.throws(() => run(src, join(dir, "out.png")), /REFUSED: expected 1024x1536/);
  assert.deepEqual(readdirSync(dir), ["in.png"], "nothing may be staged or committed on refusal");
});

test("the committed PNG is complete: its bytes are exactly what the sidecar hashes", () => {
  const dir = mkdtempSync(join(SANDBOX, "whole-"));
  const src = join(dir, "in.png");
  const out = join(dir, "out.png");
  writeFileSync(src, candidatePng());

  const report = run(src, out);
  const onDisk = readFileSync(out);
  assert.equal(createHash("sha256").update(onDisk).digest("hex"), report.output.sha256,
    "a truncated or partially-flushed file would not hash to the reported value");
});

test("the second run refuses rather than overwriting a committed pair", () => {
  const dir = mkdtempSync(join(SANDBOX, "twice-"));
  const src = join(dir, "in.png");
  const out = join(dir, "out.png");
  writeFileSync(src, candidatePng());

  run(src, out);
  const before = readFileSync(out);
  assert.throws(() => run(src, out), /REFUSED: output already exists/);
  assert.deepEqual(readFileSync(out), before, "the committed file must be untouched");
});

// ── 5. the commit ORDER, which no runtime test can observe ───────────────────────────────────

test("SOURCE: the sidecar is renamed into place BEFORE the PNG", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "avatar", "clean-r2-hair-alpha.mjs"),
    "utf8",
  );
  const sidecarAt = src.indexOf("renameSync(tmpSidecar, sidecarAbs)");
  const pngAt = src.indexOf("renameSync(tmpOut, outAbs)");
  assert.ok(sidecarAt > 0 && pngAt > 0, "both renames must exist");
  assert.ok(sidecarAt < pngAt,
    "Two files cannot be published atomically. Of the two crash residues, a report with no image " +
    "is harmless and makes the next run refuse, while an image with no report looks like a " +
    "validated output carrying no evidence. Only the harmless one may be reachable.");
});

test("SOURCE: the final files are created with O_EXCL, which will not follow a symlink", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "avatar", "clean-r2-hair-alpha.mjs"),
    "utf8",
  );
  assert.match(src, /openSync\(path, "wx"\)/, "staging must use O_CREAT|O_EXCL");
  assert.match(src, /fsyncSync\(fd\)/, "a rename is only meaningful once the contents are durable");
  assert.ok(!/\bwriteFileSync\(/.test(src),
    "writeFileSync follows symlinks and overwrites silently; it must not be used to commit");
});

test("the tool version records that the write contract changed", () => {
  assert.equal(TOOL_VERSION, "3.0.0");
  assert.equal(SIDECAR_SUFFIX, ".alpha-report.json");
});
