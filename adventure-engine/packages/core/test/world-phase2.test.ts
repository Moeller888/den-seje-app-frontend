import type { ContentPackage, GraphDef, NodeDef, PortalDef, SceneDef } from "@adventure-engine/content";
import { describe, expect, it } from "vitest";
import { TICK_MS, facingFromDelta, type Command } from "../src/index.ts";
import { harness, pending } from "./helpers.ts";

const rect = (x: number, y: number, w: number, h: number): Array<[number, number]> => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const entry = (id: string, next: string[] = []): NodeDef => ({ id, type: "entry", name: id, next });
const setIf = (id: string, action: string, v: string): NodeDef[] => [
  { id, type: "guard", expr: { eq: [{ var: "$action" }, { const: action }] }, next: [`${id}_s`] },
  { id: `${id}_s`, type: "set", var: v, value: true },
];

const GOLDEN_CAMERA = { focal: 900, height: 170, tilt: 12, horizon: 0.35, speed: 120 } as const;

function world(over: { scenes?: SceneDef[]; portals?: PortalDef[]; graphs?: GraphDef[]; actors?: ContentPackage["actors"]; objects?: ContentPackage["objects"] } = {}) {
  const pkg: ContentPackage = {
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
    scenes: over.scenes ?? [
      {
        id: "field",
        size: { width: 3000, height: 720 },
        entry: null,
        walkSpeed: 600,
        spots: { a: { x: 100, y: 600, facing: "right" }, b: { x: 2800, y: 600, facing: "left" }, mid: { x: 1500, y: 650 } },
        defaultSpot: "a",
        walkable: [rect(0, 500, 3000, 220)],
      },
    ],
    actors: over.actors ?? [
      { id: "hero", scene: (over.scenes?.[0]?.id ?? "field"), entry: null, variants: { default: {} } },
      { id: "dog", scene: (over.scenes?.[0]?.id ?? "field"), entry: null, variants: { default: {} } },
    ],
    objects: over.objects ?? [],
    portals: over.portals ?? [],
    graphs: over.graphs ?? [],
    i18n: { da: { n: "x" } },
  };
  return harness(pkg);
}

const ticksUntil = (engine: ReturnType<typeof world>["engine"], done: () => boolean, max = 20000): number => {
  let n = 0;
  engine.settle();
  while (!done()) {
    if (++n > max) throw new Error(`not done after ${max} ticks: ${JSON.stringify(engine.idleReport())}`);
    engine.advanceTicks(1);
  }
  return n;
};

describe("facing (spec 03 C3.2, TS-C07)", () => {
  it("maps all eight sectors including boundaries", () => {
    const at = (deg: number) => facingFromDelta(Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180));
    expect(at(0)).toBe("right");
    expect(at(22.4)).toBe("right");
    expect(at(22.5)).toBe("down_right");
    expect(at(22.6)).toBe("down_right");
    expect(at(90)).toBe("down");
    expect(at(135)).toBe("down_left");
    expect(at(180)).toBe("left");
    expect(at(-135)).toBe("up_left");
    expect(at(-90)).toBe("up");
    expect(at(-45)).toBe("up_right");
    expect(at(-22.5)).toBe("right");
    expect(at(-22.6)).toBe("up_right");
    expect(at(337.6)).toBe("right");
    expect(facingFromDelta(0, 0)).toBeNull();
  });
});

