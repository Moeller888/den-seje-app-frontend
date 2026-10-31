import { loadContent, type NodeDef } from "@adventure-engine/content";
import { describe, expect, it } from "vitest";
import { Engine, type Command, type Disposition, type PresentationAdapter } from "../src/index.ts";
import { basePackage, graph, harness, lastResult, pending } from "./helpers.ts";

const entry = (id: string, next: NodeDef["next"] = [], modal = false): NodeDef => ({ id, type: "entry", name: id, modal, next });
const say = (id: string, speaker = "owl", next: string[] = []): NodeDef => ({ id, type: "say", speaker, textKey: "t1", next });

describe("cancellation of nested runs (spec 02 B6)", () => {
  it("cancels an action's sub-run and a talk's dialog run with their parents", () => {
    const pkg = basePackage(
      [
        graph("g", [entry("e", ["i"], true), { id: "i", type: "interact", object: "box", next: ["after"] }, { id: "after", type: "set", var: "after", value: true }]),
        graph("ol", [entry("oe", ["os"]), say("os")]),
        graph("g2", [entry("e2", ["t"]), { id: "t", type: "talk", actor: "hero", target: "owl", next: ["after2"] }, { id: "after2", type: "set", var: "after2", value: true }]),
        { id: "dl", kind: "dialog", nodes: [entry("d0", ["ds"]), say("ds")] },
      ],
      {
        objects: [{ id: "box", container: { kind: "scene", id: "room" }, entry: "ol#oe", variants: { default: {} } }],
        actors: [
          { id: "hero", scene: "room", entry: null, variants: { default: {} } },
          { id: "owl", scene: "room", entry: null, dialog: "dl#d0", variants: { default: {} } },
        ],
      },
    );
    const { engine } = harness(pkg);
    engine.run("g#e");
    engine.run("g2#e2");
    expect(engine.pendingCommands().map((c) => c.nodeId)).toEqual(["os", "ds"]);
    expect(engine.activeRunCount()).toBe(4);
    engine.cancelAllRuns("load");
    expect(engine.activeRunCount()).toBe(0);
    expect(engine.modal.isModal).toBe(false);
    expect(engine.globals.has("after")).toBe(false);
    expect(engine.globals.has("after2")).toBe(false);
    // The talk event to the player (no logic) finished with true before the cancel.
    expect(engine.finishedRuns.map((r) => `${String(r.action)}:${String(r.result)}`)).toEqual([
      "talk:true",
      "null:cancelled",
      "interact:cancelled",
      "null:cancelled",
      "dialog:cancelled",
    ]);
  });

  it("cancelling clears timeout timers of awaited commands (no late timeout warning)", () => {
    const pkg = basePackage([graph("g", [entry("e", ["a"]), { id: "a", type: "play_animation", entity: "owl", animation: "x" }])]);
    const { engine } = harness(pkg, { await: ["PlayAnimation"] });
    engine.run("g#e");
    engine.cancelAllRuns("load");
    engine.advance(60000);
    expect(engine.warnings).toEqual([]);
  });

  it("queued siblings do not execute after a synchronous cancel from the presentation layer", () => {
    const pkg = basePackage([graph("g", [entry("e", ["a", "s"]), { id: "a", type: "play_animation", entity: "owl", animation: "x" }, say("s")])]);
    const content = loadContent(pkg);
    let engineRef: Engine | null = null;
    const adapter: PresentationAdapter = {
      onCommand(cmd: Command): Disposition {
        if (cmd.type === "PlayAnimation") engineRef?.cancelAllRuns("title");
        return { kind: "auto", afterMs: 0 };
      },
    };
    const engine = new Engine(content, { seed: "x", adapter });
    engineRef = engine;
    engine.run("g#e");
    expect(engine.executions.get("s")).toBeUndefined();
    expect(lastResult(engine)).toBe("cancelled");
  });
});

describe("lenient runtime references inside graphs", () => {
  it("interact with an unknown object or a dangling entry", () => {
    const pkg = basePackage(
      [graph("g", [entry("e", ["i"]), { id: "i", type: "interact", object: "ghost" }, entry("e2", ["i2"]), { id: "i2", type: "interact", object: "box" }])],
      { objects: [{ id: "box", container: { kind: "scene", id: "room" }, entry: "g#gone", variants: { default: {} } }] },
    );
    const { engine } = harness(pkg, { mode: "lenient" });
    engine.run("g#e");
    expect(lastResult(engine)).toBe(false);
    engine.run("g#e2");
    expect(lastResult(engine)).toBe(true);
    expect(engine.warnings.map((w) => w.runId)).toEqual(["r1", "r3"]);
  });

  it("$scene is false when there is no player", () => {
    const pkg = basePackage(
      [graph("g", [entry("e", ["i"]), { id: "i", type: "interact", object: "box" }]), graph("ol", [entry("oe", ["og"]), { id: "og", type: "guard", expr: { eq: [{ var: "$scene" }, { const: false }] }, next: ["os"] }, { id: "os", type: "set", var: "no_scene", value: true }])],
      { game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da" }, objects: [{ id: "box", container: { kind: "scene", id: "room" }, entry: "ol#oe", variants: { default: {} } }] },
    );
    const { engine } = harness(pkg);
    engine.run("g#e");
    expect(engine.globals.get("no_scene")).toBe(true);
  });
});

describe("talk veto and visible guarded options", () => {
  it("the speaking actor's logic can veto talk", () => {
    const pkg = basePackage(
      [graph("g", [entry("e", ["t"]), { id: "t", type: "talk", actor: "hero", target: "owl" }]), graph("hl", [entry("he", ["hr"]), { id: "hr", type: "return", value: false }])],
      { actors: [{ id: "hero", scene: "room", entry: "hl#he", variants: { default: {} } }, { id: "owl", scene: "room", entry: null, variants: { default: {} } }] },
    );
    const { engine } = harness(pkg);
    engine.run("g#e");
    expect(lastResult(engine)).toBe(false);
  });

  it("a true guard between a choice and an option shows the option", () => {
    const { engine } = harness(
      basePackage([
        graph("g", [
          entry("e", ["c"]),
          { id: "c", type: "choice", next: ["gq"] },
          { id: "gq", type: "guard", expr: { const: true }, next: ["o"] },
          say("o", "hero"),
        ]),
      ]),
    );
    engine.run("g#e");
    const ch = pending(engine, "Choose") as Extract<Command, { type: "Choose" }>;
    expect(ch.options.map((o) => o.id)).toEqual(["o"]);
    engine.reply(ch.cmdId, { kind: "choice", optionId: "o" });
    expect(lastResult(engine)).toBe(true);
  });
});
