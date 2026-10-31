import type { NodeDef } from "@adventure-engine/content";
import { describe, expect, it } from "vitest";
import { EngineError, type Command } from "../src/index.ts";
import { basePackage, graph, harness, lastResult, pending } from "./helpers.ts";

const entry = (id: string, next: NodeDef["next"] = [], modal = false): NodeDef => ({ id, type: "entry", name: id, modal, next });
const set = (id: string, v: string, value: boolean | number | string = true, next: string[] = []): NodeDef => ({ id, type: "set", var: v, value, next });
const say = (id: string, speaker = "owl", next: string[] = []): NodeDef => ({ id, type: "say", speaker, textKey: "t1", next });
const guard = (id: string, v: string, value: boolean | number | string, next: string[] = []): NodeDef => ({
  id,
  type: "guard",
  expr: { eq: [{ var: v }, { const: value }] },
  next,
});

function single(nodes: NodeDef[], opts: Parameters<typeof harness>[1] = {}, extra: Parameters<typeof basePackage>[1] = {}) {
  return harness(basePackage([graph("g", nodes)], extra), opts);
}

describe("fan-out, ordering and aggregation (spec 02 B3)", () => {
  it("TS-B01/B03: starts all successors, AND-aggregates, empty → true", () => {
    const { engine } = single([entry("e", ["x", "y"]), set("x", "a"), { id: "y", type: "return", value: false }]);
    engine.run("g#e");
    expect(engine.globals.get("a")).toBe(true);
    expect(lastResult(engine)).toBe(false);
    const { engine: e2 } = single([entry("e")]);
    e2.run("g#e");
    expect(lastResult(e2)).toBe(true);
  });

  it("TS-B02: set runs before siblings; then edge order, then file order", () => {
    const { engine } = single([
      entry("e", [{ to: "late", order: 5 }, "g1", "s1", { to: "early", order: -1 }]),
      guard("g1", "flag", true, ["w1"]),
      set("s1", "flag"),
      set("w1", "seen_by_guard"),
      set("early", "e_early"),
      set("late", "e_late"),
    ]);
    engine.run("g#e");
    // set nodes first (early/s1/late by order), then the guard sees flag=true.
    expect(engine.globalWrites).toEqual(["e_early", "flag", "e_late", "seen_by_guard"]);
  });

  it("TS-B04: depth-first until the first wait point", () => {
    const { engine } = single([entry("e", ["a", "b"]), set("a", "a1", true, ["a2"]), say("a2", "owl", ["a3"]), set("a3", "a_after"), guard("b", "a1", true, ["b2"]), set("b2", "b_ran")]);
    engine.run("g#e");
    expect(engine.globalWrites).toEqual(["a1", "b_ran"]);
    engine.reply(pending(engine, "Say").cmdId, { kind: "done" });
    expect(engine.globalWrites).toEqual(["a1", "b_ran", "a_after"]);
    expect(lastResult(engine)).toBe(true);
  });

  it("TS-B05: same seed and input → byte-identical traces", () => {
    const nodes = [entry("e", ["r"]), { id: "r", type: "random", next: ["x", "y", "z"] } as NodeDef, set("x", "v", 1), set("y", "v", 2), set("z", "v", 3)];
    const traces = [1, 2].map(() => {
      const { engine } = single(nodes, { seed: "same" });
      for (let i = 0; i < 20; i++) engine.run("g#e");
      return engine.tracer.toJSONL();
    });
    expect(traces[0]).toBe(traces[1]);
    expect(traces[0]?.length).toBeGreaterThan(0);
  });

  it("TS-B06/B08: return false vetoes; a false guard never vetoes", () => {
    const { engine } = single([entry("e", ["g1", "g2"]), guard("g1", "x", true, ["r"]), { id: "r", type: "return", value: false }, guard("g2", "x", "nope")]);
    engine.run("g#e");
    expect(lastResult(engine)).toBe(true);
    engine.setGlobal("x", true);
    engine.run("g#e");
    expect(lastResult(engine)).toBe(false);
  });

  it("TS-B19: a 10 000-iteration cycle and a 20 000-node chain run without stack overflow", () => {
    const { engine } = single([entry("e", ["loop"]), guard("loop", "stop", false, ["body"]), set("body", "tick", true, ["loop"])]);
    let count = 0;
    const originalEmit = engine.tracer.emit.bind(engine.tracer);
    engine.tracer.emit = (kind, fields) => {
      if (kind === "node.start" && (fields as { nodeId?: string }).nodeId === "body" && ++count === 10000) engine.globals.set("stop", true);
      originalEmit(kind, fields);
    };
    engine.run("g#e");
    expect(engine.executions.get("body")).toBe(10000);
    expect(lastResult(engine)).toBe(true);

    const chain: NodeDef[] = [entry("c0", ["n0"])];
    for (let i = 0; i < 20000; i++) chain.push({ id: `n${i}`, type: "detach", next: i + 1 < 20000 ? [`n${i + 1}`] : [] });
    const { engine: e2 } = harness(basePackage([graph("chain", chain)]));
    e2.tracer.emit = () => {};
    e2.run("chain#c0");
    expect(e2.executions.get("n19999")).toBe(1);
  });
});