describe("movement (spec 03 C3)", () => {
  it("TS-C16: arrival time is identical at 30 and 144 render FPS (tick-driven)", () => {
    const arrive = (fps: number): number => {
      const { engine } = world();
      engine.newGame();
      engine.walkPlayerTo("b");
      const frame = 1000 / fps;
      let t = 0;
      while (engine.isMoving("hero")) {
        engine.advance(frame);
        t += frame;
        if (t > 60000) throw new Error("did not arrive");
      }
      return engine.sched.tick;
    };
    const a = arrive(30);
    const b = arrive(144);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
    // 2700 px at 600 px/s = 4.5 s = 270 ticks; the render rate only affects when we observe it.
    expect(Math.min(a, b)).toBeGreaterThanOrEqual(270);
  });

  it("reaches the destination exactly, takes the spot facing, traces start and end", () => {
    const { engine } = world();
    engine.newGame();
    const info = engine.walkPlayerTo("b");
    const ticks = ticksUntil(engine, () => engine.finishedRuns.some((r) => r.runId === info.id));
    expect(ticks).toBe(270);
    expect(engine.world.actors.get("hero")).toMatchObject({ pos: [2800, 600], spot: "b", facing: "left" });
    expect(engine.trace.filter((e) => e.kind === "walk.start" || e.kind === "walk.end").map((e) => e.kind)).toEqual(["walk.start", "walk.end"]);
    expect(engine.idleReport().idle).toBe(true);
  });

  it("very short path segments do not stall movement", () => {
    const zig = [[0, 500], [1000, 500], [1000, 510], [1000.5, 510], [1000.5, 700], [0, 700]] as Array<[number, number]>;
    const { engine } = world({
      scenes: [{ id: "field", entry: null, walkSpeed: 600, spots: { a: { x: 10, y: 505 }, b: { x: 990, y: 690 } }, defaultSpot: "a", walkable: [zig, rect(1000, 500, 0.5, 10)] }],
    });
    engine.newGame();
    engine.walkPlayerTo("b");
    ticksUntil(engine, () => !engine.isMoving("hero"));
    expect(engine.world.actors.get("hero")?.pos).toEqual([990, 690]);
  });

  it("free clicks: walk to a point; a new walk replaces the previous one; no path → cannot", () => {
    const { engine, adapter } = world({
      scenes: [{ id: "field", size: { width: 3000, height: 720 }, entry: null, walkSpeed: 600, spots: { a: { x: 100, y: 600 } }, defaultSpot: "a", walkable: [rect(0, 500, 1000, 220), rect(2000, 500, 1000, 220)] }],
    });
    engine.newGame();
    engine.clickAt([800, 600]);
    engine.advanceTicks(10);
    expect(engine.isMoving("hero")).toBe(true);
    engine.clickAt([300, 600]);
    ticksUntil(engine, () => !engine.isMoving("hero"));
    expect(engine.world.actors.get("hero")?.pos).toEqual([300, 600]);
    expect(engine.trace.filter((e) => e.kind === "walk.end").map((e) => e["result"])).toEqual(["cancelled", true]);
    engine.clickAt([2500, 600]);
    expect(adapter.types()).toContain("React");
    expect(engine.idleReport().idle).toBe(true);
  });

  it("a walk_to whose target lies in another part of the scene fails without hanging", () => {
    const g: GraphDef = { id: "g", kind: "logic", nodes: [entry("e", ["w"]), { id: "w", type: "walk_to", actor: "hero", spot: "far" }] };
    const { engine } = world({
      graphs: [g],
      scenes: [{ id: "field", size: { width: 3000, height: 720 }, entry: null, spots: { a: { x: 100, y: 600 }, far: { x: 2500, y: 600 } }, defaultSpot: "a", walkable: [rect(0, 500, 1000, 220), rect(2000, 500, 1000, 220)] }],
    });
    engine.newGame();
    engine.run("g#e");
    expect(engine.finishedRuns.at(-1)?.result).toBe(false);
    expect(engine.idleReport().idle).toBe(true);
  });

  it("with a camera, walking measures floor distance and clicks above the horizon never start movement (TS-C02)", () => {
    const { engine, adapter } = world({
      scenes: [{ id: "field", entry: null, camera: GOLDEN_CAMERA, spots: { a: { x: 640, y: 700 }, b: { x: 640, y: 300 } }, defaultSpot: "a", walkable: [rect(0, 0, 1280, 720)] }],
    });
    engine.newGame();
    expect(engine.query([640, 30])).toEqual({ mode: "idle" });
    engine.clickAt([640, 30]);
    expect(engine.isMoving("hero")).toBe(false);
    expect(adapter.types()).toContain("React");
    engine.walkPlayerTo("b");
    expect(engine.trace.find((e) => e.kind === "walk.start")?.["units"]).toBe("floor");
    ticksUntil(engine, () => !engine.isMoving("hero"));
    expect(engine.world.actors.get("hero")?.pos).toEqual([640, 300]);
  });
});

