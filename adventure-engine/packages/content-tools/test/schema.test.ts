import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ContentValidationError, NODE_PARAMS, loadContent, type ContentPackage } from "@adventure-engine/content";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { demoContent } from "../../app/src/demo/content.ts";
import { buildEditorFixture } from "../fixtures/build-editor-fixture.ts";
import { buildBundle } from "../src/build.ts";
import { validateSchema } from "../src/jsonschema.ts";
import { DEFINITIONS, SCHEMAS, nodeVariants, paramSchema, type Schema } from "../src/schema.ts";

const SCENARIO_DIR = join(import.meta.dirname, "../../scenario-runner/scenarios");

/** ajv (an independent JSON Schema implementation) for the same schema. */
function ajvCheck(schema: Schema, value: unknown): boolean {
  const ajv = new Ajv({ allErrors: true, unknownFormats: "ignore" });
  ajv.addKeyword("discriminator", { valid: true });
  return ajv.validate(schema as object, value) === true;
}

/** The loader's verdict on a package: accepted (strict or lenient) or rejected. */
function loaderAccepts(pkg: unknown): boolean {
  try {
    loadContent(pkg, { mode: "lenient" });
    return true;
  } catch (err) {
    if (err instanceof ContentValidationError) return false;
    throw err;
  }
}

function loaderAcceptsStrict(pkg: unknown): boolean {
  try {
    loadContent(pkg, { mode: "strict" });
    return true;
  } catch (err) {
    if (err instanceof ContentValidationError) return false;
    throw err;
  }
}

const scenarioContents = (): Array<[string, unknown]> =>
  readdirSync(SCENARIO_DIR)
    .sort()
    .map((f) => [f, (JSON.parse(readFileSync(join(SCENARIO_DIR, f), "utf8")) as { content?: unknown }).content] as [string, unknown])
    .filter(([, c]) => c !== undefined);

const contentSchema = SCHEMAS["content"] as Schema;

describe("JSON Schema ↔ engine validator (phase 6)", () => {
  it("node variants are generated from NODE_PARAMS: one variant per type, required = required parameters", () => {
    const variants = nodeVariants();
    expect(variants.map((v) => v["title"])).toEqual(Object.keys(NODE_PARAMS));
    for (const v of variants) {
      const type = v["title"] as keyof typeof NODE_PARAMS;
      const params = NODE_PARAMS[type];
      expect(v["required"]).toEqual(["id", "type", ...params.filter((p) => p.optional !== true).map((p) => p.name)]);
      expect(Object.keys(v["properties"] as object).sort()).toEqual(["id", "next", "type", ...params.map((p) => p.name)].sort());
    }
    expect((DEFINITIONS["node"] as Schema)["discriminator"]).toEqual({ propertyName: "type" });
    expect((DEFINITIONS["container"] as Schema)["discriminator"]).toEqual({ propertyName: "kind" });
    expect((DEFINITIONS["animInstr"] as Schema)["discriminator"]).toEqual({ propertyName: "op" });
    expect(paramSchema("times")).toEqual({ oneOf: [{ type: "integer", minimum: 1 }, { const: "loop" }] });
  });

  it("valid synthetic packages are accepted by the loader, this validator and ajv", () => {
    const valid: Array<[string, unknown]> = [["demo", demoContent], ["editor fixture", buildBundle(buildEditorFixture().project).bundle.content], ...scenarioContents()];
    for (const [name, pkg] of valid) {
      expect(loaderAccepts(pkg), name).toBe(true);
      expect(validateSchema(contentSchema, pkg), name).toEqual([]);
      expect(ajvCheck(contentSchema, pkg), name).toBe(true);
    }
  });

  it("the built bundle passes the bundle schema in both implementations", () => {
    const { bundle } = buildBundle(buildEditorFixture().project);
    expect(validateSchema(SCHEMAS["bundle"] as Schema, bundle)).toEqual([]);
    expect(ajvCheck(SCHEMAS["bundle"] as Schema, JSON.parse(JSON.stringify(bundle)))).toBe(true);
  });

  const base = (): ContentPackage => JSON.parse(JSON.stringify(buildBundle(buildEditorFixture().project).bundle.content)) as ContentPackage;
  type Mut = (p: Record<string, any>) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
  const invalid: Array<[string, Mut]> = [
    ["game.id missing", (p) => delete p["game"].id],
    ["no languages", (p) => (p["game"].languages = [])],
    ["unknown node type", (p) => (p["graphs"][0].nodes[0].type = "teleport")],
    ["say without textKey", (p) => delete p["graphs"][0].nodes[2].textKey],
    ["delay with an unknown mode", (p) => p["graphs"][0].nodes.push({ id: "dx", type: "delay", minMs: 1, maxMs: 2, mode: "later" })],
    ["sound_play times 0", (p) => (p["graphs"][1].nodes[2].times = 0)],
    ["negative volume", (p) => (p["graphs"][1].nodes[2].volume = -1)],
    ["boolean parameter as text", (p) => (p["graphs"][0].nodes[0].modal = "yes")],
    ["edge without target", (p) => (p["graphs"][0].nodes[0].next = [{ order: 1 }])],
    ["graph kind", (p) => (p["graphs"][0].kind = "story")],
    ["set var name", (p) => p["graphs"][0].nodes.push({ id: "sx", type: "set", var: "Bad Name", value: 1 })],
    ["i18n value not text", (p) => (p["i18n"].da["s.cellar"] = 3)],
    ["polygon with two points", (p) => (p["scenes"][0].walkable[0] = [[0, 0], [10, 0]])],
    ["unknown facing", (p) => (p["scenes"][0].spots.shelf.facing = "sideways")],
    ["container kind", (p) => (p["objects"][0].container = { kind: "box", id: "x" })],
    ["sound channel", (p) => (p["sounds"][0].channel = "radio")],
    ["animation instruction", (p) => (p["animations"][0].instructions[0] = { op: "jump", n: 1 })],
    ["scene size zero", (p) => (p["scenes"][0].size = { width: 0, height: 720 })],
  ];

  it("representative invalid packages are rejected by the loader, this validator and ajv", () => {
    expect(loaderAcceptsStrict(base())).toBe(true);
    for (const [name, mutate] of invalid) {
      const pkg = base() as unknown as Record<string, unknown>;
      mutate(pkg);
      expect(loaderAcceptsStrict(pkg), name).toBe(false);
      expect(validateSchema(contentSchema, pkg).some((i) => i.kind === "invalid"), name).toBe(true);
      expect(ajvCheck(contentSchema, pkg), name).toBe(false);
    }
  });

  it("an unknown field is reported as 'unknown' (strict error / lenient warning), ajv rejects it as additional property", () => {
    const pkg = base() as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    pkg["scenes"][0].colour = "blue";
    pkg["graphs"][0].nodes[2].mood = "happy";
    const issues = validateSchema(contentSchema, pkg);
    expect(issues).toEqual([
      { kind: "unknown", path: "graphs[0].nodes[2].mood", message: 'unknown field "mood"' },
      { kind: "unknown", path: "scenes[0].colour", message: 'unknown field "colour"' },
    ]);
    expect(ajvCheck(contentSchema, pkg)).toBe(false);
  });

  it("schema files are generated for every project file kind and the bundle", () => {
    expect(Object.keys(SCHEMAS).sort()).toEqual(["actors", "assets", "bundle", "content", "editor", "game", "graph", "i18n", "media", "migrations", "objects", "portals", "project", "scene"]);
    for (const s of Object.values(SCHEMAS)) expect(s["$schema"]).toBe("http://json-schema.org/draft-07/schema#");
  });
});

