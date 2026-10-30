/**
 * What every tab receives, plus shared widgets: reference pickers that only
 * offer compatible ids, the references list of an element, safe rename and
 * guarded delete.
 */

import type { AssetKind, Project, RefTarget, Slot } from "@adventure-engine/content-tools";
import { deleteElement, references, rename } from "@adventure-engine/content-tools";
import { announce, button, el, field, select, textInput } from "../dom.ts";
import type { EditorStore, Selection } from "../store.ts";

export interface Commands {
  newProject(id: string, languages: readonly string[]): string | null;
  openFolder(): void;
  openFiles(list: FileList, zip: boolean): void;
  save(): void;
  saveAs(): void;
  exportProject(): void;
  exportBundle(): void;
  openProject(files: ReadonlyMap<string, Uint8Array>, name: string): string | null;
}

export interface Ctx {
  readonly store: EditorStore;
  readonly urls: AssetUrls;
  /** Run one undoable edit; returns an error text or null. */
  apply(label: string, edit: (p: Project) => Project, selection?: Partial<Selection>): string | null;
  select(s: Partial<Selection>): void;
  readonly commands: Commands;
}

/** Object URLs for asset previews, one per file content (revoked when the content is gone). */
export class AssetUrls {
  private readonly bySha = new Map<string, { url: string; bytes: Uint8Array }>();

  url(sha: string, bytes: Uint8Array | undefined, type: string): string | null {
    if (bytes === undefined) return null;
    const hit = this.bySha.get(sha);
    if (hit !== undefined && hit.bytes === bytes) return hit.url;
    if (hit !== undefined) URL.revokeObjectURL(hit.url);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    this.bySha.set(sha, { url, bytes });
    return url;
  }

  /** Release every URL (another project was opened). */
  clear(): void {
    for (const { url } of this.bySha.values()) URL.revokeObjectURL(url);
    this.bySha.clear();
  }

  /** URL of a registered asset of the project, or null. */
  forAsset(store: EditorStore, id: string): string | null {
    const a = store.project.assets[id];
    if (a === undefined) return null;
    return this.url(a.sha256, store.files.get(`assets/${a.file}`), a.type);
  }
}

// ---------------------------------------------------------------------------
// Pickers: only compatible ids are offered
// ---------------------------------------------------------------------------

export const NONE = "";

export function sceneIds(p: Project): string[] {
  return p.scenes.map((s) => s.id);
}

export function actorIds(p: Project): string[] {
  return p.actors.map((a) => a.id);
}

export function objectIds(p: Project): string[] {
  return p.objects.map((o) => o.id);
}

export function entityIds(p: Project): string[] {
  return [...actorIds(p), ...objectIds(p)];
}

export function assetIds(p: Project, kinds: readonly AssetKind[]): string[] {
  return Object.keys(p.assets)
    .filter((id) => kinds.includes((p.assets[id] as { kind: AssetKind }).kind))
    .sort();
}

export function textKeys(p: Project): string[] {
  const keys = new Set<string>();
  for (const t of Object.values(p.i18n)) for (const k of Object.keys(t)) keys.add(k);
  return [...keys].sort();
}

export function entryRefs(p: Project): string[] {
  return p.graphs.flatMap((g) => g.nodes.flatMap((n) => (n.type === "entry" ? [`${g.id}#${n.name}`] : [])));
}

export function spotsOf(p: Project, scene: string | null | undefined): string[] {
  if (scene === null || scene === undefined || scene === "*") return [...new Set(p.scenes.flatMap((s) => Object.keys(s.spots ?? {})))].sort();
  return Object.keys(p.scenes.find((s) => s.id === scene)?.spots ?? {});
}

export function soundIds(p: Project): string[] {
  return p.sounds.map((s) => s.id);
}

export function animationIds(p: Project): string[] {
  return p.animations.map((a) => a.id);
}

/** A picker with an empty choice (for optional references). */
export function picker(label: string, options: readonly string[], value: string | undefined | null, onChange: (v: string | undefined) => void, key: string, optional = true): HTMLElement {
  const opts: Array<readonly [string, string]> = [...(optional ? [[NONE, "— ingen —"] as const] : []), ...options.map((o) => [o, o] as const)];
  return field(label, select(opts, value ?? NONE, (v) => onChange(v === NONE ? undefined : v), { "data-key": key }), key);
}

// ---------------------------------------------------------------------------
// References, rename, delete
// ---------------------------------------------------------------------------