describe("trigger zones (spec 03 C6, TS-C06)", () => {
  const zoneGraph: GraphDef = { id: "z", kind: "logic", nodes: [entry("ze", ["in", "out"]), ...setIf("in", "zone.enter", "entered"), ...setIf("out", "zone.exit", "left")] };
  const sceneLogic: GraphDef = { id: "s", kind: "logic", nodes: [entry("se", ["en"]), ...setIf("en", "scene.enter", "scene_entered")] };

  it("enter on scene entry after scene.enter; exit once when leaving; none while staying", () => {
    const { engine } = world({
      graphs: [zoneGraph, sceneLogic],
      scenes: [
        {
          id: "field",
          entry: "s#se",
          walkSpeed: 600,
          spots: { a: { x: 100, y: 600 }, b: { x: 900, y: 600 } },
          defaultSpot: "a",
          walkable: [rect(0, 500, 1280, 220)],
          triggerZones: [{ id: "mat", entry: "z#ze", polygon: rect(50, 550, 100, 100) }],
        },
      ],
    });
    engine.newGame();
    expect(engine.events.map((e) => `${e.action}:${e.receiver}`)).toEqual(["scene.enter:field", "zone.enter:mat", "game.start:$game"]);
    expect(engine.globalWrites).toEqual(["scene_entered", "entered"]);
    expect(engine.activeZones("hero")).toEqual(["mat"]);
    engine.setActorPosition("hero", [120, 600]);
    engine.setActorPosition("hero", [150, 600]);
    expect(engine.events.filter((e) => e.action.startsWith("zone.")).length).toBe(1);
    engine.walkPlayerTo("b");
    ticksUntil(engine, () => !engine.isMoving("hero"));
    expect(engine.events.filter((e) => e.action === "zone.exit")).toHaveLength(1);
    expect(engine.activeZones("hero")).toEqual([]);
  });

  it("no zone.exit when the scene is left through a transition; NPCs do not trigger by default", () => {
    const { engine } = world({
      graphs: [zoneGraph, { id: "g", kind: "logic", nodes: [entry("e", ["m"]), { id: "m", type: "move_actor", actor: "hero", scene: "barn" }, entry("e2", ["m2"]), { id: "m2", type: "move_actor", actor: "dog", scene: "field", spot: "a" }] }],
      scenes: [
        { id: "field", entry: null, spots: { a: { x: 100, y: 600 } }, defaultSpot: "a", walkable: [rect(0, 500, 1280, 220)], triggerZones: [{ id: "mat", entry: "z#ze", polygon: rect(50, 550, 100, 100) }] },
        { id: "barn", entry: null, spots: { door: { x: 600, y: 600 } }, defaultSpot: "door", walkable: [rect(0, 500, 1280, 220)] },
      ],
      actors: [
        { id: "hero", scene: "field", spot: "a", entry: null, variants: { default: {} } },
        { id: "dog", scene: "barn", spot: "door", entry: null, variants: { default: {} } },
      ],
    });
    engine.newGame();
    expect(engine.activeZones("hero")).toEqual(["mat"]);
    engine.run("g#e");
    expect(engine.world.actors.get("hero")?.scene).toBe("barn");
    expect(engine.events.some((e) => e.action === "zone.exit")).toBe(false);
    expect(engine.activeZones("hero")).toEqual([]);
    engine.run("g#e2");
    expect(engine.activeZones("dog")).toEqual([]);
  });
});

