/**
 * Scene and polygon editor (phase 6, docs/decisions/phase-6.md §5).
 *
 * Canvas: SVG in screen pixels; the scene is drawn through the view
 * transform (zoom, pan) of content-tools/polygon.ts. Tools: select/move,
 * draw polygon, place spot, route (navigation preview). Mouse: drag points or
 * whole shapes, Alt+click (or double-click) on an edge inserts a point, wheel
 * zooms, middle button or Shift+drag pans. Keyboard (canvas focused): arrows
 * move the selected point or shape (Shift: 10 px), I inserts a point after
 * the selected one, Delete removes it, [ and ] select the previous/next point,
 * + / − zoom, 0 fits, Enter closes a drawing, Escape cancels it.
 *
 * Geometry checks, paths and the camera come from the engine (geometry,
 * SceneSpace); this file draws and edits only.
 */

import type { FACINGS as FacingList } from "@adventure-engine/content";
import { FACINGS } from "@adventure-engine/content";
import {
  cameraPreview,
  deleteElement,
  fitView,
  insertPoint,
  deletePoint,
  movePoint,
  navGraphPreview,
  nearestEdge,
  polygonIssue,
  routePreview,
  sceneSpace,
  sceneToScreen,
  screenToScene,
  snap,
  zoomAt,
  type RoutePreview,
  type View,
} from "@adventure-engine/content-tools";
import { announce, button, checkbox, el, field, heading, numberInput, select, svg, textInput } from "../dom.ts";
import type { ShapeRef } from "../store.ts";
import {
  actorIds,
  assetIds,
  entryRefs,
  objectIds,
  picker,
  problemList,
  referencesView,
  renameView,
  soundIds,
  spotsOf,
  textKeys,
  type Ctx,
} from "./ctx.ts";
import {
  DRAWABLE,
  LAYERS,
  addPolygon,
  addSpot,
  layerState,
  refKey,
  removeShape,
  sameRef,
  sceneOf,
  setLayerState,
  setPoly,
  setRegion,
  setSpotPos,
  shapeOf,
  shapesOf,
  withScene,
  type LayerName,
  type Poly,
  type Pt,
  type Shape,
} from "./scene-model.ts";

type Tool = "select" | "draw" | "spot" | "route";
type Facing = (typeof FacingList)[number];

const W = 720;
const H = 405;
const HANDLE = 6;

/** Canvas state that is not part of the document (survives re-rendering, never undone). */
const ui = {
  views: new Map<string, View>(),
  tool: "select" as Tool,
  drawLayer: "walkable" as LayerName,
  grid: 20,
  showGrid: true,
  snapOn: false,
  showNav: false,
  draft: [] as Pt[],
  route: [] as Pt[],
  cursor: null as Pt | null,
};

const COLORS: Readonly<Record<LayerName, string>> = {
  walkable: "#4fbf72",
  blockers: "#e0564f",
  objectZones: "#4f8fe0",
  actorZones: "#b47fe0",
  triggerZones: "#e8c24a",
  portals: "#f08a3c",
  spots: "#f4f1ea",
  speechRegions: "#45c9d6",
  portraitRegions: "#e07fb8",
};

export function renderScenes(ctx: Ctx): HTMLElement {
  const p = ctx.store.project;
  const sel = ctx.store.selection;
  const scene = sceneOf(p, sel.scene) ?? p.scenes[0] ?? null;
  const list = el("nav", { class: "side", "aria-label": "Scener" }, [
    heading(2, "Scener"),
    el(
      "ul",
      { class: "pick-list" },
      p.scenes.map((s) =>
        el("li", {}, [button(s.id, () => ctx.select({ scene: s.id, shape: null, point: null }), { "aria-current": s.id === scene?.id ? "true" : undefined, "data-key": `scene-${s.id}`, "data-scene": s.id })]),
      ),
    ),
    newSceneForm(ctx),
  ]);
  if (scene === null) return el("div", { class: "tab scene-tab" }, [list, el("p", { text: "Projektet har ingen scener." })]);
  return el("div", { class: "tab scene-tab" }, [list, canvasPane(ctx, scene.id), sidePanel(ctx, scene.id)]);
}

function newSceneForm(ctx: Ctx): HTMLElement {
  const id = textInput("", () => {}, { name: "new-scene", "data-key": "new-scene-id", placeholder: "ny-scene" });
  const msg = el("span", { class: "inline-error", role: "alert" });
  return el("div", { class: "new-form" }, [
    field("Ny scene", id),
    button(
      "Opret scene",
      () => {
        const name = id.value.trim();
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
          msg.textContent = "Brug små bogstaver, tal, - og _.";
          return;
        }
        if (ctx.store.project.scenes.some((s) => s.id === name)) {
          msg.textContent = `Scenen "${name}" findes allerede.`;
          return;
        }
        const vp = ctx.store.project.game.viewport ?? { width: 1280, height: 720 };
        ctx.apply(
          `Opret scene ${name}`,
          (q) => ({ ...q, scenes: [...q.scenes, { id: name, entry: null, size: { width: vp.width, height: vp.height }, spots: { start: { x: Math.round(vp.width / 2), y: vp.height - 80 } }, defaultSpot: "start" }] }),
          { scene: name, shape: null, point: null },
        );
      },
      { "data-action": "new-scene", "data-key": "new-scene" },
    ),
    msg,
  ]);
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

