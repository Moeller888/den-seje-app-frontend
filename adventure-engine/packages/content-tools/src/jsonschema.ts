/**
 * A small JSON Schema (draft-07 subset) validator for the schemas in schema.ts.
 *
 * Supported: $ref (#/definitions/…), type (also lists, "integer"), const, enum,
 * properties, required, additionalProperties (false or a schema), items,
 * minItems, maxItems, minLength, pattern, minimum, maximum, exclusiveMinimum,
 * oneOf (with the `discriminator` annotation), anyOf.
 *
 * Unknown properties (additionalProperties: false) are reported with kind
 * "unknown" and do not make a value invalid: the caller decides whether they
 * are errors (strict) or warnings (lenient). For oneOf/anyOf a branch matches
 * when it has no "invalid" issue. The tests compare this validator with an
 * independent implementation (ajv) on the same fixtures.
 */

import type { Schema } from "./schema.ts";

export interface SchemaIssue {
  readonly kind: "invalid" | "unknown";
  /** Dotted path like the loader's diagnostics ("scenes[0].walkable[1]"). */
  readonly path: string;
  readonly message: string;
}

type Defs = Readonly<Record<string, Schema>>;

const join = (path: string, key: string | number): string =>
  typeof key === "number" ? `${path}[${key}]` : path === "" ? key : `${path}.${key}`;

function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

const typeMatches = (want: string, v: unknown): boolean => {
  const t = typeOf(v);
  if (want === "number") return t === "number" || t === "integer";
  return want === t;
};

/** Structural equality for const/enum (JSON values only). */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function validateSchema(schema: Schema, value: unknown): SchemaIssue[] {
  const defs = (schema["definitions"] ?? {}) as Defs;
  const out: SchemaIssue[] = [];
  check(schema, value, "", defs, out);
  return out;
}

const isInvalid = (issues: readonly SchemaIssue[]): boolean => issues.some((i) => i.kind === "invalid");

function check(schema: Schema, v: unknown, path: string, defs: Defs, out: SchemaIssue[]): void {
  const bad = (message: string): void => void out.push({ kind: "invalid", path, message });
  const r = schema["$ref"];
  if (typeof r === "string") {
    const target = defs[r.replace("#/definitions/", "")];
    if (target === undefined) throw new Error(`unknown schema reference ${r}`);
    check(target, v, path, defs, out);
    return;
  }
  if ("const" in schema && !same(schema["const"], v)) {
    bad(`must be ${JSON.stringify(schema["const"])}`);
    return;
  }
  const en = schema["enum"];
  if (Array.isArray(en) && !en.some((e) => same(e, v))) {
    bad(`must be one of ${en.map((e) => JSON.stringify(e)).join(", ")}`);
    return;
  }
  const type = schema["type"];
  if (type !== undefined) {
    const types = Array.isArray(type) ? (type as string[]) : [type as string];
    if (!types.some((t) => typeMatches(t, v))) {
      bad(`must be ${types.join(" or ")}`);
      return;
    }
  }
  if (typeof v === "string") {
    const min = schema["minLength"];
    if (typeof min === "number" && v.length < min) bad(min === 1 ? "must not be empty" : `must have at least ${min} characters`);
    const pattern = schema["pattern"];
    if (typeof pattern === "string" && !new RegExp(pattern).test(v)) bad(`must match ${pattern}`);
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) bad("must be a finite number");
    const min = schema["minimum"];
    if (typeof min === "number" && v < min) bad(`must be >= ${min}`);
    const max = schema["maximum"];
    if (typeof max === "number" && v > max) bad(`must be <= ${max}`);
    const emin = schema["exclusiveMinimum"];
    if (typeof emin === "number" && v <= emin) bad(`must be > ${emin}`);
  }
  if (Array.isArray(v)) {
    const minI = schema["minItems"];
    if (typeof minI === "number" && v.length < minI) bad(`must have at least ${minI} items`);
    const maxI = schema["maxItems"];
    if (typeof maxI === "number" && v.length > maxI) bad(`must have at most ${maxI} items`);
    const items = schema["items"] as Schema | undefined;
    if (items !== undefined) v.forEach((item, i) => check(items, item, join(path, i), defs, out));
  }
  if (typeOf(v) === "object") {
    const o = v as Record<string, unknown>;
    const props = (schema["properties"] ?? {}) as Readonly<Record<string, Schema>>;
    for (const name of (schema["required"] ?? []) as string[]) {
      if (!(name in o)) bad(`missing required field "${name}"`);
    }
    const additional = schema["additionalProperties"];
    for (const key of Object.keys(o).sort()) {
      // JSON.parse keeps "__proto__" as an own key; copied with plain assignment it would replace a prototype.
      if (key === "__proto__") {
        out.push({ kind: "invalid", path: join(path, key), message: 'the key "__proto__" is not allowed' });
        continue;
      }
      // Own keys only: "constructor" or "toString" must not find Object.prototype members.
      const p = Object.hasOwn(props, key) ? props[key] : undefined;
      if (p !== undefined) check(p, o[key], join(path, key), defs, out);
      else if (additional === false) out.push({ kind: "unknown", path: join(path, key), message: `unknown field "${key}"` });
      else if (typeof additional === "object" && additional !== null) check(additional as Schema, o[key], join(path, key), defs, out);
    }
  }
  const any = schema["anyOf"] as Schema[] | undefined;
  if (any !== undefined) {
    const runs = any.map((s) => attempt(s, v, path, defs));
    const ok = runs.find((issues) => !isInvalid(issues));
    if (ok === undefined) bad("does not match any allowed form");
    else out.push(...ok);
  }
  const one = schema["oneOf"] as Schema[] | undefined;
  if (one !== undefined) oneOf(schema, one, v, path, defs, out);
}

function attempt(schema: Schema, v: unknown, path: string, defs: Defs): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  check(schema, v, path, defs, issues);
  return issues;
}

/** The discriminator constant of a branch (`properties.<name>.const`), if any. */
function branchTag(branch: Schema, name: string): unknown {
  const props = branch["properties"] as Readonly<Record<string, Schema>> | undefined;
  const p = props?.[name];
  return p !== undefined && "const" in p ? p["const"] : undefined;
}

function oneOf(schema: Schema, branches: readonly Schema[], v: unknown, path: string, defs: Defs, out: SchemaIssue[]): void {
  const disc = (schema["discriminator"] as { propertyName?: string } | undefined)?.propertyName;
  if (disc !== undefined && typeOf(v) === "object") {
    const tag = (v as Record<string, unknown>)[disc];
    const branch = branches.find((b) => same(branchTag(b, disc), tag));
    if (branch === undefined) {
      const allowed = branches.map((b) => JSON.stringify(branchTag(b, disc))).join(", ");
      out.push({ kind: "invalid", path: join(path, disc), message: `unknown ${disc} ${JSON.stringify(tag)} (allowed: ${allowed})` });
      return;
    }
    check(branch, v, path, defs, out);
    return;
  }
  const runs = branches.map((s) => attempt(s, v, path, defs));
  const matching = runs.filter((issues) => !isInvalid(issues));
  if (matching.length === 1) out.push(...(matching[0] as SchemaIssue[]));
  else if (matching.length === 0) out.push({ kind: "invalid", path, message: "does not match any allowed form" });
  else out.push({ kind: "invalid", path, message: "matches more than one form" });
}
