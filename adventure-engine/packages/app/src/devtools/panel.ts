/**
 * Developer tools (phase 6, docs/decisions/phase-6.md §11). Only built with
 * DEV_TOOLS=true: main.ts imports this module inside an `if (__DEV_TOOLS__)`
 * branch, so a normal production build contains neither the panel, its texts
 * nor its keyboard handler.
 *
 * Open/close: Ctrl+Shift+D. Every action that changes the game is a button
 * the developer presses; there is no script evaluation and no network access.
 * All reads and writes go through the engine's public facades (devAction,
 * setGlobal, deleteGlobal, activeRuns, modal.list, trace, rng.serialize,
 * findPath, snapshot) and the game's save slots.
 */

import type { Value } from "@adventure-engine/content";
import { SLOT_NAMES } from "@adventure-engine/save";
import type { Game } from "../game.ts";
import { byId, el } from "../ui/dom.ts";

export const DEVTOOLS_MARKER = "adventure-engine devtools";
const SVG_NS = "http://www.w3.org/2000/svg";

const DEVTOOLS_CSS = `
.devtools { position: fixed; top: 0; right: 0; bottom: 0; width: 420px; overflow: auto; z-index: 1000; padding: 12px 16px;
  background: #15131a; color: #f3eee6; border-left: 3px solid #e0b354; font: 14px/1.4 "Atkinson Hyperlegible", system-ui, sans-serif; }
.devtools h2 { margin: 0; font-size: 20px; color: #e0b354; }
.devtools h3 { margin: 12px 0 6px; font-size: 15px; }
.devtools button, .devtools select, .devtools input { font: inherit; color: inherit; background: #26222d; border: 1px solid #6d6478; border-radius: 6px; padding: 3px 8px; }
.devtools button:focus-visible, .devtools select:focus-visible, .devtools input:focus-visible { outline: 3px solid #7cc4ff; outline-offset: 1px; }
.dt-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; }
.dt-pre { max-height: 180px; overflow: auto; margin: 0; padding: 6px; background: #0d0c10; white-space: pre-wrap; word-break: break-all; font-size: 12px; }
.dt-table { width: 100%; border-collapse: collapse; } .dt-table td, .dt-table th { padding: 2px 4px; text-align: left; border-bottom: 1px solid #3a3442; }
.dt-list { margin: 0; padding-left: 18px; } .dt-status { min-height: 1.4em; color: #9fe0a8; } .dt-help { margin: 4px 0; color: #c9c0d4; }
.devtools-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; display: none; z-index: 5; }
.dt-walk { fill: rgba(80, 200, 120, 0.18); stroke: #50c878; stroke-width: 2; }
.dt-block { fill: rgba(220, 70, 70, 0.25); stroke: #dc4646; stroke-width: 2; }
.dt-zone { fill: rgba(90, 150, 240, 0.18); stroke: #5a96f0; stroke-width: 2; }
.dt-trigger { fill: rgba(240, 200, 60, 0.18); stroke: #f0c83c; stroke-width: 2; stroke-dasharray: 8 4; }
.dt-path { fill: none; stroke: #ff7ad9; stroke-width: 4; }
`;