function canvasPane(ctx: Ctx, sceneId: string): HTMLElement {
  const p = ctx.store.project;
  const scene = sceneOf(p, sceneId);
  if (scene === null) return el("div");
  const vp = p.game.viewport ?? { width: 1280, height: 720 };
  const size = scene.size ?? vp;
  let view = ui.views.get(sceneId) ?? fitView(size, { width: W, height: H });
  ui.views.set(sceneId, view);
  const space = sceneSpace(p, scene);
  const coords = el("output", { class: "coords", id: "scene-coords", "aria-live": "off" });
  const routeInfo = el("p", { class: "route-info", id: "route-info", role: "status" });
  const canvas = svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "scene-canvas", tabindex: 0, role: "application", "aria-label": `Scene ${sceneId}: tegneflade`, "data-key": "scene-canvas", "data-tool": ui.tool });
  let override: { ref: ShapeRef; poly?: Poly; point?: Pt; rect?: { x: number; y: number; width: number; height: number } } | null = null;

  const sel = (): { shape: ShapeRef | null; point: number | null } => ({ shape: ctx.store.selection.shape, point: ctx.store.selection.point });
  const toScene = (ev: { clientX: number; clientY: number }): Pt => {
    const r = canvas.getBoundingClientRect();
    return screenToScene(view, [ev.clientX - r.left, ev.clientY - r.top]);
  };
  const snapped = (q: Pt): Pt => snap(q, ui.snapOn ? ui.grid : null);
  const scr = (q: Pt): Pt => sceneToScreen(view, q);
  const pts = (pl: Poly): string => pl.map((q) => scr(q).map((n) => n.toFixed(1)).join(",")).join(" ");

  function draw(): void {
    const children: SVGElement[] = [];
    const [x0, y0] = scr([0, 0]);
    const [x1, y1] = scr([size.width, size.height]);
    children.push(svg("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: "scene-bounds" }));
    // Layers with pictures: background below, foreground (negative depth) above, half transparent.
    const layers = [...(scene?.layers ?? [])].sort((a, b) => b.depth - a.depth);
    const front: SVGElement[] = [];
    for (const l of layers) {
      const asset = l.assets?.["default"];
      const url = asset === undefined ? null : ctx.urls.forAsset(ctx.store, asset);
      if (url === null) continue;
      const img = svg("image", { href: url, x: x0, y: y0, width: x1 - x0, height: y1 - y0, preserveAspectRatio: "none", opacity: l.depth < 0 ? 0.5 : 1, class: "scene-layer-image" });
      (l.depth < 0 ? front : children).push(img);
    }
    if (ui.showGrid && ui.grid * view.zoom >= 6) {
      const g = svg("g", { class: "grid" });
      for (let x = 0; x <= size.width; x += ui.grid) g.append(svg("line", { x1: scr([x, 0])[0], y1: y0, x2: scr([x, 0])[0], y2: y1 }));
      for (let y = 0; y <= size.height; y += ui.grid) g.append(svg("line", { x1: x0, y1: scr([0, y])[1], x2: x1, y2: scr([0, y])[1] }));
      children.push(g);
    }
    // Camera horizon and the first screen's scroll edge.
    if (space.camera !== null) {
      const hy = scr([0, space.camera.horizonY])[1];
      children.push(svg("line", { x1: x0, y1: hy, x2: x1, y2: hy, class: "horizon" }), svg("text", { x: x0 + 4, y: hy - 4, class: "label", text: "" }, [document.createTextNode("horisont")]));
    }
    if (size.width > vp.width) {
      const sx = scr([vp.width, 0])[0];
      children.push(svg("line", { x1: sx, y1: y0, x2: sx, y2: y1, class: "scroll-edge" }));
    }
    if (ui.showNav) {
      const g = navGraphPreview(space);
      const ng = svg("g", { class: "navgraph" });
      for (const [a, b] of g.edges) ng.append(svg("line", { x1: scr(a)[0], y1: scr(a)[1], x2: scr(b)[0], y2: scr(b)[1] }));
      for (const n of g.nodes) ng.append(svg("circle", { cx: scr(n)[0], cy: scr(n)[1], r: 3 }));
      children.push(ng);
    }
    for (const sh of shapesOf(ctx.store.project, scene as NonNullable<typeof scene>)) {
      const st = layerState(ctx.store.project, sceneId, sh.ref.layer);
      if (!st.visible) continue;
      const selected = sameRef(sh.ref, sel().shape);
      const o = override !== null && sameRef(override.ref, sh.ref) ? override : null;
      const color = COLORS[sh.ref.layer];
      const attrs = { "data-shape": refKey(sh.ref), class: `shape ${sh.ref.layer}${selected ? " selected" : ""}${st.locked ? " locked" : ""}`, stroke: color, fill: color };
      if (sh.poly !== null) {
        const pl = o?.poly ?? sh.poly;
        const bad = polygonIssue(pl) !== null;
        const g = svg("g", {});
        g.append(svg("polygon", { ...attrs, points: pts(pl), class: `${attrs.class}${bad ? " bad" : ""}` }));
        const c = scr(pl[0] ?? [0, 0]);
        g.append(svg("text", { x: c[0] + 6, y: c[1] - 6, class: "label" }, [document.createTextNode(sh.label)]));
        if (selected) {
          pl.forEach((q, i) => {
            const s = scr(q);
            g.append(svg("circle", { cx: s[0], cy: s[1], r: HANDLE, class: `handle${sel().point === i ? " active" : ""}`, "data-point": i, "data-shape": refKey(sh.ref) }));
          });
        }
        children.push(g);
      } else if (sh.point !== null) {
        const q = scr(o?.point ?? sh.point);
        children.push(
          svg("g", {}, [
            svg("circle", { ...attrs, cx: q[0], cy: q[1], r: selected ? 8 : 6, class: `${attrs.class} spot` }),
            svg("text", { x: q[0] + 9, y: q[1] - 9, class: "label" }, [document.createTextNode(sh.ref.layer === "spots" ? sh.ref.id : sh.label)]),
          ]),
        );
      } else if (sh.rect !== null) {
        const r = o?.rect ?? sh.rect;
        const a = scr([r.x, r.y]);
        children.push(
          svg("g", {}, [
            svg("rect", { ...attrs, x: a[0], y: a[1], width: r.width * view.zoom, height: r.height * view.zoom, class: `${attrs.class} region` }),
            svg("text", { x: a[0] + 4, y: a[1] + 14, class: "label" }, [document.createTextNode(sh.label)]),
          ]),
        );
      }
    }
    children.push(...front);
    if (ui.draft.length > 0) {
      const d = ui.draft.map(scr);
      children.push(svg("polyline", { points: d.map((q) => q.join(",")).join(" "), class: "draft" }));
      for (const q of d) children.push(svg("circle", { cx: q[0], cy: q[1], r: 4, class: "draft-point" }));
    }
    if (ui.route.length > 0) drawRoute(children);
    canvas.replaceChildren(...children);
  }

  function drawRoute(children: SVGElement[]): void {
    const [a, b] = ui.route;
    if (a !== undefined) children.push(svg("circle", { cx: scr(a)[0], cy: scr(a)[1], r: 7, class: "route-start" }));
    if (b === undefined || a === undefined) {
      routeInfo.textContent = "Klik destinationen.";
      return;
    }
    children.push(svg("circle", { cx: scr(b)[0], cy: scr(b)[1], r: 7, class: "route-goal" }));
    const r: RoutePreview = routePreview(space, a, b);
    if (r.points.length > 1) children.push(svg("polyline", { points: r.points.map((q) => scr(q).join(",")).join(" "), class: "route-path", "data-route": String(r.points.length) }));
    if (r.goal !== null && r.goalProjected) children.push(svg("circle", { cx: scr(r.goal)[0], cy: scr(r.goal)[1], r: 5, class: "route-projected" }));
    const msg = r.noNavigation
      ? "Scenen har intet gyldigt gangområde."
      : r.noPath
        ? "Ingen sti: start og mål ligger i områder, der ikke hænger sammen."
        : `Sti med ${r.points.length} punkter, længde ${r.length.toFixed(1)}${r.startProjected ? "; start flyttet til nærmeste gyldige punkt" : ""}${r.goalProjected ? "; mål projiceret til nærmeste gyldige grænse" : ""}.`;
    routeInfo.textContent = msg;
    routeInfo.dataset["route"] = r.noNavigation ? "no-navigation" : r.noPath ? "no-path" : r.goalProjected ? "projected" : "ok";
  }

  const showCoords = (q: Pt): void => {
    const cam = cameraPreview(space, q);
    coords.textContent = `x ${Math.round(q[0])}, y ${Math.round(q[1])}${cam.heightPx !== null ? ` · figurhøjde ${cam.heightPx.toFixed(0)} px` : ""}${Number.isFinite(cam.depth) ? ` · dybde ${cam.depth.toFixed(1)}` : " · over horisonten"}`;
  };

  // --- pointer ---
  let drag: { kind: "point" | "shape" | "pan"; ref?: ShapeRef; index?: number; start: Pt; origin: Pt; moved: boolean } | null = null;

  const hitShape = (target: EventTarget | null): ShapeRef | null => {
    const key = target instanceof Element ? target.getAttribute("data-shape") : null;
    const sh = key === null ? undefined : shapesOf(ctx.store.project, scene).find((s) => refKey(s.ref) === key);
    if (sh === undefined || layerState(ctx.store.project, sceneId, sh.ref.layer).locked) return null;
    return sh.ref;
  };

  canvas.addEventListener("pointerdown", (ev) => {
    canvas.focus({ preventScroll: true });
    const at = toScene(ev);
    if (ev.button === 1 || (ev.button === 0 && ev.shiftKey)) {
      drag = { kind: "pan", start: [ev.clientX, ev.clientY], origin: [view.panX, view.panY], moved: false };
      canvas.setPointerCapture(ev.pointerId);
      return;
    }
    if (ev.button !== 0) return;
    if (ui.tool === "draw") {
      const q = snapped(at);
      const first = ui.draft[0];
      if (first !== undefined && ui.draft.length >= 3 && Math.hypot(scr(first)[0] - scr(q)[0], scr(first)[1] - scr(q)[1]) <= HANDLE * 2) finishDraft();
      else {
        ui.draft.push(q);
        draw();
      }
      return;
    }
    if (ui.tool === "spot") {
      try {
        const r = addSpot(ctx.store.project, sceneId, snapped(at));
        ctx.apply(`Opret spot ${r.name}`, () => r.project, { shape: { layer: "spots", id: r.name }, point: null });
      } catch (err) {
        announce((err as Error).message);
      }
      return;
    }
    if (ui.tool === "route") {
      ui.route = ui.route.length >= 2 ? [at] : [...ui.route, at];
      draw();
      return;
    }
    const pointAttr = ev.target instanceof Element ? ev.target.getAttribute("data-point") : null;
    const ref = hitShape(ev.target);
    if (ref === null) {
      ctx.select({ shape: null, point: null });
      return;
    }
    const sh = shapeOf(ctx.store.project, scene, ref) as Shape;
    if (sh.poly !== null && (ev.altKey || ev.detail === 2) && pointAttr === null) {
      const q = snapped(at);
      const after = nearestEdge(sh.poly, q);
      ctx.apply("Indsæt punkt", (pp) => setPoly(pp, sceneId, ref, insertPoint(sh.poly as Poly, after, q)), { shape: ref, point: after + 1 });
      return;
    }
    const index = pointAttr === null ? undefined : Number(pointAttr);
    const origin: Pt = index !== undefined && sh.poly !== null ? (sh.poly[index] as Pt) : at;
    drag = { kind: index !== undefined ? "point" : "shape", ref, ...(index !== undefined ? { index } : {}), start: at, origin, moved: false };
    canvas.setPointerCapture(ev.pointerId);
    if (!sameRef(ref, sel().shape) || sel().point !== (index ?? null)) {
      ctx.store.history.select({ ...ctx.store.selection, shape: ref, point: index ?? null });
      draw();
      void sidePanelRefresh();
    }
  });

  const moveBy = (sh: Shape, dx: number, dy: number): typeof override => {
    if (sh.poly !== null) return { ref: sh.ref, poly: sh.poly.map((q) => [q[0] + dx, q[1] + dy] as Pt) };
    if (sh.point !== null) return { ref: sh.ref, point: [sh.point[0] + dx, sh.point[1] + dy] };
    if (sh.rect !== null) return { ref: sh.ref, rect: { ...sh.rect, x: sh.rect.x + dx, y: sh.rect.y + dy } };
    return null;
  };

  canvas.addEventListener("pointermove", (ev) => {
    const at = toScene(ev);
    ui.cursor = at;
    showCoords(at);
    if (drag === null) return;
    if (drag.kind === "pan") {
      view = { ...view, panX: drag.origin[0] + ev.clientX - drag.start[0], panY: drag.origin[1] + ev.clientY - drag.start[1] };
      ui.views.set(sceneId, view);
      draw();
      return;
    }
    const sh = shapeOf(ctx.store.project, scene, drag.ref as ShapeRef);
    if (sh === null) return;
    drag.moved = true;
    if (drag.kind === "point" && sh.poly !== null) override = { ref: sh.ref, poly: movePoint(sh.poly, drag.index as number, snapped(at)) };
    else {
      const d = snapped([drag.origin[0] + at[0] - drag.start[0], drag.origin[1] + at[1] - drag.start[1]]);
      override = moveBy(sh, d[0] - drag.origin[0], d[1] - drag.origin[1]);
    }
    draw();
  });

  canvas.addEventListener("pointerup", () => {
    const d = drag;
    drag = null;
    const o = override;
    override = null;
    if (d === null || d.kind === "pan" || !d.moved || o === null) return;
    commitShape(o, d.kind === "point" ? "Flyt punkt" : "Flyt figur", d.index ?? null);
  });

  function commitShape(o: NonNullable<typeof override>, label: string, point: number | null): void {
    ctx.apply(
      label,
      (pp) => {
        if (o.poly !== undefined) return setPoly(pp, sceneId, o.ref, o.poly);
        if (o.point !== undefined && o.ref.layer === "spots") return setSpotPos(pp, sceneId, o.ref.id, o.point);
        if (o.rect !== undefined && (o.ref.layer === "speechRegions" || o.ref.layer === "portraitRegions")) return setRegion(pp, sceneId, o.ref.layer, o.ref.id, o.rect);
        return pp;
      },
      { shape: o.ref, point },
    );
  }

  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const r = canvas.getBoundingClientRect();
      view = zoomAt(view, ev.deltaY < 0 ? 1.15 : 1 / 1.15, [ev.clientX - r.left, ev.clientY - r.top]);
      ui.views.set(sceneId, view);
      draw();
    },
    { passive: false },
  );

  function finishDraft(): void {
    const poly = ui.draft;
    ui.draft = [];
    if (poly.length < 3) {
      announce("En polygon skal have mindst tre punkter");
      draw();
      return;
    }
    try {
      const r = addPolygon(ctx.store.project, sceneId, ui.drawLayer, poly);
      ui.tool = "select";
      ctx.apply(`Tegn ${LAYERS.find(([l]) => l === ui.drawLayer)?.[1] ?? ui.drawLayer}`, () => r.project, { shape: r.ref, point: null });
    } catch (err) {
      announce((err as Error).message);
      draw();
    }
  }

  canvas.addEventListener("keydown", (ev) => {
    const step = ev.shiftKey ? 10 : 1;
    const dirs: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const zoom = (f: number): void => {
      view = zoomAt(view, f, [W / 2, H / 2]);
      ui.views.set(sceneId, view);
      draw();
    };
    if (ev.key === "+" || ev.key === "=") return void (ev.preventDefault(), zoom(1.25));
    if (ev.key === "-") return void (ev.preventDefault(), zoom(0.8));
    if (ev.key === "0") {
      view = fitView(size, { width: W, height: H });
      ui.views.set(sceneId, view);
      draw();
      return;
    }
    if (ui.tool === "draw") {
      if (ev.key === "Enter") return void (ev.preventDefault(), finishDraft());
      if (ev.key === "Escape") {
        ui.draft = [];
        draw();
        return;
      }
    }
    const { shape, point } = sel();
    const sh = shape === null ? null : shapeOf(ctx.store.project, scene, shape);
    if (sh === null) return;
    const dir = dirs[ev.key];
    if (dir !== undefined) {
      ev.preventDefault();
      if (sh.poly !== null && point !== null) {
        const q = sh.poly[point] as Pt;
        commitShape({ ref: sh.ref, poly: movePoint(sh.poly, point, [q[0] + dir[0], q[1] + dir[1]]) }, "Flyt punkt", point);
      } else {
        const o = moveBy(sh, dir[0], dir[1]);
        if (o !== null) commitShape(o, "Flyt figur", point);
      }
      return;
    }
    if (sh.poly === null) return;
    if (ev.key === "[" || ev.key === "]") {
      ev.preventDefault();
      const n = sh.poly.length;
      const next = point === null ? 0 : (point + (ev.key === "]" ? 1 : n - 1)) % n;
      ctx.select({ point: next });
      return;
    }
    if (ev.key.toLowerCase() === "i") {
      ev.preventDefault();
      const i = point ?? sh.poly.length - 1;
      const a = sh.poly[i] as Pt;
      const b = sh.poly[(i + 1) % sh.poly.length] as Pt;
      ctx.apply("Indsæt punkt", (pp) => setPoly(pp, sceneId, sh.ref, insertPoint(sh.poly as Poly, i, [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)])), { point: i + 1 });
      return;
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && point !== null) {
      ev.preventDefault();
      ctx.apply("Slet punkt", (pp) => setPoly(pp, sceneId, sh.ref, deletePoint(sh.poly as Poly, point)), { point: Math.max(0, point - 1) });
    }
  });

  // The side panel is rebuilt by the shell on every store change; selection changes during a drag call this.
  const sidePanelRefresh = async (): Promise<void> => {
    await Promise.resolve();
    ctx.select({});
  };

  draw();
  const tools = el("div", { class: "row canvas-tools", role: "toolbar", "aria-label": "Værktøjer" }, [
    ...(
      [
        ["select", "Vælg/flyt"],
        ["draw", "Tegn polygon"],
        ["spot", "Placér spot"],
        ["route", "Testrute"],
      ] as const
    ).map(([t, label]) =>
      button(
        label,
        () => {
          ui.tool = t;
          ui.draft = [];
          if (t === "route") ui.route = [];
          ctx.select({});
        },
        { "aria-pressed": String(ui.tool === t), "data-tool": t, "data-key": `tool-${t}` },
      ),
    ),
    field("Tegn i lag", select(DRAWABLE.map((l) => [l, LAYERS.find(([x]) => x === l)?.[1] ?? l] as const), ui.drawLayer, (v) => void ((ui.drawLayer = v as LayerName), ctx.select({})), { "data-key": "draw-layer", name: "draw-layer" })),
    ui.tool === "draw" ? button("Luk polygon", () => finishDraft(), { "data-action": "close-polygon", "data-key": "close-polygon" }) : null,
    button("Zoom ind", () => void ((view = zoomAt(view, 1.25, [W / 2, H / 2])), ui.views.set(sceneId, view), draw()), { "data-key": "zoom-in" }),
    button("Zoom ud", () => void ((view = zoomAt(view, 0.8, [W / 2, H / 2])), ui.views.set(sceneId, view), draw()), { "data-key": "zoom-out" }),
    button("Tilpas", () => void ((view = fitView(size, { width: W, height: H })), ui.views.set(sceneId, view), draw()), { "data-key": "zoom-fit" }),
    el("label", {}, [checkbox(ui.showGrid, (v) => void ((ui.showGrid = v), draw()), { "data-key": "show-grid" }), " Gitter"]),
    el("label", {}, [checkbox(ui.snapOn, (v) => void (ui.snapOn = v), { "data-key": "snap", name: "snap" }), " Snap"]),
    field("Gitter", numberInput(ui.grid, (v) => void ((ui.grid = v !== undefined && v >= 1 ? v : 20), draw()), { "data-key": "grid-size", min: "1" })),
    el("label", {}, [checkbox(ui.showNav, (v) => void ((ui.showNav = v), draw()), { "data-key": "show-nav", name: "show-nav" }), " Navigationsgraf"]),
  ]);
  return el("section", { class: "canvas-pane", "aria-label": "Tegneflade" }, [
    tools,
    canvas,
    el("div", { class: "row" }, [coords, routeInfo]),
    el("p", { class: "muted help", text: "Træk punkter eller figurer · Alt+klik på en kant indsætter et punkt · Shift+træk panorerer · hjul zoomer · Tastatur: pile flytter, I indsætter, Delete sletter, [ ] skifter punkt, + − 0 zoomer." }),
  ]);
}

