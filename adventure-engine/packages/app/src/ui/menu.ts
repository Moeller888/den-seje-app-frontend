/**
 * Pause menu and save/load lists (spec 05 E3.3, phase 5). A modal dialog in the
 * screens layer: "pause" (resume, save, load, export, import, to title),
 * "save" and "load" (one row per slot). All actions are callbacks into the game;
 * the menu only renders and handles focus and keyboard.
 */

import { corruptStatus } from "../model/saves.ts";
import { el } from "./dom.ts";

export type MenuMode = "closed" | "pause" | "save" | "load";

export interface SlotRow {
  readonly slot: string;
  readonly label: string;
  /** "ok": details; "empty"; "corrupt": damaged or unloadable main file (backup offered when `backup`). */
  readonly state: "ok" | "empty" | "corrupt";
  readonly details: string;
  readonly backup: boolean;
  readonly reason: "damaged" | "unloadable" | null;
}

export interface MenuDeps {
  readonly host: HTMLElement;
  text(key: string): string;
  slots(): SlotRow[];
  /** Whether the game is running (save/export only then). */
  inGame(): boolean;
  resume(): void;
  save(slot: string): void;
  load(slot: string): void;
  restoreBackup(slot: string): void;
  exportSave(): void;
  importSave(file: File): void;
  toTitle(): void;
}

export class GameMenu {
  private readonly d: MenuDeps;
  private mode_: MenuMode = "closed";
  private returnFocus: Element | null = null;

  constructor(deps: MenuDeps) {
    this.d = deps;
    deps.host.hidden = true;
    deps.host.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        this.back();
      } else if (ev.key === "Tab") {
        // Modal dialog: Tab cycles inside the menu.
        const buttons = [...deps.host.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (first === undefined || last === undefined) return;
        if (ev.shiftKey && document.activeElement === first) {
          ev.preventDefault();
          last.focus();
        } else if (!ev.shiftKey && document.activeElement === last) {
          ev.preventDefault();
          first.focus();
        }
      }
    });
  }

  get host(): HTMLElement {
    return this.d.host;
  }

  get mode(): MenuMode {
    return this.mode_;
  }

  get open(): boolean {
    return this.mode_ !== "closed";
  }

  show(mode: Exclude<MenuMode, "closed">): void {
    if (this.mode_ === "closed") this.returnFocus = document.activeElement;
    this.mode_ = mode;
    this.render();
  }

  close(): void {
    this.mode_ = "closed";
    this.d.host.hidden = true;
    this.d.host.replaceChildren();
    if (this.returnFocus instanceof HTMLElement && this.returnFocus.isConnected) this.returnFocus.focus({ preventScroll: true });
  }

  /** Escape: a list goes back to the pause page (or closes when opened from the title); the pause page closes. */
  back(): void {
    if ((this.mode_ === "save" || this.mode_ === "load") && this.d.inGame()) this.show("pause");
    else if (this.mode_ === "pause" && this.d.inGame()) this.d.resume();
    else this.close();
  }

  /** Re-render (language switch, slot changes). */
  refresh(): void {
    if (this.open) this.render();
  }

  private button(text: string, action: () => void, attrs: Record<string, string> = {}): HTMLButtonElement {
    const b = el("button", { type: "button", class: "menu-button", text, ...attrs });
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      action();
    });
    return b;
  }

  private render(): void {
    const t = (k: string): string => this.d.text(k);
    const host = this.d.host;
    host.hidden = false;
    host.dataset["mode"] = this.mode_;
    const title = el("h2", { id: "game-menu-title", text: t(this.mode_ === "save" ? "ui.save_game" : this.mode_ === "load" ? "ui.load_game" : "ui.menu") });
    const body = el("div", { class: "game-menu-body" });
    if (this.mode_ === "pause") {
      const file = el("input", { type: "file", accept: "application/json,.json", class: "sr-only", id: "import-file", tabindex: "-1" });
      file.addEventListener("change", () => {
        const f = file.files?.[0];
        if (f !== undefined) this.d.importSave(f);
        file.value = "";
      });
      body.append(
        this.button(t("ui.resume"), () => this.d.resume(), { "data-action": "resume" }),
        this.button(t("ui.save_game"), () => this.show("save"), { "data-action": "save" }),
        this.button(t("ui.load_game"), () => this.show("load"), { "data-action": "load" }),
        this.button(t("ui.export"), () => this.d.exportSave(), { "data-action": "export" }),
        this.button(t("ui.import"), () => file.click(), { "data-action": "import" }),
        this.button(t("ui.to_title"), () => this.d.toTitle(), { "data-action": "title" }),
        file,
      );
    } else {
      const list = el("ul", { class: "slot-list" });
      for (const row of this.d.slots()) {
        if (this.mode_ === "save" && row.slot === "auto") continue;
        const status = row.state === "ok" ? row.details : row.state === "empty" ? t("ui.empty") : corruptStatus(row, t);
        const main =
          this.mode_ === "save"
            ? this.button(`${row.label} – ${status}`, () => this.d.save(row.slot), { "data-slot": row.slot })
            : this.button(`${row.label} – ${status}`, () => this.d.load(row.slot), { "data-slot": row.slot });
        if (this.mode_ === "load" && row.state !== "ok") main.disabled = true;
        const li = el("li", { class: `slot-row ${row.state}` }, [main]);
        if (this.mode_ === "load" && row.state === "corrupt" && row.backup) {
          li.append(this.button(t("ui.restore_backup"), () => this.d.restoreBackup(row.slot), { "data-restore": row.slot }));
        }
        list.append(li);
      }
      body.append(list, this.button(t("ui.back"), () => this.back(), { "data-action": "back" }));
    }
    host.replaceChildren(el("div", { class: "game-menu", role: "dialog", "aria-modal": "true", "aria-labelledby": "game-menu-title" }, [title, body]));
    host.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus({ preventScroll: true });
  }
}
