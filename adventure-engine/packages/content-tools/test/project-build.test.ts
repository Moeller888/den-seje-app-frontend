import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { loadContent } from "@adventure-engine/content";
import { Engine, type Command, type Disposition } from "@adventure-engine/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildEditorFixture } from "../fixtures/build-editor-fixture.ts";
import { buildBundle, buildManifest, sourceLocation, validateBundle, validateProject } from "../src/build.ts";
import { setText } from "../src/i18n.ts";
import { decodeText, encodeText, newProject, prettyCanonical, projectToFiles, readProject, sortKeys, withAssets, type Project } from "../src/project.ts";

const FIXTURE_DIR = join(import.meta.dirname, "../fixtures/editor-demo");

function readTree(root: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.set(relative(root, full).split(sep).join("/"), new Uint8Array(readFileSync(full)));
    }
  };
  walk(root);
  return out;
}

const textFiles = (p: Project): Map<string, Uint8Array> => new Map([...projectToFiles(p)].map(([k, v]) => [k, encodeText(v)]));
const fixture = () => buildEditorFixture();

/** Reverse the key order of every object (same meaning, different text). */
function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (typeof v === "object" && v !== null) return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)]));
  return v;
}

describe("editor fixture (phase 6)", () => {
  it("the committed fixture equals a fresh build through the editor API, byte for byte, with no other files", () => {
    const built = fixture().files;
    const committed = readTree(FIXTURE_DIR);
    expect([...committed.keys()].sort()).toEqual([...built.keys()].sort());
    for (const [path, bytes] of built) expect(Buffer.from(committed.get(path) as Uint8Array).equals(Buffer.from(bytes)), path).toBe(true);
  });

  it("has everything the brief asks for", () => {
    const { project: p } = fixture();
    expect(p.scenes.map((s) => s.id)).toEqual(["cellar", "attic"]);
    expect(p.portals.map((x) => x.id)).toEqual(["up", "down"]);
    expect(p.actors.map((a) => a.id)).toEqual(["mira", "bo"]);
    expect(p.objects.map((o) => o.id)).toEqual(["lamp", "wick"]);
    expect(p.graphs.find((g) => g.kind === "dialog")?.nodes.some((n) => n.type === "choice")).toBe(true);
    expect(p.scenes[0]?.triggerZones?.length).toBe(1);
    expect([p.animations.length, p.sounds.length, Object.keys(p.scenes[1]?.cutscenes ?? {}).length]).toEqual([1, 1, 1]);
    expect(Object.keys(p.i18n).sort()).toEqual(["da", "en"]);
    expect(p.i18n["da"]?.["o.wick"]).toBe("Væge");
  });

  it("validates without problems, and the built bundle runs in the engine without hand edits", () => {
    const v = validateProject(readTree(FIXTURE_DIR), { strict: true });
    expect(v.problems).toEqual([]);
    const { json } = buildBundle(v.project as Project);
    expect(validateBundle(json, { strict: true })).toEqual({ problems: [], ok: true });
    const bundle = JSON.parse(json) as { content: unknown };
    const content = loadContent(bundle.content, { mode: "strict" });
    const says: string[] = [];
    const engine = new Engine(content, {
      seed: "fixture",
      adapter: {
        onCommand: (c: Command): Disposition => {
          if (c.type === "Say") says.push(c.textKey);
          return c.type === "Say" || c.type === "Choose" ? { kind: "await" } : { kind: "auto", afterMs: 0 };
        },
      },
    });
    const settle = (): void => {
      for (let i = 0; i < 20000 && !engine.idleReport().idle; i++) {
        const say = engine.pendingCommands().find((c) => c.type === "Say");
        if (say !== undefined) engine.reply(say.cmdId, { kind: "done" });
        else if (engine.pendingCommands().some((c) => c.type === "Choose")) return;
        else engine.advanceTicks(1);
      }
    };
    engine.newGame();
    settle();
    expect(says).toContain("line.intro");
    engine.click({ objectZone: "lamp" });
    settle();
    expect(engine.world.actors.get("mira")?.inventory).toEqual(["wick", "lamp"]);
    engine.clickInventory("wick");
    engine.clickInventory("lamp");
    settle();
    expect(engine.world.objects.get("lamp")?.variant).toBe("lit");
    expect(engine.globals.get("lamp_lit")).toBe(true);
    engine.click({ portal: "up" });
    settle();
    expect(engine.world.actors.get("mira")?.scene).toBe("attic");
    engine.click({ actorZone: "bo" });
    settle();
    expect(says).toContain("bo.hello");
    const menu = engine.pendingCommands().find((c) => c.type === "Choose");
    expect(menu?.type).toBe("Choose");
  });
});

