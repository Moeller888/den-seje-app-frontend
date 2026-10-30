/**
 * Graph editing (phase 6, §6): nodes with stable, globally unique runtime ids,
 * edges with explicit order, copying with fresh ids, guard expressions as a
 * JSON AST, and the helper that writes the mirror rule of an inventory
 * combination explicitly. The rules (E-RETURN-NEXT, E-CHOICE-SET, cycles,
 * reachability …) are reported by the engine validator, not re-implemented.
 */

import type { EdgeDef, Expr, GraphDef, NodeDef, NodeType, Value } from "@adventure-engine/content";
import { NODE_PARAMS } from "@adventure-engine/content";
import type { Project } from "./project.ts";

/** Every node id of the project (one shared id space, spec 02 B2.1). */
export function nodeIds(p: Project): Set<string> {
  return new Set(p.graphs.flatMap((g) => g.nodes.map((n) => n.id)));
}

/** The first free id "<prefix>", "<prefix>_2", … in the project. */
export function freeNodeId(p: Project, prefix: string, taken: ReadonlySet<string> = nodeIds(p)): string {
  const base = prefix.replace(/[^a-zA-Z0-9_.-]+/g, "_") || "n";
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

/** A new node of a type with neutral default parameters (to be filled in the property panel). */
export function defaultNode(type: NodeType, id: string): NodeDef {
  const n: Record<string, unknown> = { id, type };
  for (const prm of NODE_PARAMS[type]) {
    if (prm.optional === true) continue;
    const v: Record<string, unknown> = {
      bool: false,
      num: 0,
      value: true,
      expr: { const: true },
      var: "flag",
      container: { kind: "none" },
      useKind: "object",
      delayMode: "block",
      times: 1,
    };
    n[prm.name] = prm.kind in v ? v[prm.kind] : prm.name === "name" ? id : "";
  }
  return n as unknown as NodeDef;
}

const mapGraph = (p: Project, graphId: string, f: (g: GraphDef) => GraphDef): Project => {
  if (!p.graphs.some((g) => g.id === graphId)) throw new RangeError(`no graph "${graphId}"`);
  return { ...p, graphs: p.graphs.map((g) => (g.id === graphId ? f(g) : g)) };
};

const mapNode = (p: Project, nodeId: string, f: (n: NodeDef) => NodeDef): Project => {
  if (!nodeIds(p).has(nodeId)) throw new RangeError(`no node "${nodeId}"`);
  return { ...p, graphs: p.graphs.map((g) => (g.nodes.some((n) => n.id === nodeId) ? { ...g, nodes: g.nodes.map((n) => (n.id === nodeId ? f(n) : n)) } : g)) };
};

export function addGraph(p: Project, id: string, kind: "logic" | "dialog"): Project {
  if (p.graphs.some((g) => g.id === id)) throw new RangeError(`graph "${id}" exists`);
  return { ...p, graphs: [...p.graphs, { id, kind, nodes: [] }] };
}

/** Add a node; the id must be unused in the whole project. The position is editor metadata only. */
export function addNode(p: Project, graphId: string, node: NodeDef, pos: { x: number; y: number }): Project {
  if (nodeIds(p).has(node.id)) throw new RangeError(`node id "${node.id}" is already used`);
  const out = mapGraph(p, graphId, (g) => ({ ...g, nodes: [...g.nodes, node] }));
  return { ...out, editor: { ...out.editor, nodes: { ...out.editor.nodes, [node.id]: pos } } };
}

export function moveNode(p: Project, nodeId: string, pos: { x: number; y: number }): Project {
  return { ...p, editor: { ...p.editor, nodes: { ...p.editor.nodes, [nodeId]: pos } } };
}

/** Change parameters of a node (id, type and next stay; use `rename` for ids). */
export function setNodeFields(p: Project, nodeId: string, fields: Readonly<Record<string, unknown>>): Project {
  return mapNode(p, nodeId, (n) => {
    const out: Record<string, unknown> = { ...n };
    for (const [k, v] of Object.entries(fields)) {
      if (k === "id" || k === "type" || k === "next") throw new RangeError(`"${k}" is not a parameter`);
      if (v === undefined) delete out[k];
      else out[k] = v;
    }
    return out as unknown as NodeDef;
  });
}

const target = (e: EdgeDef): string => (typeof e === "string" ? e : e.to);
const orderOf = (e: EdgeDef): number => (typeof e === "string" ? 0 : (e.order ?? 0));

/** Connect two nodes (no duplicate edges). `order` 0 is written as a plain id. */
export function connect(p: Project, from: string, to: string, order = 0): Project {
  if (!nodeIds(p).has(to)) throw new RangeError(`no node "${to}"`);
  return mapNode(p, from, (n) => {
    if ((n.next ?? []).some((e) => target(e) === to)) return n;
    const edge: EdgeDef = order === 0 ? to : { to, order };
    return { ...n, next: [...(n.next ?? []), edge] } as NodeDef;
  });
}

export function disconnect(p: Project, from: string, to: string): Project {
  const node = p.graphs.flatMap((g) => g.nodes).find((n) => n.id === from);
  if (node !== undefined && !(node.next ?? []).some((e) => target(e) === to)) return p;
  return mapNode(p, from, (n) => {
    const next = (n.next ?? []).filter((e) => target(e) !== to);
    const out: Record<string, unknown> = { ...n, next };
    if (next.length === 0) delete out["next"];
    return out as unknown as NodeDef;
  });
}

export function setEdgeOrder(p: Project, from: string, to: string, order: number): Project {
  if (!Number.isFinite(order)) throw new RangeError("order must be a finite number");
  return mapNode(p, from, (n) => {
    if (!(n.next ?? []).some((e) => target(e) === to)) throw new RangeError(`no edge ${from} → ${to}`);
    return { ...n, next: (n.next ?? []).map((e) => (target(e) !== to ? e : order === 0 ? to : { to, order })) } as NodeDef;
  });
}

/** Outgoing edges in execution order (order, then list position: spec 02 B3.2), numbered from 1 for display. */
export function edgesInOrder(n: NodeDef): Array<{ readonly to: string; readonly order: number; readonly rank: number }> {
  return (n.next ?? [])
    .map((e, position) => ({ to: target(e), order: orderOf(e), position }))
    .sort((a, b) => a.order - b.order || a.position - b.position)
    .map((e, i) => ({ to: e.to, order: e.order, rank: i + 1 }));
}

/**
 * Copy nodes into a graph with fresh project-wide ids. Edges between copied
 * nodes are re-pointed; edges to nodes outside the copy are dropped; copied
 * entry names get a suffix so they stay unique in the target graph.
 */
export function copyNodes(p: Project, nodeIdsToCopy: readonly string[], intoGraph: string, offset = { x: 40, y: 40 }): { readonly project: Project; readonly ids: ReadonlyMap<string, string> } {
  const all = new Map(p.graphs.flatMap((g) => g.nodes.map((n) => [n.id, n] as const)));
  const taken = nodeIds(p);
  const ids = new Map<string, string>();
  for (const id of nodeIdsToCopy) {
    if (!all.has(id)) throw new RangeError(`no node "${id}"`);
    const fresh = freeNodeId(p, `${id}_copy`, taken);
    taken.add(fresh);
    ids.set(id, fresh);
  }
  const graph = p.graphs.find((g) => g.id === intoGraph);
  if (graph === undefined) throw new RangeError(`no graph "${intoGraph}"`);
  const names = new Set(graph.nodes.flatMap((n) => (n.type === "entry" ? [n.name] : [])));
  const copies = nodeIdsToCopy.map((id) => {
    const n = all.get(id) as NodeDef;
    const next = (n.next ?? []).filter((e) => ids.has(target(e))).map((e) => (typeof e === "string" ? (ids.get(e) as string) : { ...e, to: ids.get(e.to) as string }));
    const out: Record<string, unknown> = { ...n, id: ids.get(id), next };
    if (next.length === 0) delete out["next"];
    if (n.type === "entry") {
      let name = `${n.name}_copy`;
      for (let i = 2; names.has(name); i++) name = `${n.name}_copy${i}`;
      names.add(name);
      out["name"] = name;
    }
    return out as unknown as NodeDef;
  });
  let out = mapGraph(p, intoGraph, (g) => ({ ...g, nodes: [...g.nodes, ...copies] }));
  const positions = { ...out.editor.nodes };
  for (const [from, to] of ids) {
    const at = p.editor.nodes?.[from] ?? { x: 0, y: 0 };
    positions[to] = { x: at.x + offset.x, y: at.y + offset.y };
  }
  out = { ...out, editor: { ...out.editor, nodes: positions } };
  return { project: out, ids };
}

/** Graph id and node id of an entry reference "<graph>#<name>". */
export function entryNode(p: Project, ref: string): { readonly graph: GraphDef; readonly node: NodeDef } | null {
  const [gid, name] = ref.split("#");
  const graph = p.graphs.find((g) => g.id === gid);
  const node = graph?.nodes.find((n) => n.type === "entry" && n.name === name);
  return graph === undefined || node === undefined ? null : { graph, node };
}

const is = (v: string, value: Value): Expr => ({ eq: [{ var: v }, { const: value }] });

/**
 * "Opret spejlregel": for a rule "use A on B" (A's logic receives use.inventory
 * with $target = B), write the opposite direction explicitly into B's logic: a
 * guard on $action/$target followed by use_item A → B. The runtime stays
 * asymmetric; nothing is changed unless the author asks for it.
 */
export function mirrorCombination(p: Project, item: string, targetItem: string): { readonly project: Project; readonly nodes: readonly string[] } {
  const b = p.objects.find((o) => o.id === targetItem);
  if (b === undefined) throw new RangeError(`no object "${targetItem}"`);
  if (!p.objects.some((o) => o.id === item)) throw new RangeError(`no object "${item}"`);
  if (b.entry === null || b.entry === undefined) throw new RangeError(`"${targetItem}" has no logic entry; give it one first`);
  const at = entryNode(p, b.entry);
  if (at === null) throw new RangeError(`entry "${b.entry}" does not exist`);
  const taken = nodeIds(p);
  const guardId = freeNodeId(p, `${targetItem}_mirror_${item}`, taken);
  taken.add(guardId);
  const useId = freeNodeId(p, `${targetItem}_mirror_${item}_use`, taken);
  const guard: NodeDef = { id: guardId, type: "guard", expr: { and: [is("$action", "use.inventory"), is("$target", item)] }, next: [useId] };
  const use: NodeDef = { id: useId, type: "use_item", item, target: targetItem, kind: "inventory" };
  const pos = p.editor.nodes?.[at.node.id] ?? { x: 0, y: 0 };
  let out = addNode(p, at.graph.id, guard, { x: pos.x + 240, y: pos.y + 120 });
  out = addNode(out, at.graph.id, use, { x: pos.x + 480, y: pos.y + 120 });
  out = connect(out, at.node.id, guardId);
  return { project: out, nodes: [guardId, useId] };
}

// ---------------------------------------------------------------------------
// Guard expressions as a JSON AST
// ---------------------------------------------------------------------------

export type ExprPath = readonly number[];
export type ExprOp = "const" | "var" | "eq" | "neq" | "and" | "or" | "not" | "lt" | "lte" | "gt" | "gte";

export const EXPR_OPS: readonly ExprOp[] = ["const", "var", "eq", "neq", "and", "or", "not", "lt", "lte", "gt", "gte"];

export function exprOp(e: Expr): ExprOp {
  return Object.keys(e)[0] as ExprOp;
}

/** Child expressions (operands) of an expression. */
export function exprChildren(e: Expr): readonly Expr[] {
  const op = exprOp(e);
  if (op === "const" || op === "var") return [];
  if (op === "not") return [(e as { not: Expr }).not];
  return (e as Record<string, readonly Expr[]>)[op] as readonly Expr[];
}

export function exprAt(e: Expr, path: ExprPath): Expr {
  let cur = e;
  for (const i of path) {
    const c = exprChildren(cur)[i];
    if (c === undefined) throw new RangeError(`no operand ${i}`);
    cur = c;
  }
  return cur;
}

function withChildren(e: Expr, children: readonly Expr[]): Expr {
  const op = exprOp(e);
  if (op === "not") return { not: children[0] as Expr };
  return { [op]: children } as unknown as Expr;
}

/** Replace the sub-expression at `path`. */
export function setExprAt(e: Expr, path: ExprPath, sub: Expr): Expr {
  if (path.length === 0) return sub;
  const [i, ...rest] = path as [number, ...number[]];
  const kids = [...exprChildren(e)];
  if (kids[i] === undefined) throw new RangeError(`no operand ${i}`);
  kids[i] = setExprAt(kids[i] as Expr, rest, sub);
  return withChildren(e, kids);
}

/** A new expression of an operator, keeping operands where the arity allows. */
export function changeOp(e: Expr, op: ExprOp): Expr {
  const kids = exprChildren(e);
  const operand = (i: number): Expr => kids[i] ?? { const: true };
  switch (op) {
    case "const":
      return { const: true };
    case "var":
      return { var: "flag" };
    case "not":
      return { not: operand(0) };
    case "and":
    case "or":
      return { [op]: kids.length > 0 ? [...kids] : [operand(0), operand(1)] } as unknown as Expr;
    default:
      return { [op]: [operand(0), operand(1)] } as unknown as Expr;
  }
}

/** Add an operand to and/or. */
export function addOperand(e: Expr, path: ExprPath): Expr {
  const at = exprAt(e, path);
  const op = exprOp(at);
  if (op !== "and" && op !== "or") throw new RangeError(`${op} has a fixed number of operands`);
  return setExprAt(e, path, withChildren(at, [...exprChildren(at), { const: true }]));
}

/** Remove operand `i` of and/or. */
export function removeOperand(e: Expr, path: ExprPath, i: number): Expr {
  const at = exprAt(e, path);
  const op = exprOp(at);
  if (op !== "and" && op !== "or") throw new RangeError(`${op} has a fixed number of operands`);
  return setExprAt(e, path, withChildren(at, exprChildren(at).filter((_, k) => k !== i)));
}

/** Readable one-line form, e.g. "($action == "use.inventory") and (counter > 2)". */
export function exprText(e: Expr): string {
  const op = exprOp(e);
  const sym: Partial<Record<ExprOp, string>> = { eq: "==", neq: "!=", lt: "<", lte: "<=", gt: ">", gte: ">=" };
  if (op === "const") return JSON.stringify((e as { const: Value }).const);
  if (op === "var") return (e as { var: string }).var;
  if (op === "not") return `not (${exprText((e as { not: Expr }).not)})`;
  const kids = exprChildren(e).map((k) => (exprChildren(k).length > 0 ? `(${exprText(k)})` : exprText(k)));
  return op === "and" || op === "or" ? kids.join(` ${op} `) : `${kids[0]} ${sym[op]} ${kids[1]}`;
}

/** Context keys ("$…") are set by the runtime and are read-only in the editor. */
export const isContextKey = (name: string): boolean => name.startsWith("$");
