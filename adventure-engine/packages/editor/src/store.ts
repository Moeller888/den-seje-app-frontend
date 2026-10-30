/**
 * Editor state: the project document with its command history, the asset
 * bytes, the current selection and the latest validation. Every edit is a
 * named command on the history (undo/redo, dirty/clean); validation runs the
 * same validator as the CLI after each change. Preview runtime state never
 * enters this store.
 */

import { History, newProject, validateProject, withAssets, type Problem, type Project } from "@adventure-engine/content-tools";

export type Tab = "project" | "scenes" | "entities" | "graphs" | "texts" | "assets" | "media" | "problems" | "preview";

export type ShapeRef =
  | { readonly layer: "walkable" | "blockers" | "objectZones" | "actorZones" | "triggerZones"; readonly index: number }
  | { readonly layer: "portals"; readonly id: string }
  | { readonly layer: "spots"; readonly id: string }
  | { readonly layer: "speechRegions" | "portraitRegions"; readonly id: string };

export type EntityRef = { readonly kind: "scene" | "actor" | "object" | "portal" | "sound" | "animation"; readonly id: string };

export interface Selection {
  readonly tab: Tab;
  readonly scene: string | null;
  readonly shape: ShapeRef | null;
  readonly point: number | null;
  readonly entity: EntityRef | null;
  readonly graph: string | null;
  readonly node: string | null;
  readonly asset: string | null;
  readonly textKey: string | null;
}

export const EMPTY_SELECTION: Selection = { tab: "project", scene: null, shape: null, point: null, entity: null, graph: null, node: null, asset: null, textKey: null };

export class EditorStore {
  readonly history: History<Project, Selection>;
  /** Asset bytes and other files of the opened project (path → bytes). */
  files = new Map<string, Uint8Array>();
  problems: readonly Problem[] = [];
  /** Name shown in the title bar (folder or file name). */
  name = "nyt-projekt";
  private readonly listeners = new Set<() => void>();

  constructor(limit = 200) {
    const p = newProject("nyt-projekt");
    this.history = new History<Project, Selection>(p, { ...EMPTY_SELECTION, scene: p.scenes[0]?.id ?? null }, limit);
    this.validate();
  }

  get project(): Project {
    return this.history.doc;
  }

  get selection(): Selection {
    return this.history.selection;
  }

  get dirty(): boolean {
    return this.history.dirty;
  }

  subscribe(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  private emit(): void {
    for (const f of this.listeners) f();
  }

  /** Never throws: an unexpected failure of the validator is shown as a problem instead of breaking the editor. */
  validate(): void {
    try {
      this.problems = validateProject(withAssets(this.project, this.files)).problems;
    } catch (err) {
      this.problems = [{ code: "E-EDITOR-VALIDATE", level: "error", file: "", path: "", message: `validation failed: ${err instanceof Error ? err.message : String(err)}` }];
    }
  }

  /** Run an edit as one undoable command. Errors are returned as text and leave the document unchanged. */
  apply(label: string, edit: (p: Project) => Project, selection?: Partial<Selection>): string | null {
    try {
      const changed = this.history.apply(label, edit, { ...this.selection, ...selection });
      if (changed) this.validate();
      this.emit();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  select(change: Partial<Selection>): void {
    this.history.select({ ...this.selection, ...change });
    this.emit();
  }

  undo(): boolean {
    const ok = this.history.undo();
    if (ok) {
      this.validate();
      this.emit();
    }
    return ok;
  }

  redo(): boolean {
    const ok = this.history.redo();
    if (ok) {
      this.validate();
      this.emit();
    }
    return ok;
  }

  /** Open a project (no history, clean). */
  open(project: Project, files: ReadonlyMap<string, Uint8Array>, name: string): void {
    this.files = new Map(files);
    this.name = name;
    this.history.reset(project, { ...EMPTY_SELECTION, tab: this.selection.tab, scene: project.scenes[0]?.id ?? null, graph: project.graphs[0]?.id ?? null });
    this.validate();
    this.emit();
  }

  markSaved(): void {
    this.history.markSaved();
    this.emit();
  }

  /** Asset bytes changed outside a command (import adds files; they are only written when registered). */
  setFiles(files: ReadonlyMap<string, Uint8Array>): void {
    this.files = new Map(files);
  }

  /** All files of the current project (canonical JSON and the registered assets). */
  allFiles(): Map<string, Uint8Array> {
    return withAssets(this.project, this.files);
  }

  /** Problems that belong to one project file. */
  problemsIn(file: string): readonly Problem[] {
    return this.problems.filter((p) => p.file === file);
  }
}
