import type { Expr, Value } from "@adventure-engine/content";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluate, evaluateBool, type RuntimeCodeValue } from "../src/index.ts";

function run(expr: Expr, vars: Record<string, Value> = {}) {
  const warnings: RuntimeCodeValue[] = [];
  const reads: string[] = [];
  const value = evaluate(
    expr,
    (n) => {
      reads.push(n);
      return vars[n] ?? false;
    },
    (code) => warnings.push(code),
  );
  return { value, warnings, reads };
}

const c = (v: Value): Expr => ({ const: v });
const v = (n: string): Expr => ({ var: n });

describe("expressions (spec 02 B5)", () => {
  it("const and var", () => {
    expect(run(c(3)).value).toBe(3);
    expect(run(v("x"), { x: "y" }).value).toBe("y");
  });

  it("eq / neq use canonical comparison", () => {
    expect(run({ eq: [c(true), c("true")] }).value).toBe(true);
    expect(run({ eq: [c(1), c(2)] }).value).toBe(false);
    expect(run({ neq: [c(1), c(2)] }).value).toBe(true);
    expect(run({ neq: [c("a"), c("a")] }).value).toBe(false);
  });

  it("not", () => {
    expect(run({ not: c(true) }).value).toBe(false);
    expect(run({ not: c("nope") }).value).toBe(true);
  });

  it("TS-B18: and/or short-circuit left to right", () => {
    const and = run({ and: [v("a"), v("b"), v("c")] }, { a: true, b: false, c: true });
    expect(and.value).toBe(false);
    expect(and.reads).toEqual(["a", "b"]);
    expect(run({ and: [c(true), c("true")] }).value).toBe(true);
    const or = run({ or: [v("a"), v("b")] }, { a: true });
    expect(or.value).toBe(true);
    expect(or.reads).toEqual(["a"]);
    expect(run({ or: [c(false), c(false)] }).value).toBe(false);
    expect(run({ and: [] }).value).toBe(true);
    expect(run({ or: [] }).value).toBe(false);
  });

  it("numeric comparisons; non-numeric operands give false + warning", () => {
    expect(run({ lt: [c(1), c(2)] }).value).toBe(true);
    expect(run({ lte: [c(2), c(2)] }).value).toBe(true);
    expect(run({ gt: [c(1), c(2)] }).value).toBe(false);
    expect(run({ gte: [c(3), c(2)] }).value).toBe(true);
    const bad = run({ lt: [c("1"), c(2)] });
    expect(bad.value).toBe(false);
    expect(bad.warnings).toEqual(["W-EXPR-NONNUMERIC"]);
  });

  it("invalid operator gives false + warning (lenient content)", () => {
    const bad = run({ xor: [c(1)] } as unknown as Expr);
    expect(bad.value).toBe(false);
    expect(bad.warnings).toEqual(["W-EXPR-INVALID"]);
  });

  it("evaluateBool applies truthiness", () => {
    expect(evaluateBool(c("true"), () => false, () => {})).toBe(true);
    expect(evaluateBool(c(1), () => false, () => {})).toBe(false);
  });

  it("deeply nested expressions do not overflow the stack", () => {
    let e: Expr = c(true);
    for (let i = 0; i < 50000; i++) e = { not: e };
    expect(run(e).value).toBe(true);
  });

  it("and/or agree with boolean logic (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 8 }), (bs) => {
        const args = bs.map((b) => c(b));
        return run({ and: args }).value === bs.every(Boolean) && run({ or: args }).value === bs.some(Boolean);
      }),
    );
  });
});
