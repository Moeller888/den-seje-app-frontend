import type { Action, InteractionKind, StimulusOption } from "./protocol.ts";
import { ServiceError, type ServiceHint, type ServiceResult, type ServiceTask, type Submission, type TaskQuery, type TaskService } from "./service.ts";

/**
 * D-309: `TaskService` over Lærlig's REAL backend — the existing Edge Functions `get-next-question` and
 * `process-event`, called by the HOST with the pupil's own session. No new endpoint, no migration.
 *
 * What the existing contracts give (verified against the code and the production function body,
 * 2026-11-02 — see docs/decisions/D-309.md):
 *
 *   get-next-question  body {subject}            → {question_instance_id, round_no, content{question,options?,force_text?},
 *                                                    answer_format, answer_type, …} | {step:"no_questions"}
 *                      targeting: SUBJECT ONLY (the teacher's active_domains narrow it). No objective, no mode.
 *                      An open instance (one per pupil) is always served first, so a repeat call resumes it.
 *   process-event      body {question_instance_id, answer, question_shown_at}  (legacy path: NO round_no /
 *                      submission_id — H5 is not applied, and those fields would route to _v2, which does
 *                      not exist in production)
 *                      → 200 {status: correct|incorrect|pending, correct_answer, review_text}
 *                      Idempotent PER INSTANCE in the database: process_question_attempt / process_text_answer
 *                      record and pay only while answered=false; once answered, a call returns the STORED
 *                      verdict (was_correct) and pays nothing. A retry after a lost response therefore
 *                      recovers the original verdict — it can neither record nor pay twice.
 *
 * What it does NOT give, and this adapter does not pretend to:
 *   - no learning-objective targeting (`objectiveId` is ignored; see `targeting`);
 *   - no server hint log (`hintsAvailable` is always 0; `hint()` refuses);
 *   - no evidence classification (`evidence` is always "none");
 *   - no submission id (the guarantee is per instance, not per submission).
 *
 * The answer key never passes through here before grading: get-next-question's DTO is whitelisted
 * server-side (_shared/question-dto.ts). Options are mapped to opaque ids so the game never sends text.
 */

export type EdgeFunction = "get-next-question" | "process-event";

/**
 * Calls an Edge Function as the pupil (in the browser: supabase.functions.invoke / fetch with the
 * session's access token — the token stays in the host). Resolves with the HTTP status and parsed body;
 * REJECTS only when no response arrived (network failure, aborted request).
 */
export type EdgeCaller = (fn: EdgeFunction, body: Readonly<Record<string, unknown>>) => Promise<{ status: number; body: unknown }>;

export type Subject = "historie" | "engelsk" | "dansk";

export interface LaerligServiceOptions {
  readonly call: EdgeCaller;
  readonly subject: Subject;
  /** Milliseconds since epoch, for process-event's question_shown_at. */
  readonly now?: () => number;
}

/** Feature flags of the Lærligverse backend integration. Everything is OFF unless a caller turns it on. */
export interface LaerligverseFlags {
  readonly laerligverseBackend: boolean;
}
export const DEFAULT_FLAGS: LaerligverseFlags = Object.freeze({ laerligverseBackend: false });

/**
 * The only way to obtain the real-backend service: it refuses unless the flag is explicitly on.
 * Nothing in the shipped Lærlig frontend constructs it (D-309): the integration is off by default.
 */
export function createLaerligTaskService(flags: LaerligverseFlags, options: LaerligServiceOptions): LaerligTaskService {
  if (flags.laerligverseBackend !== true) throw new Error("Lærligverse backend integration is disabled (flag laerligverseBackend is off)");
  return new LaerligTaskService(options);
}

interface Served {
  readonly task: ServiceTask;
  /** Option id → the exact option text process-event compares against. Host memory only. */
  readonly options: ReadonlyMap<string, string>;
  shownAt: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function unauthorized(status: number, body: unknown): boolean {
  if (status === 401) return true;
  // get-next-question reports a failed auth.getUser() as 500 {error:"Unauthorized"}.
  return status === 500 && isObj(body) && body.error === "Unauthorized";
}

/** Maps an HTTP reply that is not a success to a ServiceError. 5xx is transient: retrying is safe (see above). */
function failure(status: number, body: unknown): ServiceError {
  if (unauthorized(status, body)) return new ServiceError("unauthorized", false, "the pupil's session is not valid");
  if (status === 403) return new ServiceError("forbidden", false);
  if (status === 404) return new ServiceError("not_found", false);
  if (status === 426) return new ServiceError("outdated", false, "the backend closed this answer path");
  if (status === 400) return new ServiceError("invalid", false);
  if (status >= 500) return new ServiceError("server", true);
  return new ServiceError("invalid", false, `unexpected status ${status}`);
}

export class LaerligTaskService implements TaskService {
  /** Honest description of what `objectiveId` does here: nothing. Subject (and the teacher's domains) only. */
  readonly targeting = "subject-only" as const;
  /**
   * Per instance, in the database: once answered=true, process_question_attempt / process_text_answer
   * return the stored verdict and pay nothing (production body md5 2e05e769…, read 2026-11-02).
   */
  readonly submitRetry = "server-idempotent" as const;
  private readonly o: LaerligServiceOptions;
  private readonly served = new Map<string, Served>();
  private open: Served | null = null;

  constructor(options: LaerligServiceOptions) {
    this.o = options;
  }

