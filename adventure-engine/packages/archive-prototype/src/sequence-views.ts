/**
 * Arkivskabet v2 (D-322): the three local views of the learning sequence that are NOT server tasks.
 *
 *  - ArchiveCardView — "Udfyld arkivkortet": sort four facts about one source into the four questions.
 *    Local PRACTICE with an explanation per wrong placement. Never evidence, never sent anywhere.
 *  - ReflectionView — step 7: free text the pupil writes for herself, then a model answer and a self-check.
 *    Never sent, never graded (teacher-graded long text belongs to H4).
 *  - RevisitView — step 8: the delayed revisit, as a LOCAL PROTOTYPE. The delay is shown and can be skipped;
 *    no mastery is recorded anywhere.
 *
 * KONSTRUERET UNDERVISNINGSMATERIALE (see sequence.ts).
 */
import { ACTIVITIES, ARCHIVE_CARD_EXERCISE, REFLECTION, REVISIT, SOURCE_FIELDS, checkArchiveCard, type SourceField } from "./sequence.ts";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A modal sheet with a title, an activity badge, a body and an action row. */
function sheet(id: string, title: string, badge: string): { root: HTMLElement; body: HTMLElement; actions: HTMLElement } {
  const root = el("section", { id, class: "lv-task", "aria-labelledby": `${id}-title`, role: "dialog", "aria-modal": "true" });
  root.hidden = true;
  const box = el("div", { class: "lv-sheet" });
  const head = el("div", { class: "lv-head" });
  head.append(el("h2", { id: `${id}-title` }, title), el("span", { class: "lv-activity" }, badge));
  const body = el("div", { class: "lv-body" });
  const actions = el("div", { class: "lv-actions" });
  box.append(head, body, actions, el("p", { class: "lv-note" }, "Konstrueret undervisningsmateriale · tæller ikke som prøve"));
  root.append(box);
  return { root, body, actions };
}

export class ArchiveCardView {
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly check: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly selects = new Map<string, HTMLSelectElement>();
  private done: (() => void) | null = null;

  constructor(host: HTMLElement) {
    const s = sheet("lv-archive-card", `Udfyld arkivkortet: ${ARCHIVE_CARD_EXERCISE.source}`, ACTIVITIES.archiveCard?.label ?? "");
    this.root = s.root;
    s.body.append(el("p", { class: "lv-prompt", id: "lv-archive-card-intro" }, ARCHIVE_CARD_EXERCISE.intro));
    const list = el("ul", { class: "lv-sort", "aria-labelledby": "lv-archive-card-intro" });
    for (const fact of ARCHIVE_CARD_EXERCISE.facts) {
      const li = el("li", { class: "lv-sort-row", "data-fact": fact.id });
      const label = el("label", { for: `lv-fact-${fact.id}` }, `»${fact.text}«`);
      const select = el("select", { id: `lv-fact-${fact.id}`, "aria-describedby": `lv-why-${fact.id}` });
      select.append(el("option", { value: "" }, "Vælg spørgsmål …"));
      for (const f of SOURCE_FIELDS) select.append(el("option", { value: f.key }, f.label));
      select.addEventListener("change", () => this.refresh());
      const why = el("p", { class: "lv-why", id: `lv-why-${fact.id}` });
      why.hidden = true;
      li.append(label, select, why);
      list.append(li);
      this.selects.set(fact.id, select);
    }
    this.status = el("p", { id: "lv-archive-card-status", class: "lv-status", role: "status", "aria-live": "polite" });
    s.body.append(list, this.status);
    this.check = el("button", { id: "lv-archive-card-check", type: "button", class: "lv-primary" }, "Tjek arkivkortet");
    this.next = el("button", { id: "lv-archive-card-next", type: "button" }, "Gå til hylden");
    this.next.hidden = true;
    s.actions.append(this.check, this.next);
    this.check.addEventListener("click", () => this.evaluate());
    this.next.addEventListener("click", () => {
      this.root.hidden = true;
      this.done?.();
      this.done = null;
    });
    host.append(this.root);
  }

  show(): Promise<void> {
    for (const sel of this.selects.values()) sel.value = "";
    for (const why of this.root.querySelectorAll<HTMLElement>(".lv-why")) why.hidden = true;
    this.status.textContent = "";
    this.next.hidden = true;
    this.root.dataset["state"] = "open";
    this.root.hidden = false;
    this.refresh();
    this.selects.values().next().value?.focus();
    return new Promise((resolve) => {
      this.done = resolve;
    });
  }

  private placed(): Record<string, SourceField | ""> {
    const out: Record<string, SourceField | ""> = {};
    for (const [id, sel] of this.selects) out[id] = sel.value as SourceField | "";
    return out;
  }

  private refresh(): void {
    this.check.disabled = Object.values(this.placed()).some((v) => v === "");
  }

