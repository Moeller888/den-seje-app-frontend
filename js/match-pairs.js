// Match par (match_pairs) — the quiz control where the pupil connects each item in the left column
// with the item in the right column that belongs to it. Server contract: supabase/functions/_shared/
// match-pairs.ts. The browser receives only two lists of texts (content.match.left / .right, the right
// list already shuffled by the server) and sends its connections; it never knows the answer and never
// decides correctness.
//
// HOW A PUPIL CONNECTS (the same for mouse, touch and keyboard — every item is a real <button>)
//   * tap/click/Enter/Space an item → it is selected (highlighted, aria-pressed="true");
//   * then an item in the OTHER column → the two are connected: same colour AND the same pair number,
//     so the pairing never depends on colour alone;
//   * an item that is already connected → the connection is removed and the item is selected again,
//     so changing your mind is one tap;
//   * the same item again, or Escape → nothing is selected.
// Arrow keys move within a column (↑/↓) and across to the same row of the other column (←/→).
// Every change is announced through a polite live region, and each item's accessible name says what
// it is connected to. "Send svar" is enabled only when every item is connected; the progress line
// says how many pairs are done.
//
// WHAT IS SENT
// JSON [[leftPosition, rightPosition], …] in display positions — exactly what the server's
// canonicalMatchAnswer() accepts. After grading, the server returns the instance key
// ("0:2,1:0,…", left position → right position) and showResult() marks each connection right or wrong
// and lists the correct pairs. Display only.
//
// The document is injected so the control can be unit-tested without a browser.

export const MATCH_MIN_PAIRS = 2;
export const MATCH_MAX_PAIRS = 6;
export const MATCH_PAIR_COLOURS = 6;

export const MATCH_TEXT = Object.freeze({
  leftGroup: "Venstre kolonne",
  rightGroup: "Højre kolonne",
  submit: "Send svar",
  instructions: "Tryk på et ord og derefter på det, der hører sammen med det.",
});

// The layout from the question payload, or null when it is not two equally long lists of 2–6
// non-empty texts. The caller shows a visible error for null — never a half-built control.
export function readMatchLayout(content) {
  const match = content && typeof content === "object" ? content.match : null;
  if (!match || typeof match !== "object") return null;
  const { left, right } = match;
  const ok = (list) => Array.isArray(list)
    && list.length >= MATCH_MIN_PAIRS && list.length <= MATCH_MAX_PAIRS
    && list.every((t) => typeof t === "string" && t.trim().length > 0);
  if (!ok(left) || !ok(right) || left.length !== right.length) return null;
  return { left: [...left], right: [...right] };
}

// The server's key as an array (index = left position, value = right position), or null.
export function parseMatchKey(key, pairCount) {
  if (typeof key !== "string") return null;
  const parts = key.split(",");
  if (parts.length !== pairCount) return null;
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const m = /^(\d):(\d)$/.exec(parts[i]);
    if (!m || Number(m[1]) !== i) return null;
    out.push(Number(m[2]));
  }
  const sorted = [...out].sort((a, b) => a - b);
  return sorted.every((v, i) => v === i) ? out : null;
}

// "Danmark → København · Norge → Oslo" — the correct pairs in words, for the explanation panel.
// Null when the key does not fit the layout.
export function matchCorrectionText(layout, key) {
  if (!layout) return null;
  const positions = parseMatchKey(key, layout.left.length);
  if (!positions) return null;
  return "De rigtige par: " + layout.left.map((l, i) => `${l} → ${layout.right[positions[i]]}`).join(" · ");
}

