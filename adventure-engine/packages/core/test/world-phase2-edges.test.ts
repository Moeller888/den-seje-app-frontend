import type { ContentPackage, GraphDef, NodeDef, SceneDef } from "@adventure-engine/content";
import { describe, expect, it } from "vitest";
import { Spaces, queryPoint } from "../src/index.ts";
import { harness } from "./helpers.ts";
import { loadContent } from "@adventure-engine/content";

const rect = (x: number, y: number, w: number, h: number): Array<[number, number]> => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const entry = (id: string, next: string[] = []): NodeDef => ({ id, type: "entry", name: id, next });
const CAMERA = { focal: 900, height: 170, tilt: 12, horizon: 0.35, speed: 120 } as const;

function pkg(scenes: SceneDef[], extra: Partial<ContentPackage> = {}): ContentPackage {
  return {
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
    scenes,
    actors: extra.actors ?? [{ id: "hero", scene: scenes[0]?.id ?? null, entry: null, variants: { default: {} } }],
    objects: extra.objects ?? [],
    portals: extra.portals ?? [],
    graphs: extra.graphs ?? [],
    i18n: { da: { n: "x", l: "locked" } },
    ...(extra.game !== undefined ? { game: extra.game } : {}),
  };
}

const field = (over: Partial<SceneDef> = {}): SceneDef => ({
  id: "field",
  entry: null,
  walkSpeed: 600,
  spots: { a: { x: 100, y: 600 }, b: { x: 900, y: 600 } },
  defaultSpot: "a",
  walkable: [rect(0, 500, 1280, 220)],
  ...over,
});

function untilIdle(engine: ReturnType<typeof harness>["engine"]): void {
  engine.settle();
  for (let i = 0; !engine.idleReport().idle; i++) {
    if (i > 20000) throw new Error(JSON.stringify(engine.idleReport()));
    engine.advanceTicks(1);
  }
}

describe("trigger edge cases", () => {
  it("NPC walkers trigger only with triggersZones; zones without logic still track membership", () => {
    const g: GraphDef = { id: "g", kind: "logic", nodes: [entry("e", ["w1", "w2"]), { id: "w1", type: "walk_to", actor: "dog", spot: "b" }, { id: "w2", type: "walk_to", actor: "cat", spot: "b" }] };
    const { engine } = harness(
      pkg([field({ triggerZones: [{ id: "z", entry: null, polygon: rect(400, 500, 10, 220) }] })], {
        graphs: [g],
        actors: [
          { id: "hero", scene: "field", entry: null, variants: { default: {} } },
          { id: "dog", scene: "field", entry: null, variants: { default: {} } },
          { id: "cat", scene: "field", entry: null, variants: { default: {} }, triggersZones: true },
        ],
      }),
    );
    engine.newGame();
    engine.run("g#e");
    untilIdle(engine);
    expect(engine.events.filter((e) => e.action.startsWith("zone.")).map((e) => `${e.action}:${String(e.ctx["$actor"])}`)).toEqual(["zone.enter:cat", "zone.exit:cat"]);
    expect(engine.activeZones("dog")).toEqual([]);
  });

  it("two zones crossed at the same point fire in content order; leaving by placement exits", () => {
    const { engine } = harness(
      pkg([
        field({
          triggerZones: [
            { id: "first", entry: null, polygon: rect(400, 500, 50, 220) },
            { id: "second", entry: null, polygon: rect(400, 500, 80, 220) },
          ],
        }),
      ]),
    );
    engine.newGame();
    engine.walkPlayerTo("b");
    untilIdle(engine);
    expect(engine.events.filter((e) => e.action.startsWith("zone.")).map((e) => `${e.action}:${e.receiver}`)).toEqual([
      "zone.enter:first",
      "zone.enter:second",
      "zone.exit:first",
      "zone.exit:second",
    ]);
    engine.setActorPosition("hero", [420, 600]);
    expect(engine.activeZones("hero")).toEqual(["first", "second"]);
    engine.setActorPosition("hero", [460, 600]);
    expect(engine.activeZones("hero")).toEqual(["second"]);
  });

  it("a zone entry that does not exist (lenient) warns", () => {
    const { engine } = harness(pkg([field({ triggerZones: [{ id: "z", entry: "nope#x", polygon: rect(50, 500, 100, 220) }] })]), { mode: "lenient" });
    engine.newGame();
    expect(engine.warnings.map((w) => w.code)).toContain("W-RUNTIME-REF");
    expect(engine.activeZones("hero")).toEqual(["z"]);
  });
});

