/**
 * Learning bridge, protocol `laerligverse.bridge/2` (D-306).
 *
 * The game (an iframe on its own origin) and the host page (which holds the pupil's session) talk only
 * through these messages. The game never sees a token, an answer key or an evaluator; it sends
 * *claims about actions* and receives the server's verdict. Every message is validated strictly:
 * unknown fields, wrong types, oversized payloads and unknown message types are rejected (fail loud).
 *
 * Pure module: no DOM, no timers, no randomness.
 */

export const PROTOCOL = "laerligverse.bridge/2";
/** Versions this build can speak. bridge/1 was a design only (never built), so there is no N−1 yet. */
export const SUPPORTED_PROTOCOLS: readonly string[] = Object.freeze([PROTOCOL]);

/** Largest serialised message accepted in either direction (bytes of UTF-8 JSON). */
export const MAX_MESSAGE_BYTES = 8192;
export const MAX_TEXT_ANSWER = 200;
export const MAX_ORDER_ITEMS = 12;
export const MAX_OPTIONS = 12;

/** Interaction kinds a world can render. Grading for every kind stays on the server. */
export const INTERACTION_KINDS = Object.freeze(["choice", "short_text", "order"] as const);
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export const PURPOSES = Object.freeze(["introduction", "practice", "check", "review", "application"] as const);
export type Purpose = (typeof PURPOSES)[number];

export const SURFACES = Object.freeze(["world", "overlay"] as const);
export type Surface = (typeof SURFACES)[number];

/** The mode the server chose for the instance (D-277 mode enum, minus the quiz default). */
export const MODES = Object.freeze(["practice", "check", "review", "application", "diagnostic", "quiz_v1"] as const);
export type Mode = (typeof MODES)[number];

export const OUTCOMES = Object.freeze(["correct", "incorrect", "pending", "aborted"] as const);
export type Outcome = (typeof OUTCOMES)[number];

/** Display only: what the server decided this attempt counts as (LP-5). The game cannot set it. */
export const EVIDENCE = Object.freeze(["none", "practice", "evidence"] as const);
export type Evidence = (typeof EVIDENCE)[number];

export const ERROR_CODES = Object.freeze([
  "unsupported_protocol",
  "invalid_message",
  "not_ready",
  "unknown_task",
  "kind_mismatch",
  "kind_not_supported",
  "task_unavailable",
  "hint_unavailable",
  "session_expired",
  "server_error",
] as const);
export type ErrorCode = (typeof ERROR_CODES)[number];

export type Action =
  | { readonly kind: "choice"; readonly payload: { readonly optionId: string } }
  | { readonly kind: "short_text"; readonly payload: { readonly text: string } }
  | { readonly kind: "order"; readonly payload: { readonly order: readonly string[] } };

export interface StimulusOption {
  readonly id: string;
  readonly label: string;
}

/** Whitelisted stimulus: prompt and option ids/labels. Never an answer key. */
export interface Stimulus {
  readonly prompt: string;
  readonly options: readonly StimulusOption[] | null;
}

export interface PresentBody {
  readonly instanceToken: string;
  readonly kind: InteractionKind;
  readonly stimulus: Stimulus;
  readonly mode: Mode;
  readonly hintsAvailable: number;
  readonly contextKey: string;
}

export interface Feedback {
  readonly text: string | null;
  /** Shown only after the instance is closed. */
  readonly correctAnswer: string | null;
}

// ── Game → host ────────────────────────────────────────────────────────────────

export interface HelloMsg {
  readonly protocol: string;
  readonly type: "hello";
  readonly msgId: string;
  readonly supports: readonly string[];
  readonly kinds: readonly InteractionKind[];
  readonly contentId: string;
  readonly contentVersion: string;
}
export interface TaskRequestMsg {
  readonly protocol: string;
  readonly type: "task.request";
  readonly nonce: string;
  readonly requestId: string;
  readonly objectiveId: string;
  readonly purpose: Purpose;
  readonly surface: Surface;
  readonly contextKey: string;
}
export interface TaskActionMsg {
  readonly protocol: string;
  readonly type: "task.action";
  readonly nonce: string;
  readonly requestId: string;
  readonly instanceToken: string;
  readonly action: Action;
  readonly clientSeq: number;
}
export interface HintRequestMsg {
  readonly protocol: string;
  readonly type: "hint.request";
  readonly nonce: string;
  readonly requestId: string;
  readonly instanceToken: string;
  readonly level: number;
}
export type GameMessage = HelloMsg | TaskRequestMsg | TaskActionMsg | HintRequestMsg;