describe("scroll, depth and scale (spec 03 C2.2/C5)", () => {
  it("TS-C05: follow the player clamped to [0, width − viewport]; narrow scenes stay at 0", () => {
    const { engine } = world();
    const space = engine.space("field");
    expect(space.scrollFor(100)).toBe(0);
    expect(space.scrollFor(1000)).toBe(360);
    expect(space.scrollFor(2900)).toBe(1720);
    const narrow = world({ scenes: [{ id: "field", size: { width: 800, height: 720 }, entry: null, spots: { a: { x: 700, y: 600 } }, defaultSpot: "a", walkable: [rect(0, 500, 800, 220)] }] });
    narrow.engine.newGame();
    expect(narrow.engine.world.scrollX).toBe(0);
    expect(narrow.engine.space("field").scrollFor(799)).toBe(0);
  });

  it("TS-C04: draw order far → near, stable by content order at equal depth", () => {
    const { engine } = world({
      scenes: [
        {
          id: "field",
          entry: null,
          spots: { a: { x: 100, y: 600 }, same: { x: 300, y: 600 }, far: { x: 300, y: 520 } },
          defaultSpot: "a",
          walkable: [rect(0, 500, 1280, 220)],
          layers: [{ id: "sky", depth: 1e9 }, { id: "front", depth: -1e9 }],
        },
      ],
      actors: [
        { id: "hero", scene: "field", spot: "a", entry: null, variants: { default: {} } },
        { id: "dog", scene: "field", spot: "same", entry: null, variants: { default: {} } },
      ],
      objects: [
        { id: "crate", container: { kind: "scene", id: "field" }, spot: "same", entry: null, variants: { default: {} } },
        { id: "kite", container: { kind: "scene", id: "field" }, spot: "far", entry: null, variants: { default: {} } },
        { id: "pocket", container: { kind: "none" }, entry: null, variants: { default: {} } },
      ],
    });
    engine.newGame();
    expect(engine.drawOrder("field").map((d) => d.id)).toEqual(["sky", "kite", "hero", "dog", "crate", "front"]);
  });

  it("TS-C15: perspective and spot-height scaling are separate factors", () => {
    const { engine } = world({
      scenes: [
        {
          id: "field",
          entry: null,
          camera: GOLDEN_CAMERA,
          spots: { near: { x: 640, y: 700 }, far: { x: 640, y: 300 }, stage: { x: 300, y: 650, scale: true, height: 90 } },
          defaultSpot: "near",
          walkable: [rect(0, 100, 1280, 620)],
        },
      ],
      actors: [
        { id: "hero", scene: "field", spot: "near", entry: null, variants: { default: {} } },
        { id: "dog", scene: "field", spot: "far", entry: null, variants: { default: {} }, referenceHeight: 80 },
        { id: "puppet", scene: "field", spot: "stage", entry: null, variants: { default: {} }, grounded: false },
      ],
    });
    engine.newGame();
    const hero = engine.actorScale("hero");
    const dog = engine.actorScale("dog");
    expect(hero.perspectiveHeightPx).toBeGreaterThan(dog.perspectiveHeightPx as number);
    expect(hero.spotHeightPx).toBeNull();
    expect(engine.actorScale("puppet")).toEqual({ perspectiveHeightPx: null, spotHeightPx: 90, effectiveHeightPx: 90 });
    const plain = world();
    plain.engine.newGame();
    expect(plain.engine.actorScale("hero")).toEqual({ perspectiveHeightPx: null, spotHeightPx: null, effectiveHeightPx: null });
    expect(() => plain.engine.actorScale("nobody")).toThrow(/not in a scene/);
  });
});