describe("control nodes (spec 02 B4.1)", () => {
  it("TS-B13/B14: delay block vs background", () => {
    const { engine } = single([
      entry("e", ["d"]),
      { id: "d", type: "delay", minMs: 1000, maxMs: 1000, mode: "block", next: ["s"] },
      set("s", "t1", true, ["bg"]),
      { id: "bg", type: "delay", minMs: 500, maxMs: 500, mode: "background", next: ["s2"] },
      set("s2", "t2"),
    ]);
    engine.run("g#e");
    engine.advance(999);
    expect(engine.globals.has("t1")).toBe(false);
    engine.advance(1);
    expect(engine.globals.get("t1")).toBe(true);
    expect(lastResult(engine)).toBe(true);
    engine.advance(500);
    expect(engine.globals.get("t2")).toBe(true);
  });

  it("delay with a range draws from the seeded rng", () => {
    const { engine } = single([entry("e", ["d"]), { id: "d", type: "delay", minMs: 100, maxMs: 200, mode: "block", next: ["s"] }, set("s", "done")]);
    engine.run("g#e");
    engine.advance(99);
    expect(engine.globals.has("done")).toBe(false);
    engine.advance(101);
    expect(engine.globals.get("done")).toBe(true);
  });

  it("TS-B15: join continues exactly once when all incoming branches arrived", () => {
    const { engine } = single([
      entry("e", ["d1", "d2"]),
      { id: "d1", type: "delay", minMs: 10, maxMs: 10, mode: "block", next: ["j"] },
      { id: "d2", type: "delay", minMs: 30, maxMs: 30, mode: "block", next: ["j"] },
      { id: "j", type: "join", next: ["after"] },
      set("after", "joined"),
    ]);
    engine.run("g#e");
    engine.advance(10);
    expect(engine.globals.has("joined")).toBe(false);
    engine.advance(20);
    expect(engine.executions.get("after")).toBe(1);
    expect(lastResult(engine)).toBe(true);
  });

  it("B-07: a pruned incoming branch counts as arrived", () => {
    const { engine } = single([
      entry("e", ["g1", "d1"]),
      guard("g1", "never", true, ["j"]),
      { id: "d1", type: "delay", minMs: 10, maxMs: 10, mode: "block", next: ["j"] },
      { id: "j", type: "join", next: ["after"] },
      set("after", "joined"),
    ]);
    engine.run("g#e");
    engine.advance(10);
    expect(engine.globals.get("joined")).toBe(true);
    expect(lastResult(engine)).toBe(true);
  });

  it("join state resets per firing (loop through a join)", () => {
    const { engine } = single([
      entry("e", ["a"]),
      set("a", "x", true, ["j"]),
      { id: "j", type: "join", next: ["count"] },
      { id: "count", type: "random", next: ["c1"] },
      set("c1", "c", true, []),
    ]);
    engine.run("g#e");
    engine.run("g#e");
    expect(engine.executions.get("count")).toBe(2);
  });

  it("TS-B16: random picks one successor; no successors → true", () => {
    const { engine } = single([entry("e", ["r"]), { id: "r", type: "random", next: ["x", "y"] }, set("x", "pick", "x"), set("y", "pick", "y"), entry("e2", ["r2"]), { id: "r2", type: "random" }]);
    engine.run("g#e");
    expect(["x", "y"]).toContain(engine.globals.get("pick"));
    expect((engine.executions.get("x") ?? 0) + (engine.executions.get("y") ?? 0)).toBe(1);
    engine.run("g#e2");
    expect(lastResult(engine)).toBe(true);
  });

  it("TS-B17: detach completes the parent before its successors finish", () => {
    const { engine } = single([entry("e", ["d"]), { id: "d", type: "detach", next: ["s"] }, say("s", "owl", ["after"]), set("after", "bg_done")]);
    engine.run("g#e");
    expect(lastResult(engine)).toBe(true);
    expect(engine.globals.has("bg_done")).toBe(false);
    engine.reply(pending(engine, "Say").cmdId, { kind: "done" });
    expect(engine.globals.get("bg_done")).toBe(true);
    expect(engine.activeRunCount()).toBe(0);
  });

  it("TS-B29: a modal entry holds its lock until the whole run is done", () => {
    const { engine } = single([entry("e", ["s"], true), say("s")]);
    engine.run("g#e");
    expect(engine.modal.isModal).toBe(true);
    engine.reply(pending(engine, "Say").cmdId, { kind: "done" });
    expect(engine.modal.isModal).toBe(false);
  });
});