// ── Host → game ────────────────────────────────────────────────────────────────

export interface InitMsg {
  readonly protocol: string;
  readonly type: "init";
  readonly msgId: string;
  readonly replyTo: string;
  readonly nonce: string;
  /** Resumption: the instance that is still open on the server, if any. */
  readonly openTask: PresentBody | null;
}
export interface AckMsg {
  readonly protocol: string;
  readonly type: "ack";
  readonly nonce: string;
  readonly requestId: string;
  readonly state: "received" | "submitting" | "retrying";
}
export interface TaskPresentMsg extends PresentBody {
  readonly protocol: string;
  readonly type: "task.present";
  readonly nonce: string;
  readonly requestId: string;
}
export interface HintShowMsg {
  readonly protocol: string;
  readonly type: "hint.show";
  readonly nonce: string;
  readonly requestId: string;
  readonly instanceToken: string;
  readonly level: number;
  readonly text: string;
  readonly hintsRemaining: number;
}
export interface TaskResultMsg {
  readonly protocol: string;
  readonly type: "task.result";
  readonly nonce: string;
  readonly requestId: string;
  readonly instanceToken: string;
  readonly outcome: Outcome;
  readonly feedback: Feedback;
  readonly evidence: Evidence;
  /** true when the same committed answer can be sent again (aborted after network failures). */
  readonly retryable: boolean;
}
export interface ErrorMsg {
  readonly protocol: string;
  readonly type: "error";
  readonly nonce: string | null;
  readonly requestId: string | null;
  readonly code: ErrorCode;
}
export type HostMessage = InitMsg | AckMsg | TaskPresentMsg | HintShowMsg | TaskResultMsg | ErrorMsg;

// ── Validation ─────────────────────────────────────────────────────────────────

export type Validation<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const OBJECTIVE = /^[A-Za-z0-9_.:-]{1,64}$/;

class Invalid extends Error {}

function fail(reason: string): never {
  throw new Invalid(reason);
}

type Obj = Record<string, unknown>;

function isPlain(v: unknown): v is Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

function obj(v: unknown, where: string, keys: readonly string[]): Obj {
  if (!isPlain(v)) fail(`${where}: not an object`);
  for (const k of Object.keys(v)) if (!keys.includes(k)) fail(`${where}: unknown field "${k}"`);
  for (const k of keys) if (!Object.prototype.hasOwnProperty.call(v, k)) fail(`${where}: missing field "${k}"`);
  return v;
}

function str(v: unknown, where: string, max: number, min = 1): string {
  if (typeof v !== "string") fail(`${where}: not a string`);
  if (v.length < min || v.length > max) fail(`${where}: length out of range`);
  return v;
}

function id(v: unknown, where: string): string {
  if (typeof v !== "string" || !ID.test(v)) fail(`${where}: invalid id`);
  return v;
}

function int(v: unknown, where: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) fail(`${where}: invalid integer`);
  return v;
}

function oneOf<T extends string>(v: unknown, where: string, allowed: readonly T[]): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) fail(`${where}: invalid value`);
  return v as T;
}

function bool(v: unknown, where: string): boolean {
  if (typeof v !== "boolean") fail(`${where}: not a boolean`);
  return v;
}

function strOrNull(v: unknown, where: string, max: number): string | null {
  return v === null ? null : str(v, where, max);
}

