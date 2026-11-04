import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ContextFrame, EngineError, Globals, canonical, isTruthy, lookup, valuesEqual } from "../src/index.ts";

describe("values (spec 01 A3.5, 02 B5)", () => {
  it("TS-B11: canonical string equality across types", () => {
    expect(valuesEqual(true, "true")).toBe(true);
    expect(valuesEqual(3, "3")).toBe(true);
    expect(valuesEqual(3.0, "3")).toBe(true);
    expect(valuesEqual("", false)).toBe(false);
    expect(valuesEqual(false, "false")).toBe(true);
    expect(canonical(-0)).toBe("0");
    expect(canonical(2.5)).toBe("2.5");
    expect(canonical("x")).toBe("x");
  });

  it("truthiness: true or canonical \"true\"", () => {
    expect(isTruthy(true)).toBe(true);
    expect(isTruthy("true")).toBe(true);
    expect(isTruthy(false)).toBe(false);
    expect(isTruthy(1)).toBe(false);
    expect(isTruthy("yes")).toBe(false);
  });

  it("equality is reflexive and symmetric (property)", () => {
    const value = fc.oneof(fc.boolean(), fc.integer(), fc.string());
    fc.assert(fc.property(value, value, (a, b) => valuesEqual(a, a) && valuesEqual(a, b) === valuesEqual(b, a)));
  });
});

describe("Globals (spec 01 A3)", () => {
  it("TS-B10: unknown read is false and does not create the variable", () => {
    const g = new Globals();
    expect(g.get("never")).toBe(false);
    expect(g.has("never")).toBe(false);
    expect(g.entries()).toEqual([]);
  });

  it("stores typed values and initial values", () => {
    const g = new Globals({ a: 1 });
    g.set("b", "x");
    g.set("c", false);
    expect(g.get("a")).toBe(1);
    expect(g.get("c")).toBe(false);
    expect(g.has("c")).toBe(true);
    expect(g.entries()).toEqual([["a", 1], ["b", "x"], ["c", false]]);
  });

  it("rejects writes to context keys", () => {
    expect(() => new Globals().set("$action", "x")).toThrow(EngineError);
  });
});

describe("ContextFrame (spec 02 B6.1)", () => {
  it("looks up through the parent chain, nearest wins", () => {
    const root = ContextFrame.root({ $a: 1, $b: 2 });
    const child = root.extend({ $b: 3, $c: null });
    expect(child.get("$a")).toBe(1);
    expect(child.get("$b")).toBe(3);
    expect(child.get("$c")).toBeUndefined();
    expect(child.get("$zzz")).toBeUndefined();
    expect(child.flatten()).toEqual({ $a: 1, $b: 3 });
    expect(Object.keys(ContextFrame.root({ $z: 1, $a: 2 }).flatten())).toEqual(["$a", "$z"]);
    expect(ContextFrame.root().get("$x")).toBeUndefined();
  });

  it("requires $-prefixed keys", () => {
    expect(() => ContextFrame.root({ plain: 1 })).toThrow(/must start with/);
  });

  it("lookup: $ → context (missing → false), otherwise globals", () => {
    const g = new Globals({ v: "x" });
    const ctx = ContextFrame.root({ $k: 5 });
    expect(lookup("$k", g, ctx)).toBe(5);
    expect(lookup("$missing", g, ctx)).toBe(false);
    expect(lookup("v", g, ctx)).toBe("x");
    expect(lookup("w", g, ctx)).toBe(false);
  });
});
