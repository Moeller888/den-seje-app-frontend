import { describe, expect, it } from "vitest";
import { basePackage, graph, harness, pending } from "./helpers.ts";

/** Phase 6: the public facades the devtools use (no private fields are touched). */
function world() {
  const g = graph("g", [
    { id: "box", type: "entry", name: "box", next: ["box1"] },
    { id: "box1", type: "set", var: "opened", value: true },
    { id: "bg", type: "entry", name: "bg", next: ["d1"] },
    { id: "d1", type: "detach", next: ["d2"] },
    { id: "d2", type: "delay", minMs: 5000, maxMs: 5000, mode: "block" },
    { id: "fg", type: "entry", name: "fg", next: ["f1"] },
    { id: "f1", type: "delay", minMs: 5000, maxMs: 5000, mode: "block" },
  ]);
  const talk = graph("talk", [
    { id: "h0", type: "entry", name: "hello", next: ["h1"] },
    { id: "h1", type: "say", speaker: "owl", textKey: "t1" },
  ], "dialog");
  const base = basePackage([g, talk]);
  const pkg = {
    ...base,
    actors: (base.actors ?? []).map((a) => (a.id === "owl" ? { ...a, dialog: "talk#hello" } : a)),
    objects: (base.objects ?? []).map((o) => (o.id === "box" ? { ...o, entry: "g#box" } : o)),
  };
  return harness(pkg, { await: ["Say"] });
}

describe("devtools facades (phase 6)", () => {
  it("devAction moves actors between scenes, sets the player and interacts through ordinary nodes", () => {
    const { engine } = world();
    engine.newGame();
    engine.advance(1000);
    engine.devAction({ kind: "move_actor", actor: "hero", scene: "yard2", spot: "gate" });
    engine.advance(2000);
    expect(engine.world.actors.get("hero")?.scene).toBe("yard2");
    engine.devAction({ kind: "move_actor", actor: "hero", scene: "room" });
    engine.advance(2000);
    expect(engine.world.actors.get("hero")?.scene).toBe("room");
    engine.devAction({ kind: "player_set", actor: "owl" });
    expect(engine.world.playerId).toBe("owl");
    engine.devAction({ kind: "player_set", actor: "hero" });
    engine.devAction({ kind: "interact", object: "box" });
    engine.advance(100);
    expect(engine.globals.get("opened")).toBe(true);
    expect(engine.trace.some((e) => e.kind === "dev.action")).toBe(true);
  });

  it("devAction talk starts the actor's dialog; use_item runs the use logic", () => {
    const { engine } = world();
    engine.newGame();
    engine.advance(1000);
    engine.devAction({ kind: "talk", target: "owl" });
    engine.advance(100);
    expect(pending(engine, "Say").type).toBe("Say");
    const run = engine.devAction({ kind: "use_item", item: "key", target: "box", use: "object" });
    expect(run.id).toMatch(/^r\d+$/);
  });

  it("talk without a player is an error", () => {
    const { engine } = world();
    engine.newGame();
    engine.advance(1000);
    engine.devAction({ kind: "player_set", actor: "owl" });
    engine.world.playerId = null;
    expect(() => engine.devAction({ kind: "talk", target: "owl" })).toThrow(/player/);
  });

  it("deleteGlobal forgets a variable once; activeRuns lists runs, nodes and background state", () => {
    const { engine } = world();
    engine.newGame();
    engine.advance(1000);
    engine.setGlobal("x", 3);
    expect(engine.deleteGlobal("x")).toBe(true);
    expect(engine.deleteGlobal("x")).toBe(false);
    expect(engine.globals.get("x")).toBe(false);
    expect(engine.globals.has("x")).toBe(false);
    expect(engine.trace.filter((e) => e.kind === "global.delete")).toHaveLength(1);
    engine.run("g#bg");
    engine.run("g#fg");
    const runs = engine.activeRuns();
    expect(runs.map((r) => [r.entry, r.background, r.nodes])).toEqual(
      expect.arrayContaining([
        ["g#bg", true, ["d1", "d2"]],
        ["g#fg", false, ["f1", "fg"]],
      ]),
    );
  });
});
