// Lærligverse LP-13 / K9 PROTOTYPE: the introduction as a server step without an answer key (migration
// 20261110043500, docs/laerligverse/eksponering-datakontrakt.md). Pure TypeScript with no Deno or network imports:
// get-next-question and the introduction-progress function use it, the Node unit suite tests it.
//
// SWITCHES (Edge secrets, exactly "on" = on, unset everywhere):
//   LAERLIGVERSE_INTRODUCTION — get-next-question serves an objective's introduction before the first sequence step
//                               (only in a server-directed sequence), and introduction-progress accepts "completed";
//   LAERLIGVERSE_PRESENTED    — introduction-progress also accepts the optional "presented" signal.
//
// The public payload is built field by field from the server's content: only cards[{title, text}] — never a key,
// option, hint or review text (the database also refuses such keys in an introduction).

export const INTRODUCTION_ENV = "LAERLIGVERSE_INTRODUCTION";
export const PRESENTED_ENV = "LAERLIGVERSE_PRESENTED";

export const on = (value: string | undefined | null): boolean => value === "on";

// F12-B: the request's introduction capability (body.introduction_capability). A COMPATIBILITY signal, never an
// authorisation: it can only tell the server that this host and game session can SHOW a server introduction. It never
// grants a task, a reward, evidence or an exemption — without it, a required introduction is not skipped but answered
// with step "introduction_required" and nothing is written.
//   absent    — the field is missing (every client before F12-B, and every host that does not show introductions);
//   supported — exactly the integer 1 (version 1: the cards of step "introduction" + introduction-progress shown/done);
//   invalid   — anything else (another number, a string, true, null …): the request is refused (400), nothing is read
//               or written. A future version is a new integer the server must learn first; it is refused until then.
export const INTRODUCTION_CAPABILITY_FIELD = "introduction_capability";
export const INTRODUCTION_CAPABILITY_VERSION = 1;
export type IntroductionCapability = "absent" | "supported" | "invalid";

export function introductionCapabilityOf(body: unknown): IntroductionCapability {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "absent";
  if (!Object.prototype.hasOwnProperty.call(body, INTRODUCTION_CAPABILITY_FIELD)) return "absent";
  const v = (body as Record<string, unknown>)[INTRODUCTION_CAPABILITY_FIELD];
  return v === INTRODUCTION_CAPABILITY_VERSION ? "supported" : "invalid";
}

/**
 * F12-B: is an introduction REQUIRED for this pupil and objective, decided WITHOUT writing (for a request that cannot
 * show it)? The same rule as serve_introduction (migration 20261110043500): a round of ANY version of the objective's
 * introduction decides — completed → not required, not completed → required; without a round, an ACTIVE introduction
 * for the objective → required; none → not required. The rows are read on the backend client (service_role has SELECT
 * on both tables); `round` is the pupil's earliest round of the objective (or null), `activeIntroduction` whether one
 * is active. Anything malformed is a contract break (error), never "not required".
 */
export type RequiredDecision = { kind: "required" } | { kind: "not_required" } | { kind: "error"; problem: string };

export function introductionRequired(rounds: unknown, active: unknown): RequiredDecision {
  if (!Array.isArray(rounds) || !Array.isArray(active)) return { kind: "error", problem: "rows are not arrays" };
  if (rounds.length > 0) {
    const r = rounds[0];
    if (typeof r !== "object" || r === null || !Object.prototype.hasOwnProperty.call(r, "completed_at")) {
      return { kind: "error", problem: "round without completed_at" };
    }
    const completedAt = (r as Record<string, unknown>).completed_at;
    if (completedAt !== null && typeof completedAt !== "string") return { kind: "error", problem: "invalid completed_at" };
    return completedAt === null ? { kind: "required" } : { kind: "not_required" };
  }
  return active.length > 0 ? { kind: "required" } : { kind: "not_required" };
}

const MAX_CARDS = 10;
const MAX_TITLE = 200;
const MAX_TEXT = 2000;

export type IntroCard = { title: string; text: string };

/** The public cards of an introduction's content, or null when the content is not a valid introduction. */
export function publicIntroduction(content: unknown): { cards: IntroCard[] } | null {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return null;
  const cards = (content as Record<string, unknown>).cards;
  if (!Array.isArray(cards) || cards.length < 1 || cards.length > MAX_CARDS) return null;
  const out: IntroCard[] = [];
  for (const c of cards) {
    if (typeof c !== "object" || c === null) return null;
    const { title, text } = c as Record<string, unknown>;
    if (typeof title !== "string" || typeof text !== "string" || title.trim() === "" || text.trim() === ""
      || title.length > MAX_TITLE || text.length > MAX_TEXT) return null;
    out.push({ title, text });
  }
  return { cards: out };
}

export type ServeDecision =
  | { kind: "show"; roundId: string; contentSha256: string; cards: IntroCard[] }
  | { kind: "continue" }
  | { kind: "error"; problem: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** serve_introduction's jsonb → show the introduction, continue with the sequence, or a contract break. */
export function decideIntroduction(data: unknown): ServeDecision {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { kind: "error", problem: "result is not an object" };
  const r = data as Record<string, unknown>;
  if (r.outcome === "none" || r.outcome === "completed") return { kind: "continue" };
  if (r.outcome === "served" || r.outcome === "resumed") {
    if (typeof r.round_id !== "string" || !UUID.test(r.round_id)) return { kind: "error", problem: "invalid round_id" };
    if (typeof r.content_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(r.content_sha256)) return { kind: "error", problem: "invalid content_sha256" };
    const pub = publicIntroduction(r.content);
    if (pub === null) return { kind: "error", problem: "invalid introduction content" };
    return { kind: "show", roundId: r.round_id, contentSha256: r.content_sha256, cards: pub.cards };
  }
  return { kind: "error", problem: "unknown outcome" };
}
