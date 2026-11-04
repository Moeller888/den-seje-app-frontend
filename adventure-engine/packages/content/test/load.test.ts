import { describe, expect, it } from "vitest";
import {
  ContentValidationError,
  ValidationCode as C,
  interiorPoint,
  loadContent,
  pointInPolygon,
  polygonProblem,
  polygonsOverlap,
  segmentsIntersect,
  type ContentPackage,
  type NodeDef,
  type Polygon,
} from "../src/index.ts";

const sq = (x: number, y: number, s = 10): Polygon => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];

function base(over: Partial<ContentPackage> = {}): ContentPackage {
  return {
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da", "en"], defaultLanguage: "da", player: { actor: "hero" }, entry: null, globals: { lit: false } },
    scenes: [
      { id: "room", entry: null, spots: { a: { x: 1, y: 1, facing: "left" }, b: { x: 2, y: 2 } }, defaultSpot: "a", walkable: [sq(0, 0, 100)], objectZones: [{ entity: "box", polygon: sq(0, 0) }], actorZones: [{ actor: "owl", talkSpot: "b", polygon: sq(50, 50) }] },
      { id: "hall", entry: null, spots: { door: { x: 0, y: 0 } } },
    ],
    actors: [
      { id: "hero", scene: "room", spot: "a", entry: null, variants: { default: {} } },
      { id: "owl", scene: "room", entry: "g#main", dialog: "dg#hello", variants: { default: {}, wet: {} } },
    ],
    objects: [{ id: "box", nameKey: "k1", container: { kind: "scene", id: "room" }, spot: "a", entry: null, variants: { default: {} } }],
    portals: [
      { id: "p1", from: "room", to: "hall", entry: null, exitSpot: "a", entrySpot: "door" },
      { id: "p2", from: "hall", to: "room", entry: null, exitSpot: "door", entrySpot: "a" },
    ],
    graphs: [
      { id: "g", kind: "logic", nodes: [{ id: "m", type: "entry", name: "main", next: ["s"] }, { id: "s", type: "set", var: "lit", value: true, next: ["gd"] }, { id: "gd", type: "guard", expr: { eq: [{ var: "lit" }, { const: true }] } }] },
      { id: "dg", kind: "dialog", nodes: [{ id: "h", type: "entry", name: "hello", modal: true, next: ["c"] }, { id: "c", type: "choice", next: ["o"] }, { id: "o", type: "say", speaker: "hero", textKey: "k1" }] },
    ],
    i18n: { da: { k1: "Hej" }, en: { k1: "Hi" } },
    ...over,
  };
}

/** Replace the logic graph nodes. */
function withNodes(nodes: NodeDef[], over: Partial<ContentPackage> = {}): ContentPackage {
  const b = base(over);
  return { ...b, graphs: [{ id: "g", kind: "logic", nodes: [{ id: "m", type: "entry", name: "main", next: nodes.length > 0 ? [nodes[0]?.id as string] : [] }, ...nodes] }, (b.graphs ?? [])[1] as NonNullable<ContentPackage["graphs"]>[number]] };
}

function codes(pkg: unknown, mode: "strict" | "lenient" = "strict"): string[] {
  try {
    return loadContent(pkg, { mode }).diagnostics.map((d) => d.code);
  } catch (e) {
    if (e instanceof ContentValidationError) return e.diagnostics.map((d) => d.code);
    throw e;
  }
}

function errors(pkg: unknown): string[] {
  try {
    loadContent(pkg);
    return [];
  } catch (e) {
    if (e instanceof ContentValidationError) return e.diagnostics.filter((d) => d.level === "error").map((d) => d.code);
    throw e;
  }
}

