import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadContent } from "@adventure-engine/content";
import { Engine } from "@adventure-engine/core";
import { afterAll, describe, expect, it } from "vitest";
import { buildEditorFixture } from "../fixtures/build-editor-fixture.ts";
import { detectAsset, importAsset } from "../src/assets.ts";
import { readDir } from "../src/cli.ts";
import { IMPORT_LIMITS, ImportLimitError, checkFileSet, isSafeRelativePath, safeFileName } from "../src/limits.ts";
import { encodeText, newProject, prettyCanonical, readProject } from "../src/project.ts";
import { renameKeyIn } from "../src/refs.ts";
import { readZip, writeZip } from "../src/zip.ts";

/** Release review: regression tests for the bounds and checks added to the import paths. */

const enc = (s: string) => encodeText(s);

describe("import bounds (release review)", () => {
  it("only safe project-relative paths are accepted", () => {
    for (const ok of ["project.json", "assets/a.svg", "scenes/x.y.json"]) expect(isSafeRelativePath(ok), ok).toBe(true);
    for (const bad of ["", "/etc/x", "C:/x", "c:x", "a\\b", "a/../b", "../a", "./a", "a//b", "a/", "a\u0000b", "x".repeat(261)]) expect(isSafeRelativePath(bad), bad).toBe(false);
  });

  it("file sets: too many files, a too large file, too large in total, unsafe paths are refused as a whole", () => {
    expect(() => checkFileSet(new Map([["../x", enc("1")]]))).toThrow(ImportLimitError);
    const many = new Map<string, Uint8Array>();
    for (let i = 0; i <= IMPORT_LIMITS.maxFiles; i++) many.set(`f${i}.txt`, new Uint8Array());
    expect(() => checkFileSet(many)).toThrow(/too many files/);
    const big = new Uint8Array(IMPORT_LIMITS.maxFileBytes + 1);
    expect(() => checkFileSet(new Map([["a.png", big]]))).toThrow(/too large/);
    const half = new Uint8Array(IMPORT_LIMITS.maxFileBytes);
    const total = new Map<string, Uint8Array>();
    for (let i = 0; i < 9; i++) total.set(`a${i}.png`, half);
    expect(() => checkFileSet(total)).toThrow(/project is too large/);
    expect(new ImportLimitError("x").code).toBe("E-IMPORT-LIMIT");
  });

  it("ZIP: zip-slip, absolute and drive paths, duplicates, entry count, declared and actual size are checked", async () => {
    for (const bad of ["../evil.txt", "/abs.txt", "C:/win.txt", "a/./b.txt"]) {
      await expect(readZip(writeZip(new Map([[bad, enc("x")]]))), bad).rejects.toThrow(/unsafe path/);
    }
    // Two entries with the same name (written by patching the second name).
    const dup = writeZip(new Map([["a.txt", enc("1")], ["b.txt", enc("2")]]));
    const patched = dup.slice();
    for (let i = 0; i + 5 <= patched.length; i++) if (String.fromCharCode(...patched.subarray(i, i + 5)) === "b.txt") patched[i] = 0x61;
    await expect(readZip(patched)).rejects.toThrow(/duplicate entry/);
    const many = new Map<string, Uint8Array>();
    for (let i = 0; i <= IMPORT_LIMITS.maxFiles; i++) many.set(`f${i}`, new Uint8Array());
    await expect(readZip(writeZip(many))).rejects.toThrow(/too many entries/);
    // A deflated entry that claims a huge size, and one whose inflated data differ from the declared size.
    const z = writeZip(new Map([["a.txt", enc("xyz")]]));
    const v = new DataView(z.buffer);
    const cd = v.getUint32(z.length - 6, true);
    v.setUint16(cd + 10, 8, true);
    const inflateSeen: number[] = [];
    await expect(
      readZip(z, async (d, max) => {
        inflateSeen.push(max);
        return d;
      }),
    ).resolves.toBeInstanceOf(Map);
    expect(inflateSeen).toEqual([3]);
    await expect(readZip(z, async () => enc("longer than declared"))).rejects.toThrow(/size mismatch/);
    v.setUint32(cd + 24, IMPORT_LIMITS.maxFileBytes + 1, true);
    await expect(readZip(z, async (d) => d)).rejects.toThrow(/too large/);
    const total = writeZip(new Map([["a", enc("1")], ["b", enc("2")], ["c", enc("3")], ["d", enc("4")], ["e", enc("5")], ["f", enc("6")], ["g", enc("7")], ["h", enc("8")], ["i", enc("9")]]));
    const tv = new DataView(total.buffer);
    let at = tv.getUint32(total.length - 6, true);
    for (let i = 0; i < 9; i++) {
      tv.setUint32(at + 24, IMPORT_LIMITS.maxFileBytes, true);
      at += 46 + tv.getUint16(at + 28, true);
    }
    await expect(readZip(total)).rejects.toThrow(/too large when unpacked/);
    // An entry pointing past the end of the archive.
    const cut = writeZip(new Map([["a.txt", enc("hello world")]]));
    const cv = new DataView(cut.buffer);
    cv.setUint32(cv.getUint32(cut.length - 6, true) + 20, 1_000_000, true);
    await expect(readZip(cut)).rejects.toThrow(/damaged ZIP entry/);
  });

  it("assets: oversize files and SVG with DOCTYPE/ENTITY are refused; extensions must match the content", () => {
    const p = newProject("t");
    expect(importAsset(p, new Map(), { name: "big.png", bytes: new Uint8Array(IMPORT_LIMITS.maxFileBytes + 1) })).toMatchObject({ ok: false, code: "E-IMPORT-LIMIT" });
    expect(detectAsset("x.svg", enc('<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg>&a;</svg>'))).toHaveProperty("forbidden");
    expect(detectAsset("fake.png", enc("<svg></svg>"))).toBeNull();
    expect(detectAsset("fake.wav", enc("OggS...."))).toBeNull();
  });

  it("download names keep only safe characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFileName('a<b>:"c|?*.zip')).toBe("a-b-c-.zip");
    expect(safeFileName("Grøn ærø.json")).toBe("Gr-n-r-.json");
    expect(safeFileName("...")).toBe("download");
    expect(safeFileName("x".repeat(300)).length).toBe(120);
  });
});