// ---------------------------------------------------------------------------
// Side panel: layers, selected shape, scene properties
// ---------------------------------------------------------------------------

function sidePanel(ctx: Ctx, sceneId: string): HTMLElement {
  const p = ctx.store.project;
  const scene = sceneOf(p, sceneId);
  if (scene === null) return el("div");
  const shapes = shapesOf(p, scene);
  const layers = el(
    "div",
    { class: "layers" },
    LAYERS.map(([layer, label]) => {
      const st = layerState(p, sceneId, layer);
      const items = shapes.filter((s) => s.ref.layer === layer);
      return el("div", { class: "layer-group", "data-layer": layer }, [
        el("div", { class: "row layer-head" }, [
          el("span", { class: "swatch", style: `background:${COLORS[layer]}` }),
          el("strong", { text: `${label} (${items.length})` }),
          el("label", {}, [checkbox(st.visible, (v) => void ctx.apply(v ? "Vis lag" : "Skjul lag", (q) => setLayerState(q, sceneId, layer, { visible: v })), { "data-key": `vis-${layer}`, "aria-label": `Vis ${label}` }), " vis"]),
          el("label", {}, [checkbox(st.locked, (v) => void ctx.apply(v ? "Lås lag" : "Lås lag op", (q) => setLayerState(q, sceneId, layer, { locked: v })), { "data-key": `lock-${layer}`, "aria-label": `Lås ${label}` }), " lås"]),
        ]),
        el(
          "ul",
          { class: "pick-list" },
          items.map((s) =>
            el("li", {}, [
              button(s.label, () => ctx.select({ shape: s.ref, point: null }), {
                "aria-current": sameRef(s.ref, ctx.store.selection.shape) ? "true" : undefined,
                "data-key": `shape-${refKey(s.ref)}`,
                "data-shape-button": refKey(s.ref),
                disabled: st.locked ? "" : undefined,
              }),
            ]),
          ),
        ),
      ]);
    }),
  );
  const shape = shapeOf(p, scene, ctx.store.selection.shape);
  return el("aside", { class: "side props", "aria-label": "Egenskaber" }, [
    heading(2, `Scene ${sceneId}`),
    problemList(ctx, `scenes/${sceneId}.json`),
    shape === null ? el("p", { class: "muted", text: "Vælg en figur på tegnefladen eller i listen." }) : shapePanel(ctx, sceneId, shape),
    heading(3, "Lag og figurer"),
    layers,
    scenePanel(ctx, sceneId),
  ]);
}

