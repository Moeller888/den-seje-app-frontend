// The game-page side of a spillepause (D-347). One shared contract for all seven minigames:
//
//   const pass = await enterBreakGame({ client: supabase, gameKey: "brud" });
//   if (!pass) return;                 // no valid pass: the page shows a locked notice instead
//   startRound(): if (!pass.beginRound()) return;   // true exactly once
//   showOver():   pass.endRound();                  // offers the way back to the quiz
//
// THE PASS is the accepted offer's id in ?pause=. The page redeems it with minigame_break_start, which
// the server allows exactly once, for exactly the offered game, for exactly this pupil, within 15 minutes
// of "Ja tak". So a direct address, an old link, someone else's link, a reload and the back button all
// end on the locked notice — on the SERVER, not by a client flag. The pass is then removed from the
// address bar.
//
// WHAT THIS DOES NOT DO. The game files are public static assets (Cloudflare serves every page to anyone);
// their JavaScript can be downloaded and run by hand. What is closed is every way to play through the
// product: no menu entry, no link, and no page that starts a round without a redeemed pass. No game pays
// anything — no XP, no coins, no mastery, Stabel included (D-347) — so a hand-run copy gains nothing.
//
// ONE ROUND. beginRound() returns true once; the "Igen" button is hidden. When the round is over, the
// only way on is "Tilbage til quizzen". Leaving early (the top link) is reported as 'exited'. Both report
// fail-soft: the way back always works, even when the report fails (the server closes the break anyway as
// soon as the pupil answers a quiz question).

import { gameByKey, isOfferId, quizUrl } from "./minigame-break.js";

export const LOCKED_TITLE = "Spillepausen er ikke åben";
export const LOCKED_TEXT = "Minispil kan kun spilles som en spillepause i quizzen. Når du har arbejdet med dine opgaver i 20 minutter, får du tilbudt et spil.";
export const BACK_TO_QUIZ = "Tilbage til quizzen";
const SUBJECTS = ["engelsk", "dansk"];

export function readPass(search) {
  let params;
  try { params = new URLSearchParams(typeof search === "string" ? search : ""); } catch (_e) { params = new URLSearchParams(); }
  const raw = params.get("pause");
  const fag = params.get("fag");
  return {
    offerId: isOfferId(raw) ? raw : null,
    subject: SUBJECTS.includes(fag) ? fag : null,
  };
}

async function redeem(client, offerId, gameKey) {
  try {
    const { data, error } = await client.rpc("minigame_break_start", { p_offer_id: offerId, p_game_key: gameKey });
    if (error || !data || typeof data !== "object") return { ok: false, reason: "error" };
    return { ok: data.status === "ok", reason: typeof data.reason === "string" ? data.reason : "unknown" };
  } catch (_e) {
    return { ok: false, reason: "error" };
  }
}

async function report(client, offerId, outcome) {
  try {
    await client.rpc("minigame_break_finish", { p_offer_id: offerId, p_outcome: outcome });
  } catch (_e) { /* fail-soft: the server closes the break at the next quiz answer */ }
}

function backButton(doc, id, onClick, primary) {
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.id = id;
  btn.textContent = BACK_TO_QUIZ;
  btn.className = "minigame-pass-back" + (primary ? " minigame-pass-back--primary" : "");
  btn.addEventListener("click", onClick);
  return btn;
}

// Replaces the whole game with a plain notice and a way out. Nothing of the game can be started.
export function showLocked(doc, root, homeUrl) {
  if (!root) return;
  root.dataset.screen = "locked";
  root.replaceChildren();
  const box = doc.createElement("section");
  box.id = "minigame-locked";
  box.className = "minigame-locked";
  box.setAttribute("role", "status");
  const h = doc.createElement("h1");
  h.className = "minigame-locked-title";
  h.textContent = LOCKED_TITLE;
  const p = doc.createElement("p");
  p.className = "minigame-locked-text";
  p.textContent = LOCKED_TEXT;
  const quiz = doc.createElement("a");
  quiz.className = "minigame-pass-back minigame-pass-back--primary";
  quiz.id = "minigame-locked-quiz";
  quiz.href = homeUrl;
  quiz.textContent = "Til quizzen";
  const hub = doc.createElement("a");
  hub.className = "minigame-pass-back";
  hub.href = "hub.html";
  hub.textContent = "Til Hub";
  box.append(h, p, quiz, hub);
  root.appendChild(box);
}

export async function enterBreakGame({ client, gameKey, doc, location, history, navigate } = {}) {
  const d = doc ?? document;
  const loc = location ?? window.location;
  const hist = history ?? window.history;
  const go = typeof navigate === "function" ? navigate : (url) => { loc.href = url; };
  const root = d.getElementById(gameKey + "-root");
  const pass = readPass(loc.search);
  const home = quizUrl(pass.subject);

  // Nothing of the game is usable until the pass is redeemed.
  const startBtn = d.getElementById(gameKey + "-start");
  if (startBtn) startBtn.disabled = true;

  if (!gameByKey(gameKey) || !client || !pass.offerId) {
    showLocked(d, root, home);
    return null;
  }

  const result = await redeem(client, pass.offerId, gameKey);
  // The pass is spent (or worthless): never keep it in the address bar, history or a copied link.
  try { hist.replaceState(null, "", loc.pathname); } catch (_e) { /* fail-soft */ }
  if (!result.ok) {
    showLocked(d, root, home);
    return null;
  }

  let begun = false;
  let ended = false;
  let leaving = false;

  async function leave(outcome) {
    if (leaving) return;
    leaving = true;
    await report(client, pass.offerId, outcome);
    go(home);
  }

  // The round's single start; "Igen" is gone.
  const again = d.getElementById(gameKey + "-again");
  if (again) again.hidden = true;

  // Every way back on the page leads to the quiz, and says so.
  for (const link of root ? root.querySelectorAll("a[href]") : []) {
    link.href = home;
    if (link.closest("#" + gameKey + "-over")) {
      link.hidden = true;                       // replaced by the primary button below
      continue;
    }
    link.textContent = "← Quizzen";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      leave(ended ? "completed" : "exited");
    });
  }

  const overActions = d.querySelector("#" + gameKey + "-over ." + gameKey + "-actions")
    ?? d.getElementById(gameKey + "-over");
  const finishBtn = backButton(d, "minigame-pass-return", () => leave("completed"), true);
  finishBtn.className += " " + gameKey + "-cta " + gameKey + "-cta--primary";
  if (overActions) overActions.prepend(finishBtn);

  if (startBtn) startBtn.disabled = false;

  return {
    offerId: pass.offerId,
    beginRound() {
      if (begun) return false;
      begun = true;
      return true;
    },
    endRound() {
      ended = true;
      try { finishBtn.focus(); } catch (_e) { /* fail-soft */ }
    },
  };
}
