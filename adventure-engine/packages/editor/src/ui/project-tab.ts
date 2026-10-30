/**
 * Project tab: new project, open (folder via File System Access, folder or ZIP
 * via file input), save / save as / export, game settings and the explicit
 * content order of scenes and graphs.
 */

import { caseClash, type Project } from "@adventure-engine/content-tools";
import { announce, button, el, field, heading, numberInput, select, textInput } from "../dom.ts";
import { hasFsAccess } from "../io.ts";
import { clean } from "./scene-tab.ts";
import { actorIds, entryRefs, moved, picker, problemList, type Ctx } from "./ctx.ts";

export function renderProject(ctx: Ctx): HTMLElement {
  const p = ctx.store.project;
  const c = ctx.commands;

  // --- new project ---
  const newId = textInput("mit-spil", () => {}, { name: "new-id", "data-key": "new-id" });
  const newLangs = textInput("da, en", () => {}, { name: "new-languages", "data-key": "new-languages" });
  const newMsg = el("p", { class: "inline-error", role: "alert" });
  const createNew = button(
    "Opret nyt projekt",
    () => {
      const err = c.newProject(
        newId.value.trim(),
        newLangs.value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== ""),
      );
      newMsg.textContent = err ?? "";
    },
    { "data-action": "new-project", "data-key": "new-project" },
  );

  // --- open ---
  const dirInput = el("input", { type: "file", id: "open-dir-input", "data-key": "open-dir-input", class: "file-input" });
  dirInput.setAttribute("webkitdirectory", "");
  dirInput.multiple = true;
  dirInput.addEventListener("change", () => {
    if (dirInput.files !== null && dirInput.files.length > 0) c.openFiles(dirInput.files, false);
  });
  const zipInput = el("input", { type: "file", accept: ".zip,application/zip", id: "open-zip-input", "data-key": "open-zip-input", class: "file-input" });
  zipInput.addEventListener("change", () => {
    if (zipInput.files !== null && zipInput.files.length > 0) c.openFiles(zipInput.files, true);
  });

  const files = el("section", { class: "card" }, [
    heading(2, "Projekt"),
    el("div", { class: "row" }, [field("Id", newId), field("Sprog (kommasepareret)", newLangs), createNew]),
    newMsg,
    el("div", { class: "row" }, [
      hasFsAccess() ? button("Åbn projektmappe …", () => c.openFolder(), { "data-action": "open-folder", "data-key": "open-folder" }) : null,
      field("Åbn mappe (filvalg)", dirInput),
      field("Åbn projekt-ZIP", zipInput),
    ]),
    el("div", { class: "row" }, [
      button("Gem", () => c.save(), { "data-action": "save-project", "data-key": "save-project" }),
      button("Gem som …", () => c.saveAs(), { "data-action": "save-as", "data-key": "save-as" }),
      button("Eksportér kildeprojekt (ZIP)", () => c.exportProject(), { "data-action": "export-project", "data-key": "export-project" }),
      button("Eksportér runtime-bundle", () => c.exportBundle(), { "data-action": "export-bundle-2", "data-key": "export-bundle-2" }),
    ]),
    el("p", {
      class: "muted",
      text: hasFsAccess()
        ? "Gem skriver filerne direkte i projektmappen (hver fil atomisk)."
        : "Denne browser kan ikke skrive i mapper: Gem henter projektet som ZIP.",
    }),
  ]);

  // --- game settings ---
  const g = p.game;
  const setGame = (label: string, change: Record<string, unknown>): void => void ctx.apply(label, (q) => ({ ...q, game: clean({ ...q.game, ...change }) as Project["game"] }));
  const langs = textInput(g.languages.join(", "), (v) => {
    const list = v
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    // Languages become file names (i18n/<lang>.json): only safe language codes are accepted.
    const bad = list.find((l) => !/^[a-z]{2,3}(-[A-Za-z0-9]{1,8})?$/.test(l));
    if (bad !== undefined || list.length === 0) {
      announce(bad === undefined ? "Angiv mindst ét sprog." : `"${bad}" er ikke en gyldig sprogkode (fx da, en eller en-GB).`);
      return;
    }
    // i18n/<lang>.json: "en-GB" and "en-gb" would be one file on Windows and macOS (saving would delete it).
    const before = ctx.store.project.game.languages;
    const clashing = list.find((l, i) => caseClash([...list.slice(0, i), ...before], l) !== undefined);
    if (clashing !== undefined) {
      announce(`"${clashing}" adskiller sig kun ved store/små bogstaver fra et andet sprog. Fjern det gamle sprog og gem først.`);
      return;
    }
    ctx.apply("Ret sprog", (q) => ({ ...q, game: { ...q.game, languages: list }, i18n: Object.fromEntries(list.map((l) => [l, q.i18n[l] ?? {}])) }));
  }, { "data-key": "game-languages", name: "game-languages" });
  const settings = el("section", { class: "card" }, [
    heading(2, "Spil"),
    el("div", { class: "grid" }, [
      field("Spil-id", textInput(g.id, (v) => setGame("Ret spil-id", { id: v }), { "data-key": "game-id", name: "game-id" })),
      field("Version", textInput(g.version, (v) => setGame("Ret version", { version: v }), { "data-key": "game-version", name: "game-version" })),
      field("Sprog", langs),
      field("Standardsprog", select(g.languages, g.defaultLanguage, (v) => setGame("Ret standardsprog", { defaultLanguage: v }), { "data-key": "game-default" })),
      picker("Reservesprog", g.languages, g.fallbackLanguage, (v) => setGame("Ret reservesprog", { fallbackLanguage: v }), "game-fallback"),
      picker("Spilleraktør", actorIds(p), g.player?.actor, (v) => setGame("Ret spilleraktør", { player: v === undefined ? undefined : { actor: v } }), "game-player"),
      picker("Start-entry", entryRefs(p), g.entry ?? undefined, (v) => setGame("Ret start-entry", { entry: v ?? null }), "game-entry"),
      field("Viewport-bredde", numberInput(g.viewport?.width, (v) => setGame("Ret viewport", { viewport: v === undefined ? undefined : { width: v, height: g.viewport?.height ?? 720 } }), { "data-key": "vp-w" })),
      field("Viewport-højde", numberInput(g.viewport?.height, (v) => setGame("Ret viewport", { viewport: v === undefined ? undefined : { width: g.viewport?.width ?? 1280, height: v } }), { "data-key": "vp-h" })),
    ]),
    problemList(ctx, "game.json"),
  ]);

  // --- content order ---
  const orderList = (title: string, ids: readonly string[], move: (i: number, d: -1 | 1) => void, key: string): HTMLElement =>
    el("div", {}, [
      heading(3, title),
      el(
        "ol",
        { class: "order", "data-order": key },
        ids.map((id, i) =>
          el("li", {}, [
            el("span", { text: id }),
            button("↑", () => move(i, -1), { "aria-label": `Flyt ${id} op`, "data-key": `${key}-up-${id}`, disabled: i === 0 ? "" : undefined }),
            button("↓", () => move(i, 1), { "aria-label": `Flyt ${id} ned`, "data-key": `${key}-down-${id}`, disabled: i === ids.length - 1 ? "" : undefined }),
          ]),
        ),
      ),
    ]);
  const order = el("section", { class: "card" }, [
    heading(2, "Rækkefølge i indholdet"),
    el("p", { class: "muted", text: "Rækkefølgen er en del af indholdet (fx standardscene og tegning); filernes rækkefølge på disken betyder intet." }),
    el("div", { class: "columns" }, [
      orderList("Scener", p.scenes.map((s) => s.id), (i, d) => void ctx.apply("Flyt scene", (q) => ({ ...q, scenes: moved(q.scenes, i, d) })), "scenes"),
      orderList("Grafer", p.graphs.map((x) => x.id), (i, d) => void ctx.apply("Flyt graf", (q) => ({ ...q, graphs: moved(q.graphs, i, d) })), "graphs"),
    ]),
  ]);
  return el("div", { class: "tab project-tab" }, [files, settings, order]);
}
