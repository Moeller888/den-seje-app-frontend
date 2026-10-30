/**
 * Speech bubbles (layer 4) and the choice menu (layer 5), spec 04 D6 / 06 F5.
 *
 * - A Say stays until it is confirmed by a click anywhere, Enter or Space; it
 *   is never completed automatically (spec 01/06: Say/Choose wait for the player).
 * - The choice menu supports pointer hover/click, arrow keys + Enter and digits.
 * - Texts are looked up at display time, so a language switch updates them at once.
 */

import type { ChoiceOption, Command } from "@adventure-engine/core";
import { ChoiceMenuModel, confirmsSay } from "../model/choice-menu.ts";
import { placeBubble } from "../model/speech.ts";
import { el } from "./dom.ts";

type SayCmd = Extract<Command, { type: "Say" }>;
type ChooseCmd = Extract<Command, { type: "Choose" }>;

export interface DialogDeps {
  readonly speechLayer: HTMLElement;
  readonly menuHost: HTMLElement;
  readonly live: HTMLElement;
  text(key: string): string;
  nameOf(actor: string): string;
  /** Speaker anchor for bubble placement. */
  speaker(actor: string): { feet: readonly [number, number] | null; height: number; region: unknown; scrollX: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly bottomInset: number;
  reply(cmdId: string, reply: { kind: "done" } | { kind: "choice"; optionId: string }): void;
}

export class DialogView {
  private readonly d: DialogDeps;
  private says: SayCmd[] = [];
  private choose: { cmd: ChooseCmd; model: ChoiceMenuModel; returnFocus: Element | null } | null = null;
  private bubble: HTMLElement | null = null;
  private shownSay: string | null = null;

  constructor(deps: DialogDeps) {
    this.d = deps;
  }

  get sayOpen(): boolean {
    return this.says.length > 0;
  }

  /** Speaker of the line on screen (drives the talk animation). */
  get speaker(): string | null {
    return this.says[0]?.speaker ?? null;
  }

  get menuOpen(): boolean {
    return this.choose !== null;
  }

  say(cmd: SayCmd): void {
    this.says.push(cmd);
  }

  showChoose(cmd: ChooseCmd): void {
    this.choose = { cmd, model: new ChoiceMenuModel(cmd.options.length), returnFocus: document.activeElement };
    this.renderMenu();
  }

  /** All dialog UI disappears (DialogEnd, new game). */
  clear(): void {
    this.says = [];
    this.closeMenu();
    this.renderSay(true);
  }

  confirmSay(): boolean {
    const cmd = this.says.shift();
    if (cmd === undefined) return false;
    this.renderSay(true);
    this.d.reply(cmd.cmdId, { kind: "done" });
    return true;
  }

  /** Keyboard handling; true when the key was used. */
  key(key: string): boolean {
    if (this.sayOpen) {
      if (!confirmsSay(key)) return false;
      this.confirmSay();
      return true;
    }
    if (this.choose === null) return false;
    const action = this.choose.model.key(key);
    if (action === null) return false;
    if (action.kind === "move") this.highlight(true);
    else this.pick(action.index);
    return true;
  }

  /** Per frame: (re)place the current bubble; `force` re-renders texts (language switch). */
  update(force: boolean): void {
    this.renderSay(force);
    if (force && this.choose !== null) this.renderMenu();
  }

  private renderSay(force: boolean): void {
    const cmd = this.says[0];
    if (cmd === undefined) {
      this.bubble?.remove();
      this.bubble = null;
      this.shownSay = null;
      return;
    }
    if (this.bubble === null || this.shownSay !== cmd.cmdId || force) {
      this.bubble?.remove();
      const text = this.d.text(cmd.textKey);
      const name = this.d.nameOf(cmd.speaker);
      this.bubble = el("div", { class: "bubble", role: "dialog", "aria-live": "off", "data-speaker": cmd.speaker, "data-key": cmd.textKey }, [
        el("div", { class: "bubble-name", text: name }),
        el("div", { class: "bubble-text", text }),
        el("div", { class: "bubble-hint", text: `${this.d.text("ui.continue")} ⏎` }),
      ]);
      this.d.speechLayer.append(this.bubble);
      if (this.shownSay !== cmd.cmdId) this.d.live.textContent = `${name}: ${text}`;
      this.shownSay = cmd.cmdId;
    }
    const s = this.d.speaker(cmd.speaker);
    const place = placeBubble({
      region: s.region,
      feet: s.feet,
      speakerHeight: s.height,
      scrollX: s.scrollX,
      bubble: { width: this.bubble.offsetWidth, height: this.bubble.offsetHeight },
      viewport: this.d.viewport,
      bottomInset: this.d.bottomInset,
    });
    this.bubble.style.transform = `translate(${Math.round(place.x)}px, ${Math.round(place.y)}px)`;
    this.bubble.dataset["placement"] = place.source;
  }

  private renderMenu(): void {
    const c = this.choose;
    const host = this.d.menuHost;
    host.replaceChildren();
    if (c === null) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.append(el("div", { class: "menu-title", id: "menu-title", text: this.d.text("ui.choose") }));
    const list = el("div", { class: "menu-list", role: "menu", "aria-labelledby": "menu-title" });
    c.cmd.options.forEach((opt: ChoiceOption, i) => {
      const b = el("button", { type: "button", role: "menuitem", class: "menu-option", "data-option": opt.id, tabindex: "-1" }, [
        el("span", { class: "menu-num", "aria-hidden": "true", text: `${i + 1}` }),
        el("span", { text: this.d.text(opt.textKey) }),
      ]);
      b.addEventListener("pointerenter", () => {
        c.model.hover(i);
        this.highlight(false);
      });
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.pick(i);
      });
      list.append(b);
    });
    host.append(list);
    this.highlight(true);
  }

  private highlight(focus: boolean): void {
    const c = this.choose;
    if (c === null) return;
    const buttons = [...this.d.menuHost.querySelectorAll<HTMLButtonElement>(".menu-option")];
    buttons.forEach((b, i) => {
      const on = i === c.model.index;
      b.classList.toggle("active", on);
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus({ preventScroll: true });
    });
  }

  private pick(index: number): void {
    const c = this.choose;
    const opt = c?.cmd.options[index];
    if (c === null || opt === undefined) return;
    this.closeMenu();
    this.d.reply(c.cmd.cmdId, { kind: "choice", optionId: opt.id });
  }

  private closeMenu(): void {
    const c = this.choose;
    this.choose = null;
    this.d.menuHost.replaceChildren();
    this.d.menuHost.hidden = true;
    if (c?.returnFocus instanceof HTMLElement && c.returnFocus.isConnected) c.returnFocus.focus({ preventScroll: true });
  }
}