export function installDevtools(game: Game): void {
  const engine = game.engine;
  const content = game.content;
  const style = el("style", { text: DEVTOOLS_CSS });
  document.head.append(style);
  const panel = el("aside", { id: "devtools", class: "devtools", "aria-label": "Udviklerværktøjer", "data-marker": DEVTOOLS_MARKER });
  panel.hidden = true;
  document.body.append(panel);
  const overlay = document.createElementNS(SVG_NS, "svg");
  overlay.setAttribute("id", "devtools-overlay");
  overlay.setAttribute("class", "devtools-overlay");
  overlay.setAttribute("aria-hidden", "true");
  byId("overlay").append(overlay);
  let showOverlay = false;
  let timer: number | null = null;

  const status = el("p", { class: "dt-status", role: "status", "aria-live": "polite" });
  const say = (text: string): void => {
    status.textContent = text;
  };
  const guard = (label: string, f: () => void): void => {
    try {
      f();
      say(`${label}: udført`);
    } catch (err) {
      say(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const button = (text: string, action: () => void, attrs: Record<string, string> = {}): HTMLButtonElement => {
    const b = el("button", { type: "button", text, ...attrs });
    b.addEventListener("click", action);
    return b;
  };
  const select = (name: string, options: readonly string[], label: string): HTMLSelectElement => {
    const s = el("select", { name, "aria-label": label });
    for (const o of options) s.append(el("option", { value: o, text: o }));
    return s;
  };
  const section = (title: string, ...children: Node[]): HTMLElement => el("section", { class: "dt-section" }, [el("h3", { text: title }), ...children]);
  const player = (): string => engine.world.playerId ?? "";
  const scenes = [...content.scenes.keys()];
  const actors = [...content.actors.keys()];
  const entities = [...content.actors.keys(), ...content.objects.keys()];
  const objects = [...content.objects.keys()];

  // --- actions (each is one explicit button) -------------------------------------------------
  const sceneSel = select("scene", scenes, "Scene");
  const spotSel = select("spot", [], "Spot");
  const fillSpots = (): void => {
    spotSel.replaceChildren(...Object.keys(content.scenes.get(sceneSel.value)?.spots ?? {}).map((s) => el("option", { value: s, text: s })));
  };
  sceneSel.addEventListener("change", fillSpots);
  fillSpots();
  const actorSel = select("actor", actors, "Spilleraktør");
  const entitySel = select("entity", entities, "Entity");
  const talkSel = select("talk", actors, "Samtalepartner");
  const itemSel = select("item", objects, "Genstand");
  const targetSel = select("target", entities, "Mål");
  const kindSel = select("kind", ["object", "actor", "inventory"], "Brugstype");
  const actions = section(
    "Handlinger",
    el("div", { class: "dt-row" }, [sceneSel, spotSel, button("Skift scene / teleportér", () => guard("Flyt spiller", () => engine.devAction({ kind: "move_actor", actor: player(), scene: sceneSel.value, ...(spotSel.value !== "" ? { spot: spotSel.value } : {}) })), { "data-dt": "move" })]),
    el("div", { class: "dt-row" }, [actorSel, button("Skift spilleraktør", () => guard("Spiller", () => engine.devAction({ kind: "player_set", actor: actorSel.value })), { "data-dt": "player" })]),
    el("div", { class: "dt-row" }, [entitySel, button("Interagér", () => guard("Interagér", () => engine.devAction({ kind: "interact", object: entitySel.value })), { "data-dt": "interact" })]),
    el("div", { class: "dt-row" }, [talkSel, button("Start samtale", () => guard("Samtale", () => engine.devAction({ kind: "talk", target: talkSel.value })), { "data-dt": "talk" })]),
    el("div", { class: "dt-row" }, [itemSel, targetSel, kindSel, button("Brug genstand på mål", () => guard("Brug", () => engine.devAction({ kind: "use_item", item: itemSel.value, target: targetSel.value, use: kindSel.value as "object" | "actor" | "inventory" })), { "data-dt": "use" })]),
  );

  // --- globals ---------------------------------------------------------------------------------
  const globalsBody = el("tbody");
  const gName = el("input", { name: "global-name", "aria-label": "Variabelnavn", placeholder: "navn" });
  const gValue = el("input", { name: "global-value", "aria-label": "Værdi", placeholder: "true / 3 / tekst" });
  const parseValue = (raw: string): Value => (raw === "true" ? true : raw === "false" ? false : raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw);
  const globals = section(
    "Globale variable",
    el("table", { class: "dt-table" }, [el("thead", {}, [el("tr", {}, [el("th", { text: "Navn" }), el("th", { text: "Værdi" }), el("th", { text: "" })])]), globalsBody]),
    el("div", { class: "dt-row" }, [gName, gValue, button("Sæt", () => guard(`Sæt ${gName.value}`, () => engine.setGlobal(gName.value, parseValue(gValue.value))), { "data-dt": "set-global" })]),
  );

  // --- read-only views -------------------------------------------------------------------------
  const runsList = el("ul", { class: "dt-list", "data-dt": "runs" });
  const locksList = el("ul", { class: "dt-list", "data-dt": "locks" });
  const traceBox = el("pre", { class: "dt-pre", "data-dt": "trace" });
  const rngBox = el("pre", { class: "dt-pre", "data-dt": "rng" });
  const slotSel = select("slot", SLOT_NAMES, "Gemmeplads");
  const slotBox = el("pre", { class: "dt-pre", "data-dt": "slot" });
  const overlayToggle = el("input", { type: "checkbox", id: "dt-overlay", "data-dt": "overlay" });
  overlayToggle.addEventListener("change", () => {
    showOverlay = overlayToggle.checked;
    drawOverlay();
  });

  const report = (): Record<string, unknown> => ({
    tool: DEVTOOLS_MARKER,
    content: { id: content.pkg.game.id, version: content.pkg.game.version },
    seed: game.seed,
    rng: engine.rng.serialize(),
    now: engine.now,
    idle: engine.idleReport(),
    runs: engine.activeRuns(),
    modalLocks: engine.modal.list(),
    globals: Object.fromEntries(engine.globals.entries()),
    warnings: engine.warnings,
    world: engine.snapshot(),
    slots: game.slots.used(),
    trace: engine.trace.slice(-500),
  });
  const download = (): void => {
    const blob = new Blob([`${JSON.stringify(report(), null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `${content.pkg.game.id}-diagnostics.json` });
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    say("Diagnostisk rapport eksporteret");
  };

  panel.append(
    el("header", { class: "dt-head" }, [el("h2", { text: "Udviklerværktøjer" }), el("p", { class: "dt-help", text: "Ctrl+Shift+D lukker. Alle ændringer kræver et klik." })]),
    status,
    actions,
    globals,
    section("Aktive runs", runsList),
    section("Modal-låse", locksList),
    section("Seed og RNG", rngBox),
    section("Trace (seneste 40)", traceBox),
    section("Navmesh, stier og zoner", el("label", { for: "dt-overlay" }, [overlayToggle, " Vis på scenen"])),
    section("Gemmepladser", el("div", { class: "dt-row" }, [slotSel, button("Vis rå data", () => showSlot(), { "data-dt": "show-slot" })]), slotBox),
    section("Rapport", button("Eksportér diagnostisk rapport", download, { "data-dt": "report" })),
  );

  function showSlot(): void {
    const s = game.slots.read(slotSel.value);
    slotBox.textContent = s.state === "ok" ? s.raw : s.state === "empty" ? "(tom)" : `(beskadiget${s.backup !== null ? "; sikkerhedskopi findes" : ""})`;
  }

  /**
   * Rebuild a part of the panel only when what it shows has changed, so
   * buttons keep their identity (and keyboard focus) between refreshes.
   */
  const shown = new Map<Element, string>();
  const update = (node: Element, signature: string, build: () => void): void => {
    if (shown.get(node) === signature) return;
    shown.set(node, signature);
    build();
  };

  function refresh(): void {
    const globalsNow = engine.globals.entries();
    update(globalsBody, JSON.stringify(globalsNow), () =>
      globalsBody.replaceChildren(
        ...globalsNow.map(([name, value]) =>
          el("tr", {}, [el("td", { text: name }), el("td", { text: JSON.stringify(value) }), el("td", {}, [button("Slet", () => guard(`Slet ${name}`, () => void engine.deleteGlobal(name)), { "data-dt": `delete-${name}` })])]),
        ),
      ),
    );
    const runs = engine.activeRuns().map((r) => `${r.runId} ${r.entry ?? r.action ?? ""}${r.background ? " (baggrund)" : ""}: ${r.nodes.join(", ")}`);
    update(runsList, JSON.stringify(runs), () => runsList.replaceChildren(...(runs.length === 0 ? ["ingen"] : runs).map((text) => el("li", { text }))));
    const locks = engine.modal.list().map((l) => `#${l.handle} ${l.reason} (${l.owner})`);
    update(locksList, JSON.stringify(locks), () => locksList.replaceChildren(...(locks.length === 0 ? ["ingen"] : locks).map((text) => el("li", { text }))));
    const rng = engine.rng.serialize();
    const rngText = `seed: ${game.seed}\n${rng.algorithm}: ${rng.state}`;
    update(rngBox, rngText, () => void (rngBox.textContent = rngText));
    const traceText = engine.trace
      .slice(-40)
      .map((e) => `${e.t} ${e.kind}`)
      .join("\n");
    update(traceBox, traceText, () => void (traceBox.textContent = traceText));
  }

  function drawOverlay(): void {
    overlay.replaceChildren();
    overlay.style.display = showOverlay ? "block" : "none";
    if (!showOverlay) return;
    const p = engine.world.playerId;
    const sceneId = p === null ? null : (engine.world.actors.get(p)?.scene ?? null);
    if (sceneId === null) return;
    const space = engine.space(sceneId);
    const vp = space.viewport;
    overlay.setAttribute("viewBox", `${engine.world.scrollX} 0 ${vp.width} ${vp.height}`);
    const poly = (pts: readonly (readonly [number, number])[], cls: string): void => {
      const e = document.createElementNS(SVG_NS, "polygon");
      e.setAttribute("points", pts.map((q) => q.join(",")).join(" "));
      e.setAttribute("class", cls);
      overlay.append(e);
    };
    for (const w of space.def.walkable ?? []) poly(w, "dt-walk");
    for (const b of space.def.blockers ?? []) poly(b, "dt-block");
    for (const z of space.def.objectZones ?? []) poly(z.polygon, "dt-zone");
    for (const z of space.def.actorZones ?? []) poly(z.polygon, "dt-zone");
    for (const z of space.def.triggerZones ?? []) poly(z.polygon, "dt-trigger");
    const pos = p === null ? null : (engine.world.actors.get(p)?.pos ?? null);
    const target = engine.pointer?.kind === "scene" ? engine.pointer.point : null;
    if (pos !== null && target !== null) {
      const path = space.findPath(pos, target);
      if (path !== null) {
        const line = document.createElementNS(SVG_NS, "polyline");
        line.setAttribute("points", path.points.map((q) => q.join(",")).join(" "));
        line.setAttribute("class", "dt-path");
        overlay.append(line);
      }
    }
  }

  const open = (): void => {
    panel.hidden = false;
    refresh();
    timer = window.setInterval(() => {
      refresh();
      drawOverlay();
    }, 250);
    panel.querySelector<HTMLElement>("select, button")?.focus();
  };
  const close = (): void => {
    panel.hidden = true;
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    showOverlay = false;
    overlayToggle.checked = false;
    drawOverlay();
  };
  window.addEventListener(
    "keydown",
    (ev) => {
      if (ev.ctrlKey && ev.shiftKey && (ev.key === "D" || ev.key === "d")) {
        ev.preventDefault();
        ev.stopPropagation();
        if (panel.hidden) open();
        else close();
      }
    },
    { capture: true },
  );
  // Keys typed into the panel never reach the game.
  panel.addEventListener("keydown", (ev) => ev.stopPropagation());
  document.documentElement.dataset["devtools"] = "available";
}