  /** Local explanation, never a grade: wrong rows get their own reason; the pupil may correct and check again. */
  private evaluate(): void {
    const r = checkArchiveCard(this.placed());
    const wrong = new Set(r.wrong.map((w) => w.id));
    for (const fact of ARCHIVE_CARD_EXERCISE.facts) {
      const row = this.root.querySelector<HTMLElement>(`[data-fact="${fact.id}"]`);
      const why = this.root.querySelector<HTMLElement>(`#lv-why-${fact.id}`);
      if (row === null || why === null) continue;
      row.dataset["ok"] = String(!wrong.has(fact.id));
      why.hidden = !wrong.has(fact.id);
      why.textContent = wrong.has(fact.id) ? `Prøv igen: ${fact.why}` : "";
    }
    this.root.dataset["state"] = r.allRight ? "done" : "retry";
    this.status.textContent = r.allRight
      ? "Arkivkortet er udfyldt. De fire spørgsmål bruger du på hylden."
      : `${r.wrong.length} af ${ARCHIVE_CARD_EXERCISE.facts.length} oplysninger står under et andet spørgsmål. Læs forklaringen, og ret dem.`;
    this.next.hidden = !r.allRight;
    if (r.allRight) this.next.focus();
    else this.selects.get(r.wrong[0]?.id ?? "")?.focus();
  }
}

export class ReflectionView {
  private readonly root: HTMLElement;
  private readonly text: HTMLTextAreaElement;
  private readonly count: HTMLElement;
  private readonly compare: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly model: HTMLElement;
  private done: (() => void) | null = null;

  constructor(host: HTMLElement) {
    const s = sheet("lv-reflection", "Refleksion", ACTIVITIES.reflection?.label ?? "");
    this.root = s.root;
    s.body.append(el("label", { for: "lv-reflection-text", class: "lv-prompt", id: "lv-reflection-question" }, REFLECTION.question));
    this.text = el("textarea", { id: "lv-reflection-text", rows: "4", "aria-describedby": "lv-reflection-count lv-reflection-private" });
    this.count = el("p", { id: "lv-reflection-count", class: "lv-guide", "aria-live": "polite" });
    s.body.append(this.text, this.count, el("p", { id: "lv-reflection-private", class: "lv-note" }, "Det, du skriver, bliver kun på denne skærm. Det sendes ikke og bedømmes ikke."));
    this.model = el("div", { id: "lv-reflection-model", class: "lv-feedback" });
    this.model.hidden = true;
    s.body.append(this.model);
    this.compare = el("button", { id: "lv-reflection-compare", type: "button", class: "lv-primary" }, "Sammenlign med arkivarens svar");
    this.next = el("button", { id: "lv-reflection-next", type: "button" }, "Videre");
    this.next.hidden = true;
    s.actions.append(this.compare, this.next);
    this.text.addEventListener("input", () => this.refresh());
    this.compare.addEventListener("click", () => this.reveal());
    this.next.addEventListener("click", () => {
      this.root.hidden = true;
      // Nothing is kept: the reflection belongs to the pupil and this screen only.
      this.text.value = "";
      this.done?.();
      this.done = null;
    });
    host.append(this.root);
  }

  show(): Promise<void> {
    this.text.value = "";
    this.text.readOnly = false;
    this.model.hidden = true;
    this.model.replaceChildren();
    this.next.hidden = true;
    this.compare.hidden = false;
    this.root.dataset["state"] = "open";
    this.root.hidden = false;
    this.refresh();
    this.text.focus();
    return new Promise((resolve) => {
      this.done = resolve;
    });
  }

  private refresh(): void {
    const n = this.text.value.trim().length;
    const missing = Math.max(0, REFLECTION.minChars - n);
    this.count.textContent = missing > 0 ? `Skriv lidt mere (mindst ${REFLECTION.minChars} tegn, ${missing} mangler).` : "";
    this.compare.disabled = missing > 0;
  }

  private reveal(): void {
    this.text.readOnly = true;
    this.model.replaceChildren(el("h3", { class: "lv-card-title" }, "Arkivarens svar"), el("p", { id: "lv-reflection-answer" }, REFLECTION.model));
    const list = el("ul", { id: "lv-reflection-selfcheck", "aria-label": "Tjek dit eget svar" });
    for (const q of REFLECTION.selfCheck) list.append(el("li", {}, q));
    this.model.append(el("p", { class: "lv-card-title" }, "Tjek dit eget svar:"), list);
    this.model.hidden = false;
    this.compare.hidden = true;
    this.next.hidden = false;
    this.root.dataset["state"] = "compared";
    this.next.focus();
  }
}

export class RevisitView {
  private readonly root: HTMLElement;
  private readonly start: HTMLButtonElement;
  private done: (() => void) | null = null;

  constructor(host: HTMLElement) {
    const s = sheet("lv-revisit", "Genbesøg", ACTIVITIES.revisit?.label ?? "");
    this.root = s.root;
    s.body.append(
      el("p", { class: "lv-prompt", id: "lv-revisit-text" }, "Arkivaren kommer tilbage med en ny kilde i morgen. Så ser vi, om du kan bruge de fire spørgsmål uden hjælp."),
      el("p", { class: "lv-guide", id: "lv-revisit-due" }, REVISIT.label),
    );
    this.start = el("button", { id: "lv-revisit-start", type: "button", class: "lv-primary" }, "Spol tiden frem (prototype)");
    s.actions.append(this.start);
    this.start.addEventListener("click", () => {
      this.root.hidden = true;
      this.done?.();
      this.done = null;
    });
    host.append(this.root);
  }

  /** Resolves when the pupil skips the (simulated) delay. */
  show(): Promise<void> {
    this.root.dataset["state"] = "waiting";
    this.root.hidden = false;
    this.start.focus();
    return new Promise((resolve) => {
      this.done = resolve;
    });
  }
}
