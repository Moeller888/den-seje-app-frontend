/**
 * Phase 1 — introduction (D-310, LPD §5.1 stage 1 and §5.3): content cards of at most 80 words, then one
 * built-in comprehension check. The pupil is never tested on what the game has not introduced.
 *
 * NON-AUTHORITATIVE AND NOT EVIDENCE. The check is teaching content: whatever the pupil picks, the same
 * explanation is shown — the game judges nothing, records nothing and pays nothing. When the backend can
 * record exposure (LPD §5.3, not built), the host — not the game — will report it.
 *
 * KONSTRUERET UNDERVISNINGSMATERIALE: the cards are written for this prototype and must be checked by a
 * history teacher before any pupil sees them (D-310 §Lærergennemgang).
 *
 * F11-B — the SERVER's introduction (`showServer`): the cards come from the server through the host (bridge/3
 * `intro.present`), in the server's order, rendered as TEXT (textContent, never HTML). `onPresented` fires once the
 * first card is on screen (the host then reports "shown"); the final control calls `onFinish` (the host reports
 * "done" and waits for the server) and the view closes only when that succeeded — on a failure it stays open with
 * the error and the same control, so there is no dead end and nothing moves on without the server. The local check
 * (INTRO_CHECK) is not part of the server's introduction. Neither path is evidence.
 */
import { INTRO_CARDS, INTRO_CHECK, type IntroCard } from "./intro-content.ts";

export interface ServerIntro {
  readonly cards: readonly IntroCard[];
  /** The first card is rendered and visible. */
  readonly onPresented: () => void;
  /** The pupil pressed the final control; resolve when the server registered it, reject to keep the view open. */
  readonly onFinish: () => Promise<void>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export class IntroView {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly next: HTMLButtonElement;
  private step = 0;
  private done: (() => void) | null = null;
  /** F11-B: the server's introduction being shown, or null for the local prototype introduction. */
  private server: ServerIntro | null = null;
  private finishing = false;
  private readonly status: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = el("section", { id: "lv-intro", class: "lv-task", "aria-labelledby": "lv-intro-title", "data-step": "0" });
    this.root.hidden = true;
    const sheet = el("div", { class: "lv-sheet" });
    const head = el("div", { class: "lv-head" });
    head.append(el("h2", { id: "lv-intro-title" }, "Før du åbner skabet"), el("span", { class: "lv-mode" }, "Introduktion"));
    this.body = el("div", { id: "lv-intro-body" });
    this.next = el("button", { id: "lv-intro-next", type: "button", class: "lv-primary" }, "Videre");
    const note = el("p", { class: "lv-note" }, "Konstrueret undervisningsmateriale · tæller ikke som prøve");
    this.status = el("p", { id: "lv-intro-status", class: "lv-status", role: "status", "aria-live": "polite" });
    // Hidden while empty, so the local introduction looks exactly as before.
    this.status.hidden = true;
    const actions = el("div", { class: "lv-actions" });
    actions.append(this.next);
    sheet.append(head, this.body, this.status, actions, note);
    this.root.append(sheet);
    host.append(this.root);
    this.next.addEventListener("click", () => this.advance());
  }

  /** Shows the cards and the check; resolves when the pupil has seen both cards and answered the check. */
  show(): Promise<void> {
    this.server = null;
    this.root.dataset["source"] = "local";
    this.setStatus("");
    this.step = 0;
    this.root.hidden = false;
    this.render();
    return new Promise((resolve) => {
      this.done = resolve;
    });
  }

  /**
   * F11-B: shows the SERVER's cards (1–10, in this order). Resolves once the pupil finished and `onFinish` succeeded.
   */
  showServer(intro: ServerIntro): Promise<void> {
    if (!Array.isArray(intro.cards) || intro.cards.length === 0) return Promise.reject(new Error("intro view: no cards"));
    this.server = intro;
    this.finishing = false;
    this.root.dataset["source"] = "server";
    this.root.dataset["cards"] = String(intro.cards.length);
    this.setStatus("");
    this.step = 0;
    this.root.hidden = false;
    this.renderServer();
    // Reported only once the first card can actually be seen: after the browser has painted it.
    const presented = intro.onPresented;
    const paint = typeof requestAnimationFrame === "function" ? (f: () => void) => requestAnimationFrame(() => requestAnimationFrame(f)) : (f: () => void) => f();
    paint(() => {
      if (this.server === intro && !this.root.hidden) presented();
    });
    return new Promise((resolve) => {
      this.done = resolve;
    });
  }