describe("portal transitions (spec 03 C7/C8)", () => {
  const scenes = (extra: Partial<SceneDef> = {}): SceneDef[] => [
    { id: "yard", entry: "sl#y", size: { width: 2000, height: 720 }, walkSpeed: 600, spots: { a: { x: 100, y: 600 }, out: { x: 1900, y: 600 }, back: { x: 1800, y: 600 } }, defaultSpot: "a", walkable: [rect(0, 500, 2000, 220)], ...extra },
    { id: "hall", entry: "sl#h", walkSpeed: 600, spots: { door: { x: 100, y: 600 }, inside: { x: 300, y: 600 } }, defaultSpot: "door", walkable: [rect(0, 500, 1280, 220)] },
  ];
  const sl: GraphDef = {
    id: "sl",
    kind: "logic",
    nodes: [
      entry("y", ["yx"]),
      { id: "yx", type: "guard", expr: { and: [{ eq: [{ var: "$action" }, { const: "scene.exit" }] }, { eq: [{ var: "$to" }, { const: "hall" }] }] }, next: ["yxs"] },
      { id: "yxs", type: "set", var: "exit_to_hall", value: true },
      entry("h", ["hx"]),
      { id: "hx", type: "guard", expr: { and: [{ eq: [{ var: "$action" }, { const: "scene.enter" }] }, { eq: [{ var: "$from" }, { const: "yard" }] }] }, next: ["hxs"] },
      { id: "hxs", type: "set", var: "enter_from_yard", value: true },
    ],
  };
  const portals: PortalDef[] = [
    { id: "y_h", from: "yard", to: "hall", entry: null, exitSpot: "out", entrySpot: "inside", polygon: rect(1950, 400, 50, 100) },
    { id: "h_y", from: "hall", to: "yard", entry: null, exitSpot: "door", entrySpot: "back", polygon: rect(0, 400, 50, 100) },
  ];

  it("TS-C13/C14: exact order, $from/$to, arrival on the reverse exit spot, then walk to the entry spot", () => {
    const { engine, adapter } = world({ scenes: scenes(), portals, graphs: [sl] });
    engine.newGame();
    const mark = adapter.log.length;
    const evMark = engine.events.length;
    engine.click({ portal: "y_h" });
    ticksUntil(engine, () => engine.idleReport().idle);
    expect(engine.events.slice(evMark).map((e) => `${e.action}:${e.receiver}${e.action === "walk" ? `@${String(e.ctx["$spot"])}` : ""}`)).toEqual([
      "portal.use:y_h",
      "walk:hero@out",
      "scene.exit:yard",
      "scene.enter:hall",
      "walk:hero@inside",
    ]);
    expect(adapter.log.slice(mark).map((c) => (c.type === "SceneFade" ? `Fade:${c.direction}` : c.type))).toEqual(["Fade:out", "PortalTransition", "Fade:in"]);
    expect(engine.globals.get("exit_to_hall")).toBe(true);
    expect(engine.globals.get("enter_from_yard")).toBe(true);
    const kinds = engine.trace.filter((e) => e.kind === "transition").map((e) => e["phase"]);
    expect(kinds).toEqual(["exit", "enter", "done"]);
    expect(engine.world.actors.get("hero")).toMatchObject({ scene: "hall", spot: "inside", pos: [300, 600] });
    expect(engine.modal.isModal).toBe(false);
    expect(engine.transitions()).toEqual([]);
  });

  it("TS-C11: a locked portal says 'cannot' and runs no logic; TS-C12: a veto prevents the scene change", () => {
    const veto: GraphDef = { id: "pv", kind: "logic", nodes: [entry("pe", ["pr"]), { id: "pr", type: "return", value: false }] };
    const { engine, adapter } = world({
      scenes: scenes(),
      graphs: [sl, veto],
      portals: [{ ...(portals[0] as PortalDef), locked: true, entry: "pv#pe" }, portals[1] as PortalDef],
    });
    engine.newGame();
    expect(engine.click({ portal: "y_h" })).toBeNull();
    expect(adapter.types()).toContain("React");
    expect(engine.events.some((e) => e.action === "portal.use")).toBe(false);
    engine.setPortalLocked("y_h", false);
    engine.click({ portal: "y_h" });
    ticksUntil(engine, () => engine.idleReport().idle);
    expect(engine.finishedRuns.find((r) => r.receiver === "y_h")?.result).toBe(false);
    expect(engine.world.actors.get("hero")?.scene).toBe("yard");
    expect(engine.events.some((e) => e.action === "scene.exit")).toBe(false);
    expect(() => engine.setPortalLocked("ghost", true)).toThrow(/unknown portal/);
    expect(() => engine.click({ portal: "h_y" })).toThrow(/no portal/);
  });

  it("a portal without optional spots arrives on the reverse exit spot and does not walk", () => {
    const { engine } = world({
      scenes: scenes(),
      graphs: [sl],
      portals: [
        { id: "y_h", from: "yard", to: "hall", entry: null, polygon: rect(1950, 400, 50, 100) },
        { id: "h_y", from: "hall", to: "yard", entry: null, exitSpot: "door" },
      ],
    });
    engine.newGame();
    engine.click({ portal: "y_h" });
    ticksUntil(engine, () => engine.idleReport().idle);
    expect(engine.world.actors.get("hero")).toMatchObject({ scene: "hall", spot: "door", pos: [100, 600] });
    expect(engine.events.filter((e) => e.action === "walk")).toEqual([]);
  });

  it("cancellation in the middle of a transition leaves no locks, transitions, walks or replies", () => {
    const { engine } = harness(
      {
        game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
        scenes: scenes(),
        actors: [{ id: "hero", scene: "yard", spot: "out", entry: null, variants: { default: {} } }],
        portals,
        graphs: [sl],
        i18n: { da: { n: "x" } },
      },
      { await: ["SceneFade"] },
    );
    engine.newGame();
    engine.reply(pending(engine, "SceneFade").cmdId, { kind: "done" });
    engine.click({ portal: "y_h" });
    ticksUntil(engine, () => engine.transitions().length > 0);
    expect(engine.modal.count).toBe(2);
    expect(engine.transitions()[0]).toMatchObject({ actor: "hero", from: "yard", to: "hall", phase: "exit" });
    engine.cancelAllRuns("load");
    expect(engine.idleReport()).toEqual({ idle: true, runs: 0, pendingCommands: 0, moving: 0, modalLocks: 0, transitions: 0 });
    engine.advance(10000);
    expect(engine.world.actors.get("hero")?.scene).toBe("yard");
  });

  it("move_actor of the player across scenes runs the full transition; NPC moves are direct", () => {
    const g: GraphDef = { id: "g", kind: "logic", nodes: [entry("e", ["m"]), { id: "m", type: "move_actor", actor: "hero", scene: "hall", spot: "inside" }] };
    const { engine, adapter } = world({ scenes: scenes(), portals, graphs: [sl, g] });
    engine.newGame();
    engine.run("g#e");
    ticksUntil(engine, () => engine.idleReport().idle);
    expect(engine.world.actors.get("hero")).toMatchObject({ scene: "hall", spot: "inside" });
    expect(adapter.types().filter((t) => t === "PortalTransition")).toHaveLength(1);
    expect(engine.globals.get("enter_from_yard")).toBe(true);
  });
});