/** Byte size of a value as UTF-8 JSON; Infinity when it cannot be serialised. */
export function messageBytes(v: unknown): number {
  let json: string | undefined;
  try {
    json = JSON.stringify(v);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  return json === undefined ? Number.POSITIVE_INFINITY : new TextEncoder().encode(json).length;
}

/** Validates an action against its kind's payload shape. */
export function parseAction(v: unknown, where = "action"): Action {
  const a = obj(v, where, ["kind", "payload"]);
  const kind = oneOf(a.kind, `${where}.kind`, INTERACTION_KINDS);
  if (kind === "choice") {
    const p = obj(a.payload, `${where}.payload`, ["optionId"]);
    return { kind, payload: { optionId: id(p.optionId, `${where}.payload.optionId`) } };
  }
  if (kind === "short_text") {
    const p = obj(a.payload, `${where}.payload`, ["text"]);
    return { kind, payload: { text: str(p.text, `${where}.payload.text`, MAX_TEXT_ANSWER) } };
  }
  const p = obj(a.payload, `${where}.payload`, ["order"]);
  const list = p.order;
  if (!Array.isArray(list) || list.length < 2 || list.length > MAX_ORDER_ITEMS) fail(`${where}.payload.order: invalid list`);
  const order = list.map((x, i) => id(x, `${where}.payload.order[${i}]`));
  if (new Set(order).size !== order.length) fail(`${where}.payload.order: duplicate item`);
  return { kind, payload: { order } };
}

function parseStimulus(v: unknown, where: string): Stimulus {
  const s = obj(v, where, ["prompt", "options"]);
  const prompt = str(s.prompt, `${where}.prompt`, 1000);
  if (s.options === null) return { prompt, options: null };
  if (!Array.isArray(s.options) || s.options.length < 2 || s.options.length > MAX_OPTIONS) fail(`${where}.options: invalid list`);
  const options = s.options.map((o, i) => {
    const r = obj(o, `${where}.options[${i}]`, ["id", "label"]);
    return { id: id(r.id, `${where}.options[${i}].id`), label: str(r.label, `${where}.options[${i}].label`, 300) };
  });
  if (new Set(options.map((o) => o.id)).size !== options.length) fail(`${where}.options: duplicate id`);
  return { prompt, options };
}

function parsePresentBody(m: Obj, where: string): PresentBody {
  return {
    instanceToken: id(m.instanceToken, `${where}.instanceToken`),
    kind: oneOf(m.kind, `${where}.kind`, INTERACTION_KINDS),
    stimulus: parseStimulus(m.stimulus, `${where}.stimulus`),
    mode: oneOf(m.mode, `${where}.mode`, MODES),
    hintsAvailable: int(m.hintsAvailable, `${where}.hintsAvailable`, 0, 3),
    contextKey: id(m.contextKey, `${where}.contextKey`),
  };
}

const PRESENT_KEYS = ["instanceToken", "kind", "stimulus", "mode", "hintsAvailable", "contextKey"] as const;

function envelope(raw: unknown): { m: Obj; type: string } {
  if (messageBytes(raw) > MAX_MESSAGE_BYTES) fail("message too large");
  if (!isPlain(raw)) fail("message: not an object");
  if (typeof raw.type !== "string") fail("message: missing type");
  if (raw.protocol !== PROTOCOL) fail("message: wrong protocol");
  return { m: raw, type: raw.type };
}

function attempt<T>(f: () => T): Validation<T> {
  try {
    return { ok: true, value: f() };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, reason: err.message };
    throw err;
  }
}

/**
 * A `hello` may carry a protocol this build does not speak: the host must answer
 * `unsupported_protocol` instead of dropping it. This reads only what is needed for that decision.
 */
export function helloProtocols(raw: unknown): readonly string[] | null {
  if (!isPlain(raw) || raw.type !== "hello" || !Array.isArray(raw.supports)) return null;
  const list = raw.supports.filter((x): x is string => typeof x === "string" && x.length <= 64);
  return list.length === raw.supports.length && list.length <= 8 ? list : null;
}

/** Strict validation of a message sent by the game. */
export function parseGameMessage(raw: unknown): Validation<GameMessage> {
  return attempt((): GameMessage => {
    const { m, type } = envelope(raw);
    const p = m.protocol as string;
    switch (type) {
      case "hello": {
        obj(m, "hello", ["protocol", "type", "msgId", "supports", "kinds", "contentId", "contentVersion"]);
        const supports = m.supports;
        if (!Array.isArray(supports) || supports.length < 1 || supports.length > 8) fail("hello.supports: invalid list");
        const kinds = m.kinds;
        if (!Array.isArray(kinds) || kinds.length < 1 || kinds.length > INTERACTION_KINDS.length) fail("hello.kinds: invalid list");
        return {
          protocol: p,
          type,
          msgId: id(m.msgId, "hello.msgId"),
          supports: supports.map((s, i) => str(s, `hello.supports[${i}]`, 64)),
          kinds: [...new Set(kinds.map((k, i) => oneOf(k, `hello.kinds[${i}]`, INTERACTION_KINDS)))],
          contentId: id(m.contentId, "hello.contentId"),
          contentVersion: id(m.contentVersion, "hello.contentVersion"),
        };
      }
      case "task.request":
        obj(m, type, ["protocol", "type", "nonce", "requestId", "objectiveId", "purpose", "surface", "contextKey"]);
        if (typeof m.objectiveId !== "string" || !OBJECTIVE.test(m.objectiveId)) fail("task.request.objectiveId: invalid id");
        return {
          protocol: p,
          type,
          nonce: id(m.nonce, "nonce"),
          requestId: id(m.requestId, "requestId"),
          objectiveId: m.objectiveId,
          purpose: oneOf(m.purpose, "purpose", PURPOSES),
          surface: oneOf(m.surface, "surface", SURFACES),
          contextKey: id(m.contextKey, "contextKey"),
        };
      case "task.action":
        obj(m, type, ["protocol", "type", "nonce", "requestId", "instanceToken", "action", "clientSeq"]);
        return {
          protocol: p,
          type,
          nonce: id(m.nonce, "nonce"),
          requestId: id(m.requestId, "requestId"),
          instanceToken: id(m.instanceToken, "instanceToken"),
          action: parseAction(m.action),
          clientSeq: int(m.clientSeq, "clientSeq", 0, Number.MAX_SAFE_INTEGER),
        };
      case "hint.request":
        obj(m, type, ["protocol", "type", "nonce", "requestId", "instanceToken", "level"]);
        return {
          protocol: p,
          type,
          nonce: id(m.nonce, "nonce"),
          requestId: id(m.requestId, "requestId"),
          instanceToken: id(m.instanceToken, "instanceToken"),
          level: int(m.level, "level", 1, 3),
        };
      default:
        return fail(`unknown game message type "${type}"`);
    }
  });
}