describe("object keys from JSON (release review)", () => {
  it('"__proto__" keys are refused in project files and never become a prototype when written', () => {
    const files = new Map(buildEditorFixture().files);
    files.set("i18n/da.json", enc('{"__proto__": {"polluted": "yes"}, "o.lamp": "Lampe"}'));
    const r = readProject(files);
    expect(r.problems.some((x) => x.code === "E-PROJECT-SCHEMA" && x.path === "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    const text = prettyCanonical(JSON.parse('{"__proto__": {"x": 1}, "a": 2}'));
    expect(text).toBe('{\n  "__proto__": {\n    "x": 1\n  },\n  "a": 2\n}\n');
    const renamed = renameKeyIn({ m: JSON.parse('{"__proto__": 1, "a": 2}') as Record<string, number> }, ["m"], "a", "b");
    expect(Object.getPrototypeOf(renamed.m)).toBe(Object.prototype);
    expect(Object.keys(renamed.m).sort()).toEqual(["__proto__", "b"]);
  });

  it('text keys named like Object members ("constructor") are plain keys for the loader and the runtime', () => {
    const pkg = {
      game: { id: "g", version: "1", formatVersion: 1, languages: ["da", "en"], defaultLanguage: "da", player: { actor: "p" } },
      scenes: [{ id: "s", entry: null }],
      actors: [{ id: "p", scene: "s", entry: null, variants: { default: {} } }],
      i18n: { da: { constructor: "Bygmester" }, en: {} },
    };
    const content = loadContent(pkg);
    expect(content.diagnostics.map((d) => `${d.code} ${d.path}`)).toEqual(["W-I18N-EMPTY i18n.en.constructor"]);
    const engine = new Engine(content, { seed: "s", adapter: { onCommand: () => ({ kind: "auto", afterMs: 0 }) }, language: "en" });
    expect(engine.text.resolve("toString")).toEqual({ text: "", language: null, fallback: true });
    expect(engine.text.t("constructor")).toBe("");
  });
});

describe("CLI folder reading (release review)", () => {
  const dir = mkdtempSync(join(tmpdir(), "content-sec-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("symbolic links are not followed (no files from outside the project)", () => {
    const outside = join(dir, "outside.txt");
    writeFileSync(outside, "secret");
    const proj = join(dir, "proj");
    mkdirSync(proj);
    writeFileSync(join(proj, "project.json"), "{}");
    let linked = true;
    try {
      symlinkSync(outside, join(proj, "link.txt"));
    } catch {
      // Creating symlinks needs extra rights on some Windows setups; the regular file is still read.
      linked = false;
    }
    expect([...readDir(proj).keys()]).toEqual(["project.json"]);
    expect(typeof linked).toBe("boolean");
  });
});