describe("loading a valid package", () => {
  it("indexes nodes, entries, incoming edges and ancestors", () => {
    const c = loadContent(base());
    expect(c.mode).toBe("strict");
    expect(c.entries.get("g#main")).toBe("m");
    expect(c.resolveEntry("hello", "dg")).toBe("h");
    expect(c.resolveEntry("dg#hello")).toBe("h");
    expect(c.resolveEntry("nope", "dg")).toBeUndefined();
    expect(c.incoming.get("gd")).toEqual(["s"]);
    expect([...c.ancestors("gd")].sort()).toEqual(["m", "s"]);
    expect(c.ancestors("gd")).toBe(c.ancestors("gd"));
    expect(c.variantsOf("owl")).toEqual(["default", "wet"]);
    expect(c.variantsOf("room")).toEqual(["default"]);
    expect(c.variantsOf("ghost")).toBeUndefined();
    expect(c.hasTextKey("k1")).toBe(true);
    expect(c.diagnostics.filter((d) => d.level === "error")).toEqual([]);
  });

  it("normalizes edges with order", () => {
    const c = loadContent(withNodes([{ id: "x", type: "join", next: [{ to: "y", order: 2 }, "z"] }, { id: "y", type: "join" }, { id: "z", type: "join" }]));
    expect(c.nodes.get("x")?.edges).toEqual([{ to: "y", order: 2, position: 0 }, { to: "z", order: 0, position: 1 }]);
  });
});

describe("TS-A02 / TS-A07: strict validation rejects each error code", () => {
  it("TS-A02: an unknown reference is E-REF with a path, and no content is returned", () => {
    let err: unknown;
    try {
      loadContent(withNodes([{ id: "x", type: "interact", object: "ghost" }]));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ContentValidationError);
    const d = (err as ContentValidationError).diagnostics.find((x) => x.code === C.Ref);
    expect(d?.path).toBe("graphs[0].nodes[1].object");
    expect((err as Error).message).toMatch(/E-REF at graphs\[0\]\.nodes\[1\]\.object/);
  });

  const cases: Array<[string, unknown]> = [
    [C.Ref, withNodes([{ id: "x", type: "say", speaker: "hero", textKey: "nope" }])],
    [C.Ref, withNodes([{ id: "x", type: "join", next: ["missing"] }])],
    [C.DuplicateId, withNodes([{ id: "h", type: "join" }])],
    [C.NodeType, withNodes([{ id: "x", type: "teleport" } as unknown as NodeDef])],
    [C.NodeType, withNodes([{ id: "x", type: "say", speaker: "hero" } as unknown as NodeDef])],
    [C.Entry, base({ objects: [{ id: "box", container: { kind: "none" }, entry: "g#s", variants: { default: {} } }] })],
    [C.ReturnNext, withNodes([{ id: "x", type: "return", value: true, next: ["y"] }, { id: "y", type: "join" }])],
    [C.CtxWrite, withNodes([{ id: "x", type: "set", var: "$action", value: 1 }])],
    [C.VarName, withNodes([{ id: "x", type: "set", var: "Bad Name", value: 1 }])],
    [C.PortalArrival, base({ portals: [{ id: "p1", from: "room", to: "hall", entry: null }] })],
    [C.Polygon, base({ scenes: [{ id: "room", entry: null, walkable: [[[0, 0], [1, 1]]] }, { id: "hall", entry: null }] })],
    [C.Facing, base({ scenes: [{ id: "room", entry: null, spots: { a: { x: 0, y: 0, facing: "sideways" } } }, { id: "hall", entry: null, spots: { door: { x: 0, y: 0 } } }] })],
    [C.PlayerScene, base({ actors: [{ id: "hero", scene: null, entry: null, variants: { default: {} } }, { id: "owl", scene: "room", entry: null, variants: { default: {} } }] })],
    [C.ChoiceSet, {
      ...base(),
      graphs: [
        (base().graphs ?? [])[0],
        { id: "dg", kind: "dialog", nodes: [{ id: "h", type: "entry", name: "hello", next: ["c"] }, { id: "c", type: "choice", next: ["st"] }, { id: "st", type: "set", var: "x", value: 1, next: ["gg"] }, { id: "gg", type: "guard", expr: { const: true }, next: ["o"] }, { id: "o", type: "say", speaker: "hero", textKey: "k1" }] },
      ],
    }],
  ];
  it.each(cases)("%s", (code, pkg) => {
    expect(errors(pkg)).toContain(code);
  });

  it("TS-A08: lenient mode loads the same packages with warnings", () => {
    for (const [code, pkg] of cases) {
      const c = loadContent(pkg, { mode: "lenient" });
      expect(c.diagnostics.some((d) => d.code === code && d.level === "warning")).toBe(true);
    }
  });

  it("E-SCHEMA is fatal in every mode", () => {
    for (const bad of [null, [], { game: 1 }, { game: { id: "", languages: [], defaultLanguage: 1, globals: 3 } }]) {
      expect(() => loadContent(bad, { mode: "lenient" })).toThrow(ContentValidationError);
    }
    const shapes: unknown[] = [
      { ...base(), scenes: {} },
      { ...base(), actors: [{ noId: true }] },
      { ...base(), graphs: [{ id: "g", kind: "other", nodes: [] }] },
      { ...base(), graphs: [{ id: "g", kind: "logic", nodes: {} }] },
      { ...base(), graphs: [{ id: "g", kind: "logic", nodes: [{ id: 1 }] }] },
      { ...base(), graphs: [{ id: "g", kind: "logic", nodes: [{ id: "a", type: "join", next: [3] }] }] },
      { ...base(), graphs: [5] },
      { ...base(), i18n: { da: { k: 1 } } },
      { ...base(), game: { ...base().game, globals: { odd: {} as unknown as string } } },
    ];
    for (const s of shapes) expect(codes(s, "lenient")).toContain(C.Schema);
  });
});

