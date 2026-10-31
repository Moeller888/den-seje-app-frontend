import { describe, expect, it } from "vitest";
import { buildEditorFixture } from "../fixtures/build-editor-fixture.ts";
import { assetProblems, assetRefs, detectAsset, importAsset, slugId } from "../src/assets.ts";
import { validateProject } from "../src/build.ts";
import {
  addGraph,
  addNode,
  addOperand,
  changeOp,
  connect,
  copyNodes,
  defaultNode,
  disconnect,
  edgesInOrder,
  entryNode,
  exprAt,
  exprText,
  freeNodeId,
  isContextKey,
  mirrorCombination,
  moveNode,
  nodeIds,
  removeOperand,
  setEdgeOrder,
  setExprAt,
  setNodeFields,
} from "../src/graph.ts";
import { History } from "../src/history.ts";
import { addKey, allKeys, exportLanguage, fallbackText, filterRows, importLanguage, matrix, setText } from "../src/i18n.ts";
import { cameraPreview, navGraphPreview, routePreview, sceneSpace } from "../src/nav.ts";
import { deletePoint, fitView, hitPoint, insertPoint, inside, movePoint, nearestEdge, polygonIssue, sceneToScreen, screenToScene, snap, squareAt, zoomAt } from "../src/polygon.ts";
import { encodeText, newProject, withAssets, type Project } from "../src/project.ts";
import { deleteElement, isDefined, references, rename, renameKeyIn, setIn, slots } from "../src/refs.ts";
import { crc32, readZip, writeZip } from "../src/zip.ts";
import type { Expr, NodeDef, NodeType } from "@adventure-engine/content";
import { NODE_PARAMS } from "@adventure-engine/content";

const fx = () => buildEditorFixture();
const ok = (p: Project) => validateProject(withAssets(p, fx().files)).problems.filter((x) => x.level === "error");

