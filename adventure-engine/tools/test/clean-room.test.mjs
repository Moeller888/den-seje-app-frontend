/**
 * Tests of the clean-room script with a fully synthetic denylist (invented
 * strings, no original names or hashes) in temporary folders.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ROOT, isGenerated, isText, parseDenylist, runCr01, scan, scanDenylist } from "../check-clean-room.mjs";

const base = mkdtempSync(join(tmpdir(), "clean-room-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

/** A small synthetic project folder. */
function project(name, files) {
  const dir = join(base, name);
  for (const [rel, data] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), data);
  }
  return dir;
}

const DENY = "# synthetic test denylist\n\nFnordelwick\n  Zyxquat-77  \nqpx\n";

describe("CR-01: external denylist", () => {
  it("parses literal entries, ignores comments and blank lines, refuses entries shorter than 3 characters", () => {
    expect(parseDenylist(DENY).map((e) => [e.n, e.line])).toEqual([
      [1, 3],
      [2, 4],
      [3, 5],
    ]);
    expect(() => parseDenylist("ok-entry\nab\n")).toThrow(/line 2/);
  });

  it("reports file and line (or binary) and the entry number, never the value; generated folders are skipped", () => {
    const dir = project("hits", {
      "src/a.ts": "const x = 1;\nconst name = 'FNORDELWICK';\n",
      "docs/b.md": "nothing here\n",
      "assets/pic.png": Buffer.concat([Buffer.from([0x89, 0x50]), Buffer.from("ZYXQUAT-77", "utf8"), Buffer.from([0])]),
      "packages/app/dist/out.js": "Fnordelwick",
      "node_modules/x/index.js": "Fnordelwick",
    });
    expect(scanDenylist(dir, parseDenylist(DENY))).toEqual([
      { file: "assets/pic.png", line: null, entry: 2 },
      { file: "src/a.ts", line: 2, entry: 1 },
    ]);
  });

  it("text is decided by content, not by name; generated folder names elsewhere are scanned (review fix H4)", () => {
    const dir = project("by-content", {
      "tools/gen.py": "name = 'fnordelwick'\n",
      ".gitignore": "zyxquat-77\n",
      notes: "plain text without extension: QPX\n",
      "src/dist/secret.ts": "// FnordelWick\n",
      "docs/coverage/report.md": "Zyxquat-77\n",
      "packages/editor/node_modules/x.js": "Fnordelwick",
    });
    expect(scanDenylist(dir, parseDenylist(DENY))).toEqual([
      { file: ".gitignore", line: 1, entry: 2 },
      { file: "docs/coverage/report.md", line: 1, entry: 2 },
      { file: "notes", line: 1, entry: 3 },
      { file: "src/dist/secret.ts", line: 1, entry: 1 },
      { file: "tools/gen.py", line: 1, entry: 1 },
    ]);
    expect(isText(Buffer.from("abc"))).toBe(true);
    expect(isText(Buffer.from([0x61, 0, 0x62]))).toBe(false);
    expect([isGenerated("node_modules"), isGenerated("packages/app/dist"), isGenerated("src/dist"), isGenerated("packages/app/src/dist")]).toEqual([true, true, false, false]);
  });

  it("binary files: entries with letters such as æ, ø and å match as written, in lower and in upper case (final review F1)", () => {
    // Invented words; the UTF-8 lead byte of ø/Ø (0xC3) must be folded the same way on both sides.
    const deny = parseDenylist("Knøfflebrø\nÆrtekvæld\nGrüffelwå\n");
    const bin = (text) => Buffer.concat([Buffer.from([0x89, 0x50, 0]), Buffer.from(text, "utf8"), Buffer.from([0])]);
    const dir = project("binary-non-ascii", {
      "a.bin": bin("xx knøfflebrø xx"),
      "b.bin": bin("XX ÆRTEKVÆLD XX"),
      "c.bin": bin("Grüffelwå"),
      "d.bin": bin("knoefflebroe aertekvaeld"),
    });
    expect(scanDenylist(dir, deny)).toEqual([
      { file: "a.bin", line: null, entry: 1 },
      { file: "b.bin", line: null, entry: 2 },
      { file: "c.bin", line: null, entry: 3 },
    ]);
  });

  it("runCr01: SKIP without a denylist, ERROR when required, PASS/FAIL with one; values are not printed", () => {
    const clean = project("clean", { "src/a.ts": "export const ok = true;\n" });
    const dirty = project("dirty", { "src/a.ts": "// Fnordelwick\n" });
    const list = join(base, "denylist.txt");
    writeFileSync(list, DENY);
    expect(runCr01({}, clean)).toMatchObject({ status: "SKIP", code: 0 });
    expect(runCr01({ CLEAN_ROOM_DENYLIST_PATH: join(base, "missing.txt") }, clean)).toMatchObject({ status: "SKIP", code: 0 });
    expect(runCr01({ REQUIRE_CLEAN_ROOM_DENYLIST: "1" }, clean)).toMatchObject({ status: "ERROR", code: 1 });
    expect(runCr01({ CLEAN_ROOM_DENYLIST_PATH: list }, clean)).toMatchObject({ status: "PASS", code: 0 });
    const fail = runCr01({ CLEAN_ROOM_DENYLIST_PATH: list, REQUIRE_CLEAN_ROOM_DENYLIST: "1" }, dirty);
    expect(fail.status).toBe("FAIL");
    expect(fail.code).toBe(1);
    expect(fail.lines[0]).toBe("CR-01: src/a.ts:1 matches denylist entry #1");
    expect(fail.lines.join("\n").toLowerCase()).not.toContain("fnordelwick");
  });

  it("refuses a denylist inside the project, an empty denylist and an invalid one", () => {
    const dir = project("inside", { "src/a.ts": "x\n", "denylist.txt": "Fnordelwick\n" });
    expect(runCr01({ CLEAN_ROOM_DENYLIST_PATH: join(dir, "denylist.txt") }, dir)).toMatchObject({ status: "ERROR", code: 1 });
    const empty = join(base, "empty.txt");
    writeFileSync(empty, "# only a comment\n");
    expect(runCr01({ CLEAN_ROOM_DENYLIST_PATH: empty }, dir)).toMatchObject({ status: "ERROR" });
    const bad = join(base, "bad.txt");
    writeFileSync(bad, "xy\n");
    expect(runCr01({ CLEAN_ROOM_DENYLIST_PATH: bad }, dir).lines[0]).toMatch(/line 1/);
  });
});

describe("CR-02", () => {
  it("the project itself passes", () => {
    expect(scan(ROOT)).toEqual([]);
  });

  it("scans every text file, also files without a known extension (review fix H4)", () => {
    // The forbidden strings are assembled at run time so this test file itself stays clean.
    const dir = project("cr02-py", { "tools/gen.py": `open("${"inventory"}${".json"}")\n`, "src/dist/x.ts": `// ${"30-spor"}${"barhed"}\n` });
    expect(scan(dir).map((h) => `${h.file}:${h.rule}`)).toEqual(["src/dist/x.ts:trace-doc", "tools/gen.py:analysis-inventory"]);
  });

  it("finds a forbidden reference in a synthetic folder", () => {
    const dir = project("cr02", { "notes.md": `see ${"inventory"}${".json"} for details\n` });
    expect(scan(dir)).toEqual([{ file: "notes.md", line: 1, rule: "analysis-inventory" }]);
  });
});
