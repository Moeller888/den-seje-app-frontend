import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent, type ContentPackage } from "@adventure-engine/content";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  Engine,
  canonicalJson,
  compareVersions,
  deletePath,
  getPath,
  isoFromSimulatedMs,
  parseSave,
  pathSegments,
  saveChecksum,
  saveIntegrity,
  schemaProblem,
  setPath,
  sha256Hex,
  type Command,
  type SaveData,
  type SaveOutcome,
} from "../src/index.ts";
import { TestAdapter } from "./helpers.ts";

const rect = (x: number, y: number, w: number, h: number): Array<[number, number]> => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Synthetic lighthouse: two scenes, a portal, items, an NPC with a dialog, sounds and game logic for save/load. */
function pkg(extra: Partial<ContentPackage> = {}): ContentPackage {
  return {
    game: { id: "lighthouse", version: "1.2.0", formatVersion: 1, languages: ["da", "en"], defaultLanguage: "da", player: { actor: "keeper" }, entry: "game#main", globals: { lamp_lit: false } },
    scenes: [
      {
        id: "quay",
        entry: null,
        variants: ["default", "night"],
        spots: { a: { x: 100, y: 650 }, b: { x: 600, y: 650 }, box: { x: 300, y: 640 } },
        defaultSpot: "a",
        walkable: [rect(0, 600, 1280, 120)],
        triggerZones: [{ id: "pier", entry: null, polygon: rect(50, 600, 100, 100) }],
        sounds: { waves: "s.waves", tune: "s.tune" },
      },
      { id: "tower", entry: null, spots: { door: { x: 200, y: 650 } }, defaultSpot: "door", walkable: [rect(0, 600, 1280, 120)] },
    ],
    portals: [
      { id: "up", from: "quay", to: "tower", entry: null, arrivalSpot: "door" },
      { id: "down", from: "tower", to: "quay", entry: null, arrivalSpot: "b" },
    ],
    actors: [
      { id: "keeper", scene: "quay", spot: "a", entry: null, variants: { default: {}, wet: {} } },
      { id: "gull", scene: "quay", spot: "b", entry: null, dialog: "talk#hello", variants: { default: {} } },
      { id: "ghost", scene: null, entry: null, variants: { default: {} } },
    ],
    objects: [
      { id: "crate", container: { kind: "scene", id: "quay" }, spot: "box", entry: null, variants: { default: {}, open: {} } },
      { id: "key", container: { kind: "actor", id: "keeper" }, entry: null, variants: { default: {} } },
      { id: "map", container: { kind: "actor", id: "keeper" }, entry: null, variants: { default: {} } },
      { id: "coin", container: { kind: "none" }, entry: null, variants: { default: {} } },
    ],
    sounds: [
      { id: "s.waves", asset: "a.waves", channel: "ambient" },
      { id: "s.tune", asset: "a.tune", channel: "music", persistAcrossScenes: true },
    ],
    graphs: [
      {
        id: "game",
        kind: "logic",
        nodes: [
          { id: "g0", type: "entry", name: "main", next: ["g1", "g3", "g5"] },
          { id: "g1", type: "guard", expr: { eq: [{ var: "$action" }, { const: "game.save" }] }, next: ["g2"] },
          { id: "g2", type: "set", var: "saved", value: true },
          { id: "g3", type: "guard", expr: { eq: [{ var: "$action" }, { const: "game.load" }] }, next: ["g4"] },
          { id: "g4", type: "set", var: "loaded", value: true },
          { id: "g5", type: "guard", expr: { eq: [{ var: "$action" }, { const: "game.start" }] }, next: [] },
        ],
      },
      {
        id: "g",
        kind: "logic",
        nodes: [
          { id: "loops", type: "entry", name: "loops", next: ["l1"] },
          { id: "l1", type: "sound_play", entity: "quay", sound: "waves", times: "loop", volume: 0.5, next: ["l2"] },
          { id: "l2", type: "sound_play", entity: "quay", sound: "tune", times: "loop", next: [] },
          { id: "stop", type: "entry", name: "stop", next: ["s1"] },
          { id: "s1", type: "sound_stop", entity: "quay", sound: "waves" },
          { id: "busy", type: "entry", name: "busy", next: ["b1"] },
          { id: "b1", type: "say", speaker: "keeper", textKey: "t" },
          { id: "bg", type: "entry", name: "bg", next: ["d1"] },
          { id: "d1", type: "detach", next: ["d2"] },
          { id: "d2", type: "delay", minMs: 5000, maxMs: 5000, mode: "block" },
          { id: "up", type: "entry", name: "up", modal: true, next: ["u1"] },
          { id: "u1", type: "portal_use", portal: "up" },
        ],
      },
      {
        id: "talk",
        kind: "dialog",
        nodes: [
          { id: "h0", type: "entry", name: "hello", next: ["h1"] },
          { id: "h1", type: "say", speaker: "gull", textKey: "t" },
          { id: "h2", type: "entry", name: "later", next: ["h3"] },
          { id: "h3", type: "say", speaker: "gull", textKey: "t" },
        ],
      },
    ],
    i18n: { da: { t: "x" }, en: { t: "y" } },
    ...extra,
  };
}

