// Rækkefølge / tidslinje (order_items, F-04) — the quiz control where the pupil puts 3–6 items in order.
// Server contract: supabase/functions/_shared/order-items.ts. The browser receives only the item texts in
// the instance's SHOWN order and the kind of sequence; it never knows the correct order and never decides
// correctness. It sends the pupil's order as the display positions from top to bottom, e.g. "[2,0,3,1]".
//
// HOW A PUPIL ANSWERS (the same for mouse, touch and keyboard — every control is a real <button>)
//   * each item has "Flyt op" and "Flyt ned" buttons (≥ 44 px); the item moves one place, focus stays on
//     the same button of the moved item, so pressing it again keeps moving it;
//   * every move is announced in a polite live region: "1864 er nu nummer 2 af 4";
//   * the pupil can change the order as often as they like; "Svar" sends it once (the quiz's state
//     machine refuses a second send, and the control locks while the answer is on its way);
//   * if the answer is handed back (network or server error), the control unlocks with the order kept.
//
// The document is injected so the control can be unit-tested without a browser.

export const ORDER_TEXT = Object.freeze({
  chronological: "Sæt begivenhederne i den rækkefølge, de skete. Det første øverst.",
  process: "Sæt trinene i den rækkefølge, de sker. Det første trin øverst.",
  logical: "Sæt elementerne i den rigtige rækkefølge. Det første øverst.",
  up: "Flyt op",
  down: "Flyt ned",
  submit: "Svar",
  moved: (text, place, total) => `${text} er nu nummer ${place} af ${total}`,
});

const SEQUENCES = ["chronological", "process", "logical"];

// The layout from the question payload, or null when it breaks the contract (3–6 unique non-empty
// strings and a known sequence). The caller shows the visible error for null.
export function readOrderLayout(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const order = content.order;
  if (!order || typeof order !== "object" || Array.isArray(order)) return null;
  const items = order.items;
  if (!Array.isArray(items) || items.length < 3 || items.length > 6) return null;
  if (!items.every((t) => typeof t === "string" && t.trim().length > 0)) return null;
  if (new Set(items.map((t) => t.trim().toLowerCase())).size !== items.length) return null;
  if (!SEQUENCES.includes(order.sequence)) return null;
  return { items: [...items], sequence: order.sequence };
}

// After a wrong answer: the correct order in words, from the layout and the key the server revealed
// (display positions in the correct order). null when the key does not fit the layout.
export function orderCorrectionText(layout, key) {
  if (!layout || !Array.isArray(layout.items) || typeof key !== "string") return null;
  const parts = key.split(",");
  if (parts.length !== layout.items.length) return null;
  const positions = parts.map((p) => (/^\d$/.test(p) ? Number(p) : -1));
  if (positions.some((p) => p < 0 || p >= layout.items.length) || new Set(positions).size !== positions.length) return null;
  return "Den rigtige rækkefølge: " + positions.map((p) => layout.items[p]).join(" → ");
}

export function buildOrderAnswer(doc, { layout, onSubmit, describedBy = null, attachReadAloud = null, readAloudContext = undefined } = {}) {
  if (!doc || typeof doc.createElement !== "function") throw new Error("buildOrderAnswer: a document is required");
  if (typeof onSubmit !== "function") throw new Error("buildOrderAnswer: onSubmit is required");
  if (!layout || !Array.isArray(layout.items)) throw new Error("buildOrderAnswer: a layout is required");

  const n = layout.items.length;
  // order[i] = the display position of the item now at place i (top = 0). Starts as shown.
  const order = Array.from({ length: n }, (_, i) => i);

  const root = doc.createElement("div");
  root.className = "order-items";
  root.id = "order-items";

  const instructions = doc.createElement("p");
  instructions.id = "order-instructions";
  instructions.className = "order-instructions";
  instructions.textContent = ORDER_TEXT[layout.sequence] ?? ORDER_TEXT.logical;
  root.appendChild(instructions);

  const list = doc.createElement("ol");
  list.className = "order-list";
  list.setAttribute("aria-labelledby", instructions.id);
  if (describedBy) list.setAttribute("aria-describedby", describedBy);
  root.appendChild(list);

  const live = doc.createElement("p");
  live.className = "order-live";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("role", "status");
  root.appendChild(live);

  const submit = doc.createElement("button");
  submit.setAttribute("type", "button");
  submit.className = "submit-btn order-submit";
  submit.textContent = ORDER_TEXT.submit;
  root.appendChild(submit);

  let locked = false;
  // One row per display position, created once; render() re-appends them in the current order.
  const rows = layout.items.map((text, position) => {
    const li = doc.createElement("li");
    li.className = "order-item";
    li.dataset.position = String(position);
    const label = doc.createElement("span");
    label.className = "order-text";
    label.textContent = text;
    li.appendChild(label);
    const up = doc.createElement("button");
    up.setAttribute("type", "button");
    up.className = "order-move order-up";
    up.textContent = "▲";
    up.setAttribute("aria-label", `${ORDER_TEXT.up}: ${text}`);
    const down = doc.createElement("button");
    down.setAttribute("type", "button");
    down.className = "order-move order-down";
    down.textContent = "▼";
    down.setAttribute("aria-label", `${ORDER_TEXT.down}: ${text}`);
    up.addEventListener("click", () => move(position, -1, up));
    down.addEventListener("click", () => move(position, +1, down));
    li.appendChild(up);
    li.appendChild(down);
    if (typeof attachReadAloud === "function") {
      try { attachReadAloud(li, text, readAloudContext); } catch (_e) { /* fail-soft: the item stays */ }
    }
    return { li, up, down, text };
  });

  function render() {
    order.forEach((position, place) => {
      const r = rows[position];
      list.appendChild(r.li); // re-appending moves the node
      r.up.disabled = locked || place === 0;
      r.down.disabled = locked || place === n - 1;
    });
    submit.disabled = locked;
  }

  // Moves the item shown at display `position` one place up (-1) or down (+1). False when nothing moved.
  function move(position, delta, focusAfter) {
    if (locked) return false;
    const place = order.indexOf(position);
    const target = place + delta;
    if (place < 0 || target < 0 || target >= n) return false;
    [order[place], order[target]] = [order[target], order[place]];
    render();
    live.textContent = ORDER_TEXT.moved(rows[position].text, target + 1, n);
    // Keep the pupil on the same control of the moved item; at an edge that button is disabled, so move
    // focus to its other button.
    const r = rows[position];
    const next = focusAfter && !focusAfter.disabled ? focusAfter : (focusAfter === r.up ? r.down : r.up);
    if (next && typeof next.focus === "function") next.focus();
    return true;
  }

  const settle = () => {
    root.removeAttribute("aria-busy");
    // submitAnswer re-enables the answer buttons only when the answer was NOT accepted.
    if (submit.disabled) return;
    locked = false;
    render();
    if (typeof submit.focus === "function") submit.focus();
  };

  function send() {
    if (locked) return false;
    locked = true;
    render();
    const pending = onSubmit(JSON.stringify(order), submit);
    if (pending && typeof pending.then === "function") {
      root.setAttribute("aria-busy", "true");
      pending.then(settle, settle);
    }
    return true;
  }
  submit.addEventListener("click", () => { send(); });

  render();
  return { root, rows, submit, move, send, current: () => [...order] };
}
