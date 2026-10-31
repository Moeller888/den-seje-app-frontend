/**
 * Validation report: every problem with code, level, file and JSON path, as
 * returned by the same validator as `content validate`. A row leads to the
 * place where the problem can be fixed.
 */

import type { Problem } from "@adventure-engine/content-tools";
import { button, el, heading, select } from "../dom.ts";
import type { Selection } from "../store.ts";
import type { Ctx } from "./ctx.ts";

const view = { level: "all" };

/** Where to go for a problem. */
export function targetOf(ctx: Ctx, p: Problem): Partial<Selection> {
  const proj = ctx.store.project;
  const scene = /^scenes\/(.+)\.json$/.exec(p.file);
  if (scene !== null) return { tab: "scenes", scene: scene[1] as string, shape: null, point: null };
  const graph = /^graphs\/(.+)\.json$/.exec(p.file);
  if (graph !== null) {
    const i = /^nodes\[(\d+)\]/.exec(p.path);
    const g = proj.graphs.find((x) => x.id === graph[1]);
    return { tab: "graphs", graph: graph[1] as string, node: i === null ? null : (g?.nodes[Number(i[1])]?.id ?? null) };
  }
  if (p.file.startsWith("i18n/")) return { tab: "texts", textKey: p.path };
  if (p.file === "assets.manifest.json" || p.file.startsWith("assets/")) return { tab: "assets", asset: p.path.split(".")[0] ?? null };
  const list = /^(actors|objects|portals)\.json$/.exec(p.file);
  if (list !== null) {
    const i = /^\[(\d+)\]/.exec(p.path);
    const kind = list[1] === "actors" ? "actor" : list[1] === "objects" ? "object" : "portal";
    const items = proj[list[1] as "actors" | "objects" | "portals"] as ReadonlyArray<{ id: string }>;
    const id = i === null ? null : (items[Number(i[1])]?.id ?? null);
    return { tab: "entities", entity: id === null ? null : { kind, id } };
  }
  if (p.file === "media.json") return { tab: "media" };
  return { tab: "project" };
}

export function renderProblems(ctx: Ctx): HTMLElement {
  const all = ctx.store.problems;
  const shown = all.filter((p) => view.level === "all" || p.level === view.level);
  const errors = all.filter((p) => p.level === "error").length;
  const table = el("table", { class: "problems", "aria-label": "Valideringsrapport" }, [
    el("thead", {}, [el("tr", {}, ["Niveau", "Kode", "Fil", "Sti", "Besked", ""].map((h) => el("th", { scope: "col", text: h })))]),
    el(
      "tbody",
      {},
      shown.map((p, i) =>
        el("tr", { class: p.level, "data-code": p.code, "data-file": p.file }, [
          el("td", { text: p.level === "error" ? "fejl" : "advarsel" }),
          el("td", { text: p.code }),
          el("td", { text: p.file }),
          el("td", { text: p.path }),
          el("td", { text: p.message }),
          el("td", {}, [button("Gå til", () => ctx.select(targetOf(ctx, p)), { "data-key": `goto-${i}`, "aria-label": `Gå til ${p.code} i ${p.file}` })]),
        ]),
      ),
    ),
  ]);
  return el("div", { class: "tab problems-tab" }, [
    el("section", { class: "card" }, [
      heading(2, "Validering"),
      el("p", { "data-summary": `${errors}/${all.length - errors}`, text: all.length === 0 ? "Ingen problemer: projektet kan bygges." : `${errors} fejl og ${all.length - errors} advarsler. Fejl stopper build og preview; advarsler gør ikke.` }),
      select(
        [
          ["all", "Alle"],
          ["error", "Fejl"],
          ["warning", "Advarsler"],
        ],
        view.level,
        (v) => {
          view.level = v;
          ctx.select({});
        },
        { "data-key": "problem-level", "aria-label": "Vis niveau" },
      ),
      el("p", { class: "muted", text: "Strukturel kontrol (JSON Schema: felter, typer, grænser) og semantisk kontrol (motorens validator: referencer, grafer, geometri, oversættelser) vises samlet." }),
      table,
    ]),
  ]);
}
