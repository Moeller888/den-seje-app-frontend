/**
 * The editor shell: toolbar (new, open, save, export, undo/redo), tabs, status
 * line and keyboard shortcuts. Each tab renders from the store; after every
 * change the active tab is rendered again and keyboard focus is put back on
 * the control with the same `data-key`.
 */

import { buildBundle, newProject, readProject, validateProject, type Project } from "@adventure-engine/content-tools";
import { announce, button, download, el } from "./dom.ts";
import { clearDraft, filesFromInput, filesFromZip, hasFsAccess, isEmptyDirectory, loadDraft, pickDirectory, readDirectory, saveDraft, writeDirectory, zipOf, type FsDirHandle } from "./io.ts";
import { stopPreview } from "./ui/preview-tab.ts";
import type { EditorStore, Tab } from "./store.ts";
import { renderAssets } from "./ui/assets-tab.ts";
import { renderEntities } from "./ui/entities-tab.ts";
import { renderGraphs } from "./ui/graph-tab.ts";
import { renderMedia } from "./ui/media-tab.ts";
import { renderPreview } from "./ui/preview-tab.ts";
import { renderProblems } from "./ui/problems-tab.ts";
import { renderProject } from "./ui/project-tab.ts";
import { renderScenes } from "./ui/scene-tab.ts";
import { renderTexts } from "./ui/texts-tab.ts";
import { AssetUrls, type Ctx } from "./ui/ctx.ts";

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ["project", "Projekt"],
  ["scenes", "Scener"],
  ["entities", "Entiteter"],
  ["graphs", "Grafer"],
  ["texts", "Tekster"],
  ["assets", "Assets"],
  ["media", "Medier"],
  ["problems", "Validering"],
  ["preview", "Preview"],
];

const RENDER: Readonly<Record<Tab, (ctx: Ctx) => HTMLElement>> = {
  project: renderProject,
  scenes: renderScenes,
  entities: renderEntities,
  graphs: renderGraphs,
  texts: renderTexts,
  assets: renderAssets,
  media: renderMedia,
  problems: renderProblems,
  preview: renderPreview,
};

export class EditorApp {
  private readonly store: EditorStore;
  private readonly root: HTMLElement;
  private readonly main = el("main", { id: "tab-panel", class: "tab-panel", role: "tabpanel", tabindex: "-1" });
  private readonly urls: AssetUrls;
  private dir: FsDirHandle | null = null;
  /** Files of the folder when it was opened or last saved (to remove files that left the project). */
  private known = new Set<string>();
  private draftTimer: number | null = null;
  /** The preview tab keeps running while the user works in other tabs; it is not re-rendered by edits. */
  private previewPanel: HTMLElement | null = null;
  private renderedTab: Tab | null = null;

  constructor(store: EditorStore, root: HTMLElement) {
    this.store = store;
    this.root = root;
    this.urls = new AssetUrls();
    store.subscribe(() => {
      this.render();
      this.scheduleDraft();
    });
    window.addEventListener("keydown", (ev) => this.shortcut(ev));
    window.addEventListener("beforeunload", (ev) => {
      if (!this.store.dirty) return;
      ev.preventDefault();
      ev.returnValue = "";
    });
    this.render();
    void this.offerRecovery();
  }

  private ctx(): Ctx {
    return {
      store: this.store,
      urls: this.urls,
      apply: (label, edit, selection) => {
        const err = this.store.apply(label, edit, selection);
        announce(err === null ? label : `${label} mislykkedes: ${err}`);
        return err;
      },
      select: (s) => this.store.select(s),
      commands: {
        newProject: (id, langs) => this.newProject(id, langs),
        openFolder: () => void this.openFolder(),
        openFiles: (list, zip) => void this.openFiles(list, zip),
        save: () => void this.save(false),
        saveAs: () => void this.save(true),
        exportProject: () => this.exportProject(),
        exportBundle: () => this.exportBundle(),
        openProject: (files, name) => this.openFrom(files, name),
      },
    };
  }

  private shortcut(ev: KeyboardEvent): void {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    const k = ev.key.toLowerCase();
    const inText = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement;
    if (k === "s") {
      ev.preventDefault();
      void this.save(ev.shiftKey);
    } else if (!inText && k === "z" && !ev.shiftKey) {
      ev.preventDefault();
      this.undo();
    } else if (!inText && (k === "y" || (k === "z" && ev.shiftKey))) {
      ev.preventDefault();
      this.redo();
    }
  }

  private undo(): void {
    const label = this.store.history.undoLabel;
    if (this.store.undo()) announce(`Fortrudt: ${label ?? ""}`);
  }

  private redo(): void {
    const label = this.store.history.redoLabel;
    if (this.store.redo()) announce(`Gentaget: ${label ?? ""}`);
  }

