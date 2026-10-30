/** DOM helpers of the editor (no framework, like the game app). */

import { safeFileName } from "@adventure-engine/content-tools";

export type Attrs = Readonly<Record<string, string | undefined>>;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, children: ReadonlyArray<Node | string | null> = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (tag === "button" && attrs["tabindex"] === undefined) node.setAttribute("tabindex", "0");
  if (tag === "button" && attrs["type"] === undefined) node.setAttribute("type", "button");
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c !== null) node.append(c);
  return node;
}

export const SVG = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Readonly<Record<string, string | number | undefined>> = {}, children: ReadonlyArray<Node | null> = []): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v));
  for (const c of children) if (c !== null) node.append(c);
  return node;
}

export function button(text: string, action: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = el("button", { text, ...attrs });
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    action();
  });
  return b;
}

let ids = 0;
/** A unique element id for label/for pairs. */
export const uid = (prefix: string): string => `${prefix}-${++ids}`;

/** A labelled control in a row. `key` is a stable id used to restore focus after re-rendering. */
export function field(label: string, control: HTMLElement, key?: string): HTMLElement {
  const id = control.id !== "" ? control.id : uid("f");
  control.id = id;
  if (key !== undefined) control.dataset["key"] = key;
  return el("div", { class: "field" }, [el("label", { for: id, text: label }), control]);
}

export function textInput(value: string, onChange: (v: string) => void, attrs: Attrs = {}): HTMLInputElement {
  const i = el("input", { type: "text", value, spellcheck: "false", ...attrs });
  i.value = value;
  i.addEventListener("change", () => onChange(i.value));
  return i;
}

export function numberInput(value: number | undefined, onChange: (v: number | undefined) => void, attrs: Attrs = {}): HTMLInputElement {
  const i = el("input", { type: "number", step: "any", ...attrs });
  i.value = value === undefined ? "" : String(value);
  i.addEventListener("change", () => onChange(i.value.trim() === "" ? undefined : Number(i.value)));
  return i;
}

export function checkbox(checked: boolean, onChange: (v: boolean) => void, attrs: Attrs = {}): HTMLInputElement {
  const i = el("input", { type: "checkbox", ...attrs });
  i.checked = checked;
  i.addEventListener("change", () => onChange(i.checked));
  return i;
}

/** A select; `value` not among the options is shown as an extra "(ukendt)" option so nothing is hidden. */
export function select(options: ReadonlyArray<string | readonly [string, string]>, value: string, onChange: (v: string) => void, attrs: Attrs = {}): HTMLSelectElement {
  const s = el("select", attrs);
  const list = options.map((o) => (typeof o === "string" ? ([o, o] as const) : o));
  if (!list.some(([v]) => v === value)) s.append(el("option", { value, text: value === "" ? "—" : `${value} (ukendt)` }));
  for (const [v, label] of list) s.append(el("option", { value: v, text: label }));
  s.value = value;
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

export function heading(level: 2 | 3 | 4, text: string): HTMLElement {
  return el(`h${level}` as "h2", { text });
}

/** Announce a message to screen readers and show it in the status line. */
export function announce(text: string): void {
  const live = document.getElementById("announce");
  if (live !== null) live.textContent = text;
  const status = document.getElementById("status-message");
  if (status !== null) status.textContent = text;
}

/** Download bytes as a file; the name is reduced to safe characters ("._-", letters, digits). */
export function download(name: string, data: Uint8Array | string, type: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = el("a", { href: url, download: safeFileName(name) });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
