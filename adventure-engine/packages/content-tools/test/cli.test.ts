import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildEditorFixture } from "../fixtures/build-editor-fixture.ts";
import { readDir, runCli, writeAtomic } from "../src/cli.ts";
import { SCHEMAS } from "../src/schema.ts";

const FIXTURE = join(import.meta.dirname, "../fixtures/editor-demo");
const root = mkdtempSync(join(tmpdir(), "content-cli-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function run(...argv: string[]): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCli(argv, { cwd: root, out: (t) => out.push(t), err: (t) => err.push(t) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** A copy of the fixture project in the temp dir. */
function copyFixture(name: string): string {
  const dir = join(root, name);
  for (const [path, bytes] of buildEditorFixture().files) writeAtomic(join(dir, ...path.split("/")), bytes);
  return dir;
}

const noTmp = (dir: string): boolean => !readdirSync(dir, { recursive: true }).some((f) => String(f).includes(".tmp-"));

describe("content CLI (phase 6)", () => {
  it("validate: 0 for a clean project, JSON output for CI, 1 for errors, 0 for warnings only", () => {
    expect(run("validate", FIXTURE)).toMatchObject({ code: 0, out: "0 error(s), 0 warning(s)" });
    const json = JSON.parse(run("validate", FIXTURE, "--json").out) as { ok: boolean; problems: unknown[] };
    expect(json).toEqual({ ok: true, problems: [] });
    const dir = copyFixture("broken");
    const scene = JSON.parse(readFileSync(join(dir, "scenes/attic.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(dir, "scenes/attic.json"), JSON.stringify({ ...scene, defaultSpot: "nowhere" }));
    const bad = run("validate", "broken");
    expect(bad.code).toBe(1);
    expect(bad.out).toContain("ERROR   E-REF scenes/attic.json defaultSpot:");
    const warn = copyFixture("warn");
    writeFileSync(join(warn, "notes.txt"), "x");
    expect(run("validate", "warn")).toMatchObject({ code: 0, out: expect.stringContaining("WARNING W-PROJECT-STRAY notes.txt") });
  });

  it("--strict turns unknown fields into errors", () => {
    const dir = copyFixture("unknown");
    const game = JSON.parse(readFileSync(join(dir, "game.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(dir, "game.json"), JSON.stringify({ ...game, author: "x" }));
    expect(run("validate", "unknown").code).toBe(0);
    expect(run("validate", "unknown", "--strict").code).toBe(1);
  });

  it("build writes assets and then the bundle atomically; output is byte-identical between builds", () => {
    const a = run("build", FIXTURE, "--out", "out-a/bundle.json", "--strict");
    expect(a.code).toBe(0);
    expect(a.out).toMatch(/wrote out-a\/bundle\.json \(\d+ bytes\) and 8 asset file\(s\)/);
    run("build", FIXTURE, "--out", "out-b/bundle.json");
    expect(readFileSync(join(root, "out-a/bundle.json"))).toEqual(readFileSync(join(root, "out-b/bundle.json")));
    expect(readdirSync(join(root, "out-a/assets")).length).toBe(8);
    expect(noTmp(join(root, "out-a"))).toBe(true);
    expect(run("validate", "out-a/bundle.json", "--strict").code).toBe(0);
    const json = JSON.parse(run("build", FIXTURE, "--out", "out-c/bundle.json", "--json").out) as { ok: boolean; written: string[] };
    expect(json.ok).toBe(true);
    expect(json.written.at(-1)).toBe("bundle.json");
  });

  it("a failing build leaves no bundle (and no half-written file) behind", () => {
    const dir = copyFixture("fails");
    writeFileSync(join(dir, "portals.json"), JSON.stringify([{ id: "up", from: "cellar", to: "nowhere", entry: null }]));
    const r = run("build", "fails", "--out", "out-fail/bundle.json");
    expect(r.code).toBe(1);
    expect(existsSync(join(root, "out-fail"))).toBe(false);
    expect(JSON.parse(run("build", "fails", "--out", "out-fail/bundle.json", "--json").out)).toMatchObject({ ok: false, written: [] });
  });

  it("build --check reports an outdated bundle without writing", () => {
    expect(run("build", FIXTURE, "--out", "out-check/bundle.json", "--check")).toMatchObject({ code: 1, out: expect.stringContaining("out of date") });
    expect(existsSync(join(root, "out-check"))).toBe(false);
    run("build", FIXTURE, "--out", "out-check/bundle.json");
    expect(run("build", FIXTURE, "--out", "out-check/bundle.json", "--check")).toMatchObject({ code: 0, out: expect.stringContaining("up to date") });
    writeFileSync(join(root, "out-check/assets/lamp.svg"), "<svg/>");
    const j = JSON.parse(run("build", FIXTURE, "--out", "out-check/bundle.json", "--check", "--json").out) as { differs: string[] };
    expect(j.differs).toEqual(["assets/lamp.svg"]);
  });

  it("format rewrites canonically; --check changes nothing and exits 1 when not formatted", () => {
    const dir = copyFixture("fmt");
    const game = readFileSync(join(dir, "game.json"), "utf8");
    writeFileSync(join(dir, "game.json"), JSON.stringify(JSON.parse(game)));
    expect(run("format", "fmt", "--check")).toMatchObject({ code: 1, out: "not formatted: game.json" });
    expect(readFileSync(join(dir, "game.json"), "utf8")).not.toBe(game);
    expect(JSON.parse(run("format", "fmt", "--check", "--json").out)).toEqual({ ok: false, changed: ["game.json"] });
    expect(run("format", "fmt")).toMatchObject({ code: 0, out: "formatted: game.json" });
    expect(readFileSync(join(dir, "game.json"), "utf8")).toBe(game);
    expect(run("format", "fmt", "--check")).toMatchObject({ code: 0, out: "all files are formatted" });
    expect(JSON.parse(run("format", "fmt", "--json").out)).toEqual({ ok: true, changed: [] });
    const broken = copyFixture("fmt-broken");
    writeFileSync(join(broken, "game.json"), "{");
    expect(run("format", "fmt-broken").code).toBe(1);
    expect(JSON.parse(run("format", "fmt-broken", "--json").out)).toMatchObject({ ok: false });
  });

  it("schema writes one file per kind; --check detects stale files", () => {
    expect(run("schema", "--out", "schemas", "--check").code).toBe(1);
    expect(run("schema", "--out", "schemas").code).toBe(0);
    expect(readdirSync(join(root, "schemas")).sort()).toEqual(Object.keys(SCHEMAS).sort().map((k) => `${k}.schema.json`));
    expect(run("schema", "--out", "schemas", "--check")).toMatchObject({ code: 0, out: "schemas are up to date" });
    expect(JSON.parse(run("schema", "--out", "schemas", "--json").out)).toEqual({ ok: true, changed: [] });
  });

  it("the committed schema files are up to date", () => {
    const r = runCli(["schema", "--out", join(import.meta.dirname, "../schemas"), "--check"], { cwd: root, out: () => {}, err: () => {} });
    expect(r).toBe(0);
  });

  it("usage and I/O errors exit with 2", () => {
    expect(run().code).toBe(2);
    expect(run("bogus").code).toBe(2);
    expect(run("validate").code).toBe(2);
    expect(run("validate", "missing-dir").code).toBe(2);
    expect(run("validate", FIXTURE, "--fast").code).toBe(2);
    expect(run("build", FIXTURE).code).toBe(2);
    expect(run("build", FIXTURE, "--out").code).toBe(2);
    expect(run("build").code).toBe(2);
    expect(run("format").code).toBe(2);
    expect(run("schema").code).toBe(2);
    writeFileSync(join(root, "file.txt"), "x");
    expect(run("build", FIXTURE, "--out", "file.txt/bundle.json")).toMatchObject({ code: 2, err: expect.stringContaining("content:") });
  });

  it("validate of a bundle file with JSON output; broken bundle exits 1", () => {
    run("build", FIXTURE, "--out", "out-v/bundle.json");
    expect(JSON.parse(run("validate", "out-v/bundle.json", "--json").out)).toEqual({ ok: true, problems: [] });
    writeFileSync(join(root, "out-v/bundle.json"), "{");
    expect(run("validate", "out-v/bundle.json").code).toBe(1);
  });

  it("readDir lists POSIX paths and skips VCS folders; writeAtomic leaves no temporary file on failure", () => {
    const dir = copyFixture("tree");
    writeAtomic(join(dir, ".git", "HEAD"), "x");
    expect([...readDir(dir).keys()]).toContain("scenes/attic.json");
    expect([...readDir(dir).keys()].some((k) => k.startsWith(".git"))).toBe(false);
    expect(() => writeAtomic(join(dir, "scenes"), "x")).toThrow();
    expect(noTmp(dir)).toBe(true);
  });
});
