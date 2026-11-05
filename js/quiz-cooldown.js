// Anti-gætte-pausen i quizzen — browserens del (docs/quiz-anti-guess-cooldown.md).
//
// HÅNDHÆVELSEN ER SERVERENS. Databasen afviser svar under en pause (triggeren quiz_cooldown_guard på
// question_instances) og ejer tærskel, vindue og varighed (public.quiz_cooldown_config). Browseren gør
// kun tre ting: genkender afvisningen, viser den godkendte tekst med en nedtælling, og spørger serveren
// (public.get_my_quiz_cooldown) ved indlæsning, når en anden fane eller enhed melder om en pause, og
// når nedtællingen når 00:00. En manipuleret browser kan højst vise en forkert nedtælling — svar bliver
// stadig afvist af serveren.
//
// NEDTÆLLINGEN tåler et forkert eller ændret ur: den bygger på serverens to tidspunkter (pausens slut og
// serverens "nu" i SAMME svar) og måler derefter den forløbne tid med performance.now(), som er monoton
// og uafhængig af systemuret. Date.now() bruges ikke.
//
// Eleven ser ALDRIG tærsklen, vinduet eller antallet af fejl; intet i dette modul kender dem.
//
// Rent modul uden DOM-adgang, så Node-unit-testene (tests/unit/quiz-cooldown.test.mjs) kører præcis det,
// browseren kører.

// Den godkendte tekst (produktejer). Ændres kun med ejerens godkendelse.
export const COOLDOWN_TEXT = Object.freeze({
  title: "🧠 Hov, lidt for hurtigt!",
  body: "Tag en lille tænkepause. Du kan snart fortsætte din læring!",
  button: "Fortsæt quizzen",
  note: "Du mister ikke XP eller mønter i pausen.",
});

// KUN præsentation: bruges, hvis serveren afviste et svar uden at sige hvornår pausen slutter, og
// get_my_quiz_cooldown heller ikke kunne svare. Serveren afviser stadig svar til den rigtige slut.
export const FALLBACK_COOLDOWN_MS = 120_000;

// Én dags pause er langt over enhver konfiguration; et større tal er en fejl, ikke en pause.
const MAX_COOLDOWN_MS = 86_400_000;

export const BROADCAST_CHANNEL = "laerlig-quiz-cooldown";
export const RPC_NAME = "get_my_quiz_cooldown";

/** Resterende millisekunder som "MM:SS", rundet OP til hele sekunder (02:00 ved start, 00:00 ved slut). */
export function formatRemaining(ms) {
  const total = Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Varigheden fra serverens to tidspunkter, eller null hvis de mangler eller er urimelige. */
export function serverRemainingMs(endsAt, serverNow) {
  const end = typeof endsAt === "string" ? Date.parse(endsAt) : NaN;
  const now = typeof serverNow === "string" ? Date.parse(serverNow) : NaN;
  if (!Number.isFinite(end) || !Number.isFinite(now)) return null;
  const ms = end - now;
  if (ms > MAX_COOLDOWN_MS) return null;
  return Math.max(0, ms);
}

/**
 * En nedtælling forankret i serverens tid og målt med en monoton klokke.
 *   remainingMs  ms tilbage fra serveren (eller fallback)
 *   monoNow      monoton klokke i ms (browser: () => performance.now())
 */
export function createCountdown(remainingMs, monoNow) {
  const start = monoNow();
  const total = Number.isFinite(remainingMs) && remainingMs > 0 ? remainingMs : 0;
  return {
    remainingMs() {
      const elapsed = Math.max(0, monoNow() - start);
      return Math.max(0, total - elapsed);
    },
  };
}

/**
 * Pause-info fra serveren i den form, browseren bruger: { remainingMs, verified }.
 * verified=false betyder, at varigheden er præsentationens fallback.
 */
export function cooldownFromServer(endsAt, serverNow) {
  const ms = serverRemainingMs(endsAt, serverNow);
  return ms === null ? { remainingMs: FALLBACK_COOLDOWN_MS, verified: false } : { remainingMs: ms, verified: true };
}

async function readErrorBody(error) {
  const ctx = error && error.context;
  if (!ctx || typeof ctx.status !== "number") return { status: null, body: null };
  let body = null;
  try {
    const res = typeof ctx.clone === "function" ? ctx.clone() : ctx;
    const text = await res.text();
    try { body = JSON.parse(text); } catch (_e) { body = null; }
  } catch (_e) { body = null; }
  return { status: ctx.status, body: body && typeof body === "object" && !Array.isArray(body) ? body : null };
}

/**
 * Er en fejl fra supabase.functions.invoke("process-event") en pauseafvisning?
 *   process-event med quiz-cooldown.ts:  429 { outcome: "quiz_cooldown", cooldown_until, server_now }
 *   process-event version 34 (før den er udrullet): den gamle vej svarer på enhver RPC-fejl med
 *   500 { error: <databasens besked> }, og databasens besked er her præcis "quiz_cooldown_active".
 * Returnerer { endsAt, serverNow } (kan være null → spørg get_my_quiz_cooldown) eller null.
 */
export async function cooldownFromInvokeError(error) {
  if (!error || error.name !== "FunctionsHttpError") return null;
  const { status, body } = await readErrorBody(error);
  if (!body) return null;
  if (status === 429 && body.outcome === "quiz_cooldown") {
    return {
      endsAt: typeof body.cooldown_until === "string" ? body.cooldown_until : null,
      serverNow: typeof body.server_now === "string" ? body.server_now : null,
    };
  }
  if (status === 500 && body.error === "quiz_cooldown_active") return { endsAt: null, serverNow: null };
  return null;
}

/**
 * Den indloggede elevs egen pause fra serveren: { active, endsAt, serverNow } eller null, når den ikke
 * kan afgøres (funktionen findes ikke endnu, netværksfejl, uventet form). null betyder "ingen kendt
 * pause" — serveren afviser stadig svar, hvis der er en.
 */
// Before the migration is applied the function does not exist (PostgREST PGRST202 / HTTP 404): then this
// page stops asking for the rest of its life instead of logging a failed request after every answer.
let rpcMissing = false;
export function _resetRpcMissingForTests() { rpcMissing = false; }

export async function fetchCooldownStatus(client) {
  if (rpcMissing) return null;
  try {
    const { data, error } = await client.rpc(RPC_NAME);
    if (error && (error.code === "PGRST202" || error.status === 404)) rpcMissing = true;
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    if (data.active !== true) return { active: false, endsAt: null, serverNow: null };
    return {
      active: true,
      endsAt: typeof data.ends_at === "string" ? data.ends_at : null,
      serverNow: typeof data.server_now === "string" ? data.server_now : null,
    };
  } catch (_e) {
    return null;
  }
}

/** Fanekanal (BroadcastChannel) — fail-soft: null hvor browseren ikke har den. */
export function openCooldownChannel(onPause) {
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    const ch = new BroadcastChannel(BROADCAST_CHANNEL);
    ch.onmessage = (ev) => { if (ev && ev.data && ev.data.type === "quiz_cooldown") onPause(); };
    return ch;
  } catch (_e) {
    return null;
  }
}

/** Fortæl andre faner, at der er en pause. Indholdet er bevidst tomt: modtageren spørger serveren. */
export function announceCooldown(channel) {
  try { channel?.postMessage({ type: "quiz_cooldown" }); } catch (_e) { /* fail-soft */ }
}
