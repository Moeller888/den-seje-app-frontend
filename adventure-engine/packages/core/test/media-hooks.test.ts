import { loadContent, type ContentPackage, type NodeDef } from "@adventure-engine/content";
import { describe, expect, it } from "vitest";
import { Engine, type Command, type Disposition, type PresentationAdapter } from "../src/index.ts";
import { basePackage, graph } from "./helpers.ts";

/** Records commands and every phase-4 notification. */
class HookAdapter implements PresentationAdapter {
  readonly log: Command[] = [];
  readonly hooks: string[] = [];
  readonly awaitTypes: Set<string>;
  constructor(awaitTypes: string[] = []) {
    this.awaitTypes = new Set(awaitTypes);
  }
  onCommand(c: Command): Disposition {
    this.log.push(c);
    return this.awaitTypes.has(c.type) ? { kind: "await" } : { kind: "auto", afterMs: 0 };
  }
  onCommandAbandoned(c: Command, reason: "timeout" | "cancelled"): void {
    this.hooks.push(`abandoned:${c.type}:${reason}`);
  }
  onRunCancelled(runId: string): void {
    this.hooks.push(`cancelled:${runId}`);
  }
  onSceneExit(scene: string): void {
    this.hooks.push(`exit:${scene}`);
  }
  onReset(): void {
    this.hooks.push("reset");
  }
}

const entry = (id: string, next: string[], modal = false): NodeDef => ({ id, type: "entry", name: id, modal, next });

function setup(nodes: NodeDef[], awaitTypes: string[] = [], extra: Partial<ContentPackage> = {}) {
  const base = basePackage([graph("g", nodes)]);
  const pkg: ContentPackage = {
    ...base,
    game: { ...base.game, languages: ["da", "en"] },
    actors: (base.actors ?? []).map((a) => (a.id === "owl" ? { ...a, variants: { default: {}, wet: { animations: { flap: "a.flap" } } } } : a)),
    animations: [{ id: "a.flap", atlas: "x", instructions: [{ op: "play", from: 0, to: 1 }], maxDuration: 700 }],
    i18n: { da: { t1: "a" }, en: { t1: "b" } },
    ...extra,
  };
  const adapter = new HookAdapter(awaitTypes);
  const engine = new Engine(loadContent(pkg, { mode: "lenient" }), { seed: "s", adapter });
  engine.newGame();
  adapter.hooks.length = 0;
  return { engine, adapter };
}

describe("phase-4 core: signals, cutscene lock, animation timeout, notifications", () => {
  it("signal delivers the `signal` event with $signal and is traced; unknown targets warn", () => {
    const { engine } = setup([entry("e", ["x"]), { id: "x", type: "set", var: "v", value: 1 }]);
    const run = engine.signal("owl", "wave");
    expect(engine.events.at(-1)).toMatchObject({ runId: run.id, action: "signal", receiver: "owl", ctx: { $signal: "wave" } });
    expect(engine.trace.some((t) => t.kind === "signal" && t["name"] === "wave")).toBe(true);
    engine.signal("ghost", "x");
    expect(engine.warnings.at(-1)?.code).toBe("W-RUNTIME-REF");
  });

  it("a cutscene locks input until its reply; cancellation releases the lock and notifies the adapter", () => {
    const { engine, adapter } = setup([entry("e", ["c"]), { id: "c", type: "cutscene", name: "storm", next: ["k"] }, { id: "k", type: "cutscene_clear" }], ["PlayCutscene"]);
    engine.run("g#e");
    expect(engine.modal.isModal).toBe(true);
    const cmd = engine.pendingCommands()[0] as Command;
    engine.reply(cmd.cmdId, { kind: "done" });
    expect(engine.modal.isModal).toBe(false);
    expect(adapter.log.map((c) => c.type).slice(-2)).toEqual(["PlayCutscene", "ClearCutscene"]);
    expect(engine.pendingCommands()).toEqual([]);
    const run = engine.run("g#e");
    expect(engine.modal.isModal).toBe(true);
    engine.cancelAllRuns("test");
    expect(engine.modal.isModal).toBe(false);
    expect(adapter.hooks).toEqual(["abandoned:PlayCutscene:cancelled", `cancelled:${run.id}`]);
  });

  it("PlayAnimation carries maxDuration as timeoutMs (current variant, then any variant); the timeout warns and notifies", () => {
    const { engine, adapter } = setup([entry("e", ["a"]), { id: "a", type: "play_animation", entity: "owl", animation: "flap", next: ["b"] }, { id: "b", type: "play_animation", entity: "owl", animation: "none" }], ["PlayAnimation"]);
    engine.run("g#e");
    expect(adapter.log.at(-1)).toMatchObject({ type: "PlayAnimation", timeoutMs: 700 });
    engine.advance(699);
    expect(adapter.hooks).toEqual([]);
    engine.advance(1);
    expect(engine.warnings.at(-1)?.code).toBe("W-COMMAND-TIMEOUT");
    expect(adapter.hooks).toEqual(["abandoned:PlayAnimation:timeout"]);
    // The second animation is unknown: no timeoutMs, the default 30 s applies.
    expect(adapter.log.at(-1)).not.toHaveProperty("timeoutMs");
    const { engine: e2, adapter: a2 } = setup([entry("e", ["a"]), { id: "a", type: "play_animation", entity: "ghost", animation: "flap" }], ["PlayAnimation"]);
    e2.run("g#e");
    expect(a2.log.at(-1)).not.toHaveProperty("timeoutMs");
  });

  it("scene exit is reported during a player transition; new game and back-to-title reset the presentation", () => {
    const { engine, adapter } = setup([entry("e", ["p"], true), { id: "p", type: "portal_use", toScene: "yard2" }]);
    engine.run("g#e");
    engine.advance(10);
    expect(adapter.hooks).toContain("exit:room");
    engine.newGame();
    engine.backToTitle();
    expect(adapter.hooks.filter((h) => h === "reset")).toHaveLength(2);
  });

  it("setLanguage switches text and world language; cutscenes ask for it; a new game keeps it", () => {
    const { engine, adapter } = setup([entry("e", ["c"]), { id: "c", type: "cutscene", name: "x" }]);
    engine.setLanguage("en");
    expect([engine.text.language, engine.world.language]).toEqual(["en", "en"]);
    engine.run("g#e");
    expect(adapter.log.at(-1)).toMatchObject({ type: "PlayCutscene", language: "en" });
    engine.newGame();
    expect(engine.world.language).toBe("en");
    const fresh = new Engine(engine.content, { seed: "s", adapter: new HookAdapter(), language: "en" });
    expect(fresh.world.language).toBe("en");
    // Adapters without the optional hooks keep working.
    const plain = new Engine(engine.content, { seed: "s", adapter: { onCommand: () => ({ kind: "await" }) } });
    plain.newGame();
    plain.run("g#e");
    plain.cancelAllRuns("x");
    expect(plain.modal.isModal).toBe(false);
  });
});