  /**
   * The open task this host already holds. No network call: get-next-question has no side-effect-free
   * "peek" — it creates an instance when none is open. After a HOST reload the open instance is still
   * resumed, by the server, on the game's next task.request (get-next-question serves it first).
   */
  async openTask(): Promise<ServiceTask | null> {
    return this.open?.task ?? null;
  }

  async fetchTask(q: TaskQuery): Promise<ServiceTask> {
    const r = await this.invoke("get-next-question", { subject: this.o.subject });
    if (r.status !== 200) throw failure(r.status, r.body);
    const b = r.body;
    if (isObj(b) && b.step === "no_questions") throw new ServiceError("unavailable", false, "no question for this pupil and subject");
    const served = this.parseQuestion(b, q);
    if (!q.kinds.includes(served.task.kind)) {
      // The instance stays open on the server for the ordinary quiz (one open instance per pupil).
      throw new ServiceError("unavailable", false, `the next question is "${served.task.kind}", which this world cannot render`);
    }
    this.served.set(served.task.instanceId, served);
    this.open = served;
    return served.task;
  }

  async submit(s: Submission): Promise<ServiceResult> {
    const served = this.served.get(s.instanceId);
    if (served === undefined) throw new ServiceError("not_found", false, "this host did not serve that instance");
    const answer = this.answerText(served, s.action);
    const r = await this.invoke("process-event", {
      question_instance_id: s.instanceId,
      answer,
      question_shown_at: served.shownAt,
    });
    if (r.status !== 200) throw failure(r.status, r.body);
    const b = r.body;
    if (!isObj(b) || (b.status !== "correct" && b.status !== "incorrect" && b.status !== "pending")) {
      throw new ServiceError("server", true, "process-event returned an unexpected body");
    }
    if (this.open === served) this.open = null;
    const correctAnswer = typeof b.correct_answer === "string" && b.correct_answer.length > 0 ? b.correct_answer : null;
    const review = typeof b.review_text === "string" && b.review_text.length > 0 ? b.review_text : null;
    return {
      outcome: b.status,
      feedbackText: review,
      correctAnswer,
      // The legacy answer path classifies nothing (no mode, no hint log): say so instead of guessing.
      evidence: "none",
      replay: false,
    };
  }

  async hint(): Promise<ServiceHint> {
    throw new ServiceError("unavailable", false, "the backend has no hint log yet");
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private async invoke(fn: EdgeFunction, body: Readonly<Record<string, unknown>>): Promise<{ status: number; body: unknown }> {
    try {
      return await this.o.call(fn, body);
    } catch (err) {
      if (err instanceof ServiceError) throw err;
      throw new ServiceError("network", true, err instanceof Error ? err.message : "network failure");
    }
  }

  private parseQuestion(b: unknown, q: TaskQuery): Served {
    const bad = (why: string): never => {
      throw new ServiceError("server", false, `get-next-question: ${why}`);
    };
    if (!isObj(b)) return bad("not an object");
    const id = b.question_instance_id;
    if (typeof id !== "string" || !UUID.test(id)) return bad("invalid question_instance_id");
    const c = b.content;
    if (!isObj(c) || typeof c.question !== "string" || c.question.trim().length === 0) return bad("missing question text");
    const roundNo = Number.isInteger(b.round_no) && (b.round_no as number) >= 1 ? (b.round_no as number) : 1;
    const format = b.answer_format;
    const answerType = b.answer_type ?? "short";
    let kind: InteractionKind | "unsupported" = "unsupported";
    const options = new Map<string, string>();
    let stimulusOptions: StimulusOption[] | null = null;
    if (format === "mc" && c.force_text !== true && answerType === "short") {
      const opts = c.options;
      if (!Array.isArray(opts) || opts.length < 2 || opts.length > 12 || !opts.every((o) => typeof o === "string" && o.length > 0)) return bad("invalid options");
      stimulusOptions = (opts as string[]).map((text, i) => {
        const oid = `o${i + 1}`;
        options.set(oid, text);
        return { id: oid, label: text };
      });
      kind = "choice";
    } else if ((format === "text" && answerType === "short") || (format === "mc" && c.force_text === true && answerType === "short")) {
      kind = "short_text";
    }
    if (kind === "unsupported") {
      // number, match_pairs, long_text: the instance stays open for the ordinary quiz.
      throw new ServiceError("unavailable", false, `the next question has format "${String(format)}"/"${String(answerType)}", which the bridge does not render`);
    }
    const task: ServiceTask = {
      instanceId: id,
      kind,
      prompt: c.question,
      options: stimulusOptions,
      // The legacy contract has no mode; quiz_v1 is the D-277 name for exactly that.
      mode: "quiz_v1",
      hintsAvailable: 0,
      contextKey: q.contextKey,
      roundNo,
    };
    return { task, options, shownAt: this.o.now?.() ?? Date.now() };
  }

  private answerText(served: Served, action: Action): string {
    if (action.kind !== served.task.kind) throw new ServiceError("invalid", false, "action kind does not match the instance");
    if (action.kind === "choice") {
      const text = served.options.get(action.payload.optionId);
      // A manipulated option id never reaches the server.
      if (text === undefined) throw new ServiceError("invalid", false, "unknown option id");
      return text;
    }
    if (action.kind === "short_text") return action.payload.text;
    throw new ServiceError("invalid", false, "this backend has no evaluator for that kind");
  }
}