describe("validator details", () => {
  const defs = { definitions: { n: { type: "integer" } } };
  const v = (schema: Schema, value: unknown) => validateSchema({ ...defs, ...schema }, value);

  it("types, numbers, strings and arrays", () => {
    expect(v({ type: ["string", "null"] }, null)).toEqual([]);
    expect(v({ type: "number" }, 1)).toEqual([]);
    expect(v({ type: "number" }, Number.POSITIVE_INFINITY).map((i) => i.message)).toEqual(["must be a finite number"]);
    expect(v({ $ref: "#/definitions/n" }, 1.5).map((i) => i.message)).toEqual(["must be integer"]);
    expect(v({ type: "string", minLength: 3 }, "ab").map((i) => i.message)).toEqual(["must have at least 3 characters"]);
    expect(v({ type: "string", minLength: 1 }, "").map((i) => i.message)).toEqual(["must not be empty"]);
    expect(v({ type: "string", pattern: "^a" }, "b").map((i) => i.message)).toEqual(["must match ^a"]);
    expect(v({ minimum: 1, maximum: 3, exclusiveMinimum: 1 }, 1).map((i) => i.message)).toEqual(["must be > 1"]);
    expect(v({ maximum: 3 }, 4).map((i) => i.message)).toEqual(["must be <= 3"]);
    expect(v({ minimum: 2 }, 1).map((i) => i.message)).toEqual(["must be >= 2"]);
    expect(v({ type: "array", minItems: 1, maxItems: 1 }, [1, 2]).map((i) => i.message)).toEqual(["must have at most 1 items"]);
    expect(v({ type: "array", minItems: 2 }, [1]).map((i) => i.message)).toEqual(["must have at least 2 items"]);
    expect(v({ enum: ["a"] }, "b").map((i) => i.message)).toEqual(['must be one of "a"']);
    expect(v({ type: "object", additionalProperties: { type: "string" } }, { a: 1 }).map((i) => i.path)).toEqual(["a"]);
    expect(v({ type: "object" }, { a: 1 })).toEqual([]);
  });

  it("oneOf without a discriminator: none, exactly one, more than one; anyOf; discriminator on a non-object", () => {
    const one = { oneOf: [{ type: "string" }, { type: "integer" }, { type: "number" }] };
    expect(v(one, "x")).toEqual([]);
    expect(v(one, true).map((i) => i.message)).toEqual(["does not match any allowed form"]);
    expect(v(one, 2).map((i) => i.message)).toEqual(["matches more than one form"]);
    expect(v({ anyOf: [{ type: "string" }, { type: "integer" }] }, false).map((i) => i.message)).toEqual(["does not match any allowed form"]);
    const disc = { oneOf: [{ type: "object", properties: { k: { const: "a" } } }, { type: "string" }], discriminator: { propertyName: "k" } };
    expect(v(disc, "s")).toEqual([]);
    expect(v(disc, { k: "z" }).map((i) => i.path)).toEqual(["k"]);
    expect(() => validateSchema({ $ref: "#/definitions/none" }, 1)).toThrow(/unknown schema reference/);
  });
});
