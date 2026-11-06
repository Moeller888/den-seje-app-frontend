import type { Action, Evidence, InteractionKind, Mode, Purpose, StimulusOption } from "./protocol.ts";
import { ServiceError, type ServiceHint, type ServiceResult, type ServiceTask, type Submission, type TaskQuery, type TaskService } from "./service.ts";

/**
 * TEST ADAPTER — NOT THE SERVER (D-306).
 *
 * An in-memory stand-in for the learning backend, used by the unit tests and the local Arkivskabet
 * prototype (D-307 Trin A). It imitates the rules the real backend has or plans (server-owned instances,
 * one open instance per pupil, idempotent submission by submission id, server-side hint log, LP-5 evidence,
 * first-correct reward 10 XP + 5 coins per D-211) so the bridge can be tested against them. Passing tests
 * against it prove the bridge, not the backend. It lives on the HOST side only: answer keys never cross the
 * bridge.
 */
export interface FakeItem {
  readonly id: string;
  readonly objectiveId: string;
  readonly kind: InteractionKind;
  readonly prompt: string;
  readonly options: readonly StimulusOption[] | null;
  /** optionId (choice), accepted texts (short_text) or the item order (order). */
  readonly answer: string | readonly string[];
  readonly correctLabel: string;
  readonly feedbackCorrect: string;
  readonly feedbackIncorrect: string;
  readonly hints: readonly string[];
  /** Why each wrong option is wrong (refutation per option; LPD §5.2). Host side only, sent after grading. */
  readonly optionFeedback?: Readonly<Record<string, string>>;
}

export type InjectedFailure = "network" | "server" | "hang" | "forbidden";

interface Instance {
  readonly id: string;
  readonly item: FakeItem;
  readonly mode: Mode;
  readonly contextKey: string;
  hintsUsed: number;
  result: ServiceResult | null;
  readonly submissions: Map<string, ServiceResult>;
}

export interface LedgerEntry {
  readonly instanceId: string;
  readonly xp: number;
  readonly coins: number;
}

const MODE_FOR: Readonly<Record<Purpose, Mode>> = { introduction: "practice", practice: "practice", check: "check", review: "review", application: "application" };
const EVIDENCE_MODES: readonly Mode[] = ["check", "review", "application"];

export function normaliseText(s: string): string {
  // Case and surrounding/double spaces only; æ, ø and å are kept as written (LP-15).
  return s.trim().replace(/\s+/g, " ").toLocaleLowerCase("da-DK");
}

export class FakeTaskService implements TaskService {
  /** Default: imitates a backend with idempotent submission (H5). Tests can switch it off. */
  submitRetry: "server-idempotent" | "none" = "server-idempotent";
  readonly items: readonly FakeItem[];
  /** Every effect the "server" granted: the test oracle for "no extra rewards". */
  readonly ledger: LedgerEntry[] = [];
  /** Submissions that reached grading (replays excluded). */
  gradedCount = 0;
  readonly calls: string[] = [];
  private readonly instances = new Map<string, Instance>();
  private open: Instance | null = null;
  private nextId = 1;
  private readonly failures: InjectedFailure[] = [];

  constructor(items: readonly FakeItem[]) {
    this.items = items;
  }

  /** The next calls fail in this order (one entry per call). */
  injectFailures(...f: InjectedFailure[]): void {
    this.failures.push(...f);
  }

  get xp(): number {
    return this.ledger.reduce((s, e) => s + e.xp, 0);
  }

  get coins(): number {
    return this.ledger.reduce((s, e) => s + e.coins, 0);
  }

  /** Inspect an instance (tests): hints used, result. */
  instance(id: string): Readonly<Instance> | undefined {
    return this.instances.get(id);
  }

  async openTask(): Promise<ServiceTask | null> {
    await this.gate("openTask");
    return this.open === null ? null : this.view(this.open);
  }