describe("more reference and parameter rules", () => {
  it("parameters of every kind are checked", () => {
    const bad: NodeDef[] = [
      { id: "b1", type: "entry", name: 5 } as unknown as NodeDef,
      { id: "b2", type: "return", value: "yes" } as unknown as NodeDef,
      { id: "b3", type: "delay", minMs: -1, maxMs: 5, mode: "block" },
      { id: "b4", type: "delay", minMs: 9, maxMs: 5, mode: "later" } as unknown as NodeDef,
      { id: "b5", type: "set", var: "ok", value: {} } as unknown as NodeDef,
      { id: "b6", type: "move_object", object: "box", to: { kind: "actor", id: "ghost" } },
      { id: "b7", type: "move_object", object: 7, to: "x" } as unknown as NodeDef,
      { id: "b8", type: "use_item", item: "box", target: "owl", kind: "lick" } as unknown as NodeDef,
      { id: "b9", type: "sound_play", entity: "owl", sound: "s", times: 0 },
      { id: "b10", type: "portal_use" },
      { id: "b11", type: "set_variant", entity: "owl", variant: "dry" },
      { id: "b12", type: "walk_to", actor: "hero", spot: "nowhere" },
      { id: "b13", type: "walk_to", actor: "hero", spot: "door", scene: "room" },
      { id: "b14", type: "move_actor", actor: "owl", scene: "hall", spot: "x" },
      { id: "b15", type: "move_object", object: "box", to: { kind: "scene", id: "room" }, spot: "zz" },
      { id: "b16", type: "dialog_push", actor: "owl", entryName: 3 } as unknown as NodeDef,
      { id: "b17", type: "dialog_push", actor: "owl", entryName: "nope" },
      { id: "b18", type: "portal_lock", portal: "ghost", locked: true },
      { id: "b19", type: "talk", actor: "hero", target: "ghost" },
      { id: "b20", type: "rename", object: "box", nameKey: "zz" },
      { id: "b21", type: "move_actor", actor: "owl", scene: "ghost" },
    ];
    const c = loadContent(withNodes(bad), { mode: "lenient" });
    const byNode = (id: string) => c.diagnostics.filter((d) => d.path.includes(`nodes[${bad.findIndex((n) => n.id === id) + 1}]`)).map((d) => d.code);
    for (const n of bad) expect(byNode(n.id).length, n.id).toBeGreaterThan(0);
  });

  it("expressions are checked", () => {
    const exprs: unknown[] = [5, { a: 1, b: 2 }, { const: {} }, { var: "Bad" }, { eq: [{ const: 1 }] }, { and: [] }, { zip: 1 }];
    const nodes = exprs.map((expr, i) => ({ id: `x${i}`, type: "guard", expr }) as unknown as NodeDef);
    const c = loadContent(withNodes(nodes), { mode: "lenient" });
    for (let i = 0; i < exprs.length; i++) expect(c.diagnostics.some((d) => d.path.startsWith(`graphs[0].nodes[${i + 1}]`)), String(i)).toBe(true);
    const ok = loadContent(withNodes([{ id: "x", type: "guard", expr: { not: { or: [{ var: "$action" }, { lt: [{ const: 1 }, { const: 2 }] }] } } }]));
    expect(ok.diagnostics.filter((d) => d.level === "error")).toEqual([]);
  });

  it("world references: scenes, actors, objects, portals, zones", () => {
    const pkg = base({
      game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "xx", player: { actor: "nobody" }, entry: "g", globals: { "Bad Name": 1 } },
      scenes: [
        { id: "room", entry: "nope#x", defaultSpot: "zz", spots: {}, blockers: [[[0, 0]]], objectZones: [{ entity: "room", polygon: sq(0, 0) }, { entity: "owl", variant: "dry", nameKey: "zz", polygon: sq(0, 0) }], actorZones: [{ actor: "ghost", polygon: sq(0, 0) }, { actor: "owl", variant: "dry", talkSpot: "zz", polygon: sq(0, 0) }], triggerZones: [{ id: "t", entry: 5 as unknown as string, polygon: sq(0, 0) }] },
        { id: "hall", entry: null },
      ],
      actors: [
        { id: "hero", scene: "ghost", spot: "x", nameKey: "zz", entry: null, variants: {} },
        { id: "owl", scene: "room", entry: null, dialog: "g#main", variants: { default: {}, wet: {} } },
        { id: "box", scene: null, entry: null, variants: { default: {} } },
      ],
      objects: [{ id: "box", container: { kind: "actor", id: "ghost" }, entry: null, variants: {}, nameKey: "zz" }, { id: "bag", container: 3 as unknown as { kind: "none" }, entry: null, variants: { default: {} } }],
      portals: [{ id: "p1", from: "ghost", to: "hall", entry: null, polygon: [[0, 0]], arrivalSpot: "zz", nameKey: "zz", lockedKey: "zz" }],
    });
    const c = loadContent(pkg, { mode: "lenient" });
    const paths = c.diagnostics.map((d) => `${d.code}@${d.path}`);
    for (const expected of [
      "E-REF@game.defaultLanguage",
      "E-VAR-NAME@game.globals.Bad Name",
      "E-REF@game.player.actor",
      "E-ENTRY@game.entry",
      "E-REF@scenes[0].entry",
      "E-REF@scenes[0].defaultSpot",
      "E-POLY@scenes[0].blockers[0]",
      "E-REF@scenes[0].objectZones[0].entity",
      "E-REF@scenes[0].objectZones[1].variant",
      "E-REF@scenes[0].actorZones[0].actor",
      "E-REF@scenes[0].actorZones[1].variant",
      "E-REF@scenes[0].actorZones[1].talkSpot",
      "E-ENTRY@scenes[0].triggerZones[0].entry",
      "E-REF@actors[0].variants",
      "E-REF@actors[0].scene",
      "E-ENTRY@actors[1].dialog",
      "E-DUP-ID@objects",
      "E-REF@objects[0].container",
      "E-REF@objects[1].container",
      "E-REF@portals[0].from",
      "E-POLY@portals[0].polygon",
    ]) {
      expect(paths, expected).toContain(expected);
    }
  });

  it("duplicate ids in graphs, entries and entity lists (TS-B32)", () => {
    const pkg = {
      ...base(),
      graphs: [
        ...(base().graphs ?? []),
        { id: "g", kind: "logic", nodes: [{ id: "z1", type: "entry", name: "main" }, { id: "z2", type: "entry", name: "main" }] },
      ],
    };
    expect(errors(pkg)).toEqual(expect.arrayContaining([C.DuplicateId]));
    expect(errors(base({ scenes: [{ id: "room", entry: null, spots: { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } } }, { id: "room", entry: null }, { id: "hall", entry: null, spots: { door: { x: 0, y: 0 } } }] }))).toContain(C.DuplicateId);
  });
});

