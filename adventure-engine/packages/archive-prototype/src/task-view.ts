import type { Action, PresentBody, TaskResultMsg } from "@adventure-engine/learning-bridge";

/**
 * World binding for a server task (D-307): the stimulus is drawn as archive objects — source cards on
 * the shelf — and nothing is an answer until the pupil commits ("Læg kilden i skabet"). Before that the
 * pupil may look, pick and change freely (F0 11 §2.2 rule 1).
 *
 * Symmetric presentation (rule 3): every card has the same look, size and behaviour, in the order the
 * server sent. Nothing in the view knows or hints which card is right; it does not know.
 * Keyboard: every control is a native button or input, so motor skill never enters the evidence (rule 2).
 */
export interface TaskViewHandlers {
  readonly commit: (action: Action) => void;
  readonly hint: (level: number) => void;
  readonly retry: () => void;
  readonly close: (outcome: TaskResultMsg["outcome"] | "error") => void;
}

type El = HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export class TaskView {
  private readonly root: El;
  private readonly h: TaskViewHandlers;
  private task: PresentBody | null = null;
  private selected: string | null = null;
  private hintsShown = 0;
  private outcome: TaskResultMsg["outcome"] | "error" | null = null;
  private readonly prompt: El;
  private readonly cards: El;
  private readonly textInput: HTMLInputElement;
  private readonly commitBtn: HTMLButtonElement;
  private readonly hintBtn: HTMLButtonElement;
  private readonly hints: El;
  private readonly status: El;
  private readonly feedback: El;
  private readonly retryBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly modeTag: El;

  constructor(host: El, handlers: TaskViewHandlers) {
    this.h = handlers;
    this.root = el("section", { id: "lv-task", class: "lv-task", "aria-labelledby": "lv-title", "data-state": "closed" });
    this.root.hidden = true;
    const sheet = el("div", { class: "lv-sheet" });
    const head = el("div", { class: "lv-head" });
    head.append(el("h2", { id: "lv-title" }, "Hylden i arkivskabet"));
    this.modeTag = el("span", { id: "lv-mode", class: "lv-mode" });
    head.append(this.modeTag);
    this.prompt = el("p", { id: "lv-prompt", class: "lv-prompt" });
    this.cards = el("div", { id: "lv-cards", class: "lv-cards", role: "group", "aria-labelledby": "lv-prompt" });
    this.textInput = el("input", { id: "lv-text", type: "text", maxlength: "200", autocomplete: "off", "aria-labelledby": "lv-prompt" });
    this.commitBtn = el("button", { id: "lv-commit", type: "button", class: "lv-primary" }, "Læg kilden i skabet");
    this.hintBtn = el("button", { id: "lv-hint", type: "button" }, "Bed arkivaren om et hint");
    this.hints = el("ol", { id: "lv-hints", class: "lv-hints" });
    this.status = el("p", { id: "lv-status", class: "lv-status", role: "status", "aria-live": "polite" });
    this.feedback = el("div", { id: "lv-feedback", class: "lv-feedback", "aria-live": "polite" });
    this.retryBtn = el("button", { id: "lv-retry", type: "button", class: "lv-primary" }, "Send mit svar igen");
    this.closeBtn = el("button", { id: "lv-close", type: "button" }, "Tilbage til arkivet");
    const actions = el("div", { class: "lv-actions" });
    actions.append(this.commitBtn, this.hintBtn, this.retryBtn, this.closeBtn);
    sheet.append(head, this.prompt, this.cards, this.textInput, this.hints, actions, this.status, this.feedback);
    this.root.append(sheet);
    host.append(this.root);

    this.commitBtn.addEventListener("click", () => this.onCommit());
    this.textInput.addEventListener("input", () => this.refresh());
    this.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.onCommit();
    });
    this.hintBtn.addEventListener("click", () => {
      this.hintBtn.disabled = true;
      this.h.hint(this.hintsShown + 1);
    });
    this.retryBtn.addEventListener("click", () => {
      this.retryBtn.hidden = true;
      this.h.retry();
    });
    this.closeBtn.addEventListener("click", () => this.h.close(this.outcome ?? "error"));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(task: PresentBody): void {
    this.task = task;
    this.selected = null;
    this.hintsShown = 0;
    this.outcome = null;
    this.prompt.textContent = task.stimulus.prompt;
    this.modeTag.textContent = task.mode === "practice" ? "Øvelse" : "Selvstændig opgave";
    this.cards.replaceChildren();
    for (const o of task.stimulus.options ?? []) {
      const card = el("button", { type: "button", class: "lv-card", "data-option": o.id, "aria-pressed": "false" }, o.label);
      card.addEventListener("click", () => {
        if (this.locked()) return;
        this.selected = o.id;
        this.refresh();
      });
      this.cards.append(card);
    }
    this.cards.hidden = task.kind !== "choice";
    this.textInput.hidden = task.kind !== "short_text";
    this.textInput.value = "";
    this.commitBtn.textContent = task.kind === "choice" ? "Læg kilden i skabet" : "Skriv det på kortet";
    this.hints.replaceChildren();
    this.status.textContent = "";
    this.feedback.replaceChildren();
    this.retryBtn.hidden = true;
    this.closeBtn.hidden = true;
    this.root.hidden = false;
    this.root.dataset["state"] = "open";
    this.root.dataset["kind"] = task.kind;
    this.refresh();
    (this.cards.querySelector("button") ?? this.textInput).focus();
  }

  hide(): void {
    this.root.hidden = true;
    this.root.dataset["state"] = "closed";
    this.task = null;
  }

  /** Waiting for the server: the pupil sees that the answer is on its way, and can do nothing twice. */
  waiting(text: string): void {
    this.root.dataset["state"] = "waiting";
    this.status.textContent = text;
    this.refresh();
  }

  connection(text: string): void {
    this.status.textContent = text;
  }

  showHint(level: number, text: string, remaining: number): void {
    this.hintsShown = level;
    this.hints.append(el("li", { "data-level": String(level) }, text));
    this.hintBtn.disabled = remaining === 0;
    this.hintBtn.textContent = remaining === 0 ? "Ikke flere hints" : "Bed om et hint mere";
    this.status.textContent = "Med hint tæller opgaven som øvelse.";
  }

  hintFailed(): void {
    this.hintBtn.disabled = true;
    this.hintBtn.textContent = "Arkivaren har ikke flere hints";
  }

  result(r: TaskResultMsg): void {
    this.outcome = r.outcome;
    this.root.dataset["state"] = r.outcome;
    this.feedback.replaceChildren();
    if (r.outcome === "aborted") {
      this.status.textContent = "Forbindelsen svigtede. Dit svar er gemt og bliver sendt igen, præcis som du afgav det.";
      this.retryBtn.hidden = false;
      this.closeBtn.hidden = false;
      this.refresh();
      return;
    }
    this.status.textContent = r.outcome === "correct" ? "Rigtigt." : r.outcome === "incorrect" ? "Ikke rigtigt." : "Dit svar er afleveret til læreren.";
    if (r.feedback.text !== null) this.feedback.append(el("p", { id: "lv-feedback-text" }, r.feedback.text));
    if (r.feedback.correctAnswer !== null) this.feedback.append(el("p", { id: "lv-correct" }, `Det rigtige svar: ${r.feedback.correctAnswer}`));
    // Display only: the server decided what this answer counts as.
    const counts = r.evidence === "evidence" ? "Tæller som selvstændig opgave." : r.evidence === "practice" ? "Tæller som øvelse." : "";
    if (counts !== "") this.feedback.append(el("p", { id: "lv-evidence", "data-evidence": r.evidence }, counts));
    this.closeBtn.hidden = false;
    this.refresh();
    this.closeBtn.focus();
  }

  error(text: string): void {
    this.outcome = "error";
    this.root.dataset["state"] = "error";
    this.status.textContent = text;
    this.closeBtn.hidden = false;
    this.refresh();
    this.closeBtn.focus();
  }

  private locked(): boolean {
    const s = this.root.dataset["state"];
    return s !== "open";
  }

  private current(): Action | null {
    const t = this.task;
    if (t === null) return null;
    if (t.kind === "choice") return this.selected === null ? null : { kind: "choice", payload: { optionId: this.selected } };
    if (t.kind === "short_text") {
      const text = this.textInput.value.trim();
      return text.length === 0 ? null : { kind: "short_text", payload: { text } };
    }
    return null;
  }

  private onCommit(): void {
    if (this.locked()) return;
    const action = this.current();
    if (action === null) return;
    this.h.commit(action);
  }

  private refresh(): void {
    const locked = this.locked();
    for (const card of this.cards.querySelectorAll<HTMLButtonElement>(".lv-card")) {
      card.setAttribute("aria-pressed", String(card.dataset["option"] === this.selected));
      card.disabled = locked;
    }
    this.textInput.disabled = locked;
    this.commitBtn.disabled = locked || this.current() === null;
    // After any verdict (also "aborted") the answer is committed: only "send again" or "close" remain.
    this.commitBtn.hidden = this.outcome !== null;
    this.hintBtn.hidden = (this.task?.hintsAvailable ?? 0) === 0 || locked;
  }
}
