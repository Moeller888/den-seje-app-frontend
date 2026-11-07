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
 */
import { INTRO_CARDS, INTRO_CHECK } from "./intro-content.ts";

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

  constructor(host: HTMLElement) {
    this.root = el("section", { id: "lv-intro", class: "lv-task", "aria-labelledby": "lv-intro-title", "data-step": "0" });
    this.root.hidden = true;
    const sheet = el("div", { class: "lv-sheet" });
    const head = el("div", { class: "lv-head" });
    head.append(el("h2", { id: "lv-intro-title" }, "Før du åbner skabet"), el("span", { class: "lv-mode" }, "Introduktion"));
    this.body = el("div", { id: "lv-intro-body" });
    this.next = el("button", { id: "lv-intro-next", type: "button", class: "lv-primary" }, "Videre");
    const note = el("p", { class: "lv-note" }, "Konstrueret undervisningsmateriale · tæller ikke som prøve");
    const actions = el("div", { class: "lv-actions" });
    actions.append(this.next);
    sheet.append(head, this.body, actions, note);
    this.root.append(sheet);
    host.append(this.root);
    this.next.addEventListener("click", () => this.advance());
  }

  /** Shows the cards and the check; resolves when the pupil has seen both cards and answered the check. */
  show(): Promise<void> {
    this.step = 0;
    this.root.hidden = false;
    this.render();
    return new Promise((resolve) => {
      this.done = resolve;
    });
  }

  private advance(): void {
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