describe("cancellation (spec 02 B6, TS-B20, TS-A09)", () => {
  it("TS-B20: cancelAll completes waiting runs as cancelled, frees locks, ignores late replies", () => {
    const { engine, adapter } = single(
      [
        entry("e", ["s", "lock", "snd", "d"], true),
        say("s"),
        { id: "lock", type: "input_lock", next: [] },
        { id: "snd", type: "sound_play", entity: "room", sound: "hum", times: "loop" },
        { id: "d", type: "delay", minMs: 50, maxMs: 50, mode: "block", next: ["late"] },
        set("late", "late"),
      ],
      { await: ["PlayAnimation"] },
    );
    engine.run("g#e");
    const sayCmd = pending(engine, "Say");
    expect(engine.modal.count).toBe(2);
    const before = adapter.log.length;
    engine.cancelAllRuns("load");
    expect(lastResult(engine)).toBe("cancelled");
    expect(engine.modal.count).toBe(0);
    expect(engine.reply(sayCmd.cmdId, { kind: "done" })).toBe(false);
    engine.advance(100);
    expect(engine.globals.has("late")).toBe(false);
    expect(adapter.log.length).toBe(before);
    expect(engine.activeRunCount()).toBe(0);
  });

  it("cancelling also drops engine-level pending commands", () => {
    const { engine } = single([], { await: ["SceneFade"] });
    engine.newGame();
    const fade = pending(engine, "SceneFade");
    engine.backToTitle();
    expect(engine.reply(fade.cmdId, { kind: "done" })).toBe(false);
  });

  it("cancels background activity of an already finished run and queued siblings", () => {
    const { engine } = single([
      entry("e", ["d", "q"]),
      { id: "d", type: "detach", next: ["s"] },
      say("s"),
      { id: "q", type: "quit" },
    ]);
    engine.run("g#e");
    // quit (ShowCredits auto-completes) cancels every run including the detached say.
    expect(engine.pendingCommands()).toEqual([]);
    expect(engine.activeRunCount()).toBe(0);
  });

  it("quit cancels siblings that are still queued", () => {
    const { engine } = single([entry("e", ["q", "s"]), { id: "q", type: "quit" }, say("s")], { autoMs: 0 });
    engine.run("g#e");
    expect(engine.executions.get("s")).toBe(1);
    expect(engine.pendingCommands()).toEqual([]);
  });
});

describe("world nodes (spec 02 B4.2)", () => {
  it("move_object moves atomically and keeps inventory order", () => {
    const { engine, adapter } = single([
      entry("e", ["m1"]),
      { id: "m1", type: "move_object", object: "box", to: { kind: "actor", id: "hero" }, next: ["m2"] },
      { id: "m2", type: "move_object", object: "key", to: { kind: "none" }, spot: "a", next: ["m3"] },
      { id: "m3", type: "move_object", object: "box", to: { kind: "actor", id: "hero" }, spot: "a" },
    ]);
    engine.run("g#e");
    expect(engine.world.actors.get("hero")?.inventory).toEqual(["box"]);
    expect(engine.world.objects.get("key")?.container).toEqual({ kind: "none" });
    expect(adapter.types().filter((t) => t === "MoveObject")).toHaveLength(3);
    expect(lastResult(engine)).toBe(true);
  });

  it("TS-A05: move to an unknown container (lenient) → warning, unchanged, false", () => {
    const { engine } = single([entry("e", ["m"]), { id: "m", type: "move_object", object: "box", to: { kind: "actor", id: "ghost" } }], { mode: "lenient" });
    engine.run("g#e");
    expect(lastResult(engine)).toBe(false);
    expect(engine.warnings.map((w) => w.code)).toContain("W-MOVE-FAILED");
    expect(engine.world.objects.get("box")?.container).toEqual({ kind: "scene", id: "room" });
  });

  it("move_actor, rename, portal_lock, player_set (and their lenient failures)", () => {
    const pkg = basePackage([
      graph("g", [
        entry("e", ["ma"]),
        { id: "ma", type: "move_actor", actor: "owl", scene: "yard2", spot: "gate", next: ["mb"] },
        { id: "mb", type: "move_actor", actor: "fox", scene: "yard2", next: ["rn"] },
        { id: "rn", type: "rename", object: "box", nameKey: "t2", next: ["pl"] },
        { id: "pl", type: "portal_lock", portal: "p1", locked: true, next: ["ps"] },
        { id: "ps", type: "player_set", actor: "owl" },
        entry("bad1", ["x1"]),
        { id: "x1", type: "move_actor", actor: "ghost", scene: "yard2" },
        entry("bad2", ["x2"]),
        { id: "x2", type: "rename", object: "ghost", nameKey: "t2" },
        entry("bad3", ["x3"]),
        { id: "x3", type: "portal_lock", portal: "ghost", locked: true },
        entry("bad4", ["x4"]),
        { id: "x4", type: "player_set", actor: "ghost" },
      ]),
    ], { portals: [{ id: "p1", from: "room", to: "yard2", entry: null, arrivalSpot: "gate" }] });
    const { engine } = harness(pkg, { mode: "lenient" });
    engine.run("g#e");
    expect(engine.world.actors.get("owl")).toMatchObject({ scene: "yard2", spot: "gate" });
    expect(engine.world.actors.get("fox")).toMatchObject({ scene: "yard2", spot: "gate" });
    expect(engine.world.objects.get("box")?.nameKey).toBe("t2");
    expect(engine.world.portals.get("p1")?.locked).toBe(true);
    expect(engine.world.playerId).toBe("owl");
    for (const e of ["bad1", "bad2", "bad3", "bad4"]) {
      engine.run(`g#${e}`);
      expect(lastResult(engine)).toBe(false);
    }
    expect(engine.warnings.filter((w) => w.code === "W-RUNTIME-REF")).toHaveLength(4);
  });

  it("TS-B30: set_variant waits for PrepareVariant and passes $entity/$variant on", () => {
    const { engine } = single(
      [
        entry("e", ["v"]),
        { id: "v", type: "set_variant", entity: "box", variant: "open", next: ["g1"] },
        { id: "g1", type: "guard", expr: { and: [{ eq: [{ var: "$entity" }, { const: "box" }] }, { eq: [{ var: "$variant" }, { const: "open" }] }] }, next: ["ok"] },
        set("ok", "ctx_seen"),
        entry("bad", ["vb"]),
        { id: "vb", type: "set_variant", entity: "box", variant: "nope" },
        entry("bad2", ["vc"]),
        { id: "vc", type: "set_variant", entity: "ghost", variant: "open" },
      ],
      { await: ["PrepareVariant"], mode: "lenient" },
    );
    engine.run("g#e");
    expect(engine.world.objects.get("box")?.variant).toBe("default");
    engine.reply(pending(engine, "PrepareVariant").cmdId, { kind: "done" });
    expect(engine.world.objects.get("box")?.variant).toBe("open");
    expect(engine.globals.get("ctx_seen")).toBe(true);
    engine.run("g#bad");
    expect(lastResult(engine)).toBe(false);
    engine.run("g#bad2");
    expect(lastResult(engine)).toBe(false);
  });
});