/** Strict validation of a message sent by the host. */
export function parseHostMessage(raw: unknown): Validation<HostMessage> {
  return attempt((): HostMessage => {
    const { m, type } = envelope(raw);
    const p = m.protocol as string;
    switch (type) {
      case "init": {
        obj(m, type, ["protocol", "type", "msgId", "replyTo", "nonce", "openTask"]);
        const openTask = m.openTask === null ? null : parsePresentBody(obj(m.openTask, "init.openTask", PRESENT_KEYS), "init.openTask");
        return { protocol: p, type, msgId: id(m.msgId, "msgId"), replyTo: id(m.replyTo, "replyTo"), nonce: id(m.nonce, "nonce"), openTask };
      }
      case "ack":
        obj(m, type, ["protocol", "type", "nonce", "requestId", "state"]);
        return {
          protocol: p,
          type,
          nonce: id(m.nonce, "nonce"),
          requestId: id(m.requestId, "requestId"),
          state: oneOf(m.state, "state", ["received", "submitting", "retrying"] as const),
        };
      case "task.present":
        obj(m, type, ["protocol", "type", "nonce", "requestId", ...PRESENT_KEYS]);
        return { protocol: p, type, nonce: id(m.nonce, "nonce"), requestId: id(m.requestId, "requestId"), ...parsePresentBody(m, type) };
      case "hint.show":
        obj(m, type, ["protocol", "type", "nonce", "requestId", "instanceToken", "level", "text", "hintsRemaining"]);
        return {
          protocol: p,
          type,
          nonce: id(m.nonce, "nonce"),
          requestId: id(m.requestId, "requestId"),
          instanceToken: id(m.instanceToken, "instanceToken"),
          level: int(m.level, "level", 1, 3),
          text: str(m.text, "text", 1000),
          hintsRemaining: int(m.hintsRemaining, "hintsRemaining", 0, 3),
        };
      case "task.result": {
        obj(m, type, ["protocol", "type", "nonce", "requestId", "instanceToken", "outcome", "feedback", "evidence", "retryable"]);
        const f = obj(m.feedback, "feedback", ["text", "correctAnswer"]);
        return {
          protocol: p,
          type,
          nonce: id(m.nonce, "nonce"),
          requestId: id(m.requestId, "requestId"),
          instanceToken: id(m.instanceToken, "instanceToken"),
          outcome: oneOf(m.outcome, "outcome", OUTCOMES),
          feedback: { text: strOrNull(f.text, "feedback.text", 1000), correctAnswer: strOrNull(f.correctAnswer, "feedback.correctAnswer", 300) },
          evidence: oneOf(m.evidence, "evidence", EVIDENCE),
          retryable: bool(m.retryable, "retryable"),
        };
      }
      case "error":
        obj(m, type, ["protocol", "type", "nonce", "requestId", "code"]);
        return {
          protocol: p,
          type,
          nonce: m.nonce === null ? null : id(m.nonce, "nonce"),
          requestId: m.requestId === null ? null : id(m.requestId, "requestId"),
          code: oneOf(m.code, "code", ERROR_CODES),
        };
      default:
        return fail(`unknown host message type "${type}"`);
    }
  });
}

/** The pure `postMessage` event shape both ends receive (no DOM types in this package). */
export interface InboundEvent {
  readonly origin: string;
  readonly source: unknown;
  readonly data: unknown;
}

/** Why an inbound event was dropped without an answer. Reported for logging and tests. */
export type RejectReason = "origin" | "source" | "invalid" | "nonce" | "state";
