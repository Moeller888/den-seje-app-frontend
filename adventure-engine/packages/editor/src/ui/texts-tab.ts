/**
 * Translation matrix (phase 6, §7): one row per text key, one column per
 * language; missing and empty texts (W-I18N-EMPTY), unused keys, references,
 * the fallback the runtime would show, search and filter, rename with
 * reference update, import/export of the engine's JSON format.
 */

import { addKey, deleteElement, exportLanguage, fallbackText, filterRows, importLanguage, matrix, setText, type RowFilter } from "@adventure-engine/content-tools";
import { announce, button, download, el, field, heading, select, textInput } from "../dom.ts";
import { referencesView, renameView, slotLabel, type Ctx } from "./ctx.ts";

const view = { query: "", filter: "all" as RowFilter };

export function renderTexts(ctx: Ctx): HTMLElement {
  const p = ctx.store.project;
  const langs = p.game.languages;
  const rows = matrix(p);
  const shown = filterRows(rows, view.query, view.filter);
  const search = el("input", { type: "search", value: view.query, "data-key": "text-search", name: "text-search", "aria-label": "Søg i nøgler og tekster", placeholder: "Søg …" });
  search.value = view.query;
  search.addEventListener("input", () => {
    view.query = search.value;
    ctx.select({});
  });
  const filter = select(
    [
      ["all", "Alle"],
      ["problems", "Med problemer"],
      ["missing", "Mangler oversættelse"],
      ["empty", "Tomme"],
      ["unused", "Ubrugte"],
    ],
    view.filter,
    (v) => {
      view.filter = v as RowFilter;
      ctx.select({});
    },
    { "data-key": "text-filter", name: "text-filter" },
  );
  const newKey = textInput("", () => {}, { "data-key": "new-text-key", name: "new-text-key", placeholder: "ny.nøgle", "aria-label": "Ny tekstnøgle" });
  const table = el("table", { class: "matrix", "aria-label": "Oversættelser" }, [
    el("thead", {}, [el("tr", {}, [el("th", { scope: "col", text: "Nøgle" }), ...langs.map((l) => el("th", { scope: "col", text: l })), el("th", { scope: "col", text: "Ref." })])]),
  ]);
  const body = el("tbody");
  for (const r of shown) {
    const tr = el("tr", { "data-text-key": r.key, class: r.unused ? "unused" : undefined }, [
      el("th", { scope: "row" }, [button(r.key, () => ctx.select({ textKey: r.key }), { class: "link", "data-key": `text-key-${r.key}`, "aria-current": ctx.store.selection.textKey === r.key ? "true" : undefined })]),
    ]);
    for (const l of langs) {
      const missing = r.missing.includes(l);
      const empty = r.empty.includes(l);
      const input = el("textarea", { rows: "1", "data-key": `text-${l}-${r.key}`, "data-lang": l, "aria-label": `${r.key} (${l})`, class: missing ? "missing" : empty ? "empty" : undefined, placeholder: missing ? "mangler" : "" });
      input.value = r.texts[l] ?? "";
      input.addEventListener("change", () => void ctx.apply(`Ret tekst ${r.key} (${l})`, (q) => setText(q, l, r.key, input.value)));
      tr.append(el("td", { title: missing ? "Mangler (W-I18N-EMPTY)" : empty ? "Tom (W-I18N-EMPTY)" : "" }, [input]));
    }
    tr.append(el("td", { text: r.unused ? "ubrugt" : String(r.refs.length) }));
    body.append(tr);
  }
  table.append(body);
  const io = el("div", { class: "row" });
  for (const l of langs) {
    const file = el("input", { type: "file", accept: ".json,application/json", class: "file-input", "data-key": `import-${l}`, id: `import-${l}` });
    file.addEventListener("change", () => {
      const f = file.files?.[0];
      if (f === undefined) return;
      void f.text().then((t) => {
        const err = ctx.apply(`Importér oversættelse (${l})`, (q) => importLanguage(q, l, t));
        if (err !== null) announce(`Import afvist: ${err}`);
      });
    });
    io.append(
      button(`Eksportér ${l}.json`, () => download(`${l}.json`, `${JSON.stringify(exportLanguage(ctx.store.project, l), null, 2)}\n`, "application/json"), { "data-key": `export-${l}` }),
      field(`Importér ${l}.json`, file),
    );
  }
  return el("div", { class: "tab texts-tab" }, [
    el("section", { class: "card" }, [
      heading(2, "Tekster og oversættelser"),
      el("div", { class: "row" }, [
        field("Søg", search),
        field("Filter", filter),
        el("span", { class: "muted", text: `${shown.length} af ${rows.length} nøgler` }),
      ]),
      el("div", { class: "row" }, [
        field("Ny nøgle", newKey),
        button(
          "Tilføj nøgle",
          () => {
            const k = newKey.value.trim();
            const err = k === "" ? "Nøglen må ikke være tom" : ctx.apply(`Tilføj tekstnøgle ${k}`, (q) => addKey(q, k), { textKey: k });
            if (err !== null) announce(err);
          },
          { "data-action": "add-text-key", "data-key": "add-text-key" },
        ),
      ]),
      io,
      table,
    ]),
    keyPanel(ctx),
  ]);
}

function keyPanel(ctx: Ctx): HTMLElement {
  const key = ctx.store.selection.textKey;
  const p = ctx.store.project;
  if (key === null) return el("aside", { class: "side props" }, [el("p", { class: "muted", text: "Vælg en nøgle for at se referencer og fallback." })]);
  return el("aside", { class: "side props", "aria-label": `Nøgle ${key}` }, [
    heading(3, key),
    renameView(ctx, { kind: "textKey", id: key }, (to) => ({ textKey: to }), "Omdøb nøgle"),
    heading(4, "Fallback-preview (som runtime viser teksten)"),
    el(
      "ul",
      { class: "fallback" },
      p.game.languages.map((l) => {
        const f = fallbackText(p, key, l);
        return el("li", { "data-fallback": l, text: `${l}: ${f === null ? "(ingen tekst – runtime viser intet)" : `“${f.text}”${f.from !== l ? ` (fra ${f.from})` : ""}`}` });
      }),
    ),
    referencesView(ctx, { kind: "textKey", id: key }),
    button(
      "Slet nøgle",
      () => {
        const r = deleteElement(ctx.store.project, { kind: "textKey", id: key });
        if (!r.ok) return announce(`Nøglen bruges stadig: ${r.blockers.map((b) => slotLabel(p, b)).join(", ")}`);
        ctx.apply(`Slet tekstnøgle ${key}`, () => r.project, { textKey: null });
      },
      { class: "danger", "data-key": "delete-text-key" },
    ),
  ]);
}
