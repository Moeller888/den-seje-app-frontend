/** Tiny DOM helpers (no framework). */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string>> = {},
  children: ReadonlyArray<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  // Safari/WebKit leave buttons out of the Tab order unless they have an explicit tabindex.
  if (tag === "button" && attrs["tabindex"] === undefined) node.setAttribute("tabindex", "0");
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/** The element with this id; a missing element is a programming error and fails loudly. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing element #${id}`);
  return node as T;
}
