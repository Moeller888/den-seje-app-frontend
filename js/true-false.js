// Sandt/falsk (true_false, F-02) — the quiz control where the pupil judges one statement. Server
// contract: supabase/functions/_shared/true-false.ts. The browser receives only the statement
// (content.question, shown — and read aloud — by the quiz like every question text) and sends the chosen
// answer text, "Sandt" or "Falsk"; it never knows the answer and never decides correctness. Feedback is
// the quiz's existing choice feedback (app.js submitAnswer: the flash on the chosen button, "Ja! 🎯" /
// "Svaret er … — husk det nu.", or the explanation panel).
//
// HOW A PUPIL ANSWERS (the same for mouse, touch and keyboard — both answers are real <button>s)
//   * tap/click/Enter/Space on "Sandt" or "Falsk" sends that answer at once, like an MC option;
//   * Tab reaches both buttons; ←/↑ and →/↓ (and Home/End) move between them;
//   * the chosen button is aria-pressed="true", and the group is aria-busy while the answer is on its way.
// If the answer is handed back (network or server error: submitAnswer re-enables the buttons), the
// choice is cleared and focus returns to it, so the pupil can simply answer again.
//
// The document is injected so the control can be unit-tested without a browser.

// Must equal TRUE_FALSE_OPTIONS in supabase/functions/_shared/true-false.ts (pinned by a unit test):
// the text sent is the text the server's key holds.
export const TRUE_FALSE_OPTIONS = Object.freeze(["Sandt", "Falsk"]);

export const TRUE_FALSE_TEXT = Object.freeze({
  instructions: "Er udsagnet sandt eller falsk?",
});

// The statement from the question payload, or null when the payload breaks the contract (no statement,
// or options a true/false payload never carries). The caller shows a visible error for null — never a
// half-built control.
export function readTrueFalseContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const statement = content.question;
  if (typeof statement !== "string" || statement.trim().length === 0) return null;
  if (content.options !== undefined) return null;
  return { statement };
}

// The line shown above the explanation when a true/false answer was wrong and the quiz opens its
// reflection panel ("Ikke helt —" + review_text). Without it the pupil reads WHY but is never told
// which judgement was right. `correctAnswer` is the server's data.correct_answer (the key text); any
// other value gives null, and the quiz then shows its plain lead, exactly as before.
export function trueFalseCorrection(correctAnswer) {
  if (correctAnswer === TRUE_FALSE_OPTIONS[0]) return "Udsagnet er sandt.";
  if (correctAnswer === TRUE_FALSE_OPTIONS[1]) return "Udsagnet er falsk.";
  return null;
}

export function buildTrueFalseAnswer(doc, { onSubmit, describedBy = null } = {}) {
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("buildTrueFalseAnswer: a document is required");
  }
  if (typeof onSubmit !== "function") {
    throw new Error("buildTrueFalseAnswer: onSubmit is required");
  }

  const root = doc.createElement("div");
  root.className = "true-false";
  root.id = "true-false";

  const instructions = doc.createElement("p");
  instructions.id = "true-false-instructions";
  instructions.className = "true-false-instructions";
  instructions.textContent = TRUE_FALSE_TEXT.instructions;
  root.appendChild(instructions);

  const group = doc.createElement("div");
  group.className = "true-false-options";
  group.setAttribute("role", "group");
  group.setAttribute("aria-labelledby", instructions.id);
  root.appendChild(group);

  let locked = false;

  const buttons = TRUE_FALSE_OPTIONS.map((value, index) => {
    const b = doc.createElement("button");
    b.setAttribute("type", "button");
    b.className = `true-false-option true-false-${index === 0 ? "true" : "false"}`;
    b.dataset.value = value;
    b.setAttribute("aria-pressed", "false");
    if (describedBy) b.setAttribute("aria-describedby", describedBy);
    b.textContent = value;
    b.addEventListener("click", () => { choose(index); });
    b.addEventListener("keydown", (e) => onKey(e, index));
    group.appendChild(b);
    return b;
  });

  const focus = (index) => {
    const target = buttons[index];
    if (target && typeof target.focus === "function") target.focus();
  };

  function onKey(e, index) {
    let next = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "Home") next = 0;
    else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "End") next = buttons.length - 1;
    if (next === null) return;
    e.preventDefault();
    if (next !== index) focus(next);
  }

  const settle = (index) => {
    root.removeAttribute("aria-busy");
    // submitAnswer re-enables the buttons only when the answer was NOT accepted (network / server
    // error): then the pupil may answer again. Accepted: stay locked until the next question.
    if (buttons[index].disabled) return;
    locked = false;
    buttons[index].setAttribute("aria-pressed", "false");
    focus(index);
  };

  // Sends option `index` (0 = Sandt, 1 = Falsk). False when nothing was sent.
  function choose(index) {
    if (locked || !Number.isInteger(index) || index < 0 || index >= buttons.length) return false;
    locked = true;
    buttons[index].setAttribute("aria-pressed", "true");
    const pending = onSubmit(TRUE_FALSE_OPTIONS[index], buttons[index]);
    if (pending && typeof pending.then === "function") {
      root.setAttribute("aria-busy", "true");
      pending.then(() => settle(index), () => settle(index));
    }
    return true;
  }

  const selected = () => {
    const i = buttons.findIndex((b) => b.getAttribute("aria-pressed") === "true");
    return i === -1 ? null : TRUE_FALSE_OPTIONS[i];
  };

  return { root, buttons, choose, selected };
}