/** Human-readable place of a reference slot. */
export function slotLabel(p: Project, s: Slot): string {
  const [head, i, ...rest] = s.path;
  const name =
    head === "scenes" ? `scene ${p.scenes[i as number]?.id}` : head === "graphs" ? `graf ${p.graphs[i as number]?.id}` : head === "actors" ? `aktør ${p.actors[i as number]?.id}` : head === "objects" ? `objekt ${p.objects[i as number]?.id}` : head === "portals" ? `portal ${p.portals[i as number]?.id}` : String(head);
  const tail = (head === "graphs" && rest[0] === "nodes" ? [`node ${p.graphs[i as number]?.nodes[rest[1] as number]?.id}`, ...rest.slice(2)] : i === undefined ? [] : typeof i === "number" ? rest : [i, ...rest]).join(".");
  return tail === "" ? name : `${name}: ${tail}`;
}

export function referencesView(ctx: Ctx, t: RefTarget): HTMLElement {
  const refs = references(ctx.store.project, t);
  const list = el("ul", { class: "refs", "data-refs": String(refs.length), "aria-label": `Referencer til ${t.id}` });
  for (const s of refs) list.append(el("li", { text: slotLabel(ctx.store.project, s) }));
  if (refs.length === 0) list.append(el("li", { class: "muted", text: "Ingen referencer" }));
  return el("details", { class: "refs-box", open: refs.length > 0 && refs.length <= 8 ? "" : undefined }, [el("summary", { text: `Referencer (${refs.length})` }), list]);
}

/**
 * Rename with reference update: the new id is checked by the same rename
 * function the tests cover; the number of changed places is announced.
 */
export function renameView(ctx: Ctx, t: RefTarget, after: (newId: string) => Partial<Selection>, label = "Omdøb"): HTMLElement {
  const input = textInput(t.id, () => {}, { "data-key": `rename-${t.kind}-${t.id}`, "aria-label": `Nyt id for ${t.id}`, name: "rename" });
  const msg = el("span", { class: "inline-error", role: "alert" });
  const go = button(
    label,
    () => {
      const to = input.value.trim();
      const r = rename(ctx.store.project, t, to);
      if (!r.ok) {
        msg.textContent = r.message;
        return;
      }
      const count = r.changed;
      const err = ctx.apply(`Omdøb ${t.id} til ${to}`, () => r.project, after(to));
      if (err === null) announce(`Omdøbt ${t.id} til ${to}; ${count} steder opdateret`);
    },
    { "data-key": `rename-go-${t.kind}-${t.id}`, "data-action": "rename" },
  );
  return el("div", { class: "row rename" }, [field("Id", input), go, msg]);
}

/** Delete with a guard: a referenced element is not deleted; its references are listed instead. */
export function deleteView(ctx: Ctx, t: RefTarget, after: Partial<Selection>, extra?: (p: Project) => Project): HTMLElement {
  const msg = el("div", { class: "inline-error", role: "alert" });
  const b = button(
    "Slet",
    () => {
      const r = deleteElement(ctx.store.project, t);
      if (!r.ok) {
        msg.replaceChildren(el("p", { text: `Kan ikke slette "${t.id}": ${r.message}.` }), el("ul", {}, r.blockers.map((s) => el("li", { text: slotLabel(ctx.store.project, s) }))));
        announce(`Sletning afvist: ${t.id} har referencer`);
        return;
      }
      if (!window.confirm(`Slet "${t.id}"?`)) return;
      ctx.apply(`Slet ${t.id}`, () => (extra === undefined ? r.project : extra(r.project)), after);
    },
    { class: "danger", "data-key": `delete-${t.kind}-${t.id}`, "data-action": "delete" },
  );
  return el("div", { class: "delete" }, [b, msg]);
}

/** Problems of a file (optionally below a path prefix) as a compact list. */
export function problemList(ctx: Ctx, file: string, pathPrefix = ""): HTMLElement | null {
  const list = ctx.store.problemsIn(file).filter((p) => pathPrefix === "" || p.path === pathPrefix || p.path.startsWith(`${pathPrefix}.`) || p.path.startsWith(`${pathPrefix}[`));
  if (list.length === 0) return null;
  return el(
    "ul",
    { class: "problems-inline", "aria-label": "Problemer" },
    list.map((p) => el("li", { class: p.level, "data-code": p.code }, [el("strong", { text: p.code }), ` ${p.path === "" ? "" : `${p.path}: `}${p.message}`])),
  );
}

/** Move an item one step in a list (explicit content order). */
export function moved<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[index], out[j]] = [out[j] as T, out[index] as T];
  return out;
}
