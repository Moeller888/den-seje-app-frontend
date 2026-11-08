// Spillepauser (D-347, D-364): minigames are offered as a voluntary break after 10 minutes of active quiz time.
//
// THE SERVER DECIDES. Active time, eligibility, the random draw, the single-use pass and the new
// period all live in supabase/migrations/20261105090000_minigame_breaks.sql. This module only:
//   * names the games (MINIGAME_CATALOG — the one list on the client; the server's list of enabled
//     games, public.minigame_break_games, must hold the same keys: tests/unit/minigame-break.test.mjs);
//   * measures how long the question on screen was VISIBLE, which can only LOWER the server's credit;
//   * asks the server after each registered answer, shows the offer dialog, and sends the choice.
//
// FAIL-SOFT, ALWAYS. Every network or rendering failure here returns "no break" and the quiz carries on
// exactly as before. Nothing here touches the answer, XP, coins, mastery or the next question.
//
// The 10-minute interval (MINIGAME_INTERVAL_SECONDS = 600, D-364) is a constant of the SQL function and is
// reported back as `interval_seconds`; it is deliberately NOT repeated here.

export const MINIGAME_CATALOG = Object.freeze([
  Object.freeze({ key: "stabel", name: "Stabel", page: "stabel.html" }),
  Object.freeze({ key: "husk",   name: "Husk",   page: "husk.html" }),
  Object.freeze({ key: "naal",   name: "Nål",    page: "naal.html" }),
  Object.freeze({ key: "kloeft", name: "Kløft",  page: "kloeft.html" }),
  Object.freeze({ key: "hop",    name: "Hop",    page: "hop.html" }),
  Object.freeze({ key: "brud",   name: "Brud",   page: "brud.html" }),
  Object.freeze({ key: "slope",  name: "Slope",  page: "slope.html" }),
]);

export const YES_LABEL = "Ja tak";
export const NO_LABEL = "Nej, ellers tak";
export const OFFER_SUBTEXT = "Du har arbejdet godt! Har du lyst til en lille spillepause?";
export const ACCEPT_FAILED_TEXT = "Spillepausen kunne ikke startes lige nu. Vi fortsætter med quizzen.";