describe("project format", () => {
  it("parse → edit → export → parse loses nothing (property: random text edits)", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom("da", "en"), fc.stringMatching(/^[a-z][a-z0-9._]{0,10}$/), fc.string()), { maxLength: 8 }), (edits) => {
        let p = fixture().project;
        for (const [lang, key, text] of edits) p = setText(p, lang, key, text);
        const files = withAssets(p, fixture().files);
        const back = readProject(files);
        expect(back.problems.filter((x) => x.level === "error")).toEqual([]);
        expect(sortKeys(back.project)).toEqual(sortKeys(p));
        expect(projectToFiles(back.project as Project)).toEqual(projectToFiles(p));
      }),
      { numRuns: 30 },
    );
  });

  it("the bundle is byte-identical regardless of file order and object key order", () => {
    const files = fixture().files;
    const base = buildBundle(readProject(files).project as Project).json;
    const reversed = new Map([...files].reverse());
    expect(buildBundle(readProject(reversed).project as Project).json).toBe(base);
    const rekeyed = new Map(
      [...files].map(([path, bytes]) => [path, path.endsWith(".json") ? encodeText(JSON.stringify(reverseKeys(JSON.parse(decodeText(bytes))), null, 4)) : bytes] as const),
    );
    expect(buildBundle(readProject(rekeyed).project as Project).json).toBe(base);
    expect(base.endsWith("\n")).toBe(true);
    expect(base).not.toMatch(/[A-Z]:\\|\/Users\//);
  });

  it("unknown fields: warning by default, error with strict; nothing is dropped on export", () => {
    const files = new Map(fixture().files);
    files.set("scenes/cellar.json", encodeText(JSON.stringify({ ...JSON.parse(decodeText(files.get("scenes/cellar.json") as Uint8Array)), mood: "dark" })));
    const lenient = readProject(files);
    expect(lenient.problems).toEqual([{ code: "E-PROJECT-UNKNOWN", level: "warning", file: "scenes/cellar.json", path: "mood", message: 'unknown field "mood"' }]);
    expect(readProject(files, { strict: true }).problems[0]?.level).toBe("error");
    expect(projectToFiles(lenient.project as Project).get("scenes/cellar.json")).toContain('"mood": "dark"');
  });

  it("structural problems: missing, unparsable, wrong format, newer version, names and order", () => {
    const files = new Map(fixture().files);
    const without = new Map(files);
    without.delete("project.json");
    expect(readProject(without).problems.map((p) => p.code)).toEqual(["E-PROJECT-MISSING"]);
    const bad = new Map(files);
    bad.set("game.json", encodeText("{"));
    expect(readProject(bad).project).toBeNull();
    expect(readProject(bad).problems.map((p) => p.code)).toEqual(["E-PROJECT-JSON"]);
    const notUtf8 = new Map(files);
    notUtf8.set("actors.json", new Uint8Array([0xff, 0xfe, 0x00]));
    expect(readProject(notUtf8).problems.map((p) => p.code)).toEqual(["E-PROJECT-JSON"]);
    const fmt = new Map(files);
    fmt.set("project.json", encodeText(JSON.stringify({ format: "other", formatVersion: 1, order: { scenes: [], graphs: [] } })));
    expect(readProject(fmt).problems.map((p) => p.code)).toContain("E-PROJECT-FORMAT");
    const newer = new Map(files);
    newer.set("project.json", encodeText(JSON.stringify({ format: "adventure-engine.project", formatVersion: 2, order: { scenes: [], graphs: [] } })));
    expect(readProject(newer).problems.map((p) => [p.code, p.path])).toContainEqual(["E-PROJECT-FORMAT", "formatVersion"]);
    const order = new Map(files);
    order.set("project.json", encodeText(JSON.stringify({ format: "adventure-engine.project", formatVersion: 1, order: { scenes: ["attic", "attic"], graphs: ["nope"] } })));
    const r = readProject(order);
    expect(r.problems.map((p) => `${p.code} ${p.path}`)).toEqual(
      expect.arrayContaining(["W-PROJECT-ORDER order.scenes[1]", "W-PROJECT-ORDER order.scenes", "E-PROJECT-MISSING order.graphs[0]", "W-PROJECT-ORDER order.graphs"]),
    );
    expect(r.project).toBeNull();
    const renamed = new Map(files);
    renamed.set("scenes/kitchen.json", files.get("scenes/attic.json") as Uint8Array);
    renamed.delete("scenes/attic.json");
    expect(readProject(renamed).problems.map((p) => `${p.code} ${p.file}`)).toContain("E-PROJECT-FILE scenes/kitchen.json");
    const stray = new Map(files);
    stray.set("notes.txt", encodeText("hello"));
    expect(readProject(stray).problems.map((p) => p.code)).toEqual(["W-PROJECT-STRAY"]);
    const noGame = new Map(files);
    noGame.delete("game.json");
    expect(readProject(noGame).problems.map((p) => p.code)).toEqual(["E-PROJECT-MISSING"]);
    const shapes = new Map(files);
    shapes.set("actors.json", encodeText("{}"));
    shapes.set("scenes/attic.json", encodeText("[]"));
    shapes.set("i18n/da.json", encodeText("[]"));
    shapes.set("media.json", encodeText("[]"));
    expect(readProject(shapes).project).toBeNull();
  });

  it("a new project validates and has the documented files", () => {
    const p = newProject("blank");
    const files = textFiles(p);
    expect([...files.keys()]).toEqual(["actors.json", "assets.manifest.json", "game.json", "i18n/da.json", "i18n/en.json", "objects.json", "portals.json", "project.json", "scenes/start.json"]);
    expect(validateProject(files).problems).toEqual([]);
    expect(newProject("x", []).game.defaultLanguage).toBe("da");
    expect(prettyCanonical({ b: 1, a: [undefined, { d: undefined, c: 2 }] })).toBe('{\n  "a": [\n    null,\n    {\n      "c": 2\n    }\n  ],\n  "b": 1\n}\n');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toBe("{}");
  });
});