describe("walking edge cases", () => {
  it("cancelling a run mid-walk stops the walk; a placement interrupts a walk_to with false", () => {
    const g: GraphDef = { id: "g", kind: "logic", nodes: [entry("e", ["w"]), { id: "w", type: "walk_to", actor: "hero", spot: "b" }] };
    const { engine } = harness(pkg([field()], { graphs: [g] }));
    engine.newGame();
    engine.run("g#e");
    engine.advanceTicks(5);
    engine.cancelAllRuns("load");
    expect(engine.isMoving("hero")).toBe(false);
    expect(engine.idleReport().idle).toBe(true);
    engine.run("g#e");
    engine.advanceTicks(5);
    engine.setActorPosition("hero", [300, 600], "up");
    expect(engine.finishedRuns.at(-1)?.result).toBe(false);
    expect(engine.world.actors.get("hero")).toMatchObject({ pos: [300, 600], facing: "up", spot: null });
    engine.clickAt([700, 600]);
    engine.cancelAllRuns("title");
    expect(engine.isMoving("hero")).toBe(false);
  });

  it("an unknown spot at runtime (lenient) fails the walk", () => {
    const g: GraphDef = { id: "g", kind: "logic", nodes: [entry("e", ["w"]), { id: "w", type: "walk_to", actor: "hero", spot: "ghost", scene: "field" }] };
    const { engine } = harness(pkg([field()], { graphs: [g] }), { mode: "lenient" });
    engine.newGame();
    engine.run("g#e");
    expect(engine.finishedRuns.at(-1)?.result).toBe(false);
  });

  it("an actor without a placement starts at the target; a start outside the area walks onto it", () => {
    const { engine } = harness(pkg([field({ defaultSpot: undefined as unknown as string, spots: { b: { x: 900, y: 600 } } })]));
    expect(engine.world.actors.get("hero")?.pos).toBeNull();
    engine.newGame();
    engine.walkPlayerTo("b");
    untilIdle(engine);
    expect(engine.world.actors.get("hero")?.pos).toEqual([900, 600]);
    engine.setActorPosition("hero", [900, 300]);
    expect(engine.actorScale("hero").spotHeightPx).toBeNull();
    engine.walkPlayerTo("b");
    expect(engine.trace.filter((e) => e.kind === "walk.start").at(-1)?.["path"]).toEqual([[900, 300], [900, 500], [900, 600]]);
    untilIdle(engine);
    expect(engine.actorScale("hero").spotHeightPx).toBeNull();
  });

  it("with a camera, a start above the horizon falls back to scene units", () => {
    const { engine } = harness(pkg([field({ camera: CAMERA, walkable: [rect(0, 0, 1280, 720)], spots: { a: { x: 640, y: 30 }, b: { x: 640, y: 600 } } })]));
    engine.newGame();
    // Above the horizon: infinitely far in the draw order.
    expect(engine.drawOrder("field")[0]?.depth).toBe(Number.POSITIVE_INFINITY);
    engine.walkPlayerTo("b");
    expect(engine.trace.find((e) => e.kind === "walk.start")?.["units"]).toBe("scene");
    untilIdle(engine);
    expect(engine.world.actors.get("hero")?.pos).toEqual([640, 600]);
    expect(engine.drawOrder("field")[0]?.depth).toBeGreaterThan(0);
  });

  it("non-player move_actor within and across scenes", () => {
    const g: GraphDef = {
      id: "g",
      kind: "logic",
      nodes: [entry("e", ["m1"]), { id: "m1", type: "move_actor", actor: "dog", scene: "field", spot: "b", next: ["m2"] }, { id: "m2", type: "move_actor", actor: "dog", scene: "hall" }],
    };
    const { engine } = harness(
      pkg([field(), { id: "hall", entry: null, spots: { d: { x: 1, y: 1 } }, defaultSpot: "d" }], {
        graphs: [g],
        actors: [
          { id: "hero", scene: "field", entry: null, variants: { default: {} } },
          { id: "dog", scene: "field", entry: null, variants: { default: {} } },
        ],
      }),
    );
    engine.newGame();
    engine.run("g#e");
    expect(engine.world.actors.get("dog")).toMatchObject({ scene: "hall", spot: "d" });
    expect(engine.world.scrollX).toBe(0);
  });
});