const content = loadContent(pkg(), { mode: "lenient" });

function engine(seed = "s", awaitTypes: string[] = []) {
  const adapter = new TestAdapter(awaitTypes as never[]);
  const e = new Engine(content, { seed, adapter });
  e.newGame();
  return { e, adapter };
}

function saveOut(e: Engine): { data: SaveData; json: string } {
  let out: SaveOutcome | null = null;
  e.requestSave((o) => {
    out = o;
  });
  const o = out as unknown as SaveOutcome;
  if (!o.ok) throw new Error(`save rejected: ${o.blockers.join(",")}`);
  return { data: o.data, json: o.json };
}

const save = (e: Engine): SaveData => saveOut(e).data;
const saveJson = (e: Engine): string => saveOut(e).json;

const comparable = (d: SaveData): string => {
  const c = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
  for (const p of ["savedAt", "playTimeMs", "checksum", "globals.loaded"]) deletePath(c, p);
  return canonicalJson(c);
};

describe("hashing, canonical JSON and helpers", () => {
  it("SHA-256 test vectors (FIPS 180-4) and UTF-8", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    expect(sha256Hex("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
    // Node's crypto as oracle, also for UTF-8 and lengths around the 55/56/64-byte padding boundaries.
    for (const t of ["æøå", "a".repeat(55), "b".repeat(56), "c".repeat(64), "Tik, tak – ✓"]) expect(sha256Hex(t)).toBe(createHash("sha256").update(t, "utf8").digest("hex"));
  });

  it("canonical JSON sorts keys, drops undefined members and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: [3, { z: 1, y: undefined }, undefined], c: null, d: "æ" })).toBe('{"a":[3,{"z":1},null],"b":1,"c":null,"d":"æ"}');
    expect(canonicalJson(undefined)).toBe("null");
  });

  it("paths, versions and simulated timestamps", () => {
    const v: Record<string, unknown> = { a: { list: [{ id: "x", v: 1 }, { id: "y", v: 2 }] } };
    expect(pathSegments("a.list[id=y].v")).toEqual(["a", "list", { key: "id", value: "y" }, "v"]);
    expect(getPath(v, "a.list[1].v")).toBe(2);
    expect(getPath(v, "a.list[id=y].v")).toBe(2);
    expect(getPath(v, "a.nope.x")).toBeUndefined();
    expect(getPath(v, "a[0]")).toBeUndefined();
    expect(setPath(v, "a.list[id=x].v", 9)).toBe(true);
    expect(getPath(v, "a.list[0].v")).toBe(9);
    expect(setPath(v, "a.missing.deep", 1)).toBe(false);
    expect(setPath(v, "a.list[id=x]", 1)).toBe(false);
    deletePath(v, "a.list");
    deletePath(v, "a.zz.q");
    expect(v).toEqual({ a: {} });
    expect(() => pathSegments("a.b]")).toThrow(/invalid path/);
    expect([compareVersions("1.2.10", "1.2.9"), compareVersions("1.0", "1.0.0"), compareVersions("1.a", "1.b"), compareVersions("2", "10")]).toEqual([1, 0, -1, -1]);
    expect(isoFromSimulatedMs(0)).toBe("2000-01-01T00:00:00.000Z");
    expect(isoFromSimulatedMs(59 * 86400000 + 3723004)).toBe("2000-02-29T01:02:03.004Z");
    for (const ms of [9132 * 86400000, 36524 * 86400000 + 86399999, 123456789012]) expect(isoFromSimulatedMs(ms)).toBe(new Date(Date.UTC(2000, 0, 1) + ms).toISOString());
    expect(isoFromSimulatedMs(-5)).toBe("2000-01-01T00:00:00.000Z");
  });
});