describe("action nodes with veto (spec 02 B4.3)", () => {
  const objLogic = (result: boolean): NodeDef[] => [entry("oe", ["or"]), { id: "or", type: "return", value: result }];

  it("TS-B31: interact keeps the parent context; use_item passes its own context on", () => {
    const pkg = basePackage(
      [
        graph("g", [
          entry("e", ["i", "u"]),
          { id: "i", type: "interact", object: "box", next: ["ci"] },
          { id: "ci", type: "guard", expr: { eq: [{ var: "$action" }, { const: "outer" }] }, next: ["si"] },
          set("si", "interact_ctx_outer"),
          { id: "u", type: "use_item", item: "key", target: "box", kind: "object", next: ["cu"] },
          { id: "cu", type: "guard", expr: { and: [{ eq: [{ var: "$item" }, { const: "key" }] }, { eq: [{ var: "$action" }, { const: "use.object" }] }] }, next: ["su"] },
          set("su", "use_ctx"),
        ]),
        graph("ol", [entry("oe", ["seen"]), set("seen", "box_saw_event")]),
      ],
      {
        objects: [
          { id: "box", container: { kind: "scene", id: "room" }, entry: "ol#oe", variants: { default: {} } },
          { id: "key", container: { kind: "actor", id: "hero" }, entry: null, variants: { default: {} } },
        ],
      },
    );
    const { engine } = harness(pkg);
    engine.run("g#e", { $action: "outer" });
    expect(engine.globals.get("interact_ctx_outer")).toBe(true);
    expect(engine.globals.get("use_ctx")).toBe(true);
    expect(engine.events.map((e) => `${e.action}:${e.receiver}`)).toEqual(["interact:box", "use.object:key"]);
  });

  it("interact / use_item veto → false", () => {
    const pkg = basePackage(
      [graph("g", [entry("e", ["i"]), { id: "i", type: "interact", object: "box" }, entry("e2", ["u"]), { id: "u", type: "use_item", item: "box", target: "owl", kind: "actor" }]), graph("ol", objLogic(false))],
      { objects: [{ id: "box", container: { kind: "scene", id: "room" }, entry: "ol#oe", variants: { default: {} } }] },
    );
    const { engine } = harness(pkg);
    engine.run("g#e");
    expect(lastResult(engine)).toBe(false);
    engine.run("g#e2");
    expect(lastResult(engine)).toBe(false);
  });

  it("TS-B09: walk_to → talk chain resolves false on veto, nothing left waiting", () => {
    const pkg = basePackage(
      [
        graph("g", [entry("e", ["w"]), { id: "w", type: "walk_to", actor: "hero", spot: "b", next: ["t"] }, { id: "t", type: "talk", actor: "hero", target: "owl" }]),
        graph("hl", [entry("he", ["hg"]), guard("hg", "$action", "walk", ["hr"]), { id: "hr", type: "return", value: false }]),
      ],
      { actors: [{ id: "hero", scene: "room", spot: "a", entry: "hl#he", variants: { default: {} } }, { id: "owl", scene: "room", entry: null, variants: { default: {} } }] },
    );
    const { engine } = harness(pkg);
    engine.run("g#e");
    expect(lastResult(engine)).toBe(false);
    expect(engine.pendingCommands()).toEqual([]);
    expect(engine.activeRunCount()).toBe(0);
  });

  it("walk_to: success sets the spot; failed reply → false; unknown actor → false", () => {
    const { engine } = single(
      [entry("e", ["w"]), { id: "w", type: "walk_to", actor: "hero", spot: "b", next: ["s"] }, set("s", "arrived"), entry("e2", ["w2"]), { id: "w2", type: "walk_to", actor: "hero", spot: "a", scene: "room" }, entry("e3", ["w3"]), { id: "w3", type: "walk_to", actor: "ghost", spot: "a" }],
      { await: ["WalkTo"], mode: "lenient" },
    );
    engine.run("g#e");
    engine.reply(pending(engine, "WalkTo").cmdId, { kind: "done" });
    expect(engine.world.actors.get("hero")?.spot).toBe("b");
    expect(engine.globals.get("arrived")).toBe(true);
    engine.run("g#e2");
    engine.reply(pending(engine, "WalkTo").cmdId, { kind: "failed", reason: "no path" });
    expect(lastResult(engine)).toBe(false);
    engine.run("g#e3");
    expect(lastResult(engine)).toBe(false);
  });

  it("TS-B27 + talk: empty stack → true; dialog result false → false; unresolved dialog (lenient) → false", () => {
    const pkg = basePackage(
      [
        graph("g", [entry("e", ["t"]), { id: "t", type: "talk", actor: "hero", target: "fox" }, entry("e2", ["t2"]), { id: "t2", type: "talk", actor: "hero", target: "owl" }, entry("e3", ["t3"]), { id: "t3", type: "talk", actor: "hero", target: "ghost" }]),
        { id: "dl", kind: "dialog", nodes: [entry("d0", ["dr"]), { id: "dr", type: "return", value: false }] },
      ],
      {
        actors: [
          { id: "hero", scene: "room", entry: null, variants: { default: {} } },
          { id: "owl", scene: "room", entry: null, dialog: "dl#d0", variants: { default: {} } },
          { id: "fox", scene: "room", entry: null, variants: { default: {} } },
          { id: "bat", scene: "room", entry: null, dialog: "dl#missing", variants: { default: {} } },
        ],
      },
    );
    const { engine, adapter } = harness(pkg, { mode: "lenient" });
    engine.run("g#e");
    expect(lastResult(engine)).toBe(true);
    expect(adapter.log).toEqual([]);
    engine.run("g#e2");
    expect(lastResult(engine)).toBe(false);
    engine.run("g#e3");
    expect(lastResult(engine)).toBe(false);
    const pkg2 = basePackage([graph("g", [entry("e", ["t"]), { id: "t", type: "talk", actor: "hero", target: "bat" }])], pkg);
    const { engine: e2 } = harness(pkg2, { mode: "lenient" });
    e2.run("g#e");
    expect(lastResult(e2)).toBe(false);
  });

  it("portal_use: lock, veto, transition with arrival spot fallbacks, toScene, failures", () => {
    const pkg = basePackage(
      [
        graph("g", [
          entry("lockedE", ["pu1"]),
          { id: "pu1", type: "portal_use", portal: "p_locked" },
          entry("vetoE", ["pu2"]),
          { id: "pu2", type: "portal_use", portal: "p_veto" },
          entry("revE", ["pu3"]),
          { id: "pu3", type: "portal_use", portal: "p_rev", actor: "owl" },
          entry("arrE", ["pu4"]),
          { id: "pu4", type: "portal_use", portal: "p_arr" },
          entry("sceneE", ["pu5"]),
          { id: "pu5", type: "portal_use", toScene: "room" },
          entry("badScene", ["pu6"]),
          { id: "pu6", type: "portal_use", toScene: "ghost" },
          entry("badPortal", ["pu7"]),
          { id: "pu7", type: "portal_use", portal: "ghost" },
          entry("badActor", ["pu8"]),
          { id: "pu8", type: "portal_use", toScene: "room", actor: "ghost" },
        ]),
        graph("pv", [entry("pe", ["pr"]), { id: "pr", type: "return", value: false }]),
      ],
      {
        portals: [
          { id: "p_locked", from: "room", to: "yard2", locked: true, entry: null, arrivalSpot: "gate" },
          { id: "p_veto", from: "room", to: "yard2", index: 1, entry: "pv#pe", arrivalSpot: "gate" },
          { id: "p_rev", from: "room", to: "yard2", index: 2, entry: null, exitSpot: "a" },
          { id: "p_rev_back", from: "yard2", to: "room", index: 2, entry: null, exitSpot: "gate" },
          { id: "p_arr", from: "yard2", to: "room", entry: null, arrivalSpot: "b" },
        ],
      },
    );
    const { engine, adapter } = harness(pkg, { mode: "lenient" });
    engine.run("g#lockedE");
    expect(lastResult(engine)).toBe(false);
    engine.run("g#vetoE");
    expect(lastResult(engine)).toBe(false);
    engine.run("g#revE");
    expect(engine.world.actors.get("owl")).toMatchObject({ scene: "yard2", spot: "gate" });
    engine.run("g#arrE");
    expect(engine.world.actors.get("hero")).toMatchObject({ scene: "room", spot: "b" });
    engine.run("g#sceneE");
    expect(engine.world.actors.get("hero")?.scene).toBe("room");
    expect(adapter.types().filter((t) => t === "PortalTransition")).toHaveLength(3);
    for (const e of ["badScene", "badPortal", "badActor"]) {
      engine.run(`g#${e}`);
      expect(lastResult(engine)).toBe(false);
    }
  });

  it("portal_use without any player or actor fails", () => {
    const pkg = basePackage([graph("g", [entry("e", ["pu"]), { id: "pu", type: "portal_use", toScene: "room" }])], { game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da" } });
    const { engine } = harness(pkg);
    engine.run("g#e");
    expect(lastResult(engine)).toBe(false);
  });

  it("portal_use falls back to no arrival spot when neither arrivalSpot nor a reverse exists (lenient)", () => {
    const pkg = basePackage([graph("g", [entry("e", ["pu"]), { id: "pu", type: "portal_use", portal: "oneway" }])], { portals: [{ id: "oneway", from: "room", to: "yard2", entry: null }] });
    const { engine } = harness(pkg, { mode: "lenient" });
    engine.run("g#e");
    expect(engine.world.actors.get("hero")).toMatchObject({ scene: "yard2", spot: "gate" });
  });
});

describe("presentation nodes (spec 02 B4.4)", () => {
  it("say, play_animation, sound (finite and loop), sound_stop, stop_walk, cutscene", () => {
    const { engine, adapter } = single([
      entry("e", ["a"]),
      { id: "a", type: "play_animation", entity: "owl", animation: "wave", next: ["s1"] },
      { id: "s1", type: "sound_play", entity: "owl", sound: "hoot", next: ["s2"] },
      { id: "s2", type: "sound_play", entity: "owl", sound: "hoot", times: 2, volume: 0.5, next: ["s3"] },
      { id: "s3", type: "sound_play", entity: "room", sound: "rain", times: "loop", next: ["s4"] },
      { id: "s4", type: "sound_stop", entity: "room", sound: "rain", next: ["sw"] },
      { id: "sw", type: "stop_walk", actor: "hero", next: ["c1"] },
      { id: "c1", type: "cutscene", name: "storm", next: ["c2"] },
      { id: "c2", type: "cutscene", name: "storm", hold: true, next: ["sy"] },
      say("sy"),
    ]);
    engine.run("g#e");
    expect(adapter.types()).toEqual(["PlayAnimation", "PlaySound", "PlaySound", "PlaySound", "StopSound", "StopWalk", "PlayCutscene", "PlayCutscene", "Say"]);
    const sounds = adapter.log.filter((c) => c.type === "PlaySound") as Array<Extract<Command, { type: "PlaySound" }>>;
    expect(sounds.map((s) => [s.times, s.volume])).toEqual([[1, 1], [2, 0.5], ["loop", 1]]);
    expect(engine.pendingCommands().map((c) => c.type)).toEqual(["Say"]);
  });

  it("input_lock / input_unlock; unlock without lock warns; leaked locks are released at run end", () => {
    const { engine } = single([
      entry("e", ["l"]),
      { id: "l", type: "input_lock", next: ["u"] },
      { id: "u", type: "input_unlock", next: ["u2"] },
      { id: "u2", type: "input_unlock" },
      entry("leak", ["l2"]),
      { id: "l2", type: "input_lock" },
    ]);
    engine.run("g#e");
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-UNLOCK-WITHOUT-LOCK"]);
    engine.run("g#leak");
    expect(engine.modal.isModal).toBe(false);
    expect(engine.warnings.map((w) => w.code)).toContain("W-LOCK-LEAK");
  });

  it("unknown node types (lenient) and edges to unknown nodes warn and fail", () => {
    const { engine } = single(
      [entry("e", ["x"]), { id: "x", type: "teleport" } as unknown as NodeDef, entry("e2", ["missing"])],
      { mode: "lenient" },
    );
    engine.run("g#e");
    expect(lastResult(engine)).toBe(false);
    engine.run("g#e2");
    expect(lastResult(engine)).toBe(false);
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-UNKNOWN-NODE", "W-RUNTIME-REF"]);
  });
});

describe("dialogs (spec 02 B7, decision B-08)", () => {
  const dialogPkg = (nodes: NodeDef[], owner?: string) =>
    basePackage([{ id: "dg", kind: "dialog", ...(owner !== undefined ? { owner } : {}), nodes }, graph("g", [entry("e", ["t"]), { id: "t", type: "talk", actor: "hero", target: "owl" }])], {
      actors: [
        { id: "hero", scene: "room", entry: null, variants: { default: {} } },
        { id: "owl", scene: "room", entry: null, dialog: "dg#first", variants: { default: {} } },
      ],
    });

  it("TS-B21–B25: choice filtering, side branches, chosen option, end_dialog replace, push/pop", () => {
    const { engine, adapter } = harness(
      dialogPkg([
        { id: "first", type: "entry", name: "first", modal: true, next: ["menu"] },
        { id: "menu", type: "choice", next: ["o1", "gq", "side", "o_npc"] },
        say("o1", "hero", ["end"]),
        guard("gq", "unlocked", true, ["o2"]),
        say("o2", "hero"),
        set("side", "side_ran"),
        say("o_npc", "owl", ["push"]),
        { id: "push", type: "dialog_push", actor: "owl", entryName: "deep", next: ["pop", "pop2"] },
        { id: "pop", type: "dialog_pop", actor: "owl" },
        { id: "pop2", type: "dialog_pop", actor: "owl" },
        { id: "end", type: "end_dialog", next: ["gnext", "say_after"] },
        guard("gnext", "never", true, ["deep"]),
        say("say_after", "owl", ["again"]),
        { id: "again", type: "entry", name: "again", next: [] },
        { id: "deep", type: "entry", name: "deep", next: [] },
      ]),
    );
    engine.run("g#e");
    const choose = pending(engine, "Choose") as Extract<Command, { type: "Choose" }>;
    expect(choose.options.map((o) => o.id)).toEqual(["o1", "o_npc"]);
    expect(engine.globals.has("side_ran")).toBe(false);
    engine.reply(choose.cmdId, { kind: "choice", optionId: "o1" });
    expect(engine.globals.get("side_ran")).toBe(true);
    expect(adapter.log.some((c) => c.type === "Say" && c.nodeId === "o1")).toBe(false);
    engine.reply(pending(engine, "DialogEnd").cmdId, { kind: "done" });
    // say_after is executed (non-entry); deep is behind a false guard.
    engine.reply(pending(engine, "Say", "say_after").cmdId, { kind: "done" });
    expect(engine.world.actors.get("owl")?.dialogStack).toEqual(["dg#first"]);
    expect(lastResult(engine)).toBe(true);

    engine.run("g#e");
    engine.reply(pending(engine, "Choose").cmdId, { kind: "choice", optionId: "o_npc" });
    // NPC option is displayed after being chosen.
    engine.reply(pending(engine, "Say", "o_npc").cmdId, { kind: "done" });
    expect(engine.world.actors.get("owl")?.dialogStack).toEqual(["dg#first"]);
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-DIALOG-POP-LAST"]);
  });

  it("end_dialog replaces the top with the last next entry (B-08)", () => {
    const { engine } = harness(
      dialogPkg([
        { id: "first", type: "entry", name: "first", next: ["end"] },
        { id: "end", type: "end_dialog", next: ["n1", "n2"] },
        { id: "n1", type: "entry", name: "n1" },
        { id: "n2", type: "entry", name: "n2" },
      ]),
    );
    engine.run("g#e");
    expect(engine.world.actors.get("owl")?.dialogStack).toEqual(["dg#n2"]);
  });

  it("TS-B26: an empty choice sends no Choose, warns and continues with side branches", () => {
    const { engine, adapter } = harness(
      dialogPkg([{ id: "first", type: "entry", name: "first", next: ["menu"] }, { id: "menu", type: "choice", next: ["gq", "side"] }, guard("gq", "nope", true, ["o"]), say("o", "hero"), set("side", "side_ran")]),
    );
    engine.run("g#e");
    expect(adapter.types()).not.toContain("Choose");
    expect(engine.globals.get("side_ran")).toBe(true);
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-CHOICE-EMPTY-RUNTIME"]);
    expect(lastResult(engine)).toBe(true);
  });

  it("end_dialog without owner warns; graph owner is used when no talk is involved", () => {
    const nodes: NodeDef[] = [{ id: "first", type: "entry", name: "first", next: ["end"] }, { id: "end", type: "end_dialog", next: ["n1"] }, { id: "n1", type: "entry", name: "n1" }];
    const { engine } = harness(dialogPkg(nodes));
    engine.run("dg#first");
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-DIALOG-NO-OWNER"]);
    const { engine: e2 } = harness(dialogPkg(nodes, "owl"));
    e2.run("dg#first");
    expect(e2.world.actors.get("owl")?.dialogStack).toEqual(["dg#n1"]);
  });

  it("dialog_push with a full ref; failures with unknown entry/actor (lenient)", () => {
    const { engine } = harness(
      dialogPkg([
        { id: "first", type: "entry", name: "first", next: ["p"] },
        { id: "p", type: "dialog_push", actor: "owl", entryName: "dg#other" },
        { id: "other", type: "entry", name: "other" },
        { id: "badE", type: "entry", name: "badE", next: ["p2"] },
        { id: "p2", type: "dialog_push", actor: "owl", entryName: "nowhere" },
        { id: "badA", type: "entry", name: "badA", next: ["p3"] },
        { id: "p3", type: "dialog_push", actor: "ghost", entryName: "other" },
        { id: "badP", type: "entry", name: "badP", next: ["p4"] },
        { id: "p4", type: "dialog_pop", actor: "ghost" },
      ]),
      { mode: "lenient" },
    );
    engine.run("dg#first");
    expect(engine.world.actors.get("owl")?.dialogStack).toEqual(["dg#first", "dg#other"]);
    for (const e of ["badE", "badA", "badP"]) {
      engine.run(`dg#${e}`);
      expect(lastResult(engine)).toBe(false);
    }
  });

  it("choice walk warns about edges to unknown nodes and deduplicates options", () => {
    const { engine } = harness(
      dialogPkg([{ id: "first", type: "entry", name: "first", next: ["menu"] }, { id: "menu", type: "choice", next: ["ghost", "o", "o"] }, say("o", "hero")]),
      { mode: "lenient" },
    );
    engine.run("g#e");
    const choose = pending(engine, "Choose") as Extract<Command, { type: "Choose" }>;
    expect(choose.options.map((o) => o.id)).toEqual(["o"]);
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-RUNTIME-REF"]);
  });
});

describe("commands, replies, watchdog (spec 06 F1, TS-A10)", () => {
  it("replies are validated; unknown command ids throw", () => {
    const { engine } = single([entry("e", ["c"]), { id: "c", type: "choice", next: ["o"] }, say("o", "hero"), entry("e2", ["s"]), say("s"), entry("e3", ["a"]), { id: "a", type: "play_animation", entity: "owl", animation: "x" }], {
      await: ["PlayAnimation"],
    });
    engine.run("g#e");
    const ch = pending(engine, "Choose");
    expect(() => engine.reply(ch.cmdId, { kind: "done" })).toThrow(EngineError);
    expect(() => engine.reply(ch.cmdId, { kind: "choice", optionId: "nope" })).toThrow(EngineError);
    engine.run("g#e2");
    expect(() => engine.reply(pending(engine, "Say").cmdId, { kind: "failed" })).toThrow(EngineError);
    engine.run("g#e3");
    expect(() => engine.reply(pending(engine, "PlayAnimation").cmdId, { kind: "choice", optionId: "x" })).toThrow(EngineError);
    expect(() => engine.reply("c999", { kind: "done" })).toThrow(/no pending command/);
  });

  it("awaited non-player commands time out with a warning and auto-done", () => {
    const { engine } = single([entry("e", ["a"]), { id: "a", type: "play_animation", entity: "owl", animation: "x", next: ["s"] }, set("s", "after")], { await: ["PlayAnimation"] });
    engine.run("g#e");
    engine.advance(29999);
    expect(engine.globals.has("after")).toBe(false);
    engine.advance(1);
    expect(engine.globals.get("after")).toBe(true);
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-COMMAND-TIMEOUT"]);
  });

  it("TS-A10: watchdog warns about a Say waiting 60 s in dev mode and keeps waiting", () => {
    const { engine } = single([entry("e", ["s", "a"]), say("s"), { id: "a", type: "play_animation", entity: "owl", animation: "x" }], { devMode: true });
    engine.run("g#e");
    engine.advance(60000);
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-WATCHDOG"]);
    expect(engine.pendingCommands().map((c) => c.type)).toEqual(["Say"]);
    const { engine: prod } = single([entry("e", ["s"]), say("s")]);
    prod.run("g#e");
    prod.advance(120000);
    expect(prod.warnings).toEqual([]);
  });

  it("unknown entries throw; synthetic node ids must start with $", () => {
    const { engine } = single([entry("e")]);
    expect(() => engine.run("g#nope")).toThrow(/unknown entry/);
    const runtime = (engine as unknown as { runtime: { addSyntheticNodes(n: NodeDef[]): void } }).runtime;
    expect(() => runtime.addSyntheticNodes([{ id: "plain", type: "join" }])).toThrow(/must start with/);
    runtime.addSyntheticNodes([{ id: "$s.e", type: "entry", name: "$s", next: [{ to: "$s.x", order: 1 }, { to: "$s.y" }] }, { id: "$s.x", type: "join" }, { id: "$s.y", type: "set", var: "syn", value: 1 }]);
    engine.run("$s.e");
    expect(engine.globals.get("syn")).toBe(1);
  });
});

describe("events and lifecycle (spec 01 A1/A4)", () => {
  it("TS-A06: events reach the receiver's entry with the documented context", () => {
    const pkg = basePackage(
      [graph("gl", [entry("ge", ["c"]), { id: "c", type: "guard", expr: { eq: [{ var: "$action" }, { const: "game.start" }] }, next: ["s"] }, set("s", "game_started")]), graph("sl", [entry("se", ["c2"]), { id: "c2", type: "guard", expr: { eq: [{ var: "$from" }, { const: false }] }, next: ["s2"] }, set("s2", "scene_entered")])],
      {
        game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: "gl#ge" },
        scenes: [{ id: "room", entry: "sl#se", spots: { a: { x: 0, y: 0 } }, defaultSpot: "a" }],
        actors: [{ id: "hero", scene: "room", entry: null, variants: { default: {} } }],
        objects: [],
      },
    );
    const { engine, adapter } = harness(pkg);
    engine.newGame();
    expect(engine.events.map((e) => `${e.action}:${e.receiver}`)).toEqual(["scene.enter:room", "game.start:$game"]);
    expect(adapter.types()).toEqual(["SceneFade"]);
    expect(engine.globalWrites).toEqual(["scene_entered", "game_started"]);
  });

  it("unknown receivers fail; dangling entries (lenient) are treated as no logic", () => {
    const pkg = basePackage([graph("g", [entry("e")])], { objects: [{ id: "box", container: { kind: "scene", id: "room" }, entry: "g#gone", variants: { default: {} } }] });
    const { engine } = harness(pkg, { mode: "lenient" });
    engine.event("ghost", "interact");
    expect(lastResult(engine)).toBe(false);
    engine.event("box", "interact");
    expect(lastResult(engine)).toBe(true);
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-RUNTIME-REF", "W-RUNTIME-REF"]);
    engine.event("$game", "game.save");
    expect(lastResult(engine)).toBe(true);
  });

  it("newGame requires a player in a scene", () => {
    const pkg = basePackage([], { game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da" } });
    const { engine } = harness(pkg);
    expect(() => engine.newGame()).toThrow(/player/);
  });
});