describe("references, rename and delete (phase 6)", () => {
  it("lists every reference of an element", () => {
    const p = fx().project;
    expect(references(p, { kind: "scene", id: "cellar" }).map((s) => s.path.join("."))).toEqual(
      expect.arrayContaining(["actors.0.scene", "objects.0.container.id", "portals.0.from", "portals.1.to"]),
    );
    expect(references(p, { kind: "entity", id: "mira" }).length).toBeGreaterThan(5);
    expect(references(p, { kind: "textKey", id: "o.lamp" }).map((s) => s.path.join("."))).toEqual(["objects.0.nameKey"]);
    expect(references(p, { kind: "spot", id: "hatch", scope: "attic" }).map((s) => s.path.join("."))).toEqual(["scenes.1.defaultSpot", "portals.0.arrivalSpot", "portals.1.exitSpot"]);
    expect(references(p, { kind: "graph", id: "lamp" }).map((s) => s.value)).toEqual(["lamp#main"]);
    expect(references(p, { kind: "var", id: "seen_dawn" }).length).toBe(2);
    expect(slots(p).some((s) => s.kind === "variant" && s.value === "lit" && s.scope === "lamp")).toBe(true);
  });

  it("renames keep the project valid and update every reference (all kinds)", () => {
    const steps: Array<[Parameters<typeof rename>[1], string]> = [
      [{ kind: "scene", id: "cellar" }, "basement"],
      [{ kind: "entity", id: "mira" }, "mia"],
      [{ kind: "entity", id: "lamp" }, "lantern"],
      [{ kind: "portal", id: "up" }, "stairs_up"],
      [{ kind: "graph", id: "bo_talk" }, "bo_dialog"],
      [{ kind: "entry", id: "bo_dialog#hello" }, "greet"],
      [{ kind: "node", id: "la4" }, "lantern_taken"],
      [{ kind: "textKey", id: "o.wick" }, "obj.wick"],
      [{ kind: "asset", id: "lamp.lit" }, "lantern.lit"],
      [{ kind: "sound", id: "s.drip" }, "s.drop"],
      [{ kind: "animation", id: "anim.bo.wave" }, "anim.bo.hello"],
      [{ kind: "spot", id: "hatch", scope: "attic" }, "trapdoor"],
      [{ kind: "variant", id: "lit", scope: "lantern" }, "burning"],
      [{ kind: "var", id: "lamp_lit" }, "lantern_lit"],
    ];
    let p = fx().project;
    for (const [t, to] of steps) {
      const r = rename(p, t, to);
      if (!r.ok) throw new Error(r.message);
      expect(r.changed, `${t.kind} ${t.id}`).toBeGreaterThan(0);
      p = r.project;
    }
    expect(p.scenes.map((s) => s.id)).toEqual(["basement", "attic"]);
    expect(p.actors[1]?.dialog).toBe("bo_dialog#greet");
    expect(p.editor.nodes?.["lantern_taken"]).toBeDefined();
    expect(p.i18n["da"]?.["obj.wick"]).toBe("Væge");
    expect(p.scenes[1]?.spots?.["trapdoor"]).toBeDefined();
    expect(p.objects[0]?.variants["burning"]).toBeDefined();
    expect(p.game.globals?.["lantern_lit"]).toBe(false);
    expect(p.scenes[0]?.speechRegions?.["mia"]).toBeDefined();
    const assets = new Map(fx().files);
    expect(ok(p).filter((x) => x.code !== "E-ASSET-FILE")).toEqual([]);
    expect(assets.size).toBeGreaterThan(0);
  });

  it("rename refuses taken, empty or invalid ids, and needs a scope for spots and variants", () => {
    const p = fx().project;
    expect(rename(p, { kind: "scene", id: "cellar" }, "attic")).toMatchObject({ ok: false });
    expect(rename(p, { kind: "scene", id: "cellar" }, "")).toMatchObject({ ok: false });
    expect(rename(p, { kind: "scene", id: "cellar" }, "a b")).toMatchObject({ ok: false });
    expect(rename(p, { kind: "var", id: "lamp_lit" }, "Lamp")).toMatchObject({ ok: false });
    expect(rename(p, { kind: "spot", id: "hatch" }, "x")).toMatchObject({ ok: false });
    expect(rename(p, { kind: "entry", id: "lamp#main" }, "start")).toMatchObject({ ok: true });
    expect(rename(p, { kind: "scene", id: "cellar" }, "cellar")).toEqual({ ok: true, project: p, changed: 0 });
    expect(rename(p, { kind: "variant", id: "default", scope: "attic" }, "night")).toMatchObject({ ok: true });
  });

  it("a referenced element is never deleted silently; unreferenced ones are", () => {
    const p = fx().project;
    const blocked = deleteElement(p, { kind: "scene", id: "attic" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.blockers.length).toBeGreaterThan(0);
    expect(deleteElement(p, { kind: "asset", id: "nope" })).toMatchObject({ ok: false, blockers: [] });
    const q = setText(setText(p, "da", "unused.key", "x"), "en", "unused.key", "y");
    const cases: Array<[Parameters<typeof deleteElement>[1], (r: Project) => boolean]> = [
      [{ kind: "textKey", id: "unused.key" }, (r) => !("unused.key" in (r.i18n["da"] ?? {}))],
      [{ kind: "spot", id: "talk", scope: "attic" }, () => true],
    ];
    for (const [t, check] of cases) {
      const r = deleteElement(t.kind === "textKey" ? q : p, t);
      expect(r.ok, t.id).toBe(t.kind === "textKey");
      if (r.ok) expect(check(r.project)).toBe(true);
    }
    // Remove the references first, then everything can go.
    let free: Project = { ...p, game: { ...p.game, globals: { ...p.game.globals, spare: 1 } } };
    free = { ...free, sounds: [...free.sounds, { id: "s.spare", asset: "snd.drip", channel: "sfx" }], animations: [...free.animations, { id: "anim.spare", atlas: "atlas.bo", instructions: [] }] };
    free = addGraph(free, "spare", "logic");
    free = addNode(free, "spare", { id: "spare_n", type: "quit" }, { x: 0, y: 0 });
    free = { ...free, portals: [...free.portals, { id: "spare_portal", from: "attic", to: "cellar", entry: null }], objects: [...free.objects, { id: "spare_obj", container: { kind: "none" }, entry: null, variants: { default: {} } }] };
    free = { ...free, scenes: [...free.scenes, { id: "spare_scene", entry: null, spots: { s: { x: 1, y: 1 } } }], assets: { ...free.assets, "spare.asset": { ...(free.assets["lamp"] as NonNullable<Project["assets"][string]>) } } };
    const targets: Array<Parameters<typeof deleteElement>[1]> = [
      { kind: "var", id: "spare" },
      { kind: "sound", id: "s.spare" },
      { kind: "animation", id: "anim.spare" },
      { kind: "node", id: "spare_n" },
      { kind: "graph", id: "spare" },
      { kind: "portal", id: "spare_portal" },
      { kind: "entity", id: "spare_obj" },
      { kind: "spot", id: "s", scope: "spare_scene" },
      { kind: "scene", id: "spare_scene" },
      { kind: "asset", id: "spare.asset" },
    ];
    for (const t of targets) {
      const r = deleteElement(free, t);
      if (!r.ok) throw new Error(`${t.kind} ${t.id}: ${r.message}`);
      expect(isDefined(r.project, t), t.id).toBe(false);
      free = r.project;
    }
    expect(deleteElement(p, { kind: "variant", id: "lit", scope: "lamp" })).toMatchObject({ ok: false });
    const v = { ...p, objects: p.objects.map((o) => (o.id === "wick" ? { ...o, variants: { ...o.variants, old: {} } } : o)) };
    expect(deleteElement(v, { kind: "variant", id: "old", scope: "wick" })).toMatchObject({ ok: false, message: expect.stringContaining("where they are defined") });
  });

  it("setIn / renameKeyIn copy on write", () => {
    const o = { a: [{ b: 1 }], c: { d: 2 } };
    const n = setIn(o, ["a", 0, "b"], 5);
    expect(n).toEqual({ a: [{ b: 5 }], c: { d: 2 } });
    expect(o.a[0]?.b).toBe(1);
    expect(n.c).toBe(o.c);
    expect(renameKeyIn(o, ["c"], "d", "e")).toEqual({ a: [{ b: 1 }], c: { e: 2 } });
  });
});

describe("undo/redo history", () => {
  it("is command based: undo, redo, labels, selection, no-op commands", () => {
    const h = new History<number, string>(0, "none", 3);
    expect(h.apply("same", (d) => d, "picked")).toBe(false);
    expect(h.selection).toBe("picked");
    h.apply("+1", (d) => d + 1, "a");
    h.apply("+2", (d) => d + 2, "b");
    expect([h.doc, h.undoLabel, h.redoLabel, h.canUndo, h.canRedo]).toEqual([3, "+2", null, true, false]);
    expect(h.undo()).toBe(true);
    expect([h.doc, h.selection, h.redoLabel]).toEqual([1, "a", "+2"]);
    expect(h.redo()).toBe(true);
    expect([h.doc, h.selection]).toEqual([3, "b"]);
    expect(h.redo()).toBe(false);
    h.undo();
    h.apply("×10", (d) => d * 10, "c");
    expect([h.doc, h.canRedo]).toEqual([10, false]);
    h.select("z");
    expect(h.selection).toBe("z");
    expect(() => new History(0, 0, 0)).toThrow(RangeError);
  });

  it("tracks dirty/clean against the saved point, also across the history limit", () => {
    const h = new History<number, null>(0, null, 2);
    expect(h.dirty).toBe(false);
    h.apply("a", (d) => d + 1);
    expect(h.dirty).toBe(true);
    h.markSaved();
    expect(h.dirty).toBe(false);
    h.undo();
    expect(h.dirty).toBe(true);
    h.redo();
    expect(h.dirty).toBe(false);
    h.apply("b", (d) => d + 1);
    h.apply("c", (d) => d + 1);
    h.apply("d", (d) => d + 1);
    expect(h.canUndo).toBe(true);
    h.undo();
    h.undo();
    expect(h.undo()).toBe(false);
    expect(h.dirty).toBe(true);
    h.markSaved();
    h.apply("e", (d) => d + 1);
    h.undo();
    h.apply("f", (d) => d + 2);
    expect(h.dirty).toBe(true);
    h.reset(7, null);
    expect([h.doc, h.dirty, h.canUndo]).toEqual([7, false, false]);
    const g = new History<number, null>(0, null, 1);
    g.markSaved();
    g.apply("x", (d) => d + 1);
    g.apply("y", (d) => d + 1);
    expect(g.dirty).toBe(true);
  });

  it("undo restores renamed references exactly", () => {
    const p = fx().project;
    const h = new History(p, null);
    h.apply("rename", (d) => {
      const r = rename(d, { kind: "scene", id: "cellar" }, "basement");
      return r.ok ? r.project : d;
    });
    expect(h.doc.actors[0]?.scene).toBe("basement");
    h.undo();
    expect(h.doc).toBe(p);
  });
});

describe("polygon editing", () => {
  const sq = squareAt([100, 100], 10);
  it("view transforms, zoom around a point, fit, snap", () => {
    const v = { zoom: 2, panX: 10, panY: 20 };
    expect(sceneToScreen(v, [5, 5])).toEqual([20, 30]);
    expect(screenToScene(v, [20, 30])).toEqual([5, 5]);
    const z = zoomAt(v, 2, [20, 30]);
    expect(screenToScene(z, [20, 30])).toEqual([5, 5]);
    expect(zoomAt(v, 1000, [0, 0]).zoom).toBe(8);
    expect(zoomAt(v, 0.0001, [0, 0]).zoom).toBe(0.1);
    expect(fitView({ width: 1280, height: 720 }, { width: 672, height: 392 })).toEqual({ zoom: 0.5, panX: 16, panY: 16 });
    expect(snap([12.4, 17.6], null)).toEqual([12, 18]);
    expect(snap([12, 17], 10)).toEqual([10, 20]);
    expect(snap([12, 17], 0)).toEqual([12, 17]);
  });

  it("insert, move, delete, nearest edge, hit test and the engine's polygon rules", () => {
    expect(insertPoint(sq, 0, [100, 80])).toHaveLength(5);
    expect(insertPoint(sq, -1, [0, 0])[0]).toEqual([0, 0]);
    expect(movePoint(sq, 1, [200, 90])[1]).toEqual([200, 90]);
    expect(deletePoint(sq, 0)).toHaveLength(3);
    expect(() => movePoint(sq, 9, [0, 0])).toThrow(RangeError);
    expect(() => insertPoint(sq, 9, [0, 0])).toThrow(RangeError);
    expect(() => deletePoint(sq, -1)).toThrow(RangeError);
    expect(nearestEdge(sq, [100, 85])).toBe(0);
    expect(nearestEdge(sq, [85, 100])).toBe(3);
    expect(nearestEdge([[0, 0], [0, 0], [0, 0]], [5, 5])).toBe(0);
    expect(hitPoint(sq, [91, 91], 3)).toBe(0);
    expect(hitPoint(sq, [50, 50], 3)).toBe(-1);
    expect(polygonIssue(sq)).toBeNull();
    expect(polygonIssue([[0, 0], [1, 0]])).toMatch(/at least 3|three|3/);
    expect(polygonIssue([[0, 0], [10, 10], [10, 0], [0, 10]])).toMatch(/intersect/);
    expect(polygonIssue([[0, 0], [Number.NaN, 0], [1, 1]])).toBe("points must be finite numbers");
    expect(inside(sq, [100, 100])).toBe(true);
  });
});

describe("graph editing", () => {
  it("defaults for every node type validate structurally; ids are global and unique", () => {
    let p = fx().project;
    p = addGraph(p, "lab", "logic");
    expect(() => addGraph(p, "lab", "logic")).toThrow(RangeError);
    for (const type of Object.keys(NODE_PARAMS) as NodeType[]) {
      const id = freeNodeId(p, `n_${type}`);
      p = addNode(p, "lab", defaultNode(type, id), { x: 0, y: 0 });
    }
    expect(() => addNode(p, "lab", { id: "la0", type: "quit" }, { x: 0, y: 0 })).toThrow(/already used/);
    expect(() => addNode(p, "nope", { id: "zz", type: "quit" }, { x: 0, y: 0 })).toThrow(/no graph/);
    expect(freeNodeId(p, "la0")).toBe("la0_2");
    expect(freeNodeId(p, "!!!")).toBe("_");
    expect(nodeIds(p).size).toBe(fx().project.graphs.reduce((n, g) => n + g.nodes.length, 0) + Object.keys(NODE_PARAMS).length);
    expect(defaultNode("delay", "d")).toEqual({ id: "d", type: "delay", minMs: 0, maxMs: 0, mode: "block" });
    expect(defaultNode("entry", "e")).toEqual({ id: "e", type: "entry", name: "e" });
  });

  it("edges: connect, order shown explicitly, disconnect; fields; positions are metadata", () => {
    let p = fx().project;
    p = connect(p, "gs0", "gs2", 3);
    p = connect(p, "gs0", "gs2", 5);
    const n = p.graphs[0]?.nodes[0] as NodeDef;
    expect(edgesInOrder(n)).toEqual([
      { to: "gs1", order: 0, rank: 1 },
      { to: "gs2", order: 3, rank: 2 },
    ]);
    p = setEdgeOrder(p, "gs0", "gs2", -1);
    expect(edgesInOrder(p.graphs[0]?.nodes[0] as NodeDef)[0]).toEqual({ to: "gs2", order: -1, rank: 1 });
    p = setEdgeOrder(p, "gs0", "gs2", 0);
    expect(p.graphs[0]?.nodes[0]?.next).toEqual(["gs1", "gs2"]);
    expect(() => setEdgeOrder(p, "gs0", "gs2", Number.NaN)).toThrow(RangeError);
    expect(() => setEdgeOrder(p, "gs0", "la0", 1)).toThrow(/no edge/);
    expect(() => connect(p, "gs0", "nope")).toThrow(/no node/);
    expect(() => connect(p, "nope", "gs0")).toThrow(/no node/);
    expect(disconnect(p, "gs0", "la0")).toBe(p);
    p = disconnect(p, "gs0", "gs2");
    p = disconnect(p, "gs0", "gs1");
    expect(p.graphs[0]?.nodes[0]?.next).toBeUndefined();
    p = setNodeFields(p, "gs2", { textKey: "line.draft", extra: undefined });
    expect(p.graphs[0]?.nodes[2]).toMatchObject({ textKey: "line.draft" });
    p = setNodeFields(p, "gs0", { modal: undefined });
    expect("modal" in (p.graphs[0]?.nodes[0] as object)).toBe(false);
    expect(() => setNodeFields(p, "gs0", { id: "x" })).toThrow(RangeError);
    p = moveNode(p, "gs0", { x: 7, y: 8 });
    expect(p.editor.nodes?.["gs0"]).toEqual({ x: 7, y: 8 });
    expect(entryNode(p, "lamp#main")?.node.id).toBe("la0");
    expect(entryNode(p, "lamp#none")).toBeNull();
  });

  it("copying nodes gives fresh global ids, keeps inner edges, drops outer ones and renames entries", () => {
    const p = fx().project;
    const { project, ids } = copyNodes(p, ["la0", "la1", "la2"], "lamp");
    expect([...ids.values()]).toEqual(["la0_copy", "la1_copy", "la2_copy"]);
    const g = project.graphs.find((x) => x.id === "lamp");
    expect(g?.nodes.find((n) => n.id === "la0_copy")).toMatchObject({ name: "main_copy", next: ["la1_copy"] });
    expect(g?.nodes.find((n) => n.id === "la2_copy")?.next).toBeUndefined();
    expect(project.editor.nodes?.["la0_copy"]).toEqual({ x: (p.editor.nodes?.["la0"]?.x ?? 0) + 40, y: (p.editor.nodes?.["la0"]?.y ?? 0) + 40 });
    const twice = copyNodes(project, ["la0"], "lamp").project;
    expect(twice.graphs.find((x) => x.id === "lamp")?.nodes.some((n) => n.type === "entry" && n.name === "main_copy2")).toBe(true);
    const ordered = copyNodes(connect(p, "wi1", "wi2", 4), ["wi1", "wi2"], "wick");
    expect(ordered.project.graphs.find((x) => x.id === "wick")?.nodes.find((n) => n.id === "wi1_copy")?.next).toEqual(["wi2_copy"]);
    const withOrder = copyNodes(p, ["wi1", "wi3"], "wick");
    expect(withOrder.project.graphs.find((x) => x.id === "wick")?.nodes.find((n) => n.id === "wi1_copy")?.next).toEqual([{ to: "wi3_copy", order: 1 }]);
    expect(copyNodes({ ...p, editor: {} }, ["gs1"], "game").project.editor.nodes?.["gs1_copy"]).toEqual({ x: 40, y: 40 });
    expect(() => copyNodes(p, ["nope"], "lamp")).toThrow(/no node/);
    expect(() => copyNodes(p, ["la0"], "nope")).toThrow(/no graph/);
  });

  it("the mirror helper writes the opposite rule explicitly and never touches other graphs", () => {
    const p = fx().project;
    const wick = p.graphs.find((g) => g.id === "wick");
    const r = mirrorCombination(p, "lamp", "wick");
    expect(r.nodes).toEqual(["wick_mirror_lamp", "wick_mirror_lamp_use"]);
    const g = r.project.graphs.find((x) => x.id === "wick");
    expect(g?.nodes.find((n) => n.id === "wick_mirror_lamp_use")).toEqual({ id: "wick_mirror_lamp_use", type: "use_item", item: "lamp", target: "wick", kind: "inventory" });
    expect(g?.nodes.find((n) => n.id === "wi0")?.next).toEqual([...(wick?.nodes[0]?.next ?? []), "wick_mirror_lamp"]);
    expect(r.project.graphs.filter((x) => x.id !== "wick")).toEqual(p.graphs.filter((x) => x.id !== "wick"));
    expect(ok(r.project)).toEqual([]);
    expect(() => mirrorCombination(p, "lamp", "nope")).toThrow(/no object/);
    expect(() => mirrorCombination(p, "nope", "wick")).toThrow(/no object/);
    const noEntry = { ...p, objects: p.objects.map((o) => (o.id === "wick" ? { ...o, entry: null } : o)) };
    expect(() => mirrorCombination(noEntry, "lamp", "wick")).toThrow(/no logic entry/);
    const badEntry = { ...p, objects: p.objects.map((o) => (o.id === "wick" ? { ...o, entry: "ghost#main" } : o)) };
    expect(() => mirrorCombination(badEntry, "lamp", "wick")).toThrow(/does not exist/);
    const noPos = mirrorCombination({ ...p, editor: {} }, "lamp", "wick").project;
    expect(noPos.editor.nodes?.["wick_mirror_lamp"]).toEqual({ x: 240, y: 120 });
  });

  it("guard expressions are edited as a JSON AST", () => {
    let e: Expr = { and: [{ eq: [{ var: "$action" }, { const: "interact" }] }, { not: { var: "done" } }] };
    expect(exprText(e)).toBe('($action == "interact") and (not (done))');
    expect(exprAt(e, [1, 0])).toEqual({ var: "done" });
    e = setExprAt(e, [1, 0], { var: "seen" });
    expect(exprAt(e, [1])).toEqual({ not: { var: "seen" } });
    e = addOperand(e, []);
    expect(exprText(e)).toBe('($action == "interact") and (not (seen)) and true');
    e = removeOperand(e, [], 2);
    expect(() => addOperand(e, [0])).toThrow(/fixed/);
    expect(() => removeOperand(e, [0], 0)).toThrow(/fixed/);
    expect(() => exprAt(e, [7])).toThrow(RangeError);
    expect(() => setExprAt(e, [7], { const: 1 })).toThrow(RangeError);
    expect(changeOp(e, "or")).toEqual({ or: (e as { and: Expr[] }).and });
    expect(changeOp({ var: "x" }, "and")).toEqual({ and: [{ const: true }, { const: true }] });
    expect(changeOp(e, "not")).toEqual({ not: (e as { and: Expr[] }).and[0] });
    expect(changeOp(e, "const")).toEqual({ const: true });
    expect(changeOp(e, "var")).toEqual({ var: "flag" });
    expect(changeOp({ not: { var: "a" } }, "gte")).toEqual({ gte: [{ var: "a" }, { const: true }] });
    expect(exprText({ or: [{ lt: [{ var: "n" }, { const: 3 }] }, { neq: [{ var: "m" }, { const: false }] }] })).toBe("(n < 3) or (m != false)");
    expect([isContextKey("$target"), isContextKey("seen")]).toEqual([true, false]);
  });
});

describe("translations", () => {
  it("matrix rows show missing, empty, unused and references; search and filters", () => {
    let p = fx().project;
    p = setText(p, "en", "o.lamp", "");
    p = setText(p, "da", "only.da", "kun dansk");
    p = addKey(p, "fresh");
    expect(() => addKey(p, "fresh")).toThrow(/exists/);
    expect(() => setText(p, "sv", "x", "y")).toThrow(/unknown language/);
    expect(() => setText(p, "da", "", "y")).toThrow(/empty/);
    const rows = matrix(p);
    const row = (k: string) => rows.find((r) => r.key === k);
    expect(row("o.lamp")).toMatchObject({ empty: ["en"], missing: [], unused: false });
    expect(row("only.da")).toMatchObject({ missing: ["en"], unused: true });
    expect(row("fresh")).toMatchObject({ empty: ["da", "en"] });
    expect(filterRows(rows, "", "missing").map((r) => r.key)).toEqual(["only.da"]);
    expect(filterRows(rows, "", "empty").map((r) => r.key)).toEqual(["fresh", "o.lamp"]);
    expect(filterRows(rows, "", "unused").map((r) => r.key)).toEqual(["fresh", "only.da"]);
    expect(filterRows(rows, "", "problems").map((r) => r.key)).toEqual(["fresh", "o.lamp", "only.da"]);
    expect(filterRows(rows, "VÆGE", "all").map((r) => r.key)).toEqual(["line.lamp_taken", "o.wick"]);
    expect(filterRows(rows, "o.wi", "all").map((r) => r.key)).toEqual(["o.wick"]);
    expect(filterRows(rows, "", "all")).toHaveLength(rows.length);
    const referencedOnly = { ...p, objects: p.objects.map((o) => (o.id === "wick" ? { ...o, nameKey: "o.ghost" } : o)) };
    expect(allKeys(referencedOnly)).toContain("o.ghost");
  });

  it("fallback preview follows the engine (language → fallback language; empty counts as missing)", () => {
    let p = fx().project;
    p = { ...p, game: { ...p.game, fallbackLanguage: "da" } };
    p = setText(p, "en", "o.lamp", "  ");
    expect(fallbackText(p, "o.lamp", "en")).toEqual({ text: "Lampe", from: "da" });
    expect(fallbackText(p, "o.wick", "en")).toEqual({ text: "Wick", from: "en" });
    expect(fallbackText(p, "nothing", "en")).toBeNull();
  });

  it("import and export use the engine's JSON format", () => {
    const p = fx().project;
    const out = exportLanguage(p, "da");
    expect(Object.keys(out)).toEqual([...Object.keys(out)].sort());
    const q = importLanguage(p, "en", JSON.stringify({ "o.lamp": "Lantern", "new.key": "New" }));
    expect(q.i18n["en"]?.["o.lamp"]).toBe("Lantern");
    expect(q.i18n["en"]?.["o.wick"]).toBe("Wick");
    expect(() => importLanguage(p, "en", "{")).toThrow(/not valid JSON/);
    expect(() => importLanguage(p, "en", JSON.stringify({ a: 1 }))).toThrow(/maps text keys/);
    expect(() => importLanguage(p, "en", "[]")).toThrow(/maps text keys/);
    expect(exportLanguage({ ...p, i18n: {} }, "da")).toEqual({});
  });
});

describe("assets", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const riff = (kind: string) => new Uint8Array([...encodeText("RIFF"), 0, 0, 0, 0, ...encodeText(kind), 1, 2]);

  it("detects engine formats by extension and content; refuses foreign formats and scripted SVG", () => {
    const cases: Array<[string, Uint8Array, string]> = [
      ["a.png", png, "image/png"],
      ["a.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0]), "image/jpeg"],
      ["a.jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0]), "image/jpeg"],
      ["a.webp", riff("WEBP"), "image/webp"],
      ["a.wav", riff("WAVE"), "audio/wav"],
      ["a.ogg", encodeText("OggS...."), "audio/ogg"],
      ["a.mp3", encodeText("ID3...."), "audio/mpeg"],
      ["b.mp3", new Uint8Array([0xff, 0xfb, 0, 0]), "audio/mpeg"],
      ["a.webm", new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]), "video/webm"],
      ["a.mp4", new Uint8Array([0, 0, 0, 0, ...encodeText("ftypisom")]), "video/mp4"],
      ["a.woff2", encodeText("wOF2...."), "font/woff2"],
      ["a.woff", encodeText("wOFF...."), "font/woff"],
      ["a.ttf", new Uint8Array([0, 1, 0, 0, 0]), "font/ttf"],
      ["a.otf", encodeText("OTTO...."), "font/otf"],
      ["a.svg", encodeText('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "image/svg+xml"],
    ];
    for (const [name, bytes, type] of cases) expect((detectAsset(name, bytes) as { type: string }).type, name).toBe(type);
    expect(detectAsset("game.swf", encodeText("FWS...."))).toMatchObject({ forbidden: expect.stringContaining("SWF") });
    expect(detectAsset("x.bin", encodeText("CWS...."))).toMatchObject({ forbidden: expect.stringContaining("SWF") });
    expect(detectAsset("x.bin", encodeText("ZWS...."))).toMatchObject({ forbidden: expect.stringContaining("SWF") });
    for (const n of ["game.xml", "slot1.sav", "save.json", "a.js"]) expect(detectAsset(n, encodeText("{}")), n).toHaveProperty("forbidden");
    expect(detectAsset("x.svg", encodeText('<svg><script>alert(1)</script></svg>'))).toHaveProperty("forbidden");
    expect(detectAsset("x.svg", encodeText('<svg onload="x()"></svg>'))).toHaveProperty("forbidden");
    expect(detectAsset("x.svg", encodeText("<html></html>"))).toBeNull();
    expect(detectAsset("x.svg", new Uint8Array([0xff, 0xfe]))).toBeNull();
    expect(detectAsset("x.png", encodeText("not a png"))).toBeNull();
    expect(detectAsset("noext", png)).toBeNull();
  });

  it("slug ids", () => {
    expect(slugId("Tove Walk.PNG")).toBe("tove-walk");
    expect(slugId("C:\\x\\Ærø Bølge Å.svg")).toBe("aeroe-boelge-aa");
    expect(slugId("café.wav")).toBe("cafe");
    expect(slugId("!!!.png")).toBe("asset");
  });

  it("import records kind, type, bytes and SHA-256, de-duplicates by hash and keeps the bytes", () => {
    const p = newProject("t");
    const r = importAsset(p, new Map(), { name: "Bg.png", bytes: png, license: "CC0", source: "test", author: "me" });
    if (!r.ok) throw new Error(r.message);
    expect(r.id).toBe("bg");
    expect(r.project.assets["bg"]).toMatchObject({ kind: "image", file: "bg.png", type: "image/png", bytes: png.length, license: "CC0", source: "test", author: "me" });
    expect(r.project.assets["bg"]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.files.get("assets/bg.png")).toBe(png);
    const dup = importAsset(r.project, r.files, { name: "other.png", bytes: png });
    expect(dup).toMatchObject({ ok: true, id: "bg", duplicateOf: "bg" });
    const second = importAsset(r.project, r.files, { name: "bg.png", bytes: new Uint8Array([...png, 9]) });
    expect(second).toMatchObject({ ok: true, id: "bg-2" });
    const clash = importAsset(r.project, new Map([...r.files, ["assets/x.png", png]]), { name: "x.png", bytes: new Uint8Array([...png, 7]), id: "x" });
    expect(clash.ok && clash.project.assets["x"]?.file).toBe("x-2.png");
    expect(importAsset(p, new Map(), { name: "a.png", bytes: png, id: "Bad Id" })).toMatchObject({ ok: false });
    expect(importAsset(r.project, r.files, { name: "a.png", bytes: new Uint8Array([...png, 5]), id: "bg" })).toMatchObject({ ok: false });
    expect(importAsset(p, new Map(), { name: "a.png", bytes: png, kind: "audio" })).toMatchObject({ ok: false, code: "E-ASSET-TYPE" });
    expect(importAsset(p, new Map(), { name: "a.png", bytes: png, kind: "atlas" })).toMatchObject({ ok: false });
    const atlas = importAsset(p, new Map(), { name: "a.png", bytes: png, kind: "atlas", atlas: { frameWidth: 1, frameHeight: 1, frames: 1 }, language: "da" });
    expect(atlas.ok && atlas.project.assets["a"]).toMatchObject({ kind: "atlas", atlas: { frames: 1 }, language: "da" });
    expect(importAsset(p, new Map(), { name: "a.swf", bytes: encodeText("FWS") })).toMatchObject({ ok: false, code: "E-ASSET-FORBIDDEN" });
    expect(importAsset(p, new Map(), { name: "a.txt", bytes: encodeText("hi") })).toMatchObject({ ok: false, code: "E-ASSET-TYPE" });
  });

  it("checks stored files: missing, changed, wrong type, duplicates, unused", () => {
    const { project, files } = fx();
    expect(assetProblems(project, files)).toEqual([]);
    const f = new Map(files);
    f.delete("assets/lamp.svg");
    f.set("assets/bg.attic.svg", encodeText("<svg></svg>"));
    f.set("assets/stray.png", png);
    const p: Project = {
      ...project,
      assets: {
        ...project.assets,
        copy: { ...(project.assets["bg.cellar"] as NonNullable<Project["assets"][string]>) },
        wrong: { ...(project.assets["snd.drip"] as NonNullable<Project["assets"][string]>), kind: "image" },
        font: { kind: "font", file: "f.woff2", type: "font/woff2", bytes: 8, sha256: "0".repeat(64) },
        alt: { ...(project.assets["snd.drip"] as NonNullable<Project["assets"][string]>), alternatives: [{ file: "nope.ogg", type: "audio/ogg", bytes: 1, sha256: "1".repeat(64) }] },
        bin: { kind: "image", file: "stray.png", type: "image/svg+xml", bytes: png.length, sha256: "2".repeat(64) },
        txt: { kind: "image", file: "notes.txt", type: "text/plain", bytes: 2, sha256: "3".repeat(64) },
      },
    };
    f.set("assets/notes.txt", encodeText("hi"));
    const codes = assetProblems(p, f).map((x) => `${x.code} ${x.file} ${x.path}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        "E-ASSET-FILE assets.manifest.json lamp.file",
        "E-ASSET-HASH assets.manifest.json bg.attic",
        "W-ASSET-DUPLICATE assets.manifest.json copy",
        "E-ASSET-TYPE assets.manifest.json wrong",
        "E-ASSET-FILE assets.manifest.json alt.alternatives[0].file",
        "E-ASSET-TYPE assets.manifest.json bin",
        "E-ASSET-FORBIDDEN assets.manifest.json txt.file",
        "W-ASSET-UNUSED assets.manifest.json copy",
        "E-ASSET-FILE assets.manifest.json font.file",
      ]),
    );
    expect(codes.some((c) => c.startsWith("W-ASSET-UNUSED assets.manifest.json font"))).toBe(false);
    const stray = new Map(files);
    stray.set("assets/forgotten.png", png);
    expect(assetProblems(project, stray).map((x) => `${x.code} ${x.file}`)).toEqual(["W-ASSET-UNUSED assets/forgotten.png"]);
    expect([...assetRefs(project).keys()].sort()).toEqual(Object.keys(project.assets).sort());
    const forbidden = new Map(files);
    forbidden.set("assets/lamp.svg", encodeText("<svg><script></script></svg>"));
    expect(assetProblems(project, forbidden).map((x) => x.code)).toContain("E-ASSET-FORBIDDEN");
  });
});

describe("zip", () => {
  it("writes deterministic stored archives and reads them back", async () => {
    const files = new Map([["b/c.txt", encodeText("ccc")], ["a.json", encodeText("{}")]]);
    const z1 = writeZip(files);
    expect(Buffer.from(writeZip(new Map([...files].reverse()))).equals(Buffer.from(z1))).toBe(true);
    expect([...(await readZip(z1))]).toEqual([["a.json", encodeText("{}")], ["b/c.txt", encodeText("ccc")]]);
    expect(crc32(encodeText("123456789"))).toBe(0xcbf43926);
  });

  it("removes a shared top folder, skips directories, refuses unsafe paths, bad data and unknown compression", async () => {
    const nested = writeZip(new Map([["proj/project.json", encodeText("1")], ["proj/a/b.txt", encodeText("2")]]));
    expect([...(await readZip(nested)).keys()]).toEqual(["a/b.txt", "project.json"]);
    const rootProject = writeZip(new Map([["project.json", encodeText("1")]]));
    expect([...(await readZip(rootProject)).keys()]).toEqual(["project.json"]);
    await expect(readZip(writeZip(new Map([["../x", encodeText("1")]])))).rejects.toThrow(/unsafe/);
    await expect(readZip(encodeText("nope"))).rejects.toThrow(/not a ZIP/);
    const deflated = writeZip(new Map([["a.txt", encodeText("xyz")]]));
    const dv = new DataView(deflated.buffer);
    const cd = dv.getUint32(deflated.length - 6, true);
    dv.setUint16(cd + 10, 8, true);
    await expect(readZip(deflated)).rejects.toThrow(/unsupported/);
    expect([...(await readZip(deflated, async (d) => d)).keys()]).toEqual(["a.txt"]);
    const corrupt = writeZip(new Map([["a.txt", encodeText("xyz")]]));
    corrupt[30 + 5] = 0x41;
    await expect(readZip(corrupt)).rejects.toThrow(/CRC/);
    const badDir = writeZip(new Map([["a.txt", encodeText("xyz")]]));
    const bv = new DataView(badDir.buffer);
    bv.setUint32(bv.getUint32(badDir.length - 6, true), 0, true);
    await expect(readZip(badDir)).rejects.toThrow(/damaged/);
    const withDir = writeZip(new Map([["d/", new Uint8Array()], ["x.txt", encodeText("1")]]));
    expect([...(await readZip(withDir)).keys()]).toEqual(["x.txt"]);
  });
});

describe("navigation and camera preview", () => {
  it("routes are the engine's: path around the blocker, projection marked, no path, no navigation", () => {
    const p = fx().project;
    const space = sceneSpace(p, p.scenes[0] as Project["scenes"][number]);
    // From left of the blocker (x 560–680, y 560–600) to its right, at its height: the route bends around it.
    const r = routePreview(space, [400, 580], [800, 580]);
    expect(r.points.length).toBeGreaterThan(2);
    expect(r.noPath).toBe(false);
    expect(r.startProjected || r.goalProjected).toBe(false);
    const projected = routePreview(space, [400, 640], [800, 100]);
    expect(projected.goalProjected).toBe(true);
    expect(projected.goal).toEqual([800, 560]);
    const split = sceneSpace(p, { id: "s", entry: null, walkable: [squareAt([100, 100], 20), squareAt([400, 100], 20)] });
    expect(routePreview(split, [100, 100], [400, 100]).noPath).toBe(true);
    const none = sceneSpace(p, { id: "n", entry: null });
    expect(routePreview(none, [0, 0], [1, 1]).noNavigation).toBe(true);
    expect(navGraphPreview(none)).toEqual({ nodes: [], edges: [] });
    const g = navGraphPreview(space);
    expect(g.nodes.length).toBeGreaterThan(4);
    expect(g.edges.length).toBeGreaterThan(4);
  });

  it("camera preview: horizon, scale, depth and scroll range", () => {
    const p = fx().project;
    const flat = sceneSpace(p, { id: "w", entry: null, size: { width: 2000, height: 720 } });
    expect(cameraPreview(flat, [100, 600])).toEqual({ horizonY: null, scrollMax: 720, heightPx: null, depth: -600, floor: null });
    const cam = sceneSpace(p, { id: "c", entry: null, camera: { focal: 800, height: 160, tilt: 10, horizon: 0.4, speed: 200 } });
    const c = cameraPreview(cam, [640, 600]);
    expect(c.horizonY).toBeTypeOf("number");
    expect(c.heightPx).toBeGreaterThan(0);
    expect(c.floor).not.toBeNull();
    expect(cameraPreview(cam, [640, 0]).depth).toBe(Number.POSITIVE_INFINITY);
  });
});
