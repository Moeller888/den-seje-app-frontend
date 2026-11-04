/**
 * Inventory panel (spec 04 D4), part of the UI layer. It shows the engine's
 * inventory window; all decisions (select, deselect, combine, scroll clamp)
 * are made by core. The panel slides up while the pointer or focus is inside.
 */

import type { InventoryView } from "@adventure-engine/core";
import { el } from "./dom.ts";

export interface InventoryDeps {
  readonly host: HTMLElement;
  text(key: string): string;
  nameOf(item: string): string;
  iconUrl(item: string): string | null;
  click(item: string): void;
  hover(item: string | null): void;
  scroll(delta: number): void;
  /** An icon that failed to load (reported as W-ASSET-LOAD). */
  iconFailed(item: string, url: string): void;
}

export class InventoryPanel {
  private readonly d: InventoryDeps;
  private signature = "";
  /** True while focus is restored after a re-render; that is not a user moving to an item. */
  private restoringFocus = false;
  private readonly slots: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly forward: HTMLButtonElement;
  private readonly label: HTMLElement;

  constructor(deps: InventoryDeps) {
    this.d = deps;
    const host = deps.host;
    this.label = el("span", { class: "sr-only", id: "inventory-label" });
    this.back = el("button", { type: "button", class: "inv-scroll", "data-scroll": "back", text: "‹" });
    this.forward = el("button", { type: "button", class: "inv-scroll", "data-scroll": "forward", text: "›" });
    this.slots = el("ul", { class: "inv-slots", "aria-labelledby": "inventory-label" });
    host.setAttribute("aria-labelledby", "inventory-label");
    host.append(this.label, this.back, this.slots, this.forward);
    this.back.addEventListener("click", () => deps.scroll(-1));
    this.forward.addEventListener("click", () => deps.scroll(1));
    host.addEventListener("pointerenter", () => deps.hover(null));
  }

  render(view: InventoryView, force: boolean): void {
    const sig = JSON.stringify([view.visible, view.offset, view.selected, view.canScrollBack, view.canScrollForward, view.slots]);
    if (!force && sig === this.signature) return;
    this.signature = sig;
    this.label.textContent = this.d.text("ui.inventory");
    this.back.setAttribute("aria-label", this.d.text("ui.scroll_back"));
    this.forward.setAttribute("aria-label", this.d.text("ui.scroll_forward"));
    this.back.disabled = !view.canScrollBack;
    this.forward.disabled = !view.canScrollForward;
    this.d.host.dataset["items"] = view.items.join(",");
    this.d.host.dataset["selected"] = view.selected ?? "";
    const children: HTMLElement[] = [];
    for (let i = 0; i < view.slots; i++) {
      const item = view.visible[i];
      if (item === undefined) {
        children.push(el("li", { class: "inv-slot empty", "aria-hidden": "true" }));
        continue;
      }
      const name = this.d.nameOf(item);
      const selected = view.selected === item;
      const button = el("button", {
        type: "button",
        class: "inv-item",
        "data-item": item,
        "aria-pressed": selected ? "true" : "false",
        "aria-label": selected ? `${name} (${this.d.text("ui.selected")})` : name,
      });
      const url = this.d.iconUrl(item);
      if (url !== null) {
        const img = el("img", { src: url, alt: "", draggable: "false" });
        img.addEventListener("error", () => {
          img.remove();
          button.classList.add("broken");
          this.d.iconFailed(item, url);
        });
        button.append(img);
      } else button.append(el("span", { class: "inv-text", text: name }));
      button.addEventListener("click", () => this.d.click(item));
      button.addEventListener("pointerenter", () => this.d.hover(item));
      button.addEventListener("focus", () => {
        if (!this.restoringFocus) this.d.hover(item);
      });
      children.push(el("li", { class: "inv-slot" }, [button]));
    }
    // Keep keyboard focus on the same item across re-renders.
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.["item"];
    this.slots.replaceChildren(...children);
    if (focused !== undefined) {
      this.restoringFocus = true;
      try {
        this.slots.querySelector<HTMLElement>(`[data-item="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
      } finally {
        this.restoringFocus = false;
      }
    }
  }
}