describe("saving (spec 05 E2/E3)", () => {
  it("TS-E01/E02: game.save runs first; the save holds world, written globals, rng and a valid checksum", () => {
    const { e } = engine();
    e.setGlobal("visits", 3);
    e.world.setVariant("quay", "night");
    e.world.setPortalLocked("up", true);
    e.world.moveObject("coin", { kind: "actor", id: "keeper" }, null);
    e.pushDialog("gull", "talk#later");
    const d = save(e);
    expect(d).toMatchObject({
      format: "engine.save",
      formatVersion: 1,
      engineVersion: ENGINE_VERSION,
      content: { id: "lighthouse", version: "1.2.0" },
      createdAt: "2000-01-01T00:00:00.000Z",
      language: "da",
      playerId: "keeper",
      globals: { lamp_lit: false, saved: true, visits: 3 },
      scenes: [{ id: "quay", variant: "night" }, { id: "tower", variant: "default" }],
      portals: [{ id: "up", locked: true }, { id: "down", locked: false }],
    });
    expect(Object.keys(d.globals)).toEqual(["lamp_lit", "saved", "visits"]);
    expect(d.content.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(d.actors).toEqual([
      { id: "keeper", scene: "quay", pos: { x: 100, y: 650 }, facing: "down", variant: "default", dialogStack: [], inventory: ["key", "map", "coin"] },
      { id: "gull", scene: "quay", pos: { x: 600, y: 650 }, facing: "down", variant: "default", dialogStack: ["talk#hello", "talk#later"], inventory: [] },
      { id: "ghost", scene: null, pos: null, facing: null, variant: "default", dialogStack: [], inventory: [] },
    ]);
    expect(d.objects[0]).toEqual({ id: "crate", container: { kind: "scene", id: "quay" }, pos: { x: 300, y: 640 }, facing: null, variant: "default", nameKey: null });
    expect(d.checksum).toBe(saveChecksum(d));
    const json = saveJson(e);
    expect(schemaProblem(JSON.parse(json) as Record<string, unknown>)).toBeNull();
    expect(saveIntegrity(json)).toBe("ok");
    expect(json).toBe(canonicalJson(JSON.parse(json)));
  });

  it("TS-E03: saving is refused while modal, in a transition or with foreground logic; background branches do not block", () => {
    const { e } = engine("s", ["Say", "SceneFade"]);
    expect(e.canSave()).toBe(true);
    const lock = e.modal.acquire("test", "t");
    expect(e.saveBlockers()).toEqual(["modal"]);
    let out: SaveOutcome | null = null;
    e.requestSave((o) => {
      out = o;
    });
    expect(out).toEqual({ ok: false, reason: "not-idle", blockers: ["modal"] });
    e.modal.release(lock);
    e.run("g#busy");
    expect(e.saveBlockers()).toEqual(["running"]);
    e.cancelAllRuns("t");
    e.run("g#bg");
    expect(e.activeRunCount()).toBe(1);
    expect(e.canSave()).toBe(true);
    e.run("g#up");
    e.advance(10);
    expect(e.saveBlockers()).toEqual(["modal", "transition", "running"]);
  });

  it("game.save logic that waits makes the save wait too", () => {
    const waiting = loadContent(
      pkg({
        graphs: [
          { id: "game", kind: "logic", nodes: [{ id: "g0", type: "entry", name: "main", next: ["g1"] }, { id: "g1", type: "guard", expr: { eq: [{ var: "$action" }, { const: "game.save" }] }, next: ["g2"] }, { id: "g2", type: "delay", minMs: 100, maxMs: 100, mode: "block", next: ["g3"] }, { id: "g3", type: "set", var: "late", value: 1 }] },
          { id: "talk", kind: "dialog", nodes: [{ id: "h0", type: "entry", name: "hello", next: ["h1"] }, { id: "h1", type: "say", speaker: "gull", textKey: "t" }] },
        ],
      }),
      { mode: "lenient" },
    );
    const e = new Engine(waiting, { seed: "s", adapter: new TestAdapter() });
    e.newGame();
    let out: SaveOutcome | null = null;
    e.requestSave((o) => {
      out = o;
    });
    expect(out).toBeNull();
    e.advance(100);
    expect((out as unknown as { data: SaveData }).data.globals).toMatchObject({ late: 1 });
  });
});

describe("loading (spec 05 E4)", () => {
  it("TS-E05: a fresh world, no scene.enter or zone events, the scene fades in, then game.load", () => {
    const { e, adapter } = engine();
    const json = saveJson(e);
    const before = e.trace.length;
    e.run("g#busy");
    const out = e.load(json);
    expect(out).toEqual({ ok: true, warnings: [] });
    const kinds = e.trace.slice(before).map((t) => (t.kind === "run.start" ? `run.start:${String(t["action"])}` : t.kind));
    expect(kinds).toContain("runs.cancelAll");
    expect(kinds.filter((k) => k.startsWith("run.start:scene.enter") || k === "zone")).toEqual([]);
    expect(kinds.indexOf("game.load")).toBeLessThan(kinds.indexOf("run.start:game.load"));
    expect(adapter.log.at(-1)).toMatchObject({ type: "SceneFade", direction: "in" });
    expect(e.globals.get("loaded")).toBe(true);
    expect(e.activeZones("keeper")).toEqual(["pier"]);
    expect(e.activeRunCount()).toBe(0);
  });

  it("TS-E04: save → load → save is canonically identical (except times, checksum and load effects)", () => {
    const { e } = engine();
    e.setGlobal("n", 2.5);
    e.setActorPosition("keeper", [420.25, 660], "left");
    e.world.moveObject("crate", { kind: "actor", id: "gull" }, null);
    e.world.setVariant("keeper", "wet");
    const { data: a, json } = saveOut(e);
    e.advance(1234);
    expect(e.load(json).ok).toBe(true);
    const b = save(e);
    expect(comparable(b)).toBe(comparable(a));
    expect(b.playTimeMs).toBe(a.playTimeMs);
    expect(b.createdAt).toBe(a.createdAt);
  });

  it("TS-E04 (property): random play states survive save → load → save", () => {
    const op = fc.oneof(
      fc.record({ k: fc.constant("global" as const), name: fc.constantFrom("a", "b", "lamp_lit"), v: fc.oneof(fc.boolean(), fc.integer({ min: -9, max: 9 }), fc.string({ maxLength: 4 })) }),
      fc.record({ k: fc.constant("move" as const), obj: fc.constantFrom("crate", "key", "map", "coin"), to: fc.constantFrom<"none" | "keeper" | "gull" | "quay">("none", "keeper", "gull", "quay") }),
      fc.record({ k: fc.constant("pos" as const), actor: fc.constantFrom("keeper", "gull"), x: fc.integer({ min: 0, max: 1280 }), y: fc.integer({ min: 600, max: 720 }) }),
      fc.record({ k: fc.constant("variant" as const), id: fc.constantFrom("quay", "keeper", "crate"), alt: fc.boolean() }),
      fc.record({ k: fc.constant("lock" as const), portal: fc.constantFrom("up", "down"), locked: fc.boolean() }),
      fc.record({ k: fc.constant("rng" as const), n: fc.integer({ min: 1, max: 5 }) }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 12 }), (ops) => {
        const { e } = engine("prop");
        for (const o of ops) {
          if (o.k === "global") e.setGlobal(o.name, o.v);
          else if (o.k === "move") e.world.moveObject(o.obj, o.to === "none" ? { kind: "none" } : o.to === "quay" ? { kind: "scene", id: "quay" } : { kind: "actor", id: o.to }, o.to === "quay" ? "box" : null);
          else if (o.k === "pos") e.setActorPosition(o.actor, [o.x, o.y]);
          else if (o.k === "variant") e.world.setVariant(o.id, o.alt ? (o.id === "quay" ? "night" : o.id === "keeper" ? "wet" : "open") : "default");
          else if (o.k === "lock") e.world.setPortalLocked(o.portal, o.locked);
          else for (let i = 0; i < o.n; i++) e.rng.int(7);
        }
        const { data: a, json } = saveOut(e);
        const loaded = e.load(json);
        expect(loaded.ok).toBe(true);
        expect(comparable(save(e))).toBe(comparable(a));
      }),
      { numRuns: 60 },
    );
  });

  it("TS-E10: the next 100 random choices after a load equal a run without save/load", () => {
    const { e: a } = engine("seed-x");
    for (let i = 0; i < 17; i++) a.rng.int(10);
    const d = saveOut(a);
    const expected = Array.from({ length: 100 }, () => a.rng.int(1000));
    const { e: b } = engine("another-seed");
    expect(b.load(d.json).ok).toBe(true);
    expect(Array.from({ length: 100 }, () => b.rng.int(1000))).toEqual(expected);
  });

  it("ambient loops are saved and restarted on load; scene exit keeps only persistent loops", () => {
    const { e, adapter } = engine();
    e.run("g#loops");
    expect(e.ambient.loops).toEqual([
      { entity: "quay", sound: "waves", volume: 0.5 },
      { entity: "quay", sound: "tune", volume: 1 },
    ]);
    const { data: d, json: dJson } = saveOut(e);
    expect(d.ambient).toEqual({ scene: "quay", loops: [{ entity: "quay", sound: "waves", volume: 0.5 }, { entity: "quay", sound: "tune", volume: 1 }] });
    e.run("g#stop");
    expect(e.ambient.loops.map((l) => l.sound)).toEqual(["tune"]);
    const n = adapter.log.length;
    e.load(dJson);
    expect(adapter.log.slice(n).filter((c: Command) => c.type === "PlaySound").map((c) => (c.type === "PlaySound" ? [c.sound, c.times, c.volume] : []))).toEqual([
      ["waves", "loop", 0.5],
      ["tune", "loop", 1],
    ]);
    e.run("g#up");
    e.advance(5000);
    expect(e.world.actors.get("keeper")?.scene).toBe("tower");
    expect(e.ambient.loops.map((l) => l.sound)).toEqual(["tune"]);
    e.newGame();
    expect(e.ambient.loops).toEqual([]);
  });
});

