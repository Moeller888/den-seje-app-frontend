/**
 * Graph editor (phase 6, docs/decisions/phase-6.md §6). A plain DOM/SVG node
 * canvas instead of React Flow (no framework in the project, every control is
 * a native button or input, so the graph is fully usable from the keyboard):
 * nodes are focusable buttons placed by their editor position (metadata),
 * edges are SVG arrows with their execution rank, cycle edges are dashed.
 * Edges are created in the property panel ("Tilføj efterfølger"), so no drag
 * gesture is needed. Rules are reported by the engine validator per node.
 */

import type { Expr, NodeDef, NodeType, Value } from "@adventure-engine/content";
import { NODE_PARAMS } from "@adventure-engine/content";
import {
  EXPR_OPS,
  addGraph,
  addNode,
  addOperand,
  changeOp,
  connect,
  copyNodes,
  defaultNode,
  deleteElement,
  disconnect,
  edgesInOrder,
  exprChildren,
  exprOp,
  exprText,
  freeNodeId,
  isContextKey,
  moveNode,
  removeOperand,
  setEdgeOrder,
  setExprAt,
  setNodeFields,
  type ExprOp,
  type ExprPath,
} from "@adventure-engine/content-tools";
import { announce, button, checkbox, el, field, heading, numberInput, select, svg, textInput } from "../dom.ts";
import { actorIds, entityIds, entryRefs, objectIds, picker, problemList, referencesView, renameView, sceneIds, spotsOf, textKeys, type Ctx } from "./ctx.ts";

const NODE_W = 170;
const NODE_H = 54;
const TYPES = Object.keys(NODE_PARAMS) as NodeType[];

export function renderGraphs(ctx: Ctx): HTMLElement {
  const p = ctx.store.project;
  const gid = p.graphs.some((g) => g.id === ctx.store.selection.graph) ? ctx.store.selection.graph : (p.graphs[0]?.id ?? null);
  const side = el("nav", { class: "side", "aria-label": "Grafer" }, [
    heading(2, "Grafer"),
    el(
      "ul",
      { class: "pick-list" },
      p.graphs.map((g) => el("li", {}, [button(`${g.id} (${g.kind === "dialog" ? "dialog" : "logik"})`, () => ctx.select({ graph: g.id, node: null }), { "aria-current": g.id === gid ? "true" : undefined, "data-key": `graph-${g.id}`, "data-graph": g.id })])),
    ),
    newGraphForm(ctx),
  ]);
  if (gid === null) return el("div", { class: "tab graph-tab" }, [side, el("p", { text: "Opret en graf." })]);
  return el("div", { class: "tab graph-tab" }, [side, canvas(ctx, gid), nodePanel(ctx, gid)]);
}

function newGraphForm(ctx: Ctx): HTMLElement {
  const id = textInput("", () => {}, { "data-key": "new-graph-id", name: "new-graph", placeholder: "ny-graf" });
  const kind = select(
    [
      ["logic", "logik"],
      ["dialog", "dialog"],
    ],
    "logic",
    () => {},
    { "data-key": "new-graph-kind", name: "new-graph-kind" },
  );
  const msg = el("span", { class: "inline-error", role: "alert" });
  return el("div", { class: "new-form" }, [
    field("Ny graf", id),
    field("Art", kind),
    button(
      "Opret graf",
      () => {
        const g = id.value.trim();
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(g)) return void (msg.textContent = "Ugyldigt graf-id.");
        const err = ctx.apply(
          `Opret graf ${g}`,
          (q) => {
            let out = addGraph(q, g, kind.value as "logic" | "dialog");
            out = addNode(out, g, { id: freeNodeId(out, `${g}_start`), type: "entry", name: "main" }, { x: 40, y: 40 });
            return out;
          },
          { graph: g, node: null },
        );
        msg.textContent = err ?? "";
      },
      { "data-action": "new-graph", "data-key": "new-graph" },
    ),
    msg,
  ]);
}