describe("warnings", () => {
  it("W-CHOICE-EMPTY, W-UNREACHABLE, W-VAR-READONLY, W-I18N-EMPTY, W-ZONE-OVERLAP", () => {
    const pkg = base({
      scenes: [
        { id: "room", entry: null, spots: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } }, objectZones: [{ entity: "box", polygon: sq(0, 0) }, { entity: "owl", polygon: sq(5, 5) }, { entity: "box", priority: 1, polygon: sq(0, 0) }, { entity: "owl", priority: 2, polygon: sq(0, 0) }] },
        { id: "hall", entry: null, spots: { door: { x: 0, y: 0 } } },
      ],
      graphs: [
        { id: "g", kind: "logic", nodes: [{ id: "m", type: "entry", name: "main", next: ["gd"] }, { id: "gd", type: "guard", expr: { var: "never_written" } }, { id: "lonely", type: "join" }] },
        { id: "dg", kind: "dialog", nodes: [{ id: "h", type: "entry", name: "hello", next: ["c", "c2"] }, { id: "c", type: "choice", next: ["gq", "ghost"] }, { id: "gq", type: "guard", expr: { const: false }, next: ["o"] }, { id: "o", type: "say", speaker: "hero", textKey: "k1" }, { id: "c2", type: "choice" }] },
      ],
      i18n: { da: { k1: "Hej", k2: " " }, en: { k1: "Hi" } },
    });
    const c = loadContent(pkg, { mode: "lenient" });
    const warn = c.diagnostics.filter((d) => d.level === "warning").map((d) => `${d.code}@${d.path}`);
    expect(warn).toEqual(
      expect.arrayContaining([
        "W-CHOICE-EMPTY@graphs[1].nodes[1]",
        "W-CHOICE-EMPTY@graphs[1].nodes[4]",
        "W-UNREACHABLE@graphs[0].nodes[2]",
        "W-VAR-READONLY@graphs[0].nodes[1].expr",
        "W-I18N-EMPTY@i18n.da.k2",
        "W-I18N-EMPTY@i18n.en.k2",
        "W-ZONE-OVERLAP@scenes[0].objectZones[1]",
      ]),
    );
    // Every overlapping pair warns unless both zones carry distinct priorities: 5 of 6 pairs here.
    expect(warn.filter((w) => w.startsWith("W-ZONE-OVERLAP"))).toHaveLength(5);
  });
});

