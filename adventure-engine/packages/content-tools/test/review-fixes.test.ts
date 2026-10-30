import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildEditorFixture } from "../fixtures/build-editor-fixture.ts";
import { detectAsset } from "../src/assets.ts";
import { buildManifest, validateProject } from "../src/build.ts";
import { runCli, writeAtomic, writeInside } from "../src/cli.ts";
import { validateSchema } from "../src/jsonschema.ts";
import { FILE_ID } from "../src/limits.ts";
import { encodeText, ownedFiles, projectToFiles, readProject, type Project } from "../src/project.ts";
import { rename } from "../src/refs.ts";
import { SCHEMAS, type Schema } from "../src/schema.ts";

/** Regression tests for the code review of PR #469. */

const fx = () => buildEditorFixture();
const root = mkdtempSync(join(tmpdir(), "review-fixes-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function copyFixture(name: string, change?: (files: Map<string, Uint8Array>) => void): string {
  const files = new Map(fx().files);
  change?.(files);
  const dir = join(root, name, "project");
  for (const [path, bytes] of files) writeAtomic(join(dir, ...path.split("/")), bytes);
  return dir;
}

const run = (...argv: string[]) => {
  const out: string[] = [];
  const code = runCli(argv, { cwd: root, out: (t) => out.push(t), err: (t) => out.push(t) });
  return { code, out: out.join("\n") };
};

describe("H1: ids that become file names cannot leave the project", () => {
  it("content format refuses a scene id with a path and writes nothing outside the project", () => {
    const dir = copyFixture("traversal", (files) => {
      const scene = JSON.parse(new TextDecoder().decode(files.get("scenes/attic.json"))) as Record<string, unknown>;
      files.set("scenes/attic.json", encodeText(JSON.stringify({ ...scene, id: "../../PWNED" })));
    });
    const r = run("format", dir);
    expect(r.code).toBe(1);
    expect(r.out).toContain("E-PROJECT-FILE");
    expect(existsSync(join(dir, "..", "..", "PWNED.json"))).toBe(false);
    expect(existsSync(join(root, "PWNED.json"))).toBe(false);
  });

  it("projectToFiles and writeInside refuse unsafe names", () => {
    const p = fx().project;
    expect(() => projectToFiles({ ...p, scenes: [{ ...(p.scenes[0] as Project["scenes"][number]), id: "../x" }] })).toThrow(/cannot be a file name/);
    expect(() => projectToFiles({ ...p, graphs: [{ ...(p.graphs[0] as Project["graphs"][number]), id: "a/b" }] })).toThrow(/cannot be a file name/);
    expect(() => projectToFiles({ ...p, i18n: { ...p.i18n, "..": {} } })).toThrow(/cannot be a file name/);
    const dir = join(root, "inside");
    expect(() => writeInside(dir, "../escape.json", "x")).toThrow(/outside/);
    expect(() => writeInside(dir, "C:/escape.json", "x")).toThrow(/outside/);
    writeInside(dir, "ok/file.json", "x");
    expect(readFileSync(join(dir, "ok", "file.json"), "utf8")).toBe("x");
  });

  it("the schema and FILE_ID agree: scene and graph ids and languages are file-name ids", () => {
    for (const ok of ["cellar", "bo_talk", "a.b-1", "Scene2"]) expect(FILE_ID.test(ok), ok).toBe(true);
    for (const bad of ["", "../x", "a/b", ".hidden", "__proto__", "a b", "x".repeat(65)]) expect(FILE_ID.test(bad), bad).toBe(false);
    const issues = validateSchema(SCHEMAS["scene"] as Schema, { id: "../x", entry: null });
    expect(issues.map((i) => i.path)).toEqual(["id"]);
  });
});

describe("M1: rename keeps file-name ids safe", () => {
  it("scene and graph ids with paths or __proto__ are refused; ordinary ids still work", () => {
    const p = fx().project;
    for (const bad of ["../../evil", "a/b", "__proto__", ".x"]) {
      expect(rename(p, { kind: "scene", id: "attic" }, bad).ok, bad).toBe(false);
      expect(rename(p, { kind: "graph", id: "lamp" }, bad).ok, bad).toBe(false);
    }
    expect(rename(p, { kind: "entity", id: "bo" }, "__proto__").ok).toBe(false);
    expect(rename(p, { kind: "asset", id: "lamp" }, "Bad Id").ok).toBe(false);
    expect(rename(p, { kind: "scene", id: "attic" }, "loft").ok).toBe(true);
  });
});

describe("M2 and related: projects with schema errors are not assembled, so nothing crashes", () => {
  it("schema errors give no project and validation reports them without throwing", () => {
    const files = new Map(fx().files);
    const actors = JSON.parse(new TextDecoder().decode(files.get("actors.json"))) as Array<Record<string, unknown>>;
    files.set("actors.json", encodeText(JSON.stringify([{ ...actors[0], variants: { default: null } }, actors[1]])));
    expect(readProject(files).project).toBeNull();
    const v = validateProject(files);
    expect(v.ok).toBe(false);
    expect(v.problems.some((x) => x.code === "E-PROJECT-SCHEMA" && x.file === "actors.json")).toBe(true);
    const assets = new Map(fx().files);
    const manifest = JSON.parse(new TextDecoder().decode(assets.get("assets.manifest.json"))) as Record<string, Record<string, unknown>>;
    assets.set("assets.manifest.json", encodeText(JSON.stringify({ ...manifest, lamp: { ...manifest["lamp"], alternatives: 5 } })));
    expect(() => validateProject(assets)).not.toThrow();
    expect(validateProject(assets).ok).toBe(false);
  });

  it("an atlas with an absurd frame count is a schema error", () => {
    const files = new Map(fx().files);
    const manifest = JSON.parse(new TextDecoder().decode(files.get("assets.manifest.json"))) as Record<string, Record<string, unknown>>;
    const atlas = manifest["atlas.bo"] as Record<string, unknown>;
    files.set("assets.manifest.json", encodeText(JSON.stringify({ ...manifest, "atlas.bo": { ...atlas, atlas: { frameWidth: 64, frameHeight: 96, frames: 1_000_000_000 } } })));
    const r = readProject(files);
    expect(r.project).toBeNull();
    expect(r.problems.some((x) => x.path === "atlas.bo.atlas.frames")).toBe(true);
  });

  it("asset ids in the manifest must be asset ids", () => {
    const files = new Map(fx().files);
    const manifest = JSON.parse(new TextDecoder().decode(files.get("assets.manifest.json"))) as Record<string, unknown>;
    files.set("assets.manifest.json", encodeText(JSON.stringify({ ...manifest, "Bad Id": manifest["lamp"] })));
    expect(readProject(files).problems.some((x) => x.path === "Bad Id" && x.code === "E-PROJECT-SCHEMA")).toBe(true);
  });
});

describe("low: prototype keys", () => {
  it("an i18n/__proto__.json file is an error, not a silently vanishing language", () => {
    const files = new Map(fx().files);
    files.set("i18n/__proto__.json", encodeText('{"x": "y"}'));
    const r = readProject(files);
    expect(r.project).toBeNull();
    expect(r.problems.some((x) => x.code === "E-PROJECT-FILE" && x.file === "i18n/__proto__.json")).toBe(true);
  });

  it("fields named like Object members are unknown fields", () => {
    const issues = validateSchema(SCHEMAS["scene"] as Schema, { id: "s", entry: null, constructor: {}, toString: 1 });
    expect(issues.map((i) => `${i.kind} ${i.path}`)).toEqual(["unknown constructor", "unknown toString"]);
  });

  it("the runtime manifest keeps any asset id as a plain key", () => {
    const p = fx().project;
    const assets = JSON.parse(`{"__proto__": ${JSON.stringify(p.assets["lamp"])}}`) as Project["assets"];
    const m = buildManifest({ ...p, assets });
    expect(Object.getPrototypeOf(m)).toBe(Object.prototype);
    expect(Object.keys(m)).toEqual(["__proto__"]);
  });
});

describe("H2: the editor only deletes files it owns", () => {
  it("own JSON files and registered assets are owned; notes and unregistered files under assets/ are not", () => {
    const p = fx().project;
    const paths = ["project.json", "scenes/attic.json", "graphs/lamp.json", "i18n/da.json", "media.json", "editor.json", "assets/lamp.svg", "assets/README.txt", "assets/source/hero.psd", "notes.md"];
    expect([...ownedFiles(p, paths)].sort()).toEqual(["assets/lamp.svg", "editor.json", "graphs/lamp.json", "i18n/da.json", "media.json", "scenes/attic.json"]);
  });
});

describe("low: SVG script filter", () => {
  it("namespaced script elements, character references and whitespace tricks are refused", () => {
    const cases = [
      '<svg xmlns="http://www.w3.org/2000/svg"><x:script xmlns:x="http://www.w3.org/2000/svg">1</x:script></svg>',
      '<svg><a href="&#106;avascript:alert(1)">x</a></svg>',
      '<svg><a href="&#x6A;avascript:alert(1)">x</a></svg>',
      '<svg><a href="java\tscript:alert(1)">x</a></svg>',
      '<svg><svg:foreignObject></svg:foreignObject></svg>',
      '<svg><image href="data:text/html,x"/></svg>',
    ];
    for (const c of cases) expect(detectAsset("x.svg", encodeText(c)), c).toHaveProperty("forbidden");
    expect(detectAsset("x.svg", encodeText('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'))).toMatchObject({ type: "image/svg+xml" });
  });
});

describe("CLI writes stay inside their folder", () => {
  it("writeInside is used for project files: a normal format still works", () => {
    const dir = copyFixture("format-ok");
    writeFileSync(join(dir, "game.json"), JSON.stringify(JSON.parse(readFileSync(join(dir, "game.json"), "utf8"))));
    expect(run("format", dir).code).toBe(0);
    expect(run("format", dir, "--check").code).toBe(0);
  });
});