  private render(): void {
    const s = this.store;
    const tab = s.selection.tab;
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active?.dataset["key"] ?? null;
    const errors = s.problems.filter((p) => p.level === "error").length;
    const warnings = s.problems.length - errors;
    document.title = `${s.dirty ? "• " : ""}${s.project.game.id} – Indholdseditor`;
    const tabs = el("div", { class: "tabs", role: "tablist", "aria-label": "Editorens dele" });
    for (const [id, label] of TABS) {
      const b = button(label + (id === "problems" && s.problems.length > 0 ? ` (${errors}/${warnings})` : ""), () => s.select({ tab: id }), {
        role: "tab",
        id: `tab-${id}`,
        "aria-selected": String(id === tab),
        "aria-controls": "tab-panel",
        "data-key": `tab-${id}`,
        "data-tab": id,
        tabindex: id === tab ? "0" : "-1",
      });
      tabs.append(b);
    }
    tabs.addEventListener("keydown", (ev) => {
      const i = TABS.findIndex(([id]) => id === tab);
      const next = ev.key === "ArrowRight" ? (i + 1) % TABS.length : ev.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : null;
      if (next === null) return;
      ev.preventDefault();
      s.select({ tab: (TABS[next] as readonly [Tab, string])[0] });
      document.getElementById(`tab-${(TABS[next] as readonly [Tab, string])[0]}`)?.focus();
    });
    const toolbar = el("div", { class: "toolbar", role: "toolbar", "aria-label": "Projekt" }, [
      button("Fortryd", () => this.undo(), { "data-key": "undo", "data-action": "undo", disabled: s.history.canUndo ? undefined : "", title: s.history.undoLabel ?? "" }),
      button("Gentag", () => this.redo(), { "data-key": "redo", "data-action": "redo", disabled: s.history.canRedo ? undefined : "", title: s.history.redoLabel ?? "" }),
      button("Gem", () => void this.save(false), { "data-key": "save", "data-action": "save" }),
      button("Eksportér bundle", () => this.exportBundle(), { "data-key": "export-bundle", "data-action": "export-bundle" }),
    ]);
    const header = el("header", { class: "topbar" }, [
      el("h1", { text: "Indholdseditor" }),
      el("span", { class: "project-name", "data-dirty": String(s.dirty), id: "project-name", text: `${s.project.game.id}${s.dirty ? " (ikke gemt)" : ""}` }),
      toolbar,
    ]);
    // The preview is created once per visit of its tab, so edits elsewhere never restart the game.
    let panel: HTMLElement;
    if (tab === "preview") {
      if (this.previewPanel === null || this.renderedTab !== "preview") this.previewPanel = RENDER.preview(this.ctx());
      panel = this.previewPanel;
    } else {
      // Leaving the preview stops it: the iframe, its message listener and its object URLs are released.
      if (this.previewPanel !== null) stopPreview();
      this.previewPanel = null;
      panel = RENDER[tab](this.ctx());
    }
    this.renderedTab = tab;
    this.main.setAttribute("aria-labelledby", `tab-${tab}`);
    if (this.main.firstChild !== panel) this.main.replaceChildren(panel);
    const status = el("footer", { class: "statusbar" }, [
      el("span", { id: "status-message", role: "status" }),
      el("span", { "data-problems": `${errors}/${warnings}`, id: "problem-count", text: `${errors} fejl, ${warnings} advarsler` }),
    ]);
    this.root.replaceChildren(header, tabs, this.main, status);
    if (focusKey !== null) {
      const again = this.root.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`);
      again?.focus({ preventScroll: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  private confirmDiscard(): boolean {
    return !this.store.dirty || window.confirm("Projektet har ugemte ændringer. Vil du kassere dem?");
  }

  private newProject(id: string, languages: readonly string[]): string | null {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) return "Id må kun indeholde små bogstaver, tal, punktum, bindestreg og understreg.";
    if (languages.length === 0 || !languages.every((l) => /^[a-z]{2,3}$/.test(l))) return "Angiv mindst ét sprog som kode (fx da, en).";
    if (!this.confirmDiscard()) return null;
    this.dir = null;
    this.known = new Set();
    this.urls.clear();
    this.store.open(newProject(id, languages), new Map(), id);
    this.store.select({ tab: "project" });
    announce(`Nyt projekt "${id}" oprettet`);
    return null;
  }

  /** Open a project from files; refuses projects that cannot be read and reports why. */
  private openFrom(files: ReadonlyMap<string, Uint8Array>, name: string): string | null {
    const r = readProject(files);
    if (r.project === null) {
      const msg = r.problems
        .filter((p) => p.level === "error")
        .slice(0, 5)
        .map((p) => `${p.code} ${p.file} ${p.path}: ${p.message}`)
        .join("\n");
      announce("Projektet kunne ikke åbnes");
      return msg === "" ? "Ikke et projekt (project.json mangler)." : msg;
    }
    this.urls.clear();
    this.store.open(r.project, files, name);
    this.known = new Set(files.keys());
    announce(`Projektet "${r.project.game.id}" er åbnet`);
    return null;
  }

  private async openFolder(): Promise<void> {
    if (!this.confirmDiscard()) return;
    try {
      const dir = await pickDirectory();
      const files = await readDirectory(dir);
      const err = this.openFrom(files, dir.name);
      if (err !== null) window.alert(err);
      else this.dir = dir;
    } catch (err) {
      if ((err as Error).name !== "AbortError") window.alert((err as Error).message);
    }
  }

  private async openFiles(list: FileList, zip: boolean): Promise<void> {
    if (!this.confirmDiscard()) return;
    try {
      const first = list[0];
      const files = zip && first !== undefined ? await filesFromZip(first) : await filesFromInput(list);
      const err = this.openFrom(files, zip && first !== undefined ? first.name.replace(/\.zip$/i, "") : "mappe");
      if (err !== null) window.alert(err);
      else this.dir = null;
    } catch (err) {
      window.alert(`Kunne ikke åbne: ${(err as Error).message}`);
    }
  }

  private async save(as: boolean): Promise<void> {
    const files = this.store.allFiles();
    try {
      if (hasFsAccess() && (as || this.dir === null)) {
        const dir = await pickDirectory();
        // Never overwrite a folder silently, and never delete files the editor did not open from it.
        if (!(await isEmptyDirectory(dir)) && !window.confirm(`Mappen "${dir.name}" er ikke tom. Filer med samme navn bliver overskrevet; andre filer bliver ikke rørt. Fortsæt?`)) return;
        this.dir = dir;
        this.known = new Set();
      }
      if (this.dir !== null) {
        await writeDirectory(this.dir, files, this.known);
        this.known = new Set(files.keys());
        announce(`Gemt i mappen "${this.dir.name}"`);
      } else {
        download(`${this.store.project.game.id}-project.zip`, zipOf(files), "application/zip");
        announce("Projektet er gemt som ZIP");
      }
      this.store.markSaved();
      await clearDraft().catch(() => undefined);
    } catch (err) {
      if ((err as Error).name !== "AbortError") window.alert(`Kunne ikke gemme: ${(err as Error).message}`);
    }
  }

  private exportProject(): void {
    download(`${this.store.project.game.id}-project.zip`, zipOf(this.store.allFiles()), "application/zip");
    announce("Kildeprojektet er eksporteret");
  }

  /** The runtime bundle (strictly validated) with its assets as a ZIP: bundle.json + assets/. */
  private exportBundle(): void {
    const v = validateProject(this.store.allFiles(), { strict: true });
    if (!v.ok || v.project === null) {
      announce("Bundlen kan ikke bygges: projektet har fejl");
      this.store.select({ tab: "problems" });
      return;
    }
    const project: Project = v.project;
    const { json } = buildBundle(project);
    const out = new Map<string, Uint8Array>([["bundle.json", new TextEncoder().encode(json)]]);
    for (const a of Object.values(project.assets)) {
      for (const f of [a.file, ...(a.alternatives ?? []).map((x) => x.file)]) {
        const bytes = this.store.files.get(`assets/${f}`);
        if (bytes !== undefined) out.set(`assets/${f}`, bytes);
      }
    }
    download(`${project.game.id}-bundle.zip`, zipOf(out), "application/zip");
    announce("Bundlen er eksporteret");
  }

  // ---------------------------------------------------------------------------
  // Recovery
  // ---------------------------------------------------------------------------

  private scheduleDraft(): void {
    if (this.draftTimer !== null) window.clearTimeout(this.draftTimer);
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = null;
      if (!this.store.dirty) return;
      void saveDraft({ name: this.store.name, savedAt: new Date().toISOString(), zip: zipOf(this.store.allFiles()) })
        .then(() => {
          document.documentElement.dataset["draft"] = "saved";
        })
        .catch((err: unknown) => console.warn("[editor] recovery draft failed", err));
    }, 800);
  }

  private async offerRecovery(): Promise<void> {
    const draft = await loadDraft().catch(() => null);
    if (draft === null) return;
    const box = el("div", { class: "recovery", role: "alertdialog", "aria-labelledby": "recovery-title" }, [
      el("h2", { id: "recovery-title", text: "Ugemt kladde fundet" }),
      el("p", { text: `Der findes en automatisk kladde af "${draft.name}" fra ${new Date(draft.savedAt).toLocaleString("da-DK")}. Kladden er ikke et gemt spil og ikke et gemt projekt.` }),
      button(
        "Gendan kladde",
        () => {
          void readDraftFiles(draft.zip).then((files) => {
            const err = this.openFrom(files, draft.name);
            if (err !== null) window.alert(err);
            box.remove();
            // A restored draft is unsaved work: it stays dirty until saved.
            this.store.apply("Gendan kladde", (p) => ({ ...p }));
          });
        },
        { "data-action": "restore-draft" },
      ),
      button(
        "Kassér kladde",
        () => {
          void clearDraft();
          box.remove();
        },
        { "data-action": "discard-draft" },
      ),
    ]);
    document.body.append(box);
    box.querySelector("button")?.focus();
  }
}

async function readDraftFiles(zip: Uint8Array): Promise<Map<string, Uint8Array>> {
  return filesFromZip(new Blob([zip as BlobPart]));
}