describe("walk targets without navigation", () => {
  it("a target above the horizon never starts a walk; an actor outside any scene walks via presentation", () => {
    const g: GraphDef = {
      id: "g",
      kind: "logic",
      nodes: [entry("e", ["w"]), { id: "w", type: "walk_to", actor: "hero", spot: "sky" }, entry("e2", ["w2"]), { id: "w2", type: "walk_to", actor: "ghost", spot: "a" }],
    };
    const { engine, adapter } = harness(
      pkg([field({ camera: CAMERA, walkable: [rect(0, 0, 1280, 720)], spots: { a: { x: 640, y: 600 }, sky: { x: 640, y: 30 } } })], {
        graphs: [g],
        actors: [
          { id: "hero", scene: "field", entry: null, variants: { default: {} } },
          { id: "ghost", scene: null, entry: null, variants: { default: {} } },
        ],
      }),
    );
    engine.newGame();
    engine.run("g#e");
    expect(engine.finishedRuns.at(-1)?.result).toBe(false);
    expect(engine.trace.some((e) => e.kind === "walk.nopath" && e["reason"] === "above-horizon")).toBe(true);
    engine.run("g#e2");
    expect(adapter.types()).toContain("WalkTo");
    engine.setActorPosition("ghost", [10, 10]);
    expect(engine.activeZones("ghost")).toEqual([]);
  });
});

describe("portal walk vetoes", () => {
  const scenes: SceneDef[] = [
    field({ spots: { a: { x: 100, y: 600 }, out: { x: 1200, y: 600 } }, defaultSpot: "a" }),
    { id: "hall", entry: null, walkSpeed: 600, spots: { door: { x: 100, y: 600 }, inside: { x: 300, y: 600 } }, defaultSpot: "door", walkable: [rect(0, 500, 1280, 220)] },
  ];
  const portals = [
    { id: "f_h", from: "field", to: "hall", entry: null, exitSpot: "out", entrySpot: "inside", polygon: rect(1250, 400, 30, 100) },
    { id: "h_f", from: "hall", to: "field", entry: null, exitSpot: "door" },
  ];
  const vetoWalk = (spot: string): GraphDef => ({
    id: "hl",
    kind: "logic",
    nodes: [entry("he", ["hg"]), { id: "hg", type: "guard", expr: { eq: [{ var: "$spot" }, { const: spot }] }, next: ["hr"] }, { id: "hr", type: "return", value: false }],
  });
  const withHero = (spot: string) =>
    harness(pkg(scenes, { portals, graphs: [vetoWalk(spot)], actors: [{ id: "hero", scene: "field", entry: "hl#he", variants: { default: {} } }] }));

  it("a vetoed exit walk keeps the actor in the scene", () => {
    const { engine } = withHero("out");
    engine.newGame();
    engine.click({ portal: "f_h" });
    untilIdle(engine);
    expect(engine.world.actors.get("hero")?.scene).toBe("field");
    expect(engine.events.some((e) => e.action === "scene.exit")).toBe(false);
  });

  it("a vetoed entry walk completes the transition but fails the portal use", () => {
    const { engine } = withHero("inside");
    engine.newGame();
    engine.click({ portal: "f_h" });
    untilIdle(engine);
    expect(engine.world.actors.get("hero")).toMatchObject({ scene: "hall", spot: "door" });
    expect(engine.finishedRuns.find((r) => r.entry?.startsWith("$ui") === true)?.result).toBe(false);
    expect(engine.idleReport().idle).toBe(true);
  });
});