describe("build and validation", () => {
  it("engine diagnostics are mapped back to the project file and path", () => {
    let p = fixture().project;
    p = { ...p, scenes: p.scenes.map((s, i) => (i === 1 ? { ...s, walkable: [[[0, 0], [10, 0], [0, 0]]] } : s)) };
    p = setText(p, "en", "o.lamp", " ");
    const v = validateProject(withAssets(p, fixture().files));
    expect(v.ok).toBe(false);
    expect(v.problems.map((x) => `${x.code} ${x.file} ${x.path}`)).toEqual(expect.arrayContaining(["E-POLY scenes/attic.json walkable[0]", "W-I18N-EMPTY i18n/en.json o.lamp"]));
  });

  it("sourceLocation covers every part of a package", () => {
    const p = fixture().project;
    const at = (path: string) => sourceLocation(p, path);
    expect(at("scenes[1].spots.hatch")).toEqual({ file: "scenes/attic.json", path: "spots.hatch" });
    expect(at("scenes")).toEqual({ file: "project.json", path: "order.scenes" });
    expect(at("scenes[9]")).toEqual({ file: "scenes/9.json", path: "" });
    expect(at("graphs[0].nodes[1]")).toEqual({ file: "graphs/game.json", path: "nodes[1]" });
    expect(at("graphs[9]")).toEqual({ file: "graphs/9.json", path: "" });
    expect(at("graphs")).toEqual({ file: "project.json", path: "order.graphs" });
    expect(at("actors[1].spot")).toEqual({ file: "actors.json", path: "[1].spot" });
    expect(at("objects")).toEqual({ file: "objects.json", path: "" });
    expect(at("portals[0]")).toEqual({ file: "portals.json", path: "[0]" });
    expect(at("animations[0].atlas")).toEqual({ file: "media.json", path: "animations[0].atlas" });
    expect(at("sounds")).toEqual({ file: "media.json", path: "sounds" });
    expect(at("saveMigrations[0].rename")).toEqual({ file: "migrations.json", path: "[0].rename" });
    expect(at("saveMigrations")).toEqual({ file: "migrations.json", path: "" });
    expect(at("game.player.actor")).toEqual({ file: "game.json", path: "player.actor" });
    expect(at("i18n.da.o.lamp")).toEqual({ file: "i18n/da.json", path: "o.lamp" });
    expect(at("manifest.lamp.atlas")).toEqual({ file: "assets.manifest.json", path: "lamp.atlas" });
    expect(at("manifest.lamp")).toEqual({ file: "assets.manifest.json", path: "lamp" });
    expect(at("")).toEqual({ file: "", path: "" });
  });

  it("the manifest uses relative urls, sha256 hashes and alternatives; fonts stay out", () => {
    const p = fixture().project;
    const lamp = p.assets["lamp"];
    const withExtra: Project = {
      ...p,
      assets: {
        ...p.assets,
        "font.ui": { kind: "font", file: "ui.woff2", type: "font/woff2", bytes: 4, sha256: "0".repeat(64) },
        "snd.drip": { ...(p.assets["snd.drip"] as NonNullable<typeof lamp>), language: "da", alternatives: [{ file: "drip.ogg", type: "audio/ogg", bytes: 5, sha256: "1".repeat(64) }] },
      },
    };
    const m = buildManifest(withExtra);
    expect(m["font.ui"]).toBeUndefined();
    expect(m["lamp"]).toEqual({ kind: "image", url: "assets/lamp.svg", bytes: lamp?.bytes, hash: `sha256:${lamp?.sha256}` });
    expect(m["snd.drip"]?.formats?.map((f) => f.url)).toEqual(["assets/snd.drip.wav", "assets/drip.ogg"]);
    expect(m["snd.drip"]?.language).toBe("da");
    expect(m["atlas.bo"]?.atlas).toEqual({ frameWidth: 64, frameHeight: 96, frames: 2, columns: 2 });
  });

  it("validateBundle: bad JSON, schema errors, unknown fields, a changed content hash, engine errors", () => {
    const { json, bundle } = buildBundle(fixture().project);
    expect(validateBundle("{").problems.map((p) => p.code)).toEqual(["E-PROJECT-JSON"]);
    expect(validateBundle(JSON.stringify({ ...bundle, format: "x" })).ok).toBe(false);
    const extra = JSON.stringify({ ...bundle, note: 1 });
    expect(validateBundle(extra)).toMatchObject({ ok: true, problems: [{ code: "E-PROJECT-UNKNOWN", level: "warning" }] });
    expect(validateBundle(extra, { strict: true }).ok).toBe(false);
    const changed = JSON.parse(json) as { content: { game: { version: string } } };
    changed.content.game.version = "9";
    expect(validateBundle(JSON.stringify(changed)).problems.map((p) => p.code)).toEqual(["E-ASSET-HASH"]);
    const broken = JSON.parse(json) as { content: { actors: Array<{ scene: string }> }; manifest: Record<string, unknown> };
    (broken.content.actors[1] as { scene: string }).scene = "moon";
    delete broken.manifest["lamp"];
    const r = validateBundle(JSON.stringify(broken));
    expect(r.problems.map((p) => `${p.code} ${p.path}`)).toEqual(expect.arrayContaining(["E-REF content.actors[1].scene", "E-ASSET-REF content.objects[0].icon"]));
  });
});
