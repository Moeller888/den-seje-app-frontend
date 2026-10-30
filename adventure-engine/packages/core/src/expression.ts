import type { Expr, Value } from "@adventure-engine/content";
import { RuntimeCode, type RuntimeCodeValue } from "./errors.ts";
import { isTruthy, valuesEqual } from "./values.ts";

export type Lookup = (name: string) => Value;
export type Warn = (code: RuntimeCodeValue, message: string) => void;

const COMPARE = {
  lt: (a: number, b: number) => a < b,
  lte: (a: number, b: number) => a <= b,
  gt: (a: number, b: number) => a > b,
  gte: (a: number, b: number) => a >= b,
} as const;

type Frame = { expr: Expr; stage: number; acc: Value[] };

/**
 * Evaluate an expression (spec 02 B5) without recursion.
 * `and`/`or` short-circuit left to right; expressions have no side effects.
 */
export function evaluate(root: Expr, get: Lookup, warn: Warn): Value {
  const stack: Frame[] = [{ expr: root, stage: 0, acc: [] }];
  let result: Value = false;
  let returning = false;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as Frame;
    if (returning) {
      frame.acc.push(result);
      returning = false;
    }
    const e = frame.expr as Record<string, unknown>;
    const op = Object.keys(e)[0];
    const done = (v: Value): void => {
      stack.pop();
      result = v;
      returning = true;
    };
    const push = (child: unknown): void => {
      stack.push({ expr: child as Expr, stage: 0, acc: [] });
    };

    switch (op) {
      case "const":
        done(e["const"] as Value);
        break;
      case "var":
        done(get(e["var"] as string));
        break;
      case "not":
        if (frame.acc.length === 0) push(e["not"]);
        else done(!isTruthy(frame.acc[0] as Value));
        break;
      case "and":
      case "or": {
        const args = e[op] as readonly Expr[];
        const last = frame.acc[frame.acc.length - 1];
        if (last !== undefined) {
          const t = isTruthy(last);
          if (op === "and" ? !t : t) {
            done(op === "or");
            break;
          }
        }
        if (frame.acc.length < args.length) push(args[frame.acc.length]);
        else done(op === "and");
        break;
      }
      case "eq":
      case "neq":
      case "lt":
      case "lte":
      case "gt":
      case "gte": {
        const args = e[op] as readonly [Expr, Expr];
        if (frame.acc.length < 2) {
          push(args[frame.acc.length]);
          break;
        }
        const [a, b] = frame.acc as [Value, Value];
        if (op === "eq") done(valuesEqual(a, b));
        else if (op === "neq") done(!valuesEqual(a, b));
        else if (typeof a === "number" && typeof b === "number") done(COMPARE[op](a, b));
        else {
          warn(RuntimeCode.ExprNonNumeric, `${op} needs numeric operands, got ${JSON.stringify(a)} and ${JSON.stringify(b)}`);
          done(false);
        }
        break;
      }
      default:
        warn(RuntimeCode.ExprInvalid, `invalid expression ${JSON.stringify(e)}`);
        done(false);
    }
  }
  return result;
}

export function evaluateBool(root: Expr, get: Lookup, warn: Warn): boolean {
  return isTruthy(evaluate(root, get, warn));
}