describe("space and query details", () => {
  it("viewport from content, spot lookup, no navigation", () => {
    const content = loadContent(pkg([field({ walkable: [], spots: { a: { x: 100, y: 550 } } })], { game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", viewport: { width: 800, height: 600 }, player: { actor: "hero" }, entry: null } }));
    const space = new Spaces(content).get("field");
    expect(space?.viewport).toEqual({ width: 800, height: 600 });
    expect(space?.height).toBe(600);
    expect(space?.spot(null)).toBeNull();
    expect(space?.spot("ghost")).toBeNull();
    expect(space?.findPath([0, 0], [1, 1])).toBeNull();
    expect(space?.hasNavigation).toBe(false);
    expect(new Spaces(content).get("ghost")).toBeUndefined();
  });

  it("variant-bound zones, actors in object zones, locked portal tooltip fallback, player without a position", () => {
    const scene = field({
      objectZones: [
        { entity: "lamp", variant: "lit", polygon: rect(0, 500, 50, 50) },
        { entity: "dog", polygon: rect(100, 500, 50, 50) },
      ],
      actorZones: [{ actor: "dog", variant: "wet", polygon: rect(200, 500, 50, 50) }],
    });
    const content = loadContent(
      pkg([scene, { id: "hall", entry: null, spots: { d: { x: 1, y: 1 } } }], {
        actors: [
          { id: "hero", scene: "field", entry: null, variants: { default: {} } },
          { id: "dog", scene: "field", entry: null, variants: { default: {}, wet: {} } },
        ],
        objects: [{ id: "lamp", container: { kind: "scene", id: "field" }, entry: null, variants: { default: {}, lit: {} } }],
        portals: [
          { id: "p", from: "field", to: "hall", entry: null, locked: true, nameKey: "n", arrivalSpot: "d", polygon: rect(1200, 500, 50, 50) },
          { id: "p2", from: "field", to: "hall", index: 1, entry: null, locked: true, arrivalSpot: "d", polygon: rect(1100, 500, 50, 50) },
        ],
      }),
    );
    const { engine } = harness(content.pkg);
    engine.newGame();
    const q = (point: [number, number], selectedItem: string | null = null) =>
      queryPoint({ content, world: engine.world, space: engine.space("field"), point, selectedItem, modal: false });
    expect(q([10, 510])).toEqual({ mode: "walk", point: [10, 510] });
    engine.world.setVariant("lamp", "lit");
    expect(q([10, 510])).toMatchObject({ mode: "interact", target: "lamp" });
    expect(q([210, 510])).toMatchObject({ mode: "walk" });
    engine.world.setVariant("dog", "wet");
    expect(q([210, 510])).toMatchObject({ mode: "talk", target: "dog" });
    expect(q([110, 510], "x")).toMatchObject({ mode: "use", target: "dog", targetKind: "actor" });
    expect(q([1210, 510])).toEqual({ mode: "portal_locked", target: "p", tooltipKey: "n" });
    expect(q([1110, 510])).toEqual({ mode: "portal_locked", target: "p2", tooltipKey: null });
    engine.setPortalLocked("p", false);
    expect(q([1210, 510])).toEqual({ mode: "portal", target: "p", tooltipKey: "n" });
    engine.world.actors.get("hero")!.pos = null;
    expect(q([600, 600], "x")).toMatchObject({ mode: "use", target: null });
  });
});
