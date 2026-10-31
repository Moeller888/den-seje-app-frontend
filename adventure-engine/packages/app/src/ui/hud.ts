/**
 * Cursor (layer 7), tooltip, "cannot" feedback and the hotspot list (layer 5).
 */

import type { ClickTarget } from "@adventure-engine/core";
import type { CursorView } from "../model/cursor.ts";
import type { Hotspot } from "../model/hotspots.ts";
import { format } from "../model/settings.ts";
import { el } from "./dom.ts";

const ICONS: Readonly<Record<string, string>> = {
  idle: '<path d="M4 2 L4 26 L10 20 L15 30 L19 28 L14 18 L22 18 Z" fill="#fff" stroke="#111" stroke-width="2"/>',
  walk: '<ellipse cx="11" cy="20" rx="5" ry="8" fill="#fff" stroke="#111" stroke-width="2"/><ellipse cx="22" cy="12" rx="5" ry="8" fill="#fff" stroke="#111" stroke-width="2"/>',
  interact: '<path d="M8 30 L8 14 Q8 10 11 10 Q14 10 14 14 L14 4 Q14 1 17 1 Q20 1 20 4 L20 13 L26 14 Q29 15 28 19 L26 30 Z" fill="#ffe7a3" stroke="#111" stroke-width="2"/>',
  talk: '<path d="M3 5 H29 V21 H13 L6 28 V21 H3 Z" fill="#fff" stroke="#111" stroke-width="2"/>',
  portal: '<path d="M4 16 H20 M14 8 L22 16 L14 24" fill="none" stroke="#fff" stroke-width="5"/><path d="M4 16 H20 M14 8 L22 16 L14 24" fill="none" stroke="#111" stroke-width="2"/><rect x="24" y="3" width="5" height="26" fill="#111"/>',
  portal_locked: '<rect x="7" y="14" width="18" height="14" fill="#ddd" stroke="#111" stroke-width="2"/><path d="M11 14 V9 Q16 2 21 9 V14" fill="none" stroke="#111" stroke-width="3"/>',
  busy: '<path d="M8 3 H24 L16 16 L24 29 H8 L16 16 Z" fill="#fff" stroke="#111" stroke-width="2"/>',
};

export class CursorLayer {
  private readonly node: HTMLElement;
  private readonly tip: HTMLElement;
  private shown = "";

  constructor(node: HTMLElement, tip: HTMLElement) {
    this.node = node;
    this.tip = tip;
  }

  /** `point` is in logical viewport coordinates; null hides the cursor (pointer outside or keyboard use). */
  private flashTimer: number | null = null;

  /**
   * Click feedback (spec 04 D1: 200 ms). Driven by a timer, not by frames, so
   * it is shown for the full duration even when frames are slow.
   */
  flash(ms: number): void {
    this.node.classList.add("clicking");
    if (this.flashTimer !== null) window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      this.node.classList.remove("clicking");
      this.flashTimer = null;
    }, ms);
  }

  update(view: CursorView, point: readonly [number, number] | null, iconUrl: string | null, tooltip: string | null): void {
    const key = `${view.mode}|${iconUrl ?? ""}`;
    if (key !== this.shown) {
      this.shown = key;
      this.node.replaceChildren();
      if (view.mode === "use" && iconUrl !== null) this.node.append(el("img", { src: iconUrl, alt: "", class: "cursor-icon" }));
      else {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 32 32");
        svg.setAttribute("width", "32");
        svg.setAttribute("height", "32");
        svg.innerHTML = ICONS[view.mode] ?? ICONS["idle"] ?? "";
        this.node.append(svg);
      }
    }
    this.node.dataset["mode"] = view.mode;
    this.node.hidden = point === null;
    if (point !== null) this.node.style.transform = `translate(${Math.round(point[0])}px, ${Math.round(point[1])}px)`;
    const showTip = point !== null && tooltip !== null && tooltip !== "" && view.mode !== "busy";
    this.tip.hidden = !showTip;
    if (showTip && point !== null) {
      this.tip.textContent = tooltip;
      const x = Math.min(Math.max(8, point[0] + 18), 1280 - this.tip.offsetWidth - 8);
      const y = Math.max(8, point[1] - this.tip.offsetHeight - 10);
      this.tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }
}

/** Tooltip text for a cursor view (spec 04 D2: with a selected item it names the target). */
export function tooltipText(view: CursorView, text: (key: string) => string): string | null {
  if (view.mode === "use") {
    const item = view.useItemKey === null ? "" : text(view.useItemKey);
    return view.tooltipKey === null ? format(text("ui.use_item"), { item }) : format(text("ui.use_on"), { item, target: text(view.tooltipKey) });
  }
  return view.tooltipKey === null ? null : text(view.tooltipKey);
}

export interface HotspotDeps {
  readonly host: HTMLElement;
  text(key: string): string;
  activate(target: ClickTarget): void;
}

export class HotspotList {
  private readonly d: HotspotDeps;
  private signature = "";
  private readonly heading: HTMLElement;
  private readonly list: HTMLElement;

  constructor(deps: HotspotDeps) {
    this.d = deps;
    this.heading = el("h2", { class: "hotspots-title", id: "hotspots-title" });
    this.list = el("ul", { class: "hotspots-list" });
    deps.host.setAttribute("aria-labelledby", "hotspots-title");
    deps.host.append(this.heading, this.list);
  }

  render(spots: readonly Hotspot[], selectedName: string | null, modal: boolean, force: boolean): void {
    const sig = JSON.stringify([spots.map((s) => [s.key, s.nameKey, s.locked]), selectedName, modal]);
    if (!force && sig === this.signature) return;
    this.signature = sig;
    this.heading.textContent = this.d.text("ui.hotspots");
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.["hotspot"];
    this.list.replaceChildren(
      ...spots.map((s) => {
        const name = s.nameKey === null ? s.key : this.d.text(s.nameKey);
        const label = selectedName === null ? name : format(this.d.text("ui.use_on"), { item: selectedName, target: name });
        const b = el("button", { type: "button", class: `hotspot ${s.kind}`, "data-hotspot": s.key, text: label });
        if (modal) b.setAttribute("aria-disabled", "true");
        b.addEventListener("click", () => {
          if (b.getAttribute("aria-disabled") !== "true") this.d.activate(s.target);
        });
        return el("li", {}, [b]);
      }),
    );
    if (focused !== undefined) this.list.querySelector<HTMLElement>(`[data-hotspot="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  }
}