/** Edges that close a cycle (found by depth-first search from the entries, then the rest). */
function cycleEdges(nodes: readonly NodeDef[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const state = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const visit = (id: string): void => {
    state.set(id, 1);
    for (const e of edgesInOrder(byId.get(id) as NodeDef)) {
      if (!byId.has(e.to)) continue;
      const s = state.get(e.to);
      if (s === 1) back.add(`${id}->${e.to}`);
      else if (s === undefined) visit(e.to);
    }
    state.set(id, 2);
  };
  for (const n of [...nodes.filter((x) => x.type === "entry"), ...nodes]) if (!state.has(n.id)) visit(n.id);
  return back;
}

function canvas(ctx: Ctx, gid: string): HTMLElement {
  const p = ctx.store.project;
  const g = p.graphs.find((x) => x.id === gid);
  if (g === undefined) return el("div");
  const pos = (id: string): { x: number; y: number } => p.editor.nodes?.[id] ?? { x: 20, y: 20 };
  const problems = ctx.store.problemsIn(`graphs/${gid}.json`);
  const nodeProblems = (i: number): string[] => problems.filter((x) => x.path === `nodes[${i}]` || x.path.startsWith(`nodes[${i}].`)).map((x) => `${x.code}: ${x.message}`);
  const levelOf = (i: number): string | null => {
    const list = problems.filter((x) => x.path === `nodes[${i}]` || x.path.startsWith(`nodes[${i}].`));
    return list.some((x) => x.level === "error") ? "error" : list.length > 0 ? "warning" : null;
  };
  const cycles = cycleEdges(g.nodes);
  const w = Math.max(900, ...g.nodes.map((n) => pos(n.id).x + NODE_W + 40));
  const h = Math.max(480, ...g.nodes.map((n) => pos(n.id).y + NODE_H + 40));
  const edges = svg("svg", { class: "edges", width: w, height: h, "aria-hidden": "true" }, [
    svg("defs", {}, [svg("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 10, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse" }, [svg("path", { d: "M0 0 L10 5 L0 10 z" })])]),
  ]);
  for (const n of g.nodes) {
    const a = pos(n.id);
    for (const e of edgesInOrder(n)) {
      if (!g.nodes.some((m) => m.id === e.to)) continue;
      const b = pos(e.to);
      const x1 = a.x + NODE_W;
      const y1 = a.y + NODE_H / 2;
      const x2 = b.x;
      const y2 = b.y + NODE_H / 2;
      const cyc = cycles.has(`${n.id}->${e.to}`);
      const mx = (x1 + x2) / 2;
      edges.append(
        svg("path", { d: `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`, class: `edge${cyc ? " cycle" : ""}`, "marker-end": "url(#arrow)", "data-edge": `${n.id}->${e.to}` }),
        svg("text", { x: mx, y: (y1 + y2) / 2 - 4, class: "edge-label" }, [document.createTextNode(`${e.rank}${e.order !== 0 ? ` (order ${e.order})` : ""}${cyc ? " ↺" : ""}`)]),
      );
    }
  }
  const layer = el("div", { class: "nodes", style: `width:${w}px;height:${h}px` });
  g.nodes.forEach((n, i) => {
    const at = pos(n.id);
    const lvl = levelOf(i);
    const b = button("", () => ctx.select({ node: n.id }), {
      class: `node type-${n.type}${ctx.store.selection.node === n.id ? " selected" : ""}${lvl !== null ? ` ${lvl}` : ""}`,
      style: `left:${at.x}px;top:${at.y}px;width:${NODE_W}px;height:${NODE_H}px`,
      "data-node": n.id,
      "data-key": `node-${n.id}`,
      title: nodeProblems(i).join("\n"),
      "aria-label": `${n.type} ${n.id}${lvl !== null ? ` (${lvl === "error" ? "fejl" : "advarsel"})` : ""}`,
    });
    b.append(el("span", { class: "node-type", text: n.type }), el("span", { class: "node-id", text: n.type === "entry" ? `${n.id} · ${n.name}` : n.id }), el("span", { class: "node-sum", text: summary(n) }));
    // Drag with the mouse; arrow keys (with Alt) move a focused node by 10 px.
    b.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      const sx = ev.clientX;
      const sy = ev.clientY;
      let moved = false;
      const move = (m: PointerEvent): void => {
        const dx = m.clientX - sx;
        const dy = m.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        b.style.left = `${Math.max(0, at.x + dx)}px`;
        b.style.top = `${Math.max(0, at.y + dy)}px`;
      };
      const up = (m: PointerEvent): void => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (moved) ctx.apply(`Flyt node ${n.id}`, (q) => moveNode(q, n.id, { x: Math.max(0, Math.round(at.x + m.clientX - sx)), y: Math.max(0, Math.round(at.y + m.clientY - sy)) }), { node: n.id });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
    b.addEventListener("keydown", (ev) => {
      const d: Record<string, readonly [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
      const v = d[ev.key];
      if (v === undefined || !ev.altKey) return;
      ev.preventDefault();
      ctx.apply(`Flyt node ${n.id}`, (q) => moveNode(q, n.id, { x: Math.max(0, at.x + v[0]), y: Math.max(0, at.y + v[1]) }), { node: n.id });
    });
    layer.append(b);
  });
  const typeSel = select(TYPES, "say", () => {}, { "data-key": "node-type", name: "node-type", "aria-label": "Nodetype" });
  const toolbar = el("div", { class: "row", role: "toolbar", "aria-label": "Graf" }, [
    field("Nodetype", typeSel),
    button(
      "Tilføj node",
      () => {
        const type = typeSel.value as NodeType;
        const id = freeNodeId(ctx.store.project, `${gid}_${type}`);
        const y = Math.max(20, ...g.nodes.map((n) => pos(n.id).y + NODE_H + 30));
        ctx.apply(`Tilføj ${type}-node`, (q) => addNode(q, gid, defaultNode(type, id), { x: 40 + (g.nodes.length % 4) * 210, y: g.nodes.length % 4 === 0 ? y : pos(g.nodes[g.nodes.length - 1]?.id ?? "").y }), { node: id });
      },
      { "data-action": "add-node", "data-key": "add-node" },
    ),
    button(
      "Kopiér valgt node",
      () => {
        const nid = ctx.store.selection.node;
        if (nid === null) return announce("Vælg først en node");
        const r = copyNodes(ctx.store.project, [nid], gid);
        ctx.apply(`Kopiér ${nid}`, () => r.project, { node: r.ids.get(nid) ?? null });
      },
      { "data-action": "copy-node", "data-key": "copy-node" },
    ),
  ]);
  return el("section", { class: "graph-pane", "aria-label": `Graf ${gid}` }, [
    toolbar,
    el("div", { class: "graph-canvas", "data-graph-canvas": gid }, [edges, layer]),
    el("p", { class: "muted help", text: "Klik en node for at redigere den · træk for at flytte · Alt+pile flytter den fokuserede node · ↺ markerer en kant, der lukker en cyklus (tilladt)." }),
    problemList(ctx, `graphs/${gid}.json`),
  ]);
}

function summary(n: NodeDef): string {
  const r = n as unknown as Record<string, unknown>;
  if (n.type === "guard") return exprText(n.expr);
  if (n.type === "say") return `${n.speaker}: ${n.textKey}`;
  if (n.type === "set") return `${n.var} = ${JSON.stringify(n.value)}`;
  const first = NODE_PARAMS[n.type][0];
  return first === undefined ? "" : String(JSON.stringify(r[first.name]) ?? "");
}

// ---------------------------------------------------------------------------
// Property panel (type-specific)
// ---------------------------------------------------------------------------

function nodePanel(ctx: Ctx, gid: string): HTMLElement {
  const p = ctx.store.project;
  const g = p.graphs.find((x) => x.id === gid);
  const n = g?.nodes.find((x) => x.id === ctx.store.selection.node);
  const graphBox = el("section", { class: "card" }, [
    heading(3, `Graf ${gid}`),
    renameView(ctx, { kind: "graph", id: gid }, (to) => ({ graph: to })),
    referencesView(ctx, { kind: "graph", id: gid }),
    button(
      "Slet graf",
      () => {
        const r = deleteElement(ctx.store.project, { kind: "graph", id: gid });
        if (!r.ok) return announce(`Grafen "${gid}" bruges stadig (${r.blockers.length} referencer) og blev ikke slettet`);
        if (window.confirm(`Slet grafen "${gid}"?`)) ctx.apply(`Slet graf ${gid}`, () => r.project, { graph: null, node: null });
      },
      { class: "danger", "data-key": "delete-graph" },
    ),
  ]);
  if (g === undefined || n === undefined) return el("aside", { class: "side props" }, [el("p", { class: "muted", text: "Vælg en node." }), graphBox]);
  const i = g.nodes.indexOf(n);
  const set = (label: string, fields: Record<string, unknown>): void => void ctx.apply(label, (q) => setNodeFields(q, n.id, fields), { node: n.id });
  const params = NODE_PARAMS[n.type].map((prm) => paramField(ctx, gid, n, prm.name, prm.kind, prm.optional === true, set));
  const others = p.graphs.flatMap((x) => x.nodes.map((m) => m.id)).filter((id) => id !== n.id);
  const target = select(others, others[0] ?? "", () => {}, { "data-key": "edge-target", name: "edge-target", "aria-label": "Efterfølger" });
  const order = numberInput(0, () => {}, { "data-key": "edge-order", name: "edge-order", "aria-label": "Order" });
  return el("aside", { class: "side props", "aria-label": "Nodeegenskaber" }, [
    el("section", { class: "card", "data-node-panel": n.id }, [
      heading(3, `${n.type}: ${n.id}`),
      problemList(ctx, `graphs/${gid}.json`, `nodes[${i}]`),
      renameView(ctx, { kind: "node", id: n.id }, (to) => ({ node: to }), "Omdøb node"),
      ...params,
      heading(4, "Efterfølgere (i udførelsesrækkefølge)"),
      n.type === "return" ? el("p", { class: "muted", text: "En return-node må ikke have efterfølgere (E-RETURN-NEXT)." }) : null,
      el(
        "ol",
        { class: "edges-list", "data-edges": n.id },
        edgesInOrder(n).map((e) =>
          el("li", {}, [
            el("span", { text: `${e.rank}. → ${e.to}` }),
            field("order", numberInput(e.order, (v) => void ctx.apply("Ret kantrækkefølge", (q) => setEdgeOrder(q, n.id, e.to, v ?? 0), { node: n.id }), { "data-key": `edge-order-${e.to}` })),
            button("Fjern kant", () => void ctx.apply(`Fjern kant ${n.id} → ${e.to}`, (q) => disconnect(q, n.id, e.to), { node: n.id }), { "data-key": `edge-del-${e.to}`, "aria-label": `Fjern kant til ${e.to}` }),
          ]),
        ),
      ),
      others.length === 0
        ? null
        : el("div", { class: "row" }, [
            field("Ny efterfølger", target),
            field("Order", order),
            button("Tilføj efterfølger", () => void ctx.apply(`Forbind ${n.id} → ${target.value}`, (q) => connect(q, n.id, target.value, Number(order.value) || 0), { node: n.id }), { "data-action": "connect", "data-key": "connect" }),
          ]),
      referencesView(ctx, { kind: "node", id: n.id }),
      button(
        "Slet node",
        () => {
          const r = deleteElement(ctx.store.project, { kind: "node", id: n.id });
          if (!r.ok) return announce(`Noden "${n.id}" har stadig indgående kanter (${r.blockers.length}) og blev ikke slettet`);
          ctx.apply(`Slet node ${n.id}`, () => r.project, { node: null });
        },
        { class: "danger", "data-key": "delete-node", "data-action": "delete-node" },
      ),
    ]),
    graphBox,
  ]);
}

function paramField(ctx: Ctx, gid: string, n: NodeDef, name: string, kind: string, optional: boolean, set: (label: string, f: Record<string, unknown>) => void): HTMLElement {
  const p = ctx.store.project;
  const r = n as unknown as Record<string, unknown>;
  const value = r[name];
  const key = `param-${n.id}-${name}`;
  const label = `${name}${optional ? " (valgfri)" : ""}`;
  const str = (v: string | undefined): void => set(`Ret ${name}`, { [name]: v === undefined || v === "" ? (optional ? undefined : "") : v });
  switch (kind) {
    case "actor":
      return picker(label, actorIds(p), value as string | undefined, str, key, optional);
    case "object":
      return picker(label, objectIds(p), value as string | undefined, str, key, optional);
    case "entity":
      return picker(label, [...entityIds(p), ...sceneIds(p)], value as string | undefined, str, key, optional);
    case "scene":
      return picker(label, sceneIds(p), value as string | undefined, str, key, optional);
    case "portal":
      return picker(label, p.portals.map((x) => x.id), value as string | undefined, str, key, optional);
    case "textKey":
      return picker(label, textKeys(p), value as string | undefined, str, key, optional);
    case "spot": {
      const scene = typeof r["scene"] === "string" ? (r["scene"] as string) : n.type === "move_object" && n.to.kind === "scene" ? n.to.id : "*";
      return picker(label, spotsOf(p, scene), value as string | undefined, str, key, optional);
    }
    case "entryName": {
      const local = p.graphs.find((x) => x.id === gid)?.nodes.flatMap((m) => (m.type === "entry" ? [m.name] : [])) ?? [];
      return picker(label, [...local, ...entryRefs(p)], value as string | undefined, str, key, optional);
    }
    case "bool":
      return el("label", { class: "field" }, [checkbox(value === true, (v) => set(`Ret ${name}`, { [name]: optional && !v ? undefined : v }), { "data-key": key }), ` ${label}`]);
    case "num":
      return field(label, numberInput(value as number | undefined, (v) => set(`Ret ${name}`, { [name]: v ?? (optional ? undefined : 0) }), { "data-key": key, min: "0" }));
    case "times":
      return field(label, textInput(value === undefined ? "" : String(value), (v) => set(`Ret ${name}`, { [name]: v.trim() === "" ? undefined : v.trim() === "loop" ? "loop" : Number(v) }), { "data-key": key, placeholder: "1, 2 … eller loop" }));
    case "useKind":
      return field(label, select(["object", "actor", "inventory"], String(value ?? "object"), (v) => set(`Ret ${name}`, { [name]: v }), { "data-key": key }));
    case "delayMode":
      return field(label, select(["block", "background"], String(value ?? "block"), (v) => set(`Ret ${name}`, { [name]: v }), { "data-key": key }));
    case "value":
      return valueField(label, value as Value, (v) => set(`Ret ${name}`, { [name]: v }), key);
    case "var":
      return field(label, textInput(String(value ?? ""), (v) => set(`Ret ${name}`, { [name]: v }), { "data-key": key, pattern: "[a-z][a-z0-9_.]*" }));
    case "container":
      return containerField(ctx, label, value as Record<string, string> | undefined, (v) => set(`Ret ${name}`, { [name]: v }), key, optional);
    case "expr":
      return exprEditor(value as Expr, (e, label2) => set(label2, { [name]: e }), key);
    default:
      return field(label, textInput(String(value ?? ""), (v) => str(v), { "data-key": key }));
  }
}

function valueField(label: string, v: Value, onChange: (v: Value) => void, key: string): HTMLElement {
  const type = typeof v === "boolean" ? "bool" : typeof v === "number" ? "num" : "str";
  const t = select(
    [
      ["bool", "sandhedsværdi"],
      ["num", "tal"],
      ["str", "tekst"],
    ],
    type,
    (nt) => onChange(nt === "bool" ? true : nt === "num" ? 0 : ""),
    { "data-key": `${key}-type`, "aria-label": `${label}: type` },
  );
  const input =
    type === "bool"
      ? select(["true", "false"], String(v), (x) => onChange(x === "true"), { "data-key": key, "aria-label": label })
      : type === "num"
        ? numberInput(v as number, (x) => onChange(x ?? 0), { "data-key": key, "aria-label": label })
        : textInput(String(v), (x) => onChange(x), { "data-key": key, "aria-label": label });
  return el("div", { class: "field" }, [el("span", { text: label }), t, input]);
}

function containerField(ctx: Ctx, label: string, c: Record<string, string> | undefined, onChange: (v: unknown) => void, key: string, optional: boolean): HTMLElement {
  const p = ctx.store.project;
  const kind = c?.["kind"] ?? (optional ? "" : "none");
  const kinds: Array<readonly [string, string]> = [...(optional ? [["", "— ingen —"] as const] : []), ["scene", "scene"], ["actor", "aktør"], ["none", "ingen container"]];
  const ids = kind === "scene" ? sceneIds(p) : kind === "actor" ? actorIds(p) : [];
  return el("div", { class: "field" }, [
    el("span", { text: label }),
    select(kinds, kind, (k) => onChange(k === "" ? undefined : k === "none" ? { kind: "none" } : { kind: k, id: (k === "scene" ? sceneIds(p) : actorIds(p))[0] ?? "" }), { "data-key": `${key}-kind`, "aria-label": `${label}: art` }),
    ids.length === 0 ? null : select(ids, c?.["id"] ?? "", (id) => onChange({ kind, id }), { "data-key": `${key}-id`, "aria-label": `${label}: id` }),
  ]);
}

/**
 * Guard expressions as a JSON AST: every operator is a select, operands are
 * nested; context keys ($…) are shown read-only (the runtime sets them).
 */
function exprEditor(expr: Expr, onChange: (e: Expr, label: string) => void, key: string): HTMLElement {
  const root = el("div", { class: "expr", "data-expr": exprText(expr) }, [el("p", { class: "expr-text", text: exprText(expr) })]);
  const nodeView = (e: Expr, path: ExprPath): HTMLElement => {
    const op = exprOp(e);
    const k = `${key}-${path.join("-") || "root"}`;
    const opSel = select(EXPR_OPS, op, (v) => onChange(setExprAt(expr, path, changeOp(e, v as ExprOp)), "Skift operator"), { "data-key": `${k}-op`, "aria-label": `Operator ${path.join(".") || "rod"}` });
    const box = el("div", { class: "expr-node" }, [opSel]);
    if (op === "const") {
      const v = (e as { const: Value }).const;
      box.append(valueField("værdi", v, (nv) => onChange(setExprAt(expr, path, { const: nv }), "Ret konstant"), `${k}-v`));
    } else if (op === "var") {
      const name = (e as { var: string }).var;
      box.append(
        isContextKey(name)
          ? el("span", { class: "readonly", title: "Kontekstnøgle (sættes af runtime, kan ikke skrives)", text: `${name} (kontekst, skrivebeskyttet)` })
          : textInput(name, (nv) => onChange(setExprAt(expr, path, { var: nv }), "Ret variabel"), { "data-key": `${k}-var`, "aria-label": "Variabel" }),
        textInput("", (nv) => nv.trim() !== "" && onChange(setExprAt(expr, path, { var: nv.trim() }), "Ret variabel"), { "data-key": `${k}-ctx`, "aria-label": "Skift til kontekstnøgle eller variabel", placeholder: "$action, $target …", list: "ctx-keys" }),
      );
    } else {
      const kids = exprChildren(e);
      kids.forEach((c, i) => {
        const child = nodeView(c, [...path, i]);
        if (op === "and" || op === "or") child.append(button("Fjern", () => onChange(removeOperand(expr, path, i), "Fjern operand"), { "data-key": `${k}-rm-${i}` }));
        box.append(child);
      });
      if (op === "and" || op === "or") box.append(button("Tilføj operand", () => onChange(addOperand(expr, path), "Tilføj operand"), { "data-key": `${k}-add` }));
    }
    return box;
  };
  root.append(
    nodeView(expr, []),
    el("datalist", { id: "ctx-keys" }, ["$action", "$target", "$item", "$scene", "$signal", "$from"].map((v) => el("option", { value: v }))),
  );
  return root;
}