export function buildMatchPairsAnswer(doc, { layout, onSubmit, describedBy = null } = {}) {
  if (!doc || typeof doc.createElement !== "function") {
    throw new Error("buildMatchPairsAnswer: a document is required");
  }
  if (typeof onSubmit !== "function") {
    throw new Error("buildMatchPairsAnswer: onSubmit is required");
  }
  const checked = layout ? readMatchLayout({ match: layout }) : null;
  if (!checked) throw new Error("buildMatchPairsAnswer: a valid layout is required");
  const n = checked.left.length;

  const root = doc.createElement("div");
  root.className = "match-pairs";
  root.id = "match-pairs";

  const instructions = doc.createElement("p");
  instructions.id = "match-instructions";
  instructions.className = "match-instructions";
  instructions.textContent = MATCH_TEXT.instructions;
  root.appendChild(instructions);

  const grid = doc.createElement("div");
  grid.className = "match-grid";
  // css/match-pairs.css lays both columns on these rows so a long text keeps the two columns level.
  if (grid.style && typeof grid.style.setProperty === "function") grid.style.setProperty("--match-rows", String(n));
  root.appendChild(grid);

  // State: which right position each left position is connected to (-1 = none), the reverse, the pair
  // number shown on each connection, and the current selection.
  const rightOfLeft = new Array(n).fill(-1);
  const leftOfRight = new Array(n).fill(-1);
  const pairNumberOfLeft = new Array(n).fill(0);
  let selected = null; // { side: "left" | "right", index }
  let locked = false;
  let inFlight = false;

  const buttons = { left: [], right: [] };

  const makeColumn = (side) => {
    const col = doc.createElement("div");
    col.className = `match-column match-column-${side}`;
    col.setAttribute("role", "group");
    col.setAttribute("aria-label", side === "left" ? MATCH_TEXT.leftGroup : MATCH_TEXT.rightGroup);
    checked[side].forEach((text, index) => {
      const b = doc.createElement("button");
      b.setAttribute("type", "button");
      b.className = "match-item";
      b.dataset.side = side;
      b.dataset.index = String(index);
      b.setAttribute("aria-pressed", "false");
      const label = doc.createElement("span");
      label.className = "match-item-text";
      label.textContent = text;
      const badge = doc.createElement("span");
      badge.className = "match-badge";
      badge.setAttribute("aria-hidden", "true");
      b.appendChild(label);
      b.appendChild(badge);
      if (describedBy) b.setAttribute("aria-describedby", `${describedBy} ${instructions.id}`);
      b.addEventListener("click", () => onItem(side, index));
      b.addEventListener("keydown", (e) => onKey(e, side, index));
      buttons[side].push(b);
      col.appendChild(b);
    });
    return col;
  };

  grid.appendChild(makeColumn("left"));
  grid.appendChild(makeColumn("right"));

  const progress = doc.createElement("p");
  progress.id = "match-progress";
  progress.className = "match-progress";
  root.appendChild(progress);

  // Polite announcements of every change (selection, connection, removal) for screen readers.
  const live = doc.createElement("p");
  live.id = "match-live";
  live.className = "match-live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  root.appendChild(live);

  const button = doc.createElement("button");
  button.setAttribute("type", "button");
  button.className = "submit-btn match-submit";
  button.id = "match-submit";
  button.textContent = MATCH_TEXT.submit;
  root.appendChild(button);

  const textOf = (side, index) => checked[side][index];
  const connectedCount = () => rightOfLeft.filter((r) => r !== -1).length;

  const nextPairNumber = () => {
    for (let k = 1; k <= n; k++) if (!pairNumberOfLeft.includes(k)) return k;
    return n;
  };

  const render = () => {
    for (const side of ["left", "right"]) {
      buttons[side].forEach((b, index) => {
        const leftIndex = side === "left" ? index : leftOfRight[index];
        const partner = side === "left" ? rightOfLeft[index] : leftOfRight[index];
        const isSelected = !!selected && selected.side === side && selected.index === index;
        const pairNo = leftIndex !== -1 ? pairNumberOfLeft[leftIndex] : 0;
        b.setAttribute("aria-pressed", isSelected ? "true" : "false");
        b.classList.toggle("is-selected", isSelected);
        b.classList.toggle("is-connected", partner !== -1);
        for (let c = 1; c <= MATCH_PAIR_COLOURS; c++) b.classList.toggle(`match-c${c}`, pairNo === c);
        const badge = b.querySelector(".match-badge");
        if (badge) badge.textContent = pairNo ? String(pairNo) : "";
        const other = side === "left" ? "right" : "left";
        const name = textOf(side, index);
        b.setAttribute("aria-label", partner !== -1
          ? `${name}, forbundet med ${textOf(other, partner)} (par ${pairNo})`
          : isSelected ? `${name}, valgt` : name);
      });
    }
    const done = connectedCount();
    progress.textContent = `${done} af ${n} par forbundet`;
    button.disabled = locked || done !== n;
  };

  const announce = (text) => { live.textContent = text; };

  const disconnectLeft = (l) => {
    const r = rightOfLeft[l];
    if (r === -1) return;
    rightOfLeft[l] = -1;
    leftOfRight[r] = -1;
    pairNumberOfLeft[l] = 0;
  };

  function onItem(side, index) {
    if (locked) return;
    const other = side === "left" ? "right" : "left";
    const partner = side === "left" ? rightOfLeft[index] : leftOfRight[index];
    if (partner !== -1) {
      // Already connected: remove the connection and pick this item up again.
      disconnectLeft(side === "left" ? index : partner);
      selected = { side, index };
      announce(`Forbindelsen er fjernet. Valgt: ${textOf(side, index)}.`);
    } else if (selected && selected.side === side && selected.index === index) {
      selected = null;
      announce("Intet valgt.");
    } else if (!selected || selected.side === side) {
      selected = { side, index };
      announce(`Valgt: ${textOf(side, index)}. Vælg nu det, der hører sammen med det.`);
    } else {
      const l = side === "left" ? index : selected.index;
      const r = side === "right" ? index : selected.index;
      pairNumberOfLeft[l] = nextPairNumber();
      rightOfLeft[l] = r;
      leftOfRight[r] = l;
      selected = null;
      const done = connectedCount();
      announce(`${textOf("left", l)} og ${textOf("right", r)} er forbundet. ${done} af ${n} par.`);
      // Keep the hand moving: after a connection, focus the next free item in the column the pupil
      // started from, or "Send svar" once everything is connected — after render(), which is what
      // enables that button (a disabled button cannot take focus).
      const startSide = other;
      const free = buttons[startSide].findIndex((_, i) => (startSide === "left" ? rightOfLeft[i] : leftOfRight[i]) === -1);
      render();
      const target = free !== -1 ? buttons[startSide][free] : done === n ? button : null;
      if (target && typeof target.focus === "function") target.focus();
      return;
    }
    render();
  }

  function onKey(e, side, index) {
    const move = (s, i) => {
      const target = buttons[s][Math.max(0, Math.min(n - 1, i))];
      if (target && typeof target.focus === "function") target.focus();
      e.preventDefault();
    };
    if (e.key === "ArrowDown") move(side, index + 1);
    else if (e.key === "ArrowUp") move(side, index - 1);
    else if (e.key === "ArrowRight" && side === "left") move("right", index);
    else if (e.key === "ArrowLeft" && side === "right") move("left", index);
    else if (e.key === "Escape" && selected) {
      selected = null;
      announce("Intet valgt.");
      render();
      e.preventDefault();
    }
  }

  const connections = () => rightOfLeft.map((r, l) => [l, r]).filter(([, r]) => r !== -1);

  const settle = () => {
    // submitAnswer re-enables the button only when the answer was NOT accepted (network / server
    // error): then the pupil may change connections and send again. Accepted: stay locked.
    if (button.disabled) return;
    inFlight = false;
    locked = false;
    render();
  };

  const submit = () => {
    if (inFlight || locked || connectedCount() !== n) return false;
    const pending = onSubmit(JSON.stringify(connections()), button);
    if (pending && typeof pending.then === "function") {
      inFlight = true;
      locked = true;
      root.setAttribute("aria-busy", "true");
      pending.then(() => { root.removeAttribute("aria-busy"); settle(); }, () => { root.removeAttribute("aria-busy"); settle(); });
    }
    return true;
  };

  button.onclick = submit;

  // Marks every connection right or wrong against the server's key and lists the correct pairs.
  // Returns false (and changes nothing) when the key does not fit this question.
  const showResult = (key) => {
    const positions = parseMatchKey(key, n);
    if (!positions) return false;
    locked = true;
    selected = null;
    for (let l = 0; l < n; l++) {
      const ok = rightOfLeft[l] === positions[l];
      const marks = [buttons.left[l]];
      if (rightOfLeft[l] !== -1) marks.push(buttons.right[rightOfLeft[l]]);
      for (const b of marks) {
        b.classList.add(ok ? "match-ok" : "match-wrong");
        const mark = doc.createElement("span");
        mark.className = "match-mark";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = ok ? "✓" : "✗";
        b.appendChild(mark);
      }
    }
    const list = doc.createElement("ul");
    list.className = "match-solution";
    list.id = "match-solution";
    list.setAttribute("aria-label", "De rigtige par");
    positions.forEach((r, l) => {
      const li = doc.createElement("li");
      li.textContent = `${checked.left[l]} → ${checked.right[r]}`;
      if (rightOfLeft[l] === r) li.className = "match-solution-ok";
      list.appendChild(li);
    });
    root.insertBefore(list, button);
    const right = positions.filter((r, l) => rightOfLeft[l] === r).length;
    announce(`${right} af ${n} par var rigtige.`);
    render();
    return true;
  };

  render();
  return { root, button, submit, showResult, connections, layout: checked };
}
