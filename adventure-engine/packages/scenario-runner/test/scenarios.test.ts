import { describe, expect, it } from "vitest";
import { SUPPORTED_SCENARIOS, listScenarios, readGolden, readScenario, runScenario, type Scenario, type Step } from "../src/index.ts";

describe("supported scenarios (spec 10, scenarios/*.json)", () => {
  it.each(SUPPORTED_SCENARIOS)("%s passes and matches its golden trace byte for byte", (name) => {
    const result = runScenario(readScenario(name));
    expect(result.error?.message ?? null).toBeNull();
    expect(result.passed).toBe(true);
    const golden = readGolden(name);
    expect(golden, `golden trace for ${name} is missing`).not.toBeNull();
    expect(result.trace).toBe(golden);
  });

  it("traces are byte-identical across independent runs (TS-B05)", () => {
    for (const name of SUPPORTED_SCENARIOS) {
      const a = runScenario(readScenario(name), { verifyDeterminism: false });
      const b = runScenario(readScenario(name), { verifyDeterminism: false });
      expect(a.trace).toBe(b.trace);
    }
  });

  it("every scenario file is supported (phase 5 implemented the last one, save/load)", () => {
    expect(listScenarios().filter((n) => !SUPPORTED_SCENARIOS.includes(n))).toEqual([]);
    expect(SUPPORTED_SCENARIOS).toContain("save-roundtrip-and-corrupt");
  });
});

const tiny = (steps: Step[], extra: Partial<Scenario> = {}): Scenario => ({
  scenario: "tiny",
  harness: "graph",
  content: {
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da" },
    actors: [{ id: "n", scene: null, entry: null, variants: { default: {} } }],
    graphs: [{ id: "g", kind: "logic", nodes: [{ id: "e", type: "entry", name: "main", next: ["s"] }, { id: "s", type: "say", speaker: "n", textKey: "k" }, { id: "orphan", type: "join" }] }],
    i18n: { da: { k: "x" } },
  },
  steps,
  ...extra,
});

