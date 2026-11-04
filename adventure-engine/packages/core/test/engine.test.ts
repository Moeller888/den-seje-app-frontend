import type { NodeDef } from "@adventure-engine/content";
import { describe, expect, it } from "vitest";
import { EngineError, TICK_MS } from "../src/index.ts";
import { basePackage, graph, harness, pending } from "./helpers.ts";

const say = (id: string): NodeDef => ({ id, type: "say", speaker: "owl", textKey: "t1" });

function world(graphs: ReturnType<typeof graph>[] = [], extra: Parameters<typeof basePackage>[1] = {}) {
  return harness(basePackage(graphs, extra));
}

describe("lifecycle (spec 01 A1, TS-A01)", () => {
  it("new game: scene.enter($from=null) before game.start, after the fade-in", () => {
    const { engine, adapter } = harness(basePackage([]), { await: ["SceneFade"] });
    engine.newGame();
    expect(engine.events.map((e) => e.action)).toEqual(["scene.enter"]);
    engine.reply(pending(engine, "SceneFade").cmdId, { kind: "done" });
    expect(engine.events.map((e) => e.action)).toEqual(["scene.enter", "game.start"]);
    expect(adapter.types()).toEqual(["SceneFade"]);
  });

  it("new game rebuilds world and globals from content", () => {
    const { engine } = world();
    engine.newGame();
    engine.setGlobal("x", 1);
    engine.world.moveObject("box", { kind: "none" }, null);
    engine.newGame();
    expect(engine.globals.has("x")).toBe(false);
    expect(engine.world.objects.get("box")?.container).toEqual({ kind: "scene", id: "room" });
  });

  it("exposes time, ticks and the trace", () => {
    const { engine } = world();
    engine.advanceTicks(3);
    expect(engine.now).toBeCloseTo(3 * TICK_MS, 9);
    engine.settle();
    expect(engine.trace.length).toBe(0);
  });
});

describe("interaction subset (spec 04 D3/D4)", () => {
  it("clicking an object zone interacts; a veto gives a 'cannot' reaction", () => {
    const pkg = basePackage([graph("ol", [{ id: "oe", type: "entry", name: "oe", next: ["or"] }, { id: "or", type: "return", value: false }])], {
      objects: [{ id: "box", container: { kind: "scene", id: "room" }, entry: "ol#oe", variants: { default: {} } }],
    });
    const { engine, adapter } = harness(pkg);
    engine.newGame();
    const info = engine.click({ objectZone: "box" });
    expect(info).not.toBeNull();
    expect(adapter.types()).toEqual(["SceneFade", "React"]);
    expect(engine.modal.isModal).toBe(false);
  });

  it("TS-D04: clicks are ignored while input is modal", () => {
    const pkg = basePackage([{ id: "dl", kind: "dialog", nodes: [{ id: "d0", type: "entry", name: "d0", modal: true, next: ["s"] }, say("s")] }], {
      actors: [
        { id: "hero", scene: "room", entry: null, variants: { default: {} } },
        { id: "owl", scene: "room", entry: null, dialog: "dl#d0", variants: { default: {} } },
      ],
    });
    const { engine } = harness(pkg);
    engine.newGame();
    expect(engine.click({ actorZone: "owl" })).not.toBeNull();
    expect(engine.modal.isModal).toBe(true);
    expect(engine.click({ objectZone: "box" })).toBeNull();
    expect(engine.trace.some((e) => e.kind === "input.ignored")).toBe(true);
    engine.reply(pending(engine, "Say").cmdId, { kind: "done" });
    expect(engine.modal.isModal).toBe(false);
  });

  it("an actor zone with a talk spot walks there first", () => {
    const { engine, adapter } = world();
    engine.newGame();
    engine.click({ actorZone: "fox" });
    expect(adapter.types()).toEqual(["SceneFade", "WalkTo"]);
    expect(engine.world.actors.get("hero")?.spot).toBe("b");
  });

  it("rejects clicks on unknown zones and without a player", () => {
    const { engine } = world();
    engine.newGame();
    expect(() => engine.click({ objectZone: "nope" })).toThrow(EngineError);
    expect(() => engine.click({ actorZone: "nope" })).toThrow(EngineError);
    const noPlayer = harness(basePackage([], { game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da" } }));
    expect(() => noPlayer.engine.click({ objectZone: "box" })).toThrow(/player/);
  });
});

describe("devtools helpers", () => {
  it("pushDialog validates entry and actor", () => {
    const pkg = basePackage([{ id: "dl", kind: "dialog", nodes: [{ id: "d0", type: "entry", name: "d0" }] }]);
    const { engine } = harness(pkg);
    engine.pushDialog("owl", "dl#d0");
    expect(engine.world.actors.get("owl")?.dialogStack).toEqual(["dl#d0"]);
    expect(() => engine.pushDialog("owl", "dl#none")).toThrow(/unknown entry/);
    expect(() => engine.pushDialog("ghost", "dl#d0")).toThrow(/unknown actor/);
  });
});