  private advance(): void {
    if (this.server !== null) {
      this.advanceServer(this.server);
      return;
    }
    this.step++;
    if (this.step > INTRO_CARDS.length + 1) {
      this.root.hidden = true;
      this.done?.();
      this.done = null;
      return;
    }
    this.render();
  }

  private render(): void {
    this.root.dataset["step"] = String(this.step);
    this.body.replaceChildren();
    const card = INTRO_CARDS[this.step];
    if (card !== undefined) {
      this.body.append(el("h3", { class: "lv-card-title" }, card.title), el("p", { class: "lv-prompt", "data-card": String(this.step) }, card.text));
      this.next.textContent = "Videre";
      this.next.disabled = false;
      this.next.focus();
      return;
    }
    if (this.step === INTRO_CARDS.length) {
      // The built-in comprehension check: every choice leads to the same explanation.
      this.body.append(el("h3", { class: "lv-card-title" }, "Tjek din forståelse"), el("p", { class: "lv-prompt", id: "lv-intro-question" }, INTRO_CHECK.question));
      const group = el("div", { class: "lv-cards", role: "group", "aria-labelledby": "lv-intro-question" });
      INTRO_CHECK.options.forEach((label, i) => {
        const b = el("button", { type: "button", class: "lv-card", "data-check": String(i), "aria-pressed": "false" }, label);
        b.addEventListener("click", () => {
          for (const other of group.querySelectorAll("button")) other.setAttribute("aria-pressed", String(other === b));
          this.step = INTRO_CARDS.length + 1;
          this.renderExplanation();
        });
        group.append(b);
      });
      this.body.append(group);
      this.next.disabled = true;
      (group.querySelector("button") as HTMLButtonElement).focus();
      return;
    }
  }

  private advanceServer(intro: ServerIntro): void {
    if (this.finishing) return;
    if (this.step < intro.cards.length - 1) {
      this.step++;
      this.renderServer();
      return;
    }
    // The final control: the server must register "done" before the pupil moves on.
    this.finishing = true;
    this.next.disabled = true;
    this.setStatus("Gemmer …");
    intro.onFinish().then(
      () => {
        this.finishing = false;
        this.server = null;
        this.setStatus("");
        this.root.hidden = true;
        this.done?.();
        this.done = null;
      },
      (err: unknown) => {
        this.finishing = false;
        this.setStatus(`Introduktionen kunne ikke gemmes (${err instanceof Error ? err.message : String(err)}). Prøv igen.`);
        this.next.disabled = false;
        this.next.focus();
      },
    );
  }

  private renderServer(): void {
    const intro = this.server as ServerIntro;
    const card = intro.cards[this.step] as IntroCard;
    this.root.dataset["step"] = String(this.step);
    this.body.replaceChildren();
    // Text only: textContent never interprets markup.
    this.body.append(
      el("p", { class: "lv-note", id: "lv-intro-progress" }, `Kort ${this.step + 1} af ${intro.cards.length}`),
      el("h3", { class: "lv-card-title", "data-card-title": String(this.step) }, card.title),
      el("p", { class: "lv-prompt", "data-card": String(this.step) }, card.text),
    );
    const last = this.step === intro.cards.length - 1;
    this.next.textContent = last ? "Afslut introduktionen" : "Videre";
    this.next.disabled = false;
    this.next.focus();
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
    this.status.hidden = text === "";
  }

  private renderExplanation(): void {
    this.root.dataset["step"] = String(this.step);
    let ex = this.body.querySelector<HTMLElement>("#lv-intro-explanation");
    if (ex === null) {
      ex = el("p", { id: "lv-intro-explanation", class: "lv-status", "aria-live": "polite" });
      this.body.append(ex);
    }
    ex.textContent = INTRO_CHECK.explanation;
    for (const b of this.body.querySelectorAll<HTMLButtonElement>(".lv-card")) b.disabled = true;
    this.next.textContent = "Gå til hylden";
    this.next.disabled = false;
    this.next.focus();
  }
}