describe("runner strictness", () => {
  it("unknown do/expect, unknown fields and malformed steps are format errors", () => {
    const cases: Step[][] = [[{ do: "fly" }], [{ expect: "magic" }], [{ do: "run", entry: "g#main", extra: 1 }], [{ do: "run", expect: "modal" }], [{}]];
    for (const steps of cases) {
      const r = runScenario(tiny(steps));
      expect(r.passed).toBe(false);
      expect(r.error?.kind).toBe("format");
    }
    expect(runScenario({ ...tiny([]), harness: "other" as "graph" }).error?.kind).toBe("format");
    expect(runScenario({ ...tiny([]), steps: 3 as unknown as Step[] }).error?.kind).toBe("format");
    expect(runScenario(null as unknown as Scenario).error?.kind).toBe("format");
    // Phase 5: save/load operations are supported; misuse is a format or expectation error.
    expect(runScenario({ ...tiny([]), contentRef: "x.json" }).error?.kind).toBe("format");
    expect(runScenario({ ...tiny([]), contentRef: "../escape.json" }).error?.message).toMatch(/invalid contentRef/);
    expect(runScenario({ ...tiny([]), contentPatch: 3 }).error?.message).toMatch(/contentPatch must be an object/);
    expect(runScenario({ ...tiny([]), contentPatch: { "game.nothing.deeper": 1 } }).error?.message).toMatch(/does not exist/);
    expect(runScenario({ ...tiny([]), contentPatch: { "game.id+": [1] } }).error?.message).toMatch(/needs an array/);
    expect(runScenario(tiny([{ do: "load", slot: "a" }])).error?.message).toMatch(/holds no valid save \(empty\)/);
    expect(runScenario(tiny([{ do: "releaseModalForTest" }])).error?.message).toMatch(/without acquireModalForTest/);
    expect(runScenario(tiny([{ do: "acquireModalForTest" }, { do: "acquireModalForTest" }])).error?.message).toMatch(/twice/);
    expect(runScenario(tiny([{ do: "loadFixture", fixture: "../x" }])).error?.message).toMatch(/invalid fixture name/);
    expect(runScenario(tiny([{ do: "clickInventory" }])).error?.message).toMatch(/object must be a string/);
    expect(runScenario(tiny([{ do: "run" }])).error?.message).toMatch(/missing entry/);
  });

  it("failing expectations report the step and reason", () => {
    const failing: Step[][] = [
      [{ do: "run", entry: "g#main" }, { expect: "runResult", value: true }],
      [{ do: "run", entry: "g#main" }, { expect: "modal", value: true }],
      [{ expect: "lastCommand", type: "Say" }],
      [{ do: "run", entry: "g#main" }, { expect: "lastCommand", type: "Choose" }],
      [{ do: "run", entry: "g#main" }, { expect: "lastCommand", nodeId: "zz" }],
      [{ do: "run", entry: "g#main" }, { expect: "lastCommand", optionIds: ["a"] }],
      [{ do: "run", entry: "g#main" }, { expect: "noCommand", nodeId: "s" }],
      [{ expect: "noCommand" }],
      [{ do: "run", entry: "g#main" }, { expect: "commands", sequence: [{ type: "Choose" }] }],
      [{ do: "run", entry: "g#main" }, { expect: "commands", sequence: [{ type: "Say" }, { type: "Say" }], exhaustive: true }],
      [{ do: "run", entry: "g#main" }, { expect: "commands", contains: [{ type: "React" }] }],
      [{ do: "run", entry: "g#main" }, { expect: "commands", lacks: [{ type: "Say" }] }],
      [{ do: "run", entry: "g#main" }, { expect: "commands", contains: 3 }],
      [{ expect: "globals", equals: { x: 1 } }],
      [{ do: "setGlobal", name: "x", value: 2 }, { expect: "globals", equals: { x: 1 } }],
      [{ do: "setGlobal", name: "x", value: 2 }, { expect: "globals", lacks: ["x"] }],
      [{ expect: "globalWriteOrder", equals: ["x"] }],
      [{ expect: "globalsDeterministic", name: "x" }],
      [{ expect: "nodeExecutions", nodeId: "s", count: 1 }],
      [{ expect: "dialogStack", actor: "ghost", equals: [] }],
      [{ expect: "dialogStack", actor: "n", equals: ["x"] }],
      [{ expect: "warning", code: "W-X" }],
      [{ expect: "warning", code: "W-X", phase: "validation" }],
      [{ expect: "runResult", entity: "n", value: true }],
      [{ do: "done", nodeId: "zz" }],
      [{ do: "confirmSay" }],
      [{ do: "choose", option: "zz" }],
      [{ expect: "commandsSinceLastClick", contains: [{ type: "Say" }] }],
    ];
    for (const steps of failing) {
      const r = runScenario(tiny(steps));
      expect(r.passed, JSON.stringify(steps)).toBe(false);
      expect(["expectation", "format"]).toContain(r.error?.kind);
      expect(r.error?.message).toMatch(/^step \d+ \((do|expect): /);
    }
  });

  it("passing steps of every implemented kind", () => {
    const r = runScenario(
      tiny([
        { do: "run", entry: "g#main", ctx: { $action: "x" } },
        { expect: "commands", sequence: [{ type: "Say" }] },
        { expect: "commands", sequence: [{ type: "Say", nodeId: "s" }], exhaustive: true, contains: [{ type: "Say" }], lacks: [{ type: "React" }] },
        { expect: "commandsSinceLastClick", contains: [{ type: "Say" }], lacks: [{ type: "Choose" }] },
        { expect: "lastCommand", type: "Say", nodeId: "s" },
        { expect: "noCommand", type: "Choose" },
        { do: "done", nodeId: "s" },
        { expect: "runResult", value: true },
        { do: "setGlobal", name: "x", value: 2 },
        { expect: "globals", equals: { x: 2 }, lacks: ["y"] },
        { expect: "globalWriteOrder", equals: ["x"] },
        { expect: "globalsDeterministic", name: "x" },
        { expect: "nodeExecutions", nodeId: "s", count: 1 },
        { expect: "dialogStack", actor: "n", equals: [] },
        { do: "advance", ms: 10 },
        { do: "runUntilIdle", note: "documentation fields are allowed" },
        { expect: "warning", code: "W-UNREACHABLE", phase: "validation" },
        { do: "run", entry: "g#main" },
        { do: "confirmSay" },
        { expect: "modal", value: false },
      ]),
    );
    expect(r.error?.message ?? null).toBeNull();
    expect(r.passed).toBe(true);
  });

  it("validation runs in the requested mode", () => {
    const broken = tiny([{ do: "run", entry: "g#main" }]);
    (broken.content as { graphs: Array<{ nodes: Array<Record<string, unknown>> }> }).graphs[0]?.nodes.push({ id: "bad", type: "say", speaker: "ghost", textKey: "k" });
    expect(runScenario(broken).error?.message).toMatch(/E-REF/);
    expect(runScenario(broken, { mode: "lenient" }).passed).toBe(true);
  });

  it("statistic validates its arguments and detects non-uniform outcomes", () => {
    const content = {
      game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da" },
      graphs: [
        {
          id: "g",
          kind: "logic",
          nodes: [
            { id: "e", type: "entry", name: "main", next: ["r"] },
            { id: "r", type: "random", next: ["a", "b"] },
            { id: "a", type: "set", var: "v", value: 1 },
            { id: "b", type: "set", var: "v", value: 1 },
          ],
        },
      ],
    };
    const stat = (expect: unknown, runs = 200, fresh = true): Scenario => ({ scenario: "s", harness: "graph", content, steps: [{ do: "statistic", entry: "g#main", runs, freshSeedEach: fresh, expect }] });
    expect(runScenario(stat({ var: "v", values: [1, 2], chiSquaredMinP: 0.01 })).error?.message).toMatch(/not uniform/);
    expect(runScenario(stat({ var: "v", values: [2], chiSquaredMinP: 0.01 })).error?.message).toMatch(/unexpected v=1/);
    expect(runScenario(stat({ var: "v", values: [1], chiSquaredMinP: 0.01 }, 0)).error?.kind).toBe("format");
    expect(runScenario(stat({ var: "v", values: [1], chiSquaredMinP: 0.01 }, 5, false)).passed).toBe(true);
  });
});