describe("rejected saves (spec 05 E5, TS-E06)", () => {
  const { e } = engine();
  const good = saveOut(e);
  const mutate = (fn: (d: Record<string, unknown>) => void, recompute = true): string => {
    const d = JSON.parse(good.json) as Record<string, unknown>;
    fn(d);
    if (recompute) d["checksum"] = saveChecksum(d as unknown as SaveData);
    return JSON.stringify(d);
  };
  const kind = (raw: string, opts = {}): string => {
    const r = parseSave(raw, content, opts);
    return r.ok ? "ok" : `${r.error.kind}:${r.error.code}`;
  };

  it("specific error kinds and codes; the current game is left untouched", () => {
    expect(kind("{ broken")).toBe("parse:E-SAVE-PARSE");
    expect(kind("[]")).toBe("schema:E-SAVE-SCHEMA");
    expect(kind(mutate((d) => (d["formatVersion"] = 2)))).toBe("newer-format:E-SAVE-NEWER");
    expect(kind(mutate((d) => (d["globals"] = { x: 1 }), false))).toBe("checksum:E-SAVE-CHECKSUM");
    expect(kind(mutate((d) => ((d["content"] as Record<string, unknown>)["id"] = "other"), false))).toBe("wrong-content:E-SAVE-CONTENT");
    expect(kind(mutate((d) => delete d["playerId"]))).toBe("schema:E-SAVE-SCHEMA");
    expect(kind(mutate((d) => (d["rng"] = { algorithm: "xoshiro128**", state: "0".repeat(32) })))).toBe("schema:E-SAVE-SCHEMA");
    expect(kind(mutate((d) => (d["playerId"] = "nobody")))).toBe("player-scene:E-SAVE-PLAYER-SCENE");
    expect(kind(mutate((d) => ((d["actors"] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)["scene"] = "atlantis"))).toBe("player-scene:E-SAVE-PLAYER-SCENE");
    expect(kind(mutate((d) => (d["formatVersion"] = -1)))).toBe("schema:E-SAVE-SCHEMA");
    const dev = parseSave(mutate((d) => (d["globals"] = { x: 1 }), false), content, { allowChecksumMismatch: true });
    expect(dev.ok && dev.warnings.map((w) => w.kind)).toEqual(["checksum-ignored"]);
    const before = canonicalJson(e.snapshot().actors);
    const out = e.load("nope");
    expect(out.ok).toBe(false);
    expect(canonicalJson(e.snapshot().actors)).toBe(before);
    expect(e.trace.some((t) => t.kind === "load.rejected")).toBe(true);
    const devEngine = new Engine(content, { seed: "s", adapter: new TestAdapter(), devMode: true });
    expect(devEngine.load(mutate((d) => (d["globals"] = { x: 1 }), false)).ok).toBe(true);
  });

  it("schema details: every required field, malformed entries", () => {
    const bad: Array<(d: Record<string, unknown>) => void> = [
      (d) => (d["content"] = "x"),
      (d) => (d["language"] = 1),
      (d) => (d["actors"] = {}),
      (d) => (d["objects"] = null),
      (d) => ((d["actors"] as unknown[])[0] = { id: "keeper", scene: 3 }),
      (d) => ((d["actors"] as unknown[])[0] = { id: "keeper", scene: "quay", pos: { x: "1" } }),
      (d) => ((d["actors"] as unknown[])[0] = { id: "keeper", scene: "quay", inventory: [1] }),
      (d) => ((d["objects"] as unknown[])[0] = { id: "crate", container: { kind: "box" } }),
      (d) => ((d["objects"] as unknown[])[0] = { id: "crate", container: { kind: "scene" } }),
      (d) => (d["scenes"] = [{ variant: "x" }]),
      (d) => (d["portals"] = "x"),
      (d) => (d["globals"] = { $action: "x" }),
      (d) => (d["globals"] = { a: {} }),
    ];
    for (const fn of bad) expect(kind(mutate(fn))).toBe("schema:E-SAVE-SCHEMA");
  });
});

describe("repairs and migrations (spec 05 E4–E6, TS-E07/TS-E08)", () => {
  const { e } = engine();
  const good = saveOut(e);
  const raw = (fn: (d: Record<string, unknown>) => void): string => {
    const d = JSON.parse(good.json) as Record<string, unknown>;
    fn(d);
    d["checksum"] = saveChecksum(d as unknown as SaveData);
    return JSON.stringify(d);
  };

  it("TS-E08: unknown variants fall back, unknown ids are removed, inventories follow the containers", () => {
    const r = parseSave(
      raw((d) => {
        const actors = d["actors"] as Array<Record<string, unknown>>;
        const objects = d["objects"] as Array<Record<string, unknown>>;
        (objects[0] as Record<string, unknown>)["variant"] = "smashed";
        objects.push({ id: "dragon", container: { kind: "none" }, pos: null, facing: null, variant: "default", nameKey: null });
        (objects[3] as Record<string, unknown>)["container"] = { kind: "actor", id: "unknown-actor" };
        actors.push({ id: "pirate", scene: "quay", pos: null, facing: null, variant: "default", dialogStack: [], inventory: [] });
        (actors[0] as Record<string, unknown>)["inventory"] = ["map", "ghost-item", "map"];
        (actors[1] as Record<string, unknown>)["dialogStack"] = ["talk#hello", "talk#gone"];
        (actors[1] as Record<string, unknown>)["scene"] = "atlantis";
        (d["scenes"] as unknown[]).push({ id: "moon", variant: "default" });
        (d["portals"] as unknown[]).push({ id: "warp", locked: true });
        d["language"] = "fr";
        d["ambient"] = { scene: "quay", loops: [{ entity: "quay", sound: "waves", volume: 1 }, { entity: "kraken", sound: "roar", volume: 1 }] };
      }),
      content,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.kind)).toEqual([
      "unknown-actor-removed",
      "unknown-object-removed",
      "unknown-variant-fallback",
      "unknown-object-removed",
      "inventory-mismatch",
      "unknown-scene-removed",
      "unknown-dialog-removed",
      "unknown-scene-removed",
      "unknown-portal-removed",
      "unknown-ambient-removed",
      "unknown-language-fallback",
    ]);
    expect(r.data.objects.find((o) => o.id === "crate")?.variant).toBe("default");
    expect(r.data.objects.find((o) => o.id === "coin")?.container).toEqual({ kind: "none" });
    expect(r.data.actors.find((a) => a.id === "keeper")?.inventory).toEqual(["map", "key"]);
    expect(r.data.actors.find((a) => a.id === "gull")).toMatchObject({ scene: null, pos: null, dialogStack: ["talk#hello"] });
    expect(r.data.language).toBe("da");
    expect(r.data.ambient.loops).toEqual([{ entity: "quay", sound: "waves", volume: 1 }]);
  });

  it("missing optional fields get defaults; actors without a position stand on the default spot", () => {
    const minimal = JSON.stringify({
      format: "engine.save",
      formatVersion: 1,
      content: { id: "lighthouse", version: "1.2.0" },
      language: "da",
      playerId: "keeper",
      rng: { algorithm: "xoshiro128**", state: "0123456789abcdef0123456789abcdef" },
      actors: [{ id: "keeper", scene: "tower" }],
      objects: [{ id: "crate", container: { kind: "scene", id: "quay" } }],
      ambient: { music: { sound: "tune", volumeFraction: 0.5 }, loops: [{ bad: true }] },
    });
    const withSum = JSON.stringify({ ...JSON.parse(minimal), checksum: saveChecksum(JSON.parse(minimal) as SaveData) });
    const r = parseSave(withSum, content);
    expect(r.ok && r.data).toMatchObject({ engineVersion: "0.0.0", playTimeMs: 0, scenes: [], portals: [], globals: {}, ambient: { scene: null, music: { sound: "tune", volumeFraction: 0.5 }, loops: [] } });
    const { e: f } = engine();
    expect(f.load(withSum).ok).toBe(true);
    expect(f.world.actors.get("keeper")).toMatchObject({ scene: "tower", spot: "door", pos: [200, 650] });
    expect(f.world.objects.get("crate")?.spot).toBe("box");
    expect(f.world.actors.get("gull")?.scene).toBe("quay");
  });

  it("TS-E07: the format-0 fixture migrates to the current format and loads", () => {
    const here = fileURLToPath(new URL(".", import.meta.url));
    const fixture = readFileSync(join(here, "..", "..", "scenario-runner", "fixtures", "save-v0-legacy-example.json"), "utf8");
    const workshop = loadContent((JSON.parse(readFileSync(join(here, "..", "..", "scenario-runner", "scenarios", "interaction-inventory-combine.json"), "utf8")) as { content: unknown }).content);
    const r = parseSave(fixture, workshop);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.kind)).toEqual(["format-migrated"]);
    expect(r.data).toMatchObject({ formatVersion: 1, playerId: "keeper", globals: { counter: 3 } });
    expect(r.data.actors.find((a) => a.id === "keeper")).toMatchObject({ pos: { x: 600, y: 640 }, facing: "left", inventory: ["hook"] });
    expect(r.data.objects.find((o) => o.id === "rope")?.container).toEqual({ kind: "scene", id: "workshop" });
    const w = new Engine(workshop, { seed: "s", adapter: new TestAdapter() });
    expect(w.load(fixture).ok).toBe(true);
    expect(w.world.objects.get("rope")?.spot).toBe("bench");
    expect(saveIntegrity(fixture)).toBe("ok");
    expect([saveIntegrity(null), saveIntegrity("{"), saveIntegrity("{}"), saveIntegrity('{"format":"engine.save","formatVersion":1,"checksum":"x"}')]).toEqual(["corrupt", "corrupt", "corrupt", "corrupt"]);
    expect(parseSave(JSON.stringify({ format: "engine.save", formatVersion: 0 }), workshop).ok).toBe(false);
  });

  it("content migrations rename, remove and set globals for older content versions", () => {
    const old = raw((d) => {
      (d["content"] as Record<string, unknown>)["version"] = "1.0.0";
      (d["objects"] as Array<Record<string, unknown>>).push({ id: "old_key", container: { kind: "actor", id: "keeper" }, pos: null, facing: null, variant: "default", nameKey: null });
      ((d["actors"] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)["inventory"] = ["key", "map", "old_key"];
      (d["globals"] as Record<string, unknown>)["legacy"] = 1;
      (d["globals"] as Record<string, unknown>)["oldname"] = "v";
    });
    const migrating = loadContent(
      pkg({
        saveMigrations: [
          { fromVersion: "1.0.0", rename: { old_key: "coin", oldname: "newname" }, remove: ["legacy"], setGlobals: { migrated: true } },
          { fromVersion: "0.5.0", remove: ["never"] },
        ],
      }),
      { mode: "lenient" },
    );
    const r = parseSave(old, migrating);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.kind)).toEqual(["content-migrated", "duplicate-id-removed"]);
    expect(r.data.content.version).toBe("1.2.0");
    expect(r.data.globals).toMatchObject({ newname: "v", migrated: true });
    expect(r.data.globals).not.toHaveProperty("legacy");
    expect(r.data.actors[0]?.inventory).toEqual(["key", "map", "coin"]);
    // Same version: no migration.
    expect(parseSave(good.json, migrating).warnings).toEqual([]);
  });

  it("saveMigrations are validated", () => {
    const diag = (m: unknown): string[] => loadContent(pkg({ saveMigrations: m as never }), { mode: "lenient" }).diagnostics.filter((d) => d.path.startsWith("saveMigrations")).map((d) => d.path);
    expect(() => loadContent(pkg({ saveMigrations: 5 as never }))).toThrow(/saveMigrations must be an array/);
    expect(() => loadContent(pkg({ saveMigrations: [{}] as never }))).toThrow(/fromVersion/);
    expect(() => loadContent(pkg({ saveMigrations: [{ fromVersion: "1", rename: { a: 1 }, remove: "x", setGlobals: { a: {} } }] as never }))).toThrow(/rename maps ids/);
    expect(diag([{ fromVersion: "1", rename: { a: "b" }, remove: ["x"], setGlobals: { a: 1 } }])).toEqual([]);
  });
});