  async fetchTask(q: TaskQuery): Promise<ServiceTask> {
    await this.gate("fetchTask");
    if (this.open !== null) return this.view(this.open); // one open instance per pupil
    const answered = new Set([...this.instances.values()].filter((i) => i.result !== null).map((i) => i.item.id));
    const candidates = this.items.filter((it) => it.objectiveId === q.objectiveId && q.kinds.includes(it.kind));
    if (candidates.length === 0) throw new ServiceError("unavailable", false, "no item for this objective and these kinds");
    const item = candidates.find((it) => !answered.has(it.id)) ?? (candidates[0] as FakeItem);
    const inst: Instance = { id: `inst-${this.nextId++}`, item, mode: MODE_FOR[q.purpose], contextKey: q.contextKey, hintsUsed: 0, result: null, submissions: new Map() };
    this.instances.set(inst.id, inst);
    this.open = inst;
    return this.view(inst);
  }

  async submit(s: Submission): Promise<ServiceResult> {
    await this.gate("submit");
    const inst = this.instances.get(s.instanceId);
    if (inst === undefined) throw new ServiceError("not_found", false);
    const seen = inst.submissions.get(s.submissionId);
    if (seen !== undefined) return { ...seen, replay: true };
    if (inst.result !== null) return { ...inst.result, replay: true }; // closed: the stored verdict, no new effect
    if (s.action.kind !== inst.item.kind) throw new ServiceError("invalid", false, "action kind does not match the instance");

    this.gradedCount++;
    const correct = grade(inst.item, s.action);
    const evidence: Evidence = !EVIDENCE_MODES.includes(inst.mode) ? "practice" : inst.hintsUsed > 0 ? "practice" : "evidence";
    const result: ServiceResult = {
      outcome: correct ? "correct" : "incorrect",
      feedbackText: correct ? inst.item.feedbackCorrect : refutation(inst.item, s.action) ?? inst.item.feedbackIncorrect,
      correctAnswer: inst.item.correctLabel,
      evidence,
      replay: false,
    };
    // Reward exactly once, on the first correct answer of the instance (D-211: 10 XP + 5 coins).
    if (correct) this.ledger.push({ instanceId: inst.id, xp: 10, coins: 5 });
    inst.result = result;
    inst.submissions.set(s.submissionId, result);
    if (this.open === inst) this.open = null;
    return result;
  }

  async hint(instanceId: string, level: number): Promise<ServiceHint> {
    await this.gate("hint");
    const inst = this.instances.get(instanceId);
    if (inst === undefined) throw new ServiceError("not_found", false);
    if (inst.result !== null || level !== inst.hintsUsed + 1 || level > inst.item.hints.length) throw new ServiceError("invalid", false, "hint not available");
    inst.hintsUsed = level; // the server's own log decides "assisted"
    return { level, text: inst.item.hints[level - 1] as string, hintsRemaining: inst.item.hints.length - level };
  }

  private view(i: Instance): ServiceTask {
    return {
      instanceId: i.id,
      kind: i.item.kind,
      prompt: i.item.prompt,
      options: i.item.options,
      mode: i.mode,
      hintsAvailable: Math.min(3, i.item.hints.length),
      contextKey: i.contextKey,
      roundNo: 1,
    };
  }

  private gate(call: string): Promise<void> {
    this.calls.push(call);
    const f = this.failures.shift();
    if (f === undefined) return Promise.resolve();
    if (f === "hang") return new Promise<void>(() => undefined);
    if (f === "network") return Promise.reject(new ServiceError("network", true));
    if (f === "server") return Promise.reject(new ServiceError("server", true));
    return Promise.reject(new ServiceError("forbidden", false));
  }
}

function refutation(item: FakeItem, action: Action): string | null {
  if (action.kind !== "choice") return null;
  const own = item.optionFeedback?.[action.payload.optionId];
  return own === undefined ? null : `${own} ${item.feedbackIncorrect}`;
}

function grade(item: FakeItem, action: Action): boolean {
  if (action.kind === "choice") return action.payload.optionId === item.answer;
  if (action.kind === "short_text") {
    const accepted = (Array.isArray(item.answer) ? item.answer : [item.answer]) as readonly string[];
    const given = normaliseText(action.payload.text);
    return accepted.some((a) => normaliseText(a) === given);
  }
  const want = item.answer as readonly string[];
  const got = action.payload.order;
  return got.length === want.length && got.every((x, i) => x === want[i]);
}