function shapePanel(ctx: Ctx, sceneId: string, sh: Shape): HTMLElement {
  const p = ctx.store.project;
  const scene = sceneOf(p, sceneId) as NonNullable<ReturnType<typeof sceneOf>>;
  const box = el("section", { class: "card shape-panel", "data-selected-shape": refKey(sh.ref) }, [heading(3, sh.label)]);
  const ref = sh.ref;
  if (sh.poly !== null) {
    const poly = sh.poly;
    const issue = polygonIssue(poly);
    if (issue !== null) box.append(el("p", { class: "inline-error", role: "alert", "data-code": "E-POLY", text: `Ugyldig polygon: ${issue}` }));
    const table = el("table", { class: "points" }, [el("thead", {}, [el("tr", {}, [el("th", { text: "#" }), el("th", { text: "x" }), el("th", { text: "y" }), el("th", { text: "" })])])]);
    const body = el("tbody");
    poly.forEach((q, i) => {
      const setXY = (x: number | undefined, y: number | undefined): void => {
        if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
          announce("Koordinater skal være tal");
          return;
        }
        ctx.apply("Ret punkt", (pp) => setPoly(pp, sceneId, ref, movePoint(poly, i, [x, y])), { point: i });
      };
      body.append(
        el("tr", { class: ctx.store.selection.point === i ? "active" : undefined }, [
          el("td", {}, [button(String(i + 1), () => ctx.select({ point: i }), { "data-key": `pt-sel-${i}`, "aria-label": `Vælg punkt ${i + 1}` })]),
          el("td", {}, [numberInput(q[0], (v) => setXY(v, q[1]), { "data-key": `pt-x-${i}`, "aria-label": `Punkt ${i + 1} x`, name: `pt-x-${i}` })]),
          el("td", {}, [numberInput(q[1], (v) => setXY(q[0], v), { "data-key": `pt-y-${i}`, "aria-label": `Punkt ${i + 1} y`, name: `pt-y-${i}` })]),
          el("td", {}, [button("Slet", () => void ctx.apply("Slet punkt", (pp) => setPoly(pp, sceneId, ref, deletePoint(poly, i)), { point: null }), { "data-key": `pt-del-${i}`, "aria-label": `Slet punkt ${i + 1}` })]),
        ]),
      );
    });
    table.append(body);
    const sp = ctx.store.selection.point;
    box.append(
      table,
      el("div", { class: "row" }, [
        button(
          "Tilføj punkt",
          () => {
            const i = sp ?? poly.length - 1;
            const a = poly[i] as Pt;
            const b = poly[(i + 1) % poly.length] as Pt;
            ctx.apply("Indsæt punkt", (pp) => setPoly(pp, sceneId, ref, insertPoint(poly, i, [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)])), { point: i + 1 });
          },
          { "data-action": "add-point", "data-key": "add-point" },
        ),
        button("Slet figur", () => void ctx.apply(`Slet ${sh.label}`, (pp) => removeShape(pp, sceneId, ref), { shape: null, point: null }), { class: "danger", "data-action": "delete-shape", "data-key": "delete-shape" }),
      ]),
    );
    box.append(zoneFields(ctx, sceneId, ref));
  } else if (ref.layer === "spots") {
    const spot = scene.spots?.[ref.id];
    if (spot !== undefined) {
      const set = (label: string, change: Record<string, unknown>): void =>
        void ctx.apply(label, (pp) => withScene(pp, sceneId, (s) => ({ ...s, spots: { ...s.spots, [ref.id]: clean({ ...spot, ...change }) as typeof spot } })));
      box.append(
        renameView(ctx, { kind: "spot", id: ref.id, scope: sceneId }, (to) => ({ shape: { layer: "spots", id: to } })),
        el("div", { class: "grid" }, [
          field("x", numberInput(spot.x, (v) => (v === undefined ? announce("x skal være et tal") : set("Ret spot", { x: v })), { "data-key": "spot-x", name: "spot-x" })),
          field("y", numberInput(spot.y, (v) => (v === undefined ? announce("y skal være et tal") : set("Ret spot", { y: v })), { "data-key": "spot-y", name: "spot-y" })),
          field("Retning", select([["", "—"], ...FACINGS.map((f) => [f, f] as const)], spot.facing ?? "", (v) => set("Ret retning", { facing: v === "" ? undefined : (v as Facing) }), { "data-key": "spot-facing" })),
          field("Højde", numberInput(spot.height, (v) => set("Ret højde", { height: v }), { "data-key": "spot-height" })),
          el("label", {}, [checkbox(spot.scale === true, (v) => set("Ret skalering", { scale: v ? true : undefined }), { "data-key": "spot-scale" }), " skaleres"]),
        ]),
        referencesView(ctx, { kind: "spot", id: ref.id, scope: sceneId }),
        button(
          "Slet spot",
          () => {
            const r = deleteElement(ctx.store.project, { kind: "spot", id: ref.id, scope: sceneId });
            if (!r.ok) announce(`Spottet "${ref.id}" bruges stadig (${r.blockers.length} referencer) og blev ikke slettet`);
            else ctx.apply(`Slet spot ${ref.id}`, () => r.project, { shape: null });
          },
          { class: "danger", "data-action": "delete-spot", "data-key": "delete-spot" },
        ),
      );
    }
  } else if (sh.rect !== null && (ref.layer === "speechRegions" || ref.layer === "portraitRegions")) {
    const r = sh.rect;
    const layer = ref.layer;
    const set = (k: keyof typeof r, v: number | undefined): void => {
      if (v === undefined || ((k === "width" || k === "height") && v <= 0)) return announce("Bredde og højde skal være større end 0");
      ctx.apply("Ret region", (pp) => setRegion(pp, sceneId, layer, ref.id, { ...r, [k]: v }));
    };
    box.append(
      el(
        "div",
        { class: "grid" },
        (["x", "y", "width", "height"] as const).map((k) => field(k, numberInput(r[k], (v) => set(k, v), { "data-key": `region-${k}` }))),
      ),
      button("Slet region", () => void ctx.apply("Slet region", (pp) => removeShape(pp, sceneId, ref), { shape: null }), { class: "danger", "data-key": "delete-region" }),
    );
  }
  return box;
}

