import { parseSourceBack } from "./sequence.ts";
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
  /** D-322 step 5: after an incorrect verdict, ask for a NEW task on the same objective. */
  readonly revise?: () => void;
}

/** What the pupil sees about the activity (D-322 sequence.ts): its class and what it counts for. */
export interface ActivityBadge {
  readonly cls: string;
  readonly label: string;
}

const REASONS = [
  ["hvem", "Hvem der lavede kilden"],
  ["hvornaar", "Hvornår den blev lavet"],
  ["til", "Hvem den var til"],
  ["hvorfor", "Hvorfor den blev lavet"],
  ["gaet", "Jeg gættede"],
] as const;

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
  /** Option ids whose description the pupil has opened (phase 2, investigation). Local only. */
  private readonly inspected = new Set<string>();
  /** The pupil's own reason (phase 3, self-explanation). Never graded, never sent: shown back with the verdict. */
  private reason: string | null = null;
  private readonly reasons: El;
  private readonly guide: El;
  private readonly note: El;
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
  private readonly activityTag: El;
  private readonly reviseBtn: HTMLButtonElement;
  private allowRevision = false;

  constructor(host: El, handlers: TaskViewHandlers) {
    this.h = handlers;
    this.root = el("section", { id: "lv-task", class: "lv-task", "aria-labelledby": "lv-title", "data-state": "closed" });
    this.root.hidden = true;
    const sheet = el("div", { class: "lv-sheet" });
    const head = el("div", { class: "lv-head" });
    head.append(el("h2", { id: "lv-title" }, "Hylden i arkivskabet"));
    this.modeTag = el("span", { id: "lv-mode", class: "lv-mode" });
    head.append(this.modeTag);
    this.activityTag = el("span", { id: "lv-activity", class: "lv-activity" });
    head.append(this.activityTag);
    this.prompt = el("p", { id: "lv-prompt", class: "lv-prompt" });
    this.cards = el("div", { id: "lv-cards", class: "lv-cards", role: "group", "aria-labelledby": "lv-prompt" });
    this.textInput = el("input", { id: "lv-text", type: "text", maxlength: "200", autocomplete: "off", "aria-labelledby": "lv-prompt" });
    this.commitBtn = el("button", { id: "lv-commit", type: "button", class: "lv-primary" }, "Læg kilden i skabet");
    this.hintBtn = el("button", { id: "lv-hint", type: "button" }, "Bed arkivaren om et hint");
    this.hints = el("ol", { id: "lv-hints", class: "lv-hints" });
    this.status = el("p", { id: "lv-status", class: "lv-status", role: "status", "aria-live": "polite" });
    this.guide = el("p", { id: "lv-guide", class: "lv-guide" });
    this.reasons = el("div", { id: "lv-reasons", class: "lv-reasons", role: "group", "aria-labelledby": "lv-reasons-title" });
    this.note = el("p", { id: "lv-material", class: "lv-note" }, "Kildebeskrivelserne er konstrueret undervisningsmateriale, ikke citater.");
    this.feedback = el("div", { id: "lv-feedback", class: "lv-feedback", "aria-live": "polite" });
    this.retryBtn = el("button", { id: "lv-retry", type: "button", class: "lv-primary" }, "Send mit svar igen");
    this.closeBtn = el("button", { id: "lv-close", type: "button" }, "Tilbage til arkivet");
    this.reviseBtn = el("button", { id: "lv-revise", type: "button", class: "lv-primary" }, "Revidér din vurdering");
    const actions = el("div", { class: "lv-actions" });
    actions.append(this.commitBtn, this.hintBtn, this.retryBtn, this.reviseBtn, this.closeBtn);
    sheet.append(head, this.prompt, this.guide, this.cards, this.textInput, this.reasons, this.hints, actions, this.status, this.feedback, this.note);
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
    this.reviseBtn.addEventListener("click", () => this.h.revise?.());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  show(task: PresentBody, opts: { activity?: ActivityBadge; allowRevision?: boolean } = {}): void {
    this.task = task;
    this.allowRevision = opts.allowRevision === true && this.h.revise !== undefined;
    this.activityTag.textContent = opts.activity?.label ?? "";
    this.activityTag.hidden = opts.activity === undefined;
    this.root.dataset["activity"] = opts.activity?.cls ?? "";
    this.selected = null;
    this.hintsShown = 0;
    this.outcome = null;
    this.prompt.textContent = task.stimulus.prompt;
    this.modeTag.textContent = task.mode === "practice" ? "Øvelse · hints tilladt" : task.mode === "quiz_v1" ? "Lærlig-opgave" : "Selvstændig opgave · uden hints";
    this.inspected.clear();
    this.reason = null;
    this.cards.replaceChildren();
    const withDetail = (task.stimulus.options ?? []).filter((o) => o.detail !== undefined).length;
    for (const o of task.stimulus.options ?? []) {
      const box = el("div", { class: "lv-source", "data-source": o.id });
      const card = el("button", { type: "button", class: "lv-card", "data-option": o.id, "aria-pressed": "false" }, o.label);
      card.addEventListener("click", () => {
        if (this.locked()) return;
        this.selected = o.id;
        this.refresh();
      });
      box.append(card);
      if (o.detail !== undefined) {
        // Step 2 (exploration): turning the document over shows its archive back — sender, time, recipient,
        // purpose, context. Part of the stimulus; never a hint about correctness.
        const back = parseSourceBack(o.detail);
        let detail: HTMLElement;
        if (back === null) {
          detail = el("p", { class: "lv-detail", id: `lv-detail-${o.id}` }, o.detail);
        } else {
          detail = el("dl", { class: "lv-detail lv-back", id: `lv-detail-${o.id}`, "aria-label": `Bagsiden af ${o.label}` });
          for (const f of back) detail.append(el("dt", {}, f.field), el("dd", { "data-field": f.field.toLowerCase() }, f.value));
        }
        detail.hidden = true;
        const inspect = el("button", { type: "button", class: "lv-inspect", "data-inspect": o.id, "aria-expanded": "false", "aria-controls": `lv-detail-${o.id}` }, "Vend dokumentet");
        inspect.addEventListener("click", () => {
          detail.hidden = !detail.hidden;
          inspect.setAttribute("aria-expanded", String(!detail.hidden));
          inspect.textContent = detail.hidden ? "Vend dokumentet" : "Vend tilbage";
          box.dataset["side"] = detail.hidden ? "front" : "back";
          this.inspected.add(o.id);
          this.refresh();
        });
        box.dataset["side"] = "front";
        box.append(inspect, detail);
      }
      this.cards.append(box);
    }
    this.note.hidden = withDetail === 0;
    this.renderReasons(task.kind === "choice" && withDetail > 0);
    this.cards.hidden = task.kind !== "choice";
    this.textInput.hidden = task.kind !== "short_text";
    this.textInput.value = "";
    this.commitBtn.textContent = task.kind === "choice" ? "Læg kilden i skabet" : "Skriv det på kortet";
    this.hints.replaceChildren();
    this.status.textContent = "";
    this.feedback.replaceChildren();
    this.retryBtn.hidden = true;
    this.reviseBtn.hidden = true;
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
    if (r.outcome === "aborted" && !r.retryable) {
      // Unresolved: the backend cannot tell whether the answer was recorded, so nothing is resent.
      this.root.dataset["state"] = "unresolved";
      this.status.textContent = "Vi ved ikke, om dit svar nåede frem. Det bliver ikke sendt igen automatisk. Din lærer kan se, hvad der blev registreret.";
      this.closeBtn.hidden = false;
      this.refresh();
      return;
    }
    if (r.outcome === "aborted") {
      this.status.textContent = "Forbindelsen svigtede. Dit svar er gemt og bliver sendt igen, præcis som du afgav det.";
      this.retryBtn.hidden = false;
      this.closeBtn.hidden = false;
      this.refresh();
      return;
    }
    this.status.textContent = r.outcome === "correct" ? "Rigtigt." : r.outcome === "incorrect" ? "Ikke rigtigt." : "Dit svar er afleveret til læreren.";
    if (r.feedback.text !== null) this.feedback.append(el("p", { id: "lv-feedback-text" }, r.feedback.text));
    if (r.feedback.correctAnswer !== null) {
      this.feedback.append(el("p", { id: "lv-correct" }, `Det rigtige svar: ${r.feedback.correctAnswer}`));
      // Step 4: point at the information that mattered — the right source's back, now that the answer is known.
      const card = [...this.cards.querySelectorAll<HTMLElement>(".lv-source")].find((b) => b.querySelector(".lv-card")?.textContent === r.feedback.correctAnswer);
      const back = card?.querySelector<HTMLElement>(".lv-back");
      if (card !== undefined && back !== null && back !== undefined) {
        card.dataset["relevant"] = "true";
        back.hidden = false;
        card.dataset["side"] = "back";
        this.feedback.append(el("p", { id: "lv-relevant" }, `Læg mærke til bagsiden af »${r.feedback.correctAnswer}«: afsender, tid, modtager og formål afgør, hvad kilden kan bruges til.`));
      }
    }
    // Self-explanation shown back next to the explanation, so the pupil compares their reason with it.
    if (this.reason !== null) this.feedback.append(el("p", { id: "lv-own-reason" }, `Din begrundelse: ${this.reason.toLowerCase()}. Sammenlign den med forklaringen ovenfor.`));
    // Display only: the server decided what this answer counts as.
    const counts = r.evidence === "evidence" ? "Tæller som selvstændig opgave." : r.evidence === "practice" ? "Tæller som øvelse." : "";
    if (counts !== "") this.feedback.append(el("p", { id: "lv-evidence", "data-evidence": r.evidence }, counts));
    this.closeBtn.hidden = false;
    // Step 5: a wrong assessment can be revised on a NEW task after reading the feedback.
    this.reviseBtn.hidden = !(r.outcome === "incorrect" && this.allowRevision);
    this.refresh();
    (this.reviseBtn.hidden ? this.closeBtn : this.reviseBtn).focus();
  }

  error(text: string): void {
    this.outcome = "error";
    this.root.dataset["state"] = "error";
    this.status.textContent = text;
    this.closeBtn.hidden = false;
    this.refresh();
    this.closeBtn.focus();
  }

  /** How many sources must be opened before choosing (phase 2). 0 when the backend sends no descriptions. */
  private investigationNeeded(): number {
    const n = (this.task?.stimulus.options ?? []).filter((o) => o.detail !== undefined).length;
    return Math.min(2, n);
  }

  private renderReasons(show: boolean): void {
    this.reasons.replaceChildren();
    this.reasons.hidden = !show;
    if (!show) return;
    this.reasons.append(el("p", { id: "lv-reasons-title", class: "lv-card-title" }, "Hvad afgjorde dit valg? Vælg det spørgsmål, du brugte (bliver ikke bedømt)."));
    for (const [key, label] of REASONS) {
      const b = el("button", { type: "button", class: "lv-reason", "data-reason": key, "aria-pressed": "false" }, label);
      b.addEventListener("click", () => {
        if (this.locked()) return;
        this.reason = this.reason === label ? null : label;
        for (const other of this.reasons.querySelectorAll<HTMLElement>(".lv-reason")) other.setAttribute("aria-pressed", String(other.textContent === this.reason));
        this.refresh();
      });
      this.reasons.append(b);
    }
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
    for (const b of this.reasons.querySelectorAll<HTMLButtonElement>(".lv-reason")) b.disabled = locked;
    const need = this.investigationNeeded();
    const missing = Math.max(0, need - this.inspected.size);
    // Step 3: a hypothesis is an assessment WITH a reason — the pupil names the question that decided it.
    const reasonNeeded = !this.reasons.hidden && this.reason === null;
    this.guide.textContent =
      need === 0 || this.outcome !== null ? ""
        : missing > 0 ? `Vend mindst ${need} dokumenter, før du vælger (${this.inspected.size} af ${need}).`
          : this.selected === null ? "Vælg den kilde, der bedst kan undersøge påstanden."
            : reasonNeeded ? "Vælg, hvad der afgjorde dit valg." : "Klar: læg kilden i skabet.";
    this.root.dataset["investigated"] = String(this.inspected.size);
    this.commitBtn.disabled = locked || this.current() === null || missing > 0 || reasonNeeded;
    // After any verdict (also "aborted") the answer is committed: only "send again" or "close" remain.
    this.commitBtn.hidden = this.outcome !== null;
    this.hintBtn.hidden = (this.task?.hintsAvailable ?? 0) === 0 || locked;
  }
}