describe("save edge cases", () => {
  it("format-0 entries with missing fields, optional v1 fields, dev builds without checksum", () => {
    const v0 = JSON.stringify({
      format: "engine.save",
      formatVersion: 0,
      game: "lighthouse",
      gameVersion: "1.2.0",
      language: "da",
      player: "keeper",
      rngState: "0123456789abcdef0123456789abcdef",
      actors: { keeper: { scene: "quay" }, ghost: {} },
      objects: { coin: {}, crate: { where: "scene:quay" } },
    });
    const r = parseSave(v0, content);
    expect(r.ok && r.data.actors).toEqual([
      { id: "keeper", scene: "quay", pos: null, facing: null, variant: "default", dialogStack: [], inventory: [] },
      { id: "ghost", scene: null, pos: null, facing: null, variant: "default", dialogStack: [], inventory: [] },
    ]);
    expect(r.ok && r.data.objects.find((o) => o.id === "coin")).toEqual({ id: "coin", container: { kind: "none" }, pos: null, facing: null, variant: "default", nameKey: null });
    const v1 = {
      format: "engine.save",
      formatVersion: 1,
      content: { id: "lighthouse", version: "1.2.0" },
      language: "da",
      playerId: "keeper",
      rng: { algorithm: "xoshiro128**", state: "0123456789abcdef0123456789abcdef" },
      actors: [{ id: "keeper", scene: "quay" }],
      objects: [{ id: "crate", container: { kind: "scene", id: "quay" }, facing: "left" }],
      scenes: [{ id: "quay" }],
      ambient: "none",
    };
    const dev = parseSave(JSON.stringify(v1), content, { allowChecksumMismatch: true });
    expect(dev.ok && dev.data).toMatchObject({ checksum: "", scenes: [{ id: "quay", variant: "default" }], ambient: { scene: null, loops: [] } });
    expect(dev.ok && dev.data.objects[0]?.facing).toBe("left");
    const loopsNotArray = parseSave(JSON.stringify({ ...v1, ambient: { loops: 5 } }), content, { allowChecksumMismatch: true });
    expect(loopsNotArray.ok && loopsNotArray.data.ambient.loops).toEqual([]);
    const noPlayerEntry = parseSave(JSON.stringify({ ...v1, actors: [] }), content, { allowChecksumMismatch: true });
    expect(noPlayerEntry.ok ? "ok" : noPlayerEntry.error.message).toMatch(/player's scene null is unknown/);
  });

  it("content migrations without remove or setGlobals; content without migrations; version comparison details", () => {
    const old: Record<string, unknown> = { ...(JSON.parse(saveOut(engine().e).json) as Record<string, unknown>), content: { id: "lighthouse", version: "0.9.0", hash: "" } };
    old["checksum"] = saveChecksum(old as unknown as SaveData);
    const plain = parseSave(JSON.stringify(old), content);
    expect(plain.ok && plain.data.content.version).toBe("1.2.0");
    const renameOnly = loadContent(pkg({ saveMigrations: [{ fromVersion: "1.0.0", rename: { lamp_lit: "lamp_on" } }] }), { mode: "lenient" });
    const r = parseSave(JSON.stringify(old), renameOnly);
    expect(r.ok && r.data.globals).toEqual({ lamp_on: false, saved: true });
    expect([compareVersions("1.0.0", "1.0"), compareVersions("1.b", "1.a"), compareVersions("1.a", "1.a")]).toEqual([0, 1, 0]);
    expect(getPath({ a: {} }, "a[id=x]")).toBeUndefined();
  });

  it("resolveSound looks through scene, actor and object sound maps; unknown entities and packages without sounds", async () => {
    const { resolveSound } = await import("../src/index.ts");
    const c = loadContent(
      pkg({
        actors: [{ id: "keeper", scene: "quay", spot: "a", entry: null, sounds: { hum: "s.waves" }, variants: { default: {} } }, { id: "gull", scene: "quay", spot: "b", entry: null, dialog: "talk#hello", variants: { default: {} } }],
        objects: [{ id: "crate", container: { kind: "scene", id: "quay" }, spot: "box", entry: null, sounds: { creak: "s.tune" }, variants: { default: {} } }],
      }),
      { mode: "lenient" },
    );
    expect([resolveSound(c, "quay", "waves")?.id, resolveSound(c, "keeper", "hum")?.id, resolveSound(c, "crate", "creak")?.id, resolveSound(c, "nobody", "s.tune")?.id]).toEqual(["s.waves", "s.waves", "s.tune", "s.tune"]);
    const noSounds = { ...pkg(), sounds: undefined };
    expect(resolveSound(loadContent(noSounds, { mode: "lenient" }), "quay", "waves")).toBeUndefined();
  });
});