/** Entity, variant, entry … of zones (pickers only offer compatible ids). */
function zoneFields(ctx: Ctx, sceneId: string, ref: ShapeRef): HTMLElement {
  const p = ctx.store.project;
  const scene = sceneOf(p, sceneId) as NonNullable<ReturnType<typeof sceneOf>>;
  const out = el("div", { class: "grid" });
  if (ref.layer === "objectZones") {
    const z = scene.objectZones?.[ref.index];
    if (z === undefined) return out;
    const set = (label: string, change: Record<string, unknown>): void =>
      void ctx.apply(label, (pp) => withScene(pp, sceneId, (s) => ({ ...s, objectZones: (s.objectZones ?? []).map((x, k) => (k === ref.index ? clean({ ...x, ...change }) : x)) })));
    out.append(
      picker("Entity", [...objectIds(p), ...actorIds(p)], z.entity, (v) => (v === undefined ? announce("En objektzone skal have en entity") : set("Ret zone-entity", { entity: v })), "zone-entity", false),
      picker("Variant", Object.keys([...p.objects, ...p.actors].find((e) => e.id === z.entity)?.variants ?? {}), z.variant, (v) => set("Ret zone-variant", { variant: v }), "zone-variant"),
      picker("Navnenøgle", textKeys(p), z.nameKey, (v) => set("Ret navnenøgle", { nameKey: v }), "zone-name"),
      field("Prioritet", numberInput(z.priority, (v) => set("Ret prioritet", { priority: v }), { "data-key": "zone-priority" })),
    );
  } else if (ref.layer === "actorZones") {
    const z = scene.actorZones?.[ref.index];
    if (z === undefined) return out;
    const set = (label: string, change: Record<string, unknown>): void =>
      void ctx.apply(label, (pp) => withScene(pp, sceneId, (s) => ({ ...s, actorZones: (s.actorZones ?? []).map((x, k) => (k === ref.index ? clean({ ...x, ...change }) : x)) })));
    out.append(
      picker("Aktør", actorIds(p), z.actor, (v) => (v === undefined ? announce("En aktørzone skal have en aktør") : set("Ret zone-aktør", { actor: v })), "zone-actor", false),
      picker("Talespot", spotsOf(p, sceneId), z.talkSpot, (v) => set("Ret talespot", { talkSpot: v }), "zone-talk"),
      picker("Variant", Object.keys(p.actors.find((a) => a.id === z.actor)?.variants ?? {}), z.variant, (v) => set("Ret zone-variant", { variant: v }), "zone-variant"),
      field("Prioritet", numberInput(z.priority, (v) => set("Ret prioritet", { priority: v }), { "data-key": "zone-priority" })),
    );
  } else if (ref.layer === "triggerZones") {
    const z = scene.triggerZones?.[ref.index];
    if (z === undefined) return out;
    const set = (label: string, change: Record<string, unknown>): void =>
      void ctx.apply(label, (pp) => withScene(pp, sceneId, (s) => ({ ...s, triggerZones: (s.triggerZones ?? []).map((x, k) => (k === ref.index ? ({ ...x, ...change } as typeof x) : x)) })));
    out.append(
      field("Id", textInput(z.id, (v) => set("Ret trigger-id", { id: v }), { "data-key": "trigger-id", name: "trigger-id" })),
      picker("Entry", entryRefs(p), z.entry ?? undefined, (v) => set("Ret trigger-entry", { entry: v ?? null }), "trigger-entry"),
    );
  } else if (ref.layer === "portals") {
    const pt = p.portals.find((x) => x.id === ref.id);
    if (pt !== undefined) {
      out.append(
        el("p", { text: `Portal ${pt.id}: ${pt.from} → ${pt.to}` }),
        button("Redigér portalpar", () => ctx.select({ tab: "entities", entity: { kind: "portal", id: pt.id } }), { "data-key": "edit-portal" }),
      );
    }
  }
  return out;
}