// Subjects the quiz accepts in ?fag= (app.js). Anything else returns to the default quiz.
const SUBJECTS = Object.freeze(["engelsk", "dansk"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOfferId(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function gameByKey(key) {
  if (typeof key !== "string") return null;
  for (const game of MINIGAME_CATALOG) if (game.key === key) return game;
  return null;
}

export function offerHeading(gameName) {
  return "Har du lyst til et spil " + gameName + "?";
}

// The quiz address a game returns to, keeping the subject the pupil was working in.
export function quizUrl(subject) {
  return SUBJECTS.includes(subject) ? "index.html?fag=" + subject : "index.html";
}

// The game page for an accepted offer. The pass is the offer id; the game page redeems it once.
export function breakGameUrl(game, offerId, subject) {
  if (!game || !isOfferId(offerId)) return null;
  const params = new URLSearchParams({ pause: offerId });
  if (SUBJECTS.includes(subject)) params.set("fag", subject);
  return game.page + "?" + params.toString();
}

// Seconds the page was visible since restart(). A hidden tab does not count. Uses a monotonic clock, so
// changing the computer's clock changes nothing (and the server bounds the value anyway).
export function createVisibleTimer({ now, doc } = {}) {
  const clock = typeof now === "function" ? now
    : () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  const d = doc ?? (typeof document !== "undefined" ? document : null);
  const isVisible = () => !d || d.visibilityState !== "hidden";
  let total = 0;
  let since = isVisible() ? clock() : null;

  function onVisibility() {
    if (isVisible()) {
      if (since === null) since = clock();
    } else if (since !== null) {
      total += Math.max(0, clock() - since);
      since = null;
    }
  }
  if (d && typeof d.addEventListener === "function") d.addEventListener("visibilitychange", onVisibility);

  return {
    restart() {
      total = 0;
      since = isVisible() ? clock() : null;
    },
    seconds() {
      const ms = total + (since !== null ? Math.max(0, clock() - since) : 0);
      return Math.floor(ms / 1000);
    },
    dispose() {
      if (d && typeof d.removeEventListener === "function") d.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

// Validates the server's reply. An offer is used only if its id is a uuid AND its game is one this page
// knows how to open; anything else is "no offer" (and is logged by the caller).
export function parseAfterAnswer(data) {
  if (!data || typeof data !== "object" || data.status !== "ok") return { offer: null, valid: false };
  const raw = data.offer;
  if (raw === null || raw === undefined) return { offer: null, valid: true };
  if (typeof raw !== "object" || !isOfferId(raw.id)) return { offer: null, valid: false };
  const game = gameByKey(raw.game);
  if (!game) return { offer: null, valid: false };
  return { offer: { id: raw.id, game }, valid: true };
}

// After a registered answer: credit its time and ask whether a break is due. Never throws.
export async function checkBreakAfterAnswer(client, instanceId, visibleSeconds) {
  try {
    if (!client || typeof client.rpc !== "function" || typeof instanceId !== "string" || instanceId.length === 0) {
      return { offer: null, error: "no_client_or_instance" };
    }
    const visible = Number.isFinite(visibleSeconds) && visibleSeconds >= 0 ? Math.floor(visibleSeconds) : null;
    const { data, error } = await client.rpc("minigame_break_after_answer", {
      p_question_instance_id: instanceId,
      p_visible_seconds: visible,
    });
    if (error) return { offer: null, error: "rpc_error" };
    const parsed = parseAfterAnswer(data);
    if (!parsed.valid) return { offer: null, error: "invalid_reply" };
    return { offer: parsed.offer, error: null };
  } catch (_e) {
    return { offer: null, error: "threw" };
  }
}

// Sends "Ja tak" / "Nej, ellers tak". Never throws.
export async function respondToOffer(client, offerId, accept) {
  try {
    const { data, error } = await client.rpc("minigame_break_respond", { p_offer_id: offerId, p_accept: accept === true });
    if (error || !data || typeof data !== "object") return { ok: false, offerStatus: null };
    const want = accept === true ? "accepted" : "declined";
    return { ok: data.status === "ok" && data.offer_status === want, offerStatus: data.offer_status ?? null };
  } catch (_e) {
    return { ok: false, offerStatus: null };
  }
}

// The offer dialog: a native modal <dialog> (focus is trapped and the page behind is inert), with
// exactly two buttons. It resolves ONCE with "yes" or "no"; after the first choice both buttons are
// disabled, so a double click or a fast second key press cannot send a second choice.
// Escape does NOT close it: closing without a choice would be a third, ambiguous answer. The pupil is
// never stuck — both buttons are always there, and "Nej, ellers tak" simply continues the quiz.
export function showBreakDialog({ doc, game, attachReadAloud } = {}) {
  const d = doc ?? document;
  return new Promise((resolve) => {
    const dialog = d.createElement("dialog");
    dialog.id = "minigame-break-dialog";
    dialog.className = "minigame-break-dialog";
    dialog.setAttribute("aria-labelledby", "minigame-break-title");
    dialog.setAttribute("aria-describedby", "minigame-break-text");

    const title = d.createElement("h2");
    title.id = "minigame-break-title";
    title.className = "minigame-break-title";
    title.textContent = offerHeading(game.name);

    const text = d.createElement("p");
    text.id = "minigame-break-text";
    text.className = "minigame-break-text";
    text.textContent = OFFER_SUBTEXT;

    const actions = d.createElement("div");
    actions.className = "minigame-break-actions";
    const yes = d.createElement("button");
    yes.type = "button";
    yes.id = "minigame-break-yes";
    yes.className = "minigame-break-btn minigame-break-btn--yes";
    yes.textContent = YES_LABEL;
    const no = d.createElement("button");
    no.type = "button";
    no.id = "minigame-break-no";
    no.className = "minigame-break-btn minigame-break-btn--no";
    no.textContent = NO_LABEL;
    actions.append(yes, no);
    dialog.append(title, text, actions);

    let done = false;
    function choose(choice) {
      if (done) return;
      done = true;
      yes.disabled = true;
      no.disabled = true;
      try { if (dialog.open) dialog.close(); } catch (_e) { /* fail-soft */ }
      dialog.remove();
      resolve(choice);
    }
    yes.addEventListener("click", () => choose("yes"));
    no.addEventListener("click", () => choose("no"));
    dialog.addEventListener("cancel", (event) => event.preventDefault());

    d.body.appendChild(dialog);
    try {
      // The quiz's own read-aloud player (it renders the given text into the element, so it gets
      // exactly the heading's text). Absent when read-aloud is off — then nothing is added.
      if (typeof attachReadAloud === "function") {
        attachReadAloud(title, offerHeading(game.name));
        // The player's controls must not become part of the heading (it names the dialog for screen
        // readers): keep the word-tracked text in the heading and place the controls right after it.
        const player = title.querySelector(".read-aloud-player");
        if (player) title.after(player);
      }
    } catch (_e) { /* fail-soft: the dialog works without read-aloud */ }
    try {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } catch (_e) {
      dialog.setAttribute("open", "");
    }
    try { yes.focus(); } catch (_e) { /* fail-soft */ }
  });
}

// The whole offer, start to finish. Returns "navigated" when the pupil was sent to the game (the quiz
// must then load nothing), otherwise "continue" (declined, or the acceptance failed) — the quiz then
// loads its next question as it would have without a break.
export async function runBreakOffer({ client, offer, subject, doc, navigate, track, attachReadAloud, showNotice } = {}) {
  const note = (event, props) => { try { if (typeof track === "function") track(event, props); } catch (_e) { /* fail-soft */ } };
  try {
    if (!offer || !offer.game || !isOfferId(offer.id)) return "continue";
    note("minigame_break_shown", { game: offer.game.key });
    const choice = await showBreakDialog({ doc, game: offer.game, attachReadAloud });
    const accept = choice === "yes";
    const reply = await respondToOffer(client, offer.id, accept);
    if (!accept) {
      note("minigame_break_declined", { game: offer.game.key, saved: reply.ok });
      return "continue";
    }
    const url = breakGameUrl(offer.game, offer.id, subject);
    if (!reply.ok || !url) {
      note("minigame_break_accept_failed", { game: offer.game.key, offer_status: reply.offerStatus });
      if (typeof showNotice === "function") showNotice(ACCEPT_FAILED_TEXT);
      return "continue";
    }
    note("minigame_break_accepted", { game: offer.game.key });
    if (typeof navigate === "function") navigate(url);
    return "navigated";
  } catch (_e) {
    return "continue";
  }
}