describe("geometry", () => {
  it("segments, polygons, points", () => {
    expect(segmentsIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [1, 0], [2, 0], [3, 0])).toBe(false);
    expect(segmentsIntersect([0, 0], [2, 0], [1, 0], [3, 0])).toBe(true);
    expect(segmentsIntersect([1, 0], [3, 0], [0, 0], [2, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [1, 1], [0, 1], [1, 1])).toBe(true);
    expect(segmentsIntersect([0, 1], [1, 1], [0, 0], [1, 1])).toBe(true);
    expect(polygonProblem(sq(0, 0))).toBeNull();
    expect(polygonProblem([[0, 0], [1, 1]])).toMatch(/3 points/);
    expect(polygonProblem([[0, 0], [1, Number.NaN], [2, 2]])).toMatch(/finite/);
    expect(polygonProblem([[0, 0], [2, 2], [2, 0], [0, 2]])).toMatch(/self-intersecting/);
    expect(pointInPolygon([5, 5], sq(0, 0))).toBe(true);
    expect(pointInPolygon([10, 5], sq(0, 0))).toBe(true);
    expect(pointInPolygon([15, 5], sq(0, 0))).toBe(false);
    expect(polygonsOverlap(sq(0, 0), sq(5, 5))).toBe(true);
    expect(polygonsOverlap(sq(0, 0), sq(50, 50))).toBe(false);
    expect(polygonsOverlap(sq(0, 0, 100), sq(10, 10))).toBe(true);
    expect(pointInPolygon(interiorPoint(sq(0, 0)), sq(0, 0))).toBe(true);
    const concave: Polygon = [[0, 0], [10, 0], [10, 10], [9, 10], [9, 1], [1, 1], [1, 10], [0, 10]];
    expect(pointInPolygon(interiorPoint(concave), concave)).toBe(true);
  });
});