describe("hover priority and clicks (spec 04 D2–D4)", () => {
  const scene: SceneDef = {
    id: "field",
    entry: null,
    spots: { a: { x: 600, y: 650 }, box: { x: 100, y: 600 } },
    defaultSpot: "a",
    walkable: [rect(0, 500, 1280, 220)],
    objectZones: [
      { entity: "box", nameKey: "n", polygon: rect(50, 550, 100, 100) },
      { entity: "lamp", polygon: rect(50, 550, 100, 100) },
      { entity: "lamp", priority: 5, polygon: rect(300, 550, 50, 50) },
      { entity: "box", polygon: rect(300, 550, 50, 50) },
    ],
    actorZones: [{ actor: "dog", polygon: rect(400, 550, 50, 100) }],
  };
  const setup = () =>
    world({
      scenes: [scene, { id: "field2", entry: null, spots: { x: { x: 1, y: 1 } } }],
      portals: [{ id: "p", from: "field", to: "field2", entry: null, arrivalSpot: "x", polygon: rect(1200, 500, 80, 100) }],
      actors: [
        { id: "hero", scene: "field", spot: "a", entry: null, variants: { default: {} } },
        { id: "dog", scene: "field", spot: "a", entry: null, variants: { default: {} } },
      ],
      objects: [
        { id: "box", container: { kind: "scene", id: "field" }, spot: "box", entry: null, variants: { default: {} } },
        { id: "lamp", container: { kind: "scene", id: "field" }, entry: null, variants: { default: {} } },
        { id: "key", container: { kind: "actor", id: "hero" }, entry: null, variants: { default: {} } },
      ],
    });

  it("TS-D02/D03: priority without and with a selected item; content order breaks ties unless priority is set", () => {
    const pkgScenes = [scene, { id: "field2", entry: null, spots: { x: { x: 1, y: 1 } } }];
    const { engine } = world({
      scenes: pkgScenes,
      portals: [{ id: "p", from: "field", to: "field2", entry: null, arrivalSpot: "x", polygon: rect(1200, 500, 80, 100) }],
      actors: [
        { id: "hero", scene: "field", spot: "a", entry: null, variants: { default: {} } },
        { id: "dog", scene: "field", spot: "a", entry: null, variants: { default: {} } },
      ],
      objects: [
        { id: "box", container: { kind: "scene", id: "field" }, spot: "box", entry: null, variants: { default: {} } },
        { id: "lamp", container: { kind: "scene", id: "field" }, entry: null, variants: { default: {} } },
        { id: "key", container: { kind: "actor", id: "hero" }, entry: null, variants: { default: {} } },
      ],
    });
    engine.newGame();
    expect(engine.content.diagnostics.some((d) => d.code === "W-ZONE-OVERLAP")).toBe(true);
    expect(engine.query([100, 600])).toEqual({ mode: "interact", target: "box", tooltipKey: "n" });
    expect(engine.query([320, 570])).toMatchObject({ mode: "interact", target: "lamp" });
    expect(engine.query([420, 600])).toMatchObject({ mode: "talk", target: "dog", talkSpot: null });
    expect(engine.query([1250, 550])).toEqual({ mode: "portal", target: "p", tooltipKey: null });
    expect(engine.query([800, 600])).toEqual({ mode: "walk", point: [800, 600] });
    expect(engine.query([800, 100])).toEqual({ mode: "idle" });
    engine.selectItem("key");
    expect(engine.selectedItem).toBe("key");
    expect(engine.query([100, 600])).toMatchObject({ mode: "use", item: "key", target: "box", targetKind: "object" });
    expect(engine.query([420, 600])).toMatchObject({ mode: "use", target: "dog", targetKind: "actor" });
    expect(engine.query([600, 620])).toMatchObject({ mode: "use", target: "hero", targetKind: "actor" });
    expect(engine.query([1000, 600])).toEqual({ mode: "use", item: "key", target: null, targetKind: null, tooltipKey: null });
    engine.selectItem("key");
    expect(engine.selectedItem).toBeNull();
    expect(() => engine.selectItem("box")).toThrow(/inventory/);
  });

  it("use clicks run use_item and clear the selection; use without a target reacts", () => {
    const { engine, adapter } = setup();
    engine.newGame();
    engine.selectItem("key");
    engine.clickAt([100, 600]);
    expect(engine.events.at(-1)).toMatchObject({ action: "use.object", receiver: "key" });
    expect(engine.selectedItem).toBeNull();
    // Phase 3 (spec 04 D5): "key" has entry null, so nothing happened → "cannot" (reactWhenNothingHappens defaults to true).
    expect(adapter.types().filter((t) => t === "React")).toHaveLength(1);
    engine.selectItem("key");
    engine.clickAt([1000, 600]);
    expect(adapter.types().at(-1)).toBe("React");
    expect(engine.selectedItem).toBeNull();
    engine.clickAt([800, 100]);
    expect(adapter.types().filter((t) => t === "React")).toHaveLength(3);
  });

  it("clicks dispatch on the hover result: interact, talk, portal", () => {
    const { engine } = setup();
    engine.newGame();
    engine.clickAt([100, 600]);
    engine.clickAt([420, 600]);
    expect(engine.events.map((e) => e.action)).toContain("interact");
    expect(engine.events.map((e) => e.action)).toContain("talk");
    engine.clickAt([1250, 550]);
    expect(engine.events.map((e) => e.action)).toContain("portal.use");
  });

  it("TS-D04: while modal the cursor is busy and world clicks are ignored", () => {
    const { engine } = harness(
      {
        game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
        scenes: [{ ...scene, objectZones: [], actorZones: [] }],
        actors: [{ id: "hero", scene: "field", spot: "a", entry: null, variants: { default: {} } }],
        graphs: [{ id: "g", kind: "logic", nodes: [{ id: "e", type: "entry", name: "e", modal: true, next: ["s"] }, { id: "s", type: "say", speaker: "hero", textKey: "n" }] }],
        i18n: { da: { n: "x" } },
      },
    );
    engine.newGame();
    engine.hover([800, 600]);
    expect(engine.cursor).toEqual({ mode: "walk", point: [800, 600] });
    engine.run("g#e");
    expect(engine.cursor).toEqual({ mode: "busy" });
    expect(engine.query([800, 600])).toEqual({ mode: "busy" });
    expect(engine.clickAt([800, 600])).toBeNull();
    expect(engine.isMoving("hero")).toBe(false);
    engine.reply((engine.pendingCommands()[0] as Command).cmdId, { kind: "done" });
    expect(engine.cursor).toEqual({ mode: "walk", point: [800, 600] });
  });

  it("target points and screen conversion", () => {
    const { engine } = setup();
    engine.newGame();
    expect(engine.cursor).toEqual({ mode: "idle" });
    expect(engine.targetPoint({ objectZone: "box" })).toEqual([100, 600]);
    expect(engine.targetPoint({ actorZone: "dog" })).toEqual([425, 600]);
    expect(engine.targetPoint({ portal: "p" })).toEqual([1240, 550]);
    expect(() => engine.targetPoint({ triggerZone: "none" })).toThrow(/no polygon/);
    expect(engine.screenToScene([10, 20])).toEqual([10, 20]);
    expect(() => engine.space("ghost")).toThrow(/unknown scene/);
    expect(engine.findPath("field", [10, 600], [20, 600])?.points).toEqual([[10, 600], [20, 600]]);
    expect(TICK_MS).toBeGreaterThan(16);
  });
});
