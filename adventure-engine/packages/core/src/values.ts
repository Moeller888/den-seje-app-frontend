import type { Value } from "@adventure-engine/content";

/**
 * Canonical string form used for all comparisons (spec 01 A3.5):
 * true → "true", false → "false", numbers → shortest decimal form, strings unchanged.
 */
export function canonical(value: Value): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Object.is(value, -0) ? "0" : String(value);
  return value;
}

/** Truthiness (spec 02 B5.2): the value is `true` or its canonical form is "true". */
export function isTruthy(value: Value): boolean {
  return value === true || canonical(value) === "true";
}

export function valuesEqual(a: Value, b: Value): boolean {
  return canonical(a) === canonical(b);
}