/** `T` with members that may be undefined turned into optional members without undefined. */
export type Cleaned<T> = { [K in keyof T as undefined extends T[K] ? never : K]: T[K] } & { [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined> };

/** Drop undefined members (exactOptionalPropertyTypes: absent rather than undefined). */
export function clean<T extends object>(o: T): Cleaned<T> {
  const out = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as Cleaned<T>;
}

function scenePanel(ctx: Ctx, sceneId: string): HTMLElement {
  const p = ctx.store.project;
  const s = sceneOf(p, sceneId) as NonNullable<ReturnType<typeof sceneOf>>;
  const set = (label: string, change: Record<string, unknown>): void => void ctx.apply(label, (pp) => withScene(pp, sceneId, (x) => clean({ ...x, ...change }) as typeof x));
  const vp = p.game.viewport ?? { width: 1280, height: 720 };
  const size = s.size ?? vp;
  const cam = s.camera;
  const regionActor = el("select", { "data-key": "region-actor", "aria-label": "Aktør til region" }, actorIds(p).map((a) => el("option", { value: a, text: a })));
  const layerRows = (s.layers ?? []).map((l, i) =>
    el("div", { class: "row" }, [
      field("Lag-id", textInput(l.id, (v) => set("Ret lag", { layers: (s.layers ?? []).map((x, k) => (k === i ? { ...x, id: v } : x)) }), { "data-key": `layer-id-${i}` })),
      field("Dybde", numberInput(l.depth, (v) => set("Ret lag", { layers: (s.layers ?? []).map((x, k) => (k === i ? { ...x, depth: v ?? 0 } : x)) }), { "data-key": `layer-depth-${i}` })),
      picker("Billede", assetIds(p, ["image"]), l.assets?.["default"], (v) => set("Ret lagbillede", { layers: (s.layers ?? []).map((x, k) => (k === i ? clean({ ...x, assets: v === undefined ? undefined : { ...(x.assets ?? {}), default: v } }) : x)) }), `layer-asset-${i}`),
      button("Fjern lag", () => set("Fjern lag", { layers: (s.layers ?? []).filter((_, k) => k !== i) }), { "data-key": `layer-del-${i}` }),
    ]),
  );
  return el("section", { class: "card", "aria-label": "Sceneegenskaber" }, [
    heading(3, "Sceneegenskaber"),
    renameView(ctx, { kind: "scene", id: sceneId }, (to) => ({ scene: to })),
    el("div", { class: "grid" }, [
      picker("Navnenøgle", textKeys(p), s.nameKey, (v) => set("Ret navnenøgle", { nameKey: v }), "scene-name"),
      field("Bredde", numberInput(size.width, (v) => set("Ret scenestørrelse", { size: { width: v ?? size.width, height: size.height } }), { "data-key": "scene-w", name: "scene-width" })),
      field("Højde", numberInput(size.height, (v) => set("Ret scenestørrelse", { size: { width: size.width, height: v ?? size.height } }), { "data-key": "scene-h", name: "scene-height" })),
      picker("Entry", entryRefs(p), s.entry ?? undefined, (v) => set("Ret scene-entry", { entry: v ?? null }), "scene-entry"),
      picker("Standardspot", spotsOf(p, sceneId), s.defaultSpot, (v) => set("Ret standardspot", { defaultSpot: v }), "scene-default-spot"),
      field("Ganghastighed (px/s)", numberInput(s.walkSpeed, (v) => set("Ret ganghastighed", { walkSpeed: v }), { "data-key": "scene-speed" })),
      field("Varianter", textInput((s.variants ?? []).join(", "), (v) => set("Ret varianter", { variants: v.trim() === "" ? undefined : v.split(",").map((x) => x.trim()).filter((x) => x !== "") }), { "data-key": "scene-variants" })),
    ]),
    heading(4, "Kamera"),
    el("label", {}, [
      checkbox(cam !== undefined, (v) => set(v ? "Tilføj kamera" : "Fjern kamera", { camera: v ? { focal: 800, height: 160, tilt: 10, horizon: 0.35, speed: 200 } : undefined }), { "data-key": "camera-on", name: "camera-on" }),
      " Perspektivkamera",
    ]),
    cam === undefined
      ? null
      : el(
          "div",
          { class: "grid" },
          (["focal", "height", "tilt", "horizon", "speed", "scale"] as const).map((k) =>
            field(k, numberInput(cam[k], (v) => set("Ret kamera", { camera: clean({ ...cam, [k]: v ?? (k === "scale" ? undefined : cam[k]) }) }), { "data-key": `cam-${k}` })),
          ),
        ),
    heading(4, "Baggrund og forgrund"),
    ...layerRows,
    button("Tilføj lag", () => set("Tilføj lag", { layers: [...(s.layers ?? []), { id: `layer_${(s.layers ?? []).length + 1}`, depth: 0 }] }), { "data-key": "add-layer" }),
    heading(4, "Lyde (lokalt navn → lyd)"),
    ...Object.entries(s.sounds ?? {}).map(([name, id]) =>
      el("div", { class: "row" }, [
        el("span", { text: name }),
        picker("Lyd", soundIds(p), id, (v) => set("Ret scenelyd", { sounds: v === undefined ? omitKey(s.sounds, name) : { ...s.sounds, [name]: v } }), `scene-sound-${name}`, false),
        button("Fjern", () => set("Fjern scenelyd", { sounds: omitKey(s.sounds, name) }), { "data-key": `scene-sound-del-${name}` }),
      ]),
    ),
    soundIds(p).length === 0 ? null : button("Tilføj lyd", () => set("Tilføj scenelyd", { sounds: { ...(s.sounds ?? {}), [`lyd_${Object.keys(s.sounds ?? {}).length + 1}`]: soundIds(p)[0] } }), { "data-key": "scene-sound-add" }),
    heading(4, "Tale- og portrætregioner"),
    el("div", { class: "row" }, [
      field("Aktør", regionActor),
      button("Ny taleregion", () => set("Ny taleregion", { speechRegions: { ...(s.speechRegions ?? {}), [regionActor.value]: { x: 100, y: 100, width: 400, height: 120 } } }), { "data-key": "add-speech" }),
      button("Ny portrætregion", () => set("Ny portrætregion", { portraitRegions: { ...(s.portraitRegions ?? {}), [regionActor.value]: { x: 40, y: 40, width: 160, height: 200 } } }), { "data-key": "add-portrait" }),
    ]),
    referencesView(ctx, { kind: "scene", id: sceneId }),
    deleteDialog(ctx, sceneId),
  ]);
}

function deleteDialog(ctx: Ctx, sceneId: string): HTMLElement {
  const msg = el("div", { class: "inline-error", role: "alert" });
  return el("div", { class: "delete" }, [
    button(
      "Slet scene",
      () => {
        const r = deleteElement(ctx.store.project, { kind: "scene", id: sceneId });
        if (!r.ok) {
          msg.textContent = `Scenen "${sceneId}" bruges stadig ${r.blockers.length} steder og blev ikke slettet. Se referencerne ovenfor.`;
          announce(msg.textContent);
          return;
        }
        if (window.confirm(`Slet scenen "${sceneId}"?`)) ctx.apply(`Slet scene ${sceneId}`, () => r.project, { scene: null, shape: null });
      },
      { class: "danger", "data-key": "delete-scene", "data-action": "delete-scene" },
    ),
    msg,
  ]);
}

function omitKey<T>(map: Readonly<Record<string, T>> | undefined, key: string): Record<string, T> | undefined {
  const out = Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => k !== key));
  return Object.keys(out).length === 0 ? undefined : out;
}
