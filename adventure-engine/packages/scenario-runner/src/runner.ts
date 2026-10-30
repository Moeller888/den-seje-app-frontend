/**
 * Scenario runner (spec 10 §2).
 *
 * - Every step must be understood: an unknown `do`/`expect`, an unknown step
 *   field, or an operation outside phase 1 fails the scenario explicitly.
 * - The scenario is executed twice from scratch; the two traces must be
 *   byte-identical (determinism check). The trace is returned as JSONL.
 */

import { loadContent, type LoadMode, type LoadedContent, type Value } from "@adventure-engine/content";
import {
  Engine,
  SAVE_FORMAT,
  SAVE_FORMAT_VERSION,
  canonicalJson,
  deletePath,
  getPath,
  saveChecksum,
  saveIntegrity,
  schemaProblem,
  setPath,
  valuesEqual,
  type ClickTarget,
  type Command,
  type CursorResult,
  type LoadOutcome,
  type SaveData,
  type SaveOutcome,
} from "@adventure-engine/core";
import { MemoryStorage, SlotManager } from "@adventure-engine/save";
import { readFixture, readScenarioContent } from "./files.ts";
import { distance, type Vec2 } from "@adventure-engine/geometry";
import { HeadlessAdapter } from "./headless-adapter.ts";
import { MediaHeadlessAdapter } from "./media-adapter.ts";
import { chiSquaredUniform } from "./stats.ts";

export interface Scenario {
  readonly scenario: string;
  readonly description?: string;
  readonly covers?: readonly string[];
  /** "media-headless" (phase 4 extension): world-headless with real animation, sound and cutscene semantics on simulated time. */
  readonly harness: "graph" | "world-headless" | "media-headless";
  readonly seed?: string;
  readonly content?: unknown;
  readonly contentRef?: string;
  readonly contentPatch?: unknown;
  readonly notes?: string;
  readonly steps: readonly Step[];
}

export type Step = Readonly<Record<string, unknown>>;

export type ScenarioErrorKind = "format" | "unsupported" | "expectation" | "determinism";

export class ScenarioError extends Error {
  readonly kind: ScenarioErrorKind;
  constructor(kind: ScenarioErrorKind, message: string) {
    super(message);
    this.name = "ScenarioError";
    this.kind = kind;
  }
}

export interface ScenarioResult {
  readonly scenario: string;
  readonly passed: boolean;
  readonly stepsRun: number;
  readonly error: ScenarioError | null;
  readonly trace: string;
}

export interface RunOptions {
  readonly mode?: LoadMode;
  /** Run twice and compare traces (default true). */
  readonly verifyDeterminism?: boolean;
}

/** All operations named by the scenario format (spec 10 §2). */
const ALL_DO = new Set([
  "newGame", "run", "done", "confirmSay", "choose", "advance", "runUntilIdle", "click", "clickPoint", "hover", "hoverPoint",
  "clickInventory", "setGlobal", "setPortalLocked", "pushDialog", "walkPlayerTo", "save", "load", "loadRaw",
  "loadRawFromSlotWithMutation", "loadFixture", "corruptSlot", "acquireModalForTest", "releaseModalForTest", "statistic",
  // Runner extensions (phase 2, documented in docs/decisions/phase-2.md):
  "setActorPosition", "advanceTicks",
  // Runner extensions (phase 3, documented in docs/decisions/phase-3.md):
  "hoverInventory", "scrollInventory",
  // Runner extensions (phase 4, docs/decisions/phase-4.md; need harness media-headless except setLanguage/cancelRuns):
  "skipCutscene", "setLanguage", "cancelRuns", "seekAnimation",
]);
const ALL_EXPECT = new Set([
  "commands", "lastCommand", "noCommand", "commandsSinceLastClick", "runResult", "runEvent", "globals", "globalWriteOrder",
  "globalsDeterministic", "nodeExecutions", "modal", "cursor", "inventory", "dialogStack", "actorScene", "actorAtSpot", "scroll",
  "scrollClamped", "eventOrder", "warning", "saveContains", "saveLacks", "saveValidates", "saveRejected", "savesCanonicallyEqual",
  "slotOffersBackup",
  // Runner extensions (phase 2):
  "actorPosition", "facing", "activeZones", "path", "idle",
  // Runner extensions (phase 3):
  "selectedItem", "inventoryWindow",
  // Runner extensions (phase 4):
  "animation", "sounds", "cutscene", "signalCount", "mediaPending",
]);

/** Operations that exist in the format but belong to later phases, with the reason. */
const LATER: Readonly<Record<string, string>> = {};

/** Upper bound for runUntilIdle / walkPlayerTo (10 simulated minutes at 60 Hz). */
const MAX_IDLE_TICKS = 36000;

/** Allowed fields per implemented operation ("note" is always allowed). */
const DO_FIELDS: Readonly<Record<string, readonly string[]>> = {
  newGame: [],
  run: ["entry", "ctx"],
  done: ["nodeId"],
  confirmSay: [],
  choose: ["option"],
  advance: ["ms"],
  runUntilIdle: [],
  click: ["target"],
  clickPoint: ["x", "y"],
  hover: ["target"],
  hoverPoint: ["x", "y"],
  setGlobal: ["name", "value"],
  setPortalLocked: ["portal", "locked"],
  pushDialog: ["actor", "entry"],
  walkPlayerTo: ["spot", "runToArrival"],
  statistic: ["entry", "runs", "freshSeedEach", "expect"],
  setActorPosition: ["actor", "x", "y", "facing"],
  advanceTicks: ["n"],
  clickInventory: ["object"],
  hoverInventory: ["object"],
  scrollInventory: ["delta"],
  save: ["slot"],
  load: ["slot"],
  loadRaw: ["raw", "expectError", "expectWarning"],
  loadRawFromSlotWithMutation: ["slot", "mutate", "recomputeChecksum", "expectError", "expectWarning", "expectAfterLoad"],
  loadFixture: ["fixture"],
  corruptSlot: ["slot"],
  acquireModalForTest: ["reason"],
  releaseModalForTest: [],
  skipCutscene: ["expectSkipped"],
  setLanguage: ["language"],
  cancelRuns: ["reason"],
  seekAnimation: ["entity", "animation", "at"],
};
const EXPECT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  commands: ["sequence", "contains", "lacks", "exhaustive"],
  lastCommand: ["type", "nodeId", "optionIds"],
  noCommand: ["type", "nodeId"],
  commandsSinceLastClick: ["contains", "lacks"],
  runResult: ["entity", "value"],
  globals: ["equals", "lacks"],
  globalWriteOrder: ["equals"],
  globalsDeterministic: ["name"],
  nodeExecutions: ["nodeId", "count"],
  modal: ["value"],
  dialogStack: ["actor", "equals"],
  warning: ["code", "phase"],
  cursor: ["mode", "target", "tooltipKey", "item"],
  actorScene: ["actor", "equals"],
  actorAtSpot: ["actor", "spot"],
  scroll: ["x"],
  scrollClamped: ["maxX"],
  eventOrder: ["equals"],
  actorPosition: ["actor", "x", "y", "tolerance"],
  facing: ["actor", "equals"],
  activeZones: ["actor", "equals"],
  path: ["scene", "from", "to", "equals", "length", "none"],
  idle: [],
  inventory: ["actor", "equals"],
  runEvent: ["entity", "action", "ctx"],
  selectedItem: ["equals"],
  inventoryWindow: ["offset", "visible"],
  animation: ["entity", "name", "status", "frame", "none"],
  sounds: ["equals", "fading"],
  cutscene: ["state", "name", "variant", "frame"],
  signalCount: ["entity", "name", "count"],
  mediaPending: ["count"],
  saveContains: ["slot", "path", "equals"],
  saveLacks: ["slot", "path"],
  saveValidates: ["slot", "schema"],
  saveRejected: ["reason"],
  savesCanonicallyEqual: ["a", "b", "ignore"],
  slotOffersBackup: ["slot"],
};

/**
 * `contentPatch` (phase 5): keys are dotted paths set to the value, or
 * "<path>+" to append the listed items to an array.
 */
function patchContent(content: unknown, patch: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(content)) as unknown;
  if (patch === undefined) return copy;
  if (typeof patch !== "object" || patch === null) throw new ScenarioError("format", "contentPatch must be an object");
  for (const [key, value] of Object.entries(patch)) {
    if (key.endsWith("+")) {
      const list = getPath(copy, key.slice(0, -1));
      if (!Array.isArray(list) || !Array.isArray(value)) throw new ScenarioError("format", `contentPatch "${key}" needs an array at the path and an array value`);
      list.push(...(value as unknown[]));
    } else if (!setPath(copy, key, value)) throw new ScenarioError("format", `contentPatch path "${key}" does not exist`);
  }
  return copy;
}

/** Statistic steps create many engines; cap to keep runs bounded. */
const MAX_STAT_RUNS = 200000;

export function runScenario(scenario: Scenario, options: RunOptions = {}): ScenarioResult {
  const first = runOnce(scenario, options);
  if (first.error !== null || options.verifyDeterminism === false) return first;
  const second = runOnce(scenario, options);
  if (second.trace !== first.trace) {
    return { ...first, passed: false, error: new ScenarioError("determinism", "two runs with the same seed and input produced different traces") };
  }
  return first;
}

function runOnce(scenario: Scenario, options: RunOptions): ScenarioResult {
  let stepsRun = 0;
  let engine: Engine | null = null;
  try {
    validateScenarioShape(scenario);
    const rawContent = scenario.contentRef !== undefined ? patchContent(readScenarioContent(scenario.contentRef), scenario.contentPatch) : patchContent(scenario.content, scenario.contentPatch);
    const content = loadContent(rawContent, { mode: options.mode ?? "strict" });
    const media = scenario.harness === "media-headless" ? new MediaHeadlessAdapter() : null;
    const adapter = media ?? new HeadlessAdapter();
    const seed = scenario.seed ?? `scenario:${scenario.scenario}`;
    engine = new Engine(content, { seed, adapter });
    media?.attach(engine);
    const ctx: StepContext = {
      engine,
      adapter,
      media,
      content,
      seed,
      clickMark: 0,
      eventMark: 0,
      lastRunId: null,
      slots: new SlotManager(new MemoryStorage(), content.pkg.game.id),
      lastSave: null,
      testLock: null,
    };
    for (const [i, step] of scenario.steps.entries()) {
      stepsRun = i + 1;
      engine.tracer.emit("scenario.step", { index: i, step: "do" in step ? `do:${String(step["do"])}` : `expect:${String(step["expect"])}` });
      try {
        execStep(step, ctx);
      } catch (err) {
        if (err instanceof ScenarioError) throw new ScenarioError(err.kind, `step ${i} ${describe(step)}: ${err.message}`);
        // Engine contract errors (bad arguments, unknown entries) are format errors of this step.
        throw new ScenarioError("format", `step ${i} ${describe(step)}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { scenario: scenario.scenario, passed: true, stepsRun, error: null, trace: engine.tracer.toJSONL() };
  } catch (err) {
    const error = err instanceof ScenarioError ? err : new ScenarioError("format", err instanceof Error ? err.message : String(err));
    const name = typeof scenario === "object" && scenario !== null ? String(scenario.scenario) : "(invalid)";
    return { scenario: name, passed: false, stepsRun, error, trace: engine?.tracer.toJSONL() ?? "" };
  }
}

function describe(step: Step): string {
  return "do" in step ? `(do: ${String(step["do"])})` : `(expect: ${String(step["expect"])})`;
}

function validateScenarioShape(s: Scenario): void {
  if (typeof s !== "object" || s === null || typeof s.scenario !== "string") throw new ScenarioError("format", "scenario must have a name");
  if (s.harness !== "graph" && s.harness !== "world-headless" && s.harness !== "media-headless") throw new ScenarioError("format", `unknown harness "${String(s.harness)}"`);
  if (!Array.isArray(s.steps)) throw new ScenarioError("format", "steps must be an array");
  for (const [i, step] of s.steps.entries()) {
    const isDo = typeof step["do"] === "string";
    const isExpect = typeof step["expect"] === "string";
    if (isDo === isExpect) throw new ScenarioError("format", `step ${i}: exactly one of "do" or "expect" is required`);
    const op = String(isDo ? step["do"] : step["expect"]);
    const known = isDo ? ALL_DO : ALL_EXPECT;
    if (!known.has(op)) throw new ScenarioError("format", `step ${i}: unknown ${isDo ? "do" : "expect"} "${op}"`);
    const fields = (isDo ? DO_FIELDS : EXPECT_FIELDS)[op];
    if (fields === undefined) {
      throw new ScenarioError("unsupported", `step ${i}: ${isDo ? "do" : "expect"} "${op}" is not supported yet: ${LATER[op] ?? "not implemented"}`);
    }
    for (const key of Object.keys(step)) {
      if (key === "do" || key === "expect" || key === "note") continue;
      if (!fields.includes(key)) throw new ScenarioError("format", `step ${i}: unknown field "${key}" for ${op}`);
    }
  }
}

interface StepContext {
  readonly engine: Engine;
  readonly adapter: { readonly log: readonly Command[] };
  readonly media: MediaHeadlessAdapter | null;
  readonly content: LoadedContent;
  readonly seed: string;
  clickMark: number;
  eventMark: number;
  lastRunId: string | null;
  /** Save slots of this run (phase 5): in memory, with the browser's atomic-write logic. */
  readonly slots: SlotManager;
  lastSave: SaveOutcome | null;
  testLock: number | null;
}

function slotRaw(c: StepContext, slot: string): string {
  const s = c.slots.read(slot);
  if (s.state !== "ok") fail(`slot "${slot}" holds no valid save (${s.state})`);
  return (s as { raw: string }).raw;
}

function slotData(c: StepContext, slot: string): Record<string, unknown> {
  return JSON.parse(slotRaw(c, slot)) as Record<string, unknown>;
}

/** Check a load outcome against `expectError` / `expectWarning`. */
function checkLoad(out: LoadOutcome, step: Step): void {
  const err = step["expectError"];
  if (err !== undefined) {
    if (out.ok) fail(`load succeeded, expected error "${String(err)}"`);
    else if (out.error.kind !== err) fail(`load failed with "${out.error.kind}" (${out.error.code}: ${out.error.message}), expected "${String(err)}"`);
  } else if (!out.ok) fail(`load failed: ${out.error.code} ${out.error.message}`);
  const warning = step["expectWarning"];
  if (warning !== undefined && !out.warnings.some((w) => w.kind === warning)) fail(`no load warning "${String(warning)}" (got ${JSON.stringify(out.warnings.map((w) => w.kind))})`);
}

function saveNow(c: StepContext, slot: string): void {
  let outcome: SaveOutcome | null = null;
  c.engine.requestSave((o) => {
    outcome = o;
  });
  runTicksUntil(c.engine, () => outcome !== null, "the save");
  const o = outcome as unknown as SaveOutcome;
  c.lastSave = o;
  c.engine.tracer.emit("scenario.save", { slot, ok: o.ok });
  if (o.ok) {
    const written = c.slots.write(slot, o.json);
    if (!written.ok) fail(`writing slot "${slot}" failed: ${written.message}`);
  }
}

function point(step: Step): Vec2 {
  const x = step["x"];
  const y = step["y"];
  if (typeof x !== "number" || typeof y !== "number") throw new ScenarioError("format", "x and y must be numbers");
  return [x, y];
}

function vec(v: unknown, what: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "number" || typeof v[1] !== "number") throw new ScenarioError("format", `${what} must be [x, y]`);
  return [v[0], v[1]];
}

function target(step: Step): ClickTarget | { triggerZone: string } {
  const t = req(step["target"] as Record<string, unknown> | undefined, "target");
  for (const key of ["objectZone", "actorZone", "portal", "triggerZone"] as const) {
    if (typeof t[key] === "string") return { [key]: t[key] } as ClickTarget | { triggerZone: string };
  }
  throw new ScenarioError("format", `unknown target ${JSON.stringify(t)}`);
}

function runTicksUntil(e: Engine, done: () => boolean, what: string): void {
  e.settle();
  for (let i = 0; !done(); i++) {
    if (i >= MAX_IDLE_TICKS) fail(`${what} did not happen within ${MAX_IDLE_TICKS} ticks (${JSON.stringify(e.idleReport())})`);
    e.advanceTicks(1);
  }
}

function eventLabel(ev: { action: string; receiver: string; ctx: Readonly<Record<string, unknown>> }): string {
  return ev.action === "walk" && typeof ev.ctx["$spot"] === "string" ? `walk:${ev.ctx["$spot"]}` : `${ev.action}:${ev.receiver}`;
}

const fail = (message: string): never => {
  throw new ScenarioError("expectation", message);
};

const req = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new ScenarioError("format", `missing ${what}`);
  return v;
};

function needMedia(c: StepContext): MediaHeadlessAdapter {
  if (c.media === null) throw new ScenarioError("format", 'this operation needs harness "media-headless"');
  return c.media;
}

function str(step: Step, key: string): string {
  const v = step[key];
  if (typeof v !== "string") throw new ScenarioError("format", `${key} must be a string`);
  return v;
}

function execStep(step: Step, c: StepContext): void {
  const e = c.engine;
  if (typeof step["do"] === "string") {
    switch (step["do"]) {
      case "newGame":
        e.newGame();
        break;
      case "run":
        c.lastRunId = e.run(req(step["entry"] as string | undefined, "entry"), (step["ctx"] as Record<string, Value> | undefined) ?? {}).id;
        break;
      case "done": {
        const nodeId = req(step["nodeId"] as string | undefined, "nodeId");
        const cmd = e.pendingCommands().find((p) => p.nodeId === nodeId);
        if (cmd === undefined) fail(`no pending command for node "${nodeId}"`);
        e.reply((cmd as Command).cmdId, { kind: "done" });
        break;
      }
      case "confirmSay": {
        const says = e.pendingCommands().filter((p) => p.type === "Say");
        if (says.length !== 1) fail(`expected exactly one pending Say, found ${says.length}`);
        e.reply((says[0] as Command).cmdId, { kind: "done" });
        break;
      }
      case "choose": {
        const option = req(step["option"] as string | undefined, "option");
        const cmd = e.pendingCommands().find((p) => p.type === "Choose" && p.options.some((o) => o.id === option));
        if (cmd === undefined) fail(`no pending Choose offering option "${option}"`);
        e.reply((cmd as Command).cmdId, { kind: "choice", optionId: option });
        break;
      }
      case "advance":
        e.advance(req(step["ms"] as number | undefined, "ms"));
        break;
      case "runUntilIdle":
        runTicksUntil(e, () => e.idleReport().idle, "idle");
        break;
      case "click": {
        const t = target(step);
        c.clickMark = c.adapter.log.length;
        c.eventMark = e.events.length;
        if ("triggerZone" in t) e.clickAt(e.targetPoint(t));
        else e.click(t);
        break;
      }
      case "clickPoint":
        c.clickMark = c.adapter.log.length;
        c.eventMark = e.events.length;
        e.clickAt(e.screenToScene(point(step)));
        break;
      case "hover":
        e.hover(e.targetPoint(target(step)));
        break;
      case "hoverPoint":
        e.hover(e.screenToScene(point(step)));
        break;
      case "setPortalLocked":
        e.setPortalLocked(req(step["portal"] as string | undefined, "portal"), req(step["locked"] as boolean | undefined, "locked"));
        break;
      case "walkPlayerTo": {
        const info = e.walkPlayerTo(req(step["spot"] as string | undefined, "spot"));
        if (step["runToArrival"] === true) runTicksUntil(e, () => e.finishedRuns.some((r) => r.runId === info.id), "arrival");
        break;
      }
      case "setActorPosition": {
        const facing = step["facing"];
        e.setActorPosition(req(step["actor"] as string | undefined, "actor"), point(step), ...(typeof facing === "string" ? [facing as never] : []));
        break;
      }
      case "advanceTicks":
        e.advanceTicks(req(step["n"] as number | undefined, "n"));
        break;
      case "clickInventory":
        // An inventory click is a click: it starts a new "since last click" window.
        c.clickMark = c.adapter.log.length;
        c.eventMark = e.events.length;
        e.clickInventory(str(step, "object"));
        break;
      case "hoverInventory": {
        const object = step["object"];
        if (object !== null && typeof object !== "string") throw new ScenarioError("format", "object must be a string or null");
        e.hoverInventory(object);
        break;
      }
      case "scrollInventory":
        e.scrollInventory(req(step["delta"] as number | undefined, "delta"));
        break;
      case "save":
        saveNow(c, str(step, "slot"));
        break;
      case "load":
        checkLoad(e.load(slotRaw(c, str(step, "slot"))), step);
        break;
      case "loadRaw":
        checkLoad(e.load(str(step, "raw")), step);
        break;
      case "loadFixture":
        checkLoad(e.load(readFixture(str(step, "fixture"))), step);
        break;
      case "loadRawFromSlotWithMutation": {
        const data = slotData(c, str(step, "slot"));
        const mutate = (step["mutate"] as { set?: Record<string, unknown> } | undefined)?.set ?? {};
        for (const [path, value] of Object.entries(mutate)) if (!setPath(data, path, value)) throw new ScenarioError("format", `mutation path "${path}" does not exist`);
        if (step["recomputeChecksum"] === true) data["checksum"] = saveChecksum(data as unknown as SaveData);
        const out = e.load(JSON.stringify(data));
        checkLoad(out, step);
        const after = step["expectAfterLoad"] as { variantOf?: string; equals?: unknown } | undefined;
        if (after?.variantOf !== undefined) {
          const v = e.world.objects.get(after.variantOf)?.variant ?? e.world.actors.get(after.variantOf)?.variant;
          if (v !== after.equals) fail(`variant of "${after.variantOf}" is ${JSON.stringify(v)}, expected ${JSON.stringify(after.equals)}`);
        }
        break;
      }
      case "corruptSlot": {
        const slot = str(step, "slot");
        const raw = c.slots.rawMain(slot) ?? "";
        // A torn write: only the first half of the bytes reached the disk.
        c.slots.damage(slot, raw.slice(0, Math.floor(raw.length / 2)));
        break;
      }
      case "acquireModalForTest":
        if (c.testLock !== null) throw new ScenarioError("format", "acquireModalForTest twice without release");
        c.testLock = e.modal.acquire(typeof step["reason"] === "string" ? step["reason"] : "test", "scenario");
        break;
      case "releaseModalForTest":
        if (c.testLock === null) throw new ScenarioError("format", "releaseModalForTest without acquireModalForTest");
        e.modal.release(c.testLock);
        c.testLock = null;
        break;
      case "skipCutscene": {
        const skipped = needMedia(c).presenter.skipCutscene();
        if (step["expectSkipped"] !== undefined && skipped !== step["expectSkipped"]) fail(`skip ${skipped ? "was" : "was not"} accepted, expected ${String(step["expectSkipped"])}`);
        break;
      }
      case "setLanguage":
        e.setLanguage(str(step, "language"));
        break;
      case "cancelRuns":
        e.cancelAllRuns(typeof step["reason"] === "string" ? step["reason"] : "scenario");
        break;
      case "seekAnimation": {
        const at = req(step["at"] as number | undefined, "at");
        if (needMedia(c).presenter.animator.play(str(step, "entity"), str(step, "animation"), {}, { at }) === null) fail("no such animation");
        break;
      }
      case "setGlobal":
        e.setGlobal(req(step["name"] as string | undefined, "name"), req(step["value"] as Value | undefined, "value"));
        break;
      case "pushDialog":
        e.pushDialog(req(step["actor"] as string | undefined, "actor"), req(step["entry"] as string | undefined, "entry"));
        break;
      case "statistic":
        statistic(step, c);
        break;
    }
    e.settle();
    return;
  }
  expectStep(step, c);
}

function matches(cmd: Command, pattern: Readonly<Record<string, unknown>>): boolean {
  const rec = cmd as unknown as Record<string, unknown>;
  return Object.entries(pattern).every(([k, v]) => JSON.stringify(rec[k]) === JSON.stringify(v));
}

function patterns(v: unknown, what: string): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) throw new ScenarioError("format", `${what} must be a list of command patterns`);
  return v as Array<Record<string, unknown>>;
}

function checkContainsLacks(log: readonly Command[], step: Step, label: string): void {
  if (step["contains"] !== undefined) {
    for (const p of patterns(step["contains"], "contains")) {
      if (!log.some((cmd) => matches(cmd, p))) fail(`${label} contains no command matching ${JSON.stringify(p)}`);
    }
  }
  if (step["lacks"] !== undefined) {
    for (const p of patterns(step["lacks"], "lacks")) {
      if (log.some((cmd) => matches(cmd, p))) fail(`${label} unexpectedly contains a command matching ${JSON.stringify(p)}`);
    }
  }
}

function expectStep(step: Step, c: StepContext): void {
  const e = c.engine;
  const log = c.adapter.log;
  switch (step["expect"]) {
    case "commands": {
      if (step["sequence"] !== undefined) {
        const seq = patterns(step["sequence"], "sequence");
        if (step["exhaustive"] === true) {
          if (log.length !== seq.length || !seq.every((p, i) => matches(log[i] as Command, p))) {
            fail(`command log ${JSON.stringify(log.map((x) => [x.type, x.nodeId]))} does not equal ${JSON.stringify(seq)}`);
          }
        } else {
          let i = 0;
          for (const cmd of log) if (i < seq.length && matches(cmd, seq[i] as Record<string, unknown>)) i++;
          if (i < seq.length) fail(`command log does not contain the sequence ${JSON.stringify(seq)} in order`);
        }
      }
      checkContainsLacks(log, step, "command log");
      return;
    }
    case "commandsSinceLastClick":
      checkContainsLacks(log.slice(c.clickMark), step, "commands since last click");
      return;
    case "lastCommand": {
      const last = log[log.length - 1];
      if (last === undefined) fail("no commands have been issued");
      const cmd = last as Command;
      if (step["type"] !== undefined && cmd.type !== step["type"]) fail(`last command is ${cmd.type}, expected ${String(step["type"])}`);
      if (step["nodeId"] !== undefined && cmd.nodeId !== step["nodeId"]) fail(`last command node is ${String(cmd.nodeId)}, expected ${String(step["nodeId"])}`);
      if (step["optionIds"] !== undefined) {
        const ids = cmd.type === "Choose" ? cmd.options.map((o) => o.id) : null;
        if (JSON.stringify(ids) !== JSON.stringify(step["optionIds"])) fail(`options are ${JSON.stringify(ids)}, expected ${JSON.stringify(step["optionIds"])}`);
      }
      return;
    }
    case "noCommand": {
      const p: Record<string, unknown> = {};
      if (step["type"] !== undefined) p["type"] = step["type"];
      if (step["nodeId"] !== undefined) p["nodeId"] = step["nodeId"];
      if (Object.keys(p).length === 0) throw new ScenarioError("format", "noCommand needs type and/or nodeId");
      if (log.some((cmd) => matches(cmd, p))) fail(`found a command matching ${JSON.stringify(p)}`);
      return;
    }
    case "runResult": {
      const want = step["value"];
      const entity = step["entity"];
      const runs = e.finishedRuns;
      const rec =
        entity !== undefined
          ? [...runs].reverse().find((r) => r.receiver === entity)
          : runs.find((r) => r.runId === c.lastRunId);
      if (rec === undefined) fail(entity !== undefined ? `no finished run for "${String(entity)}"` : "the last run has not finished");
      if (rec?.result !== want) fail(`run result is ${JSON.stringify(rec?.result)}, expected ${JSON.stringify(want)}`);
      return;
    }
    case "globals": {
      const equals = (step["equals"] as Record<string, Value> | undefined) ?? {};
      for (const [k, v] of Object.entries(equals)) {
        if (!e.globals.has(k)) fail(`global "${k}" is not set (expected ${JSON.stringify(v)})`);
        const actual = e.globals.get(k);
        if (actual !== v) fail(`global "${k}" is ${JSON.stringify(actual)}, expected ${JSON.stringify(v)}`);
      }
      for (const k of (step["lacks"] as string[] | undefined) ?? []) {
        if (e.globals.has(k)) fail(`global "${k}" is set to ${JSON.stringify(e.globals.get(k))}, expected unset`);
      }
      return;
    }
    case "globalWriteOrder":
      if (JSON.stringify(e.globalWrites) !== JSON.stringify(step["equals"])) {
        fail(`global write order is ${JSON.stringify(e.globalWrites)}, expected ${JSON.stringify(step["equals"])}`);
      }
      return;
    case "globalsDeterministic": {
      // The value is part of the trace; the runner's two-run comparison proves determinism.
      const name = req(step["name"] as string | undefined, "name");
      if (!e.globals.has(name)) fail(`global "${name}" is not set`);
      e.tracer.emit("scenario.value", { name, value: e.globals.get(name) });
      return;
    }
    case "nodeExecutions": {
      const nodeId = req(step["nodeId"] as string | undefined, "nodeId");
      const count = e.executions.get(nodeId) ?? 0;
      if (count !== step["count"]) fail(`node "${nodeId}" executed ${count} time(s), expected ${String(step["count"])}`);
      return;
    }
    case "modal":
      if (e.modal.isModal !== step["value"]) fail(`modal is ${String(e.modal.isModal)} (${e.modal.count} lock(s)), expected ${String(step["value"])}`);
      return;
    case "dialogStack": {
      const actor = req(step["actor"] as string | undefined, "actor");
      const stack = e.world.actors.get(actor)?.dialogStack;
      if (stack === undefined) fail(`unknown actor "${actor}"`);
      if (JSON.stringify(stack) !== JSON.stringify(step["equals"])) fail(`dialog stack is ${JSON.stringify(stack)}, expected ${JSON.stringify(step["equals"])}`);
      return;
    }
    case "cursor": {
      const cur = e.cursor as CursorResult & Record<string, unknown>;
      for (const key of ["mode", "target", "tooltipKey", "item"] as const) {
        if (step[key] !== undefined && cur[key] !== step[key]) fail(`cursor.${key} is ${JSON.stringify(cur[key])}, expected ${JSON.stringify(step[key])} (cursor ${JSON.stringify(cur)})`);
      }
      return;
    }
    case "actorScene": {
      const actor = req(step["actor"] as string | undefined, "actor");
      const scene = e.world.actors.get(actor)?.scene;
      if (scene !== step["equals"]) fail(`actor "${actor}" is in scene ${JSON.stringify(scene)}, expected ${JSON.stringify(step["equals"])}`);
      return;
    }
    case "actorAtSpot": {
      const actor = req(step["actor"] as string | undefined, "actor");
      const spot = req(step["spot"] as string | undefined, "spot");
      const st = e.world.actors.get(actor);
      const want = st?.scene === null || st?.scene === undefined ? null : e.space(st.scene).spot(spot);
      if (st === undefined || want === null || st.spot !== spot || st.pos === null || distance(st.pos, want) > 1e-6) {
        fail(`actor "${actor}" is at ${JSON.stringify(st?.pos)} (spot ${JSON.stringify(st?.spot)}), expected spot "${spot}" ${JSON.stringify(want)}`);
      }
      return;
    }
    case "scroll":
      if (Math.abs(e.world.scrollX - (step["x"] as number)) > 1e-6) fail(`scroll is ${e.world.scrollX}, expected ${String(step["x"])}`);
      return;
    case "scrollClamped": {
      const max = req(step["maxX"] as number | undefined, "maxX");
      const x = e.world.scrollX;
      const player = e.world.playerId;
      const st = player === null ? undefined : e.world.actors.get(player);
      const follow = st?.scene === null || st?.scene === undefined || st.pos === null ? x : e.space(st.scene).scrollFor(st.pos[0]);
      if (x < 0 || x > max || Math.abs(x - follow) > 1e-6) fail(`scroll ${x} is not the clamped follow value ${follow} within [0, ${max}]`);
      return;
    }
    case "eventOrder": {
      const got = e.events.slice(c.eventMark).map(eventLabel);
      if (JSON.stringify(got) !== JSON.stringify(step["equals"])) fail(`event order since the last click is ${JSON.stringify(got)}, expected ${JSON.stringify(step["equals"])}`);
      return;
    }
    case "actorPosition": {
      const actor = req(step["actor"] as string | undefined, "actor");
      const pos = e.world.actors.get(actor)?.pos ?? null;
      const tol = typeof step["tolerance"] === "number" ? step["tolerance"] : 1e-6;
      if (pos === null || distance(pos, point(step)) > tol) fail(`actor "${actor}" is at ${JSON.stringify(pos)}, expected ${JSON.stringify(point(step))} ± ${tol}`);
      return;
    }
    case "facing": {
      const actor = req(step["actor"] as string | undefined, "actor");
      const f = e.world.actors.get(actor)?.facing;
      if (f !== step["equals"]) fail(`actor "${actor}" faces ${JSON.stringify(f)}, expected ${JSON.stringify(step["equals"])}`);
      return;
    }
    case "activeZones": {
      const actor = req(step["actor"] as string | undefined, "actor");
      const zones = e.activeZones(actor);
      if (JSON.stringify(zones) !== JSON.stringify(step["equals"])) fail(`active zones of "${actor}" are ${JSON.stringify(zones)}, expected ${JSON.stringify(step["equals"])}`);
      return;
    }
    case "path": {
      const scene = req(step["scene"] as string | undefined, "scene");
      const res = e.findPath(scene, vec(step["from"], "from"), vec(step["to"], "to"));
      if (step["none"] === true) {
        if (res !== null) fail(`expected no path, got ${JSON.stringify(res.points)}`);
        return;
      }
      if (res === null) fail("no path found");
      const r = res as NonNullable<typeof res>;
      if (step["equals"] !== undefined) {
        const want = (step["equals"] as unknown[]).map((p, i) => vec(p, `equals[${i}]`));
        const ok = want.length === r.points.length && want.every((p, i) => distance(p, r.points[i] as Vec2) <= 1e-6);
        if (!ok) fail(`path is ${JSON.stringify(r.points)}, expected ${JSON.stringify(want)}`);
      }
      if (step["length"] !== undefined && Math.abs(r.length - (step["length"] as number)) > 1e-6) fail(`path length is ${r.length}, expected ${String(step["length"])}`);
      return;
    }
    case "idle": {
      const rep = e.idleReport();
      if (!rep.idle) fail(`engine is not idle: ${JSON.stringify(rep)}`);
      return;
    }
    case "saveContains": {
      const got = getPath(slotData(c, str(step, "slot")), str(step, "path"));
      if (canonicalJson(got) !== canonicalJson(step["equals"])) fail(`save "${String(step["slot"])}" has ${String(step["path"])} = ${JSON.stringify(got)}, expected ${JSON.stringify(step["equals"])}`);
      return;
    }
    case "saveLacks": {
      const got = getPath(slotData(c, str(step, "slot")), str(step, "path"));
      if (got !== undefined) fail(`save "${String(step["slot"])}" has ${String(step["path"])} = ${JSON.stringify(got)}, expected nothing`);
      return;
    }
    case "saveValidates": {
      const schema = str(step, "schema");
      if (schema !== `${SAVE_FORMAT}/${SAVE_FORMAT_VERSION}`) fail(`unknown schema "${schema}"`);
      const raw = slotRaw(c, str(step, "slot"));
      const d = JSON.parse(raw) as Record<string, unknown>;
      const problem = schemaProblem(d);
      if (problem !== null || d["formatVersion"] !== SAVE_FORMAT_VERSION || saveIntegrity(raw) !== "ok") fail(`save does not validate as ${schema}: ${problem ?? "version or checksum"}`);
      return;
    }
    case "saveRejected": {
      const last = c.lastSave;
      if (last === null || last.ok) fail("the last save was not rejected");
      else if (last.reason !== step["reason"]) fail(`the last save was rejected for "${last.reason}", expected "${String(step["reason"])}"`);
      return;
    }
    case "savesCanonicallyEqual": {
      const a = slotData(c, str(step, "a"));
      const b = slotData(c, str(step, "b"));
      for (const path of (step["ignore"] as string[] | undefined) ?? []) {
        deletePath(a, path);
        deletePath(b, path);
      }
      if (canonicalJson(a) !== canonicalJson(b)) fail(`saves differ:\n${canonicalJson(a)}\n${canonicalJson(b)}`);
      return;
    }
    case "slotOffersBackup":
      if (!c.slots.offersBackup(str(step, "slot"))) fail(`slot "${String(step["slot"])}" offers no backup (${c.slots.read(str(step, "slot")).state})`);
      return;
    case "animation": {
      const view = needMedia(c).presenter.animator.view(str(step, "entity"));
      if (step["none"] === true) {
        if (view !== null) fail(`"${String(step["entity"])}" still shows ${view.name} (${view.player.status})`);
        return;
      }
      if (view === null) fail(`"${String(step["entity"])}" shows no animation`);
      const v = view as NonNullable<typeof view>;
      const got = { name: v.name, status: v.player.status, frame: v.player.state.frame };
      for (const key of ["name", "status", "frame"] as const) {
        if (step[key] !== undefined && got[key] !== step[key]) fail(`animation of "${String(step["entity"])}" is ${JSON.stringify(got)}, expected ${key} ${JSON.stringify(step[key])}`);
      }
      return;
    }
    case "sounds": {
      const m = needMedia(c);
      const playing = m.presenter.mixer.playing().map((p) => `${p.entity}:${p.name}`);
      if (step["equals"] !== undefined && JSON.stringify(playing) !== JSON.stringify(step["equals"])) fail(`playing sounds are ${JSON.stringify(playing)}, expected ${JSON.stringify(step["equals"])}`);
      if (step["fading"] !== undefined && m.audio.fading.size !== step["fading"]) fail(`${m.audio.fading.size} sound(s) are fading out, expected ${String(step["fading"])}`);
      return;
    }
    case "cutscene": {
      const m = needMedia(c);
      const cs = m.presenter.cutscenes;
      const backend = m.cutsceneBackends[m.cutsceneBackends.length - 1];
      const got = { state: cs.state, name: cs.name, variant: cs.variant, frame: cs.state === "idle" ? -1 : (backend?.frameIndex ?? -1) };
      for (const key of ["state", "name", "variant", "frame"] as const) {
        if (step[key] !== undefined && got[key] !== step[key]) fail(`cutscene is ${JSON.stringify(got)}, expected ${key} ${JSON.stringify(step[key])}`);
      }
      return;
    }
    case "signalCount": {
      const entity = str(step, "entity");
      const name = str(step, "name");
      const n = e.events.filter((ev) => ev.action === "signal" && ev.receiver === entity && ev.ctx["$signal"] === name).length;
      if (n !== step["count"]) fail(`signal "${name}" reached "${entity}" ${n} time(s), expected ${String(step["count"])}`);
      return;
    }
    case "mediaPending": {
      const n = needMedia(c).presenter.pendingCount;
      if (n !== step["count"]) fail(`${n} media command(s) are pending, expected ${String(step["count"])}`);
      return;
    }
    case "inventory": {
      const actor = str(step, "actor");
      const inv = e.world.actors.get(actor)?.inventory;
      if (inv === undefined) fail(`unknown actor "${actor}"`);
      if (JSON.stringify(inv) !== JSON.stringify(step["equals"])) fail(`inventory of "${actor}" is ${JSON.stringify(inv)}, expected ${JSON.stringify(step["equals"])}`);
      return;
    }
    case "runEvent": {
      // An event delivered since the last click (click, clickPoint or clickInventory) with a matching ctx subset.
      const entity = str(step, "entity");
      const action = str(step, "action");
      const ctx = (step["ctx"] as Record<string, Value> | undefined) ?? {};
      const since = e.events.slice(c.eventMark);
      const hit = since.find((ev) => ev.receiver === entity && ev.action === action && Object.entries(ctx).every(([k, v]) => ev.ctx[k] !== undefined && valuesEqual(ev.ctx[k] as Value, v)));
      if (hit === undefined) {
        fail(`no ${action} event to "${entity}" with ctx ${JSON.stringify(ctx)} since the last click (got ${JSON.stringify(since.map((ev) => [ev.action, ev.receiver, ev.ctx]))})`);
      }
      return;
    }
    case "selectedItem":
      if (e.selectedItem !== step["equals"]) fail(`selected item is ${JSON.stringify(e.selectedItem)}, expected ${JSON.stringify(step["equals"])}`);
      return;
    case "inventoryWindow": {
      const view = e.inventory();
      if (step["offset"] !== undefined && view.offset !== step["offset"]) fail(`inventory offset is ${view.offset}, expected ${String(step["offset"])}`);
      if (step["visible"] !== undefined && JSON.stringify(view.visible) !== JSON.stringify(step["visible"])) {
        fail(`visible inventory is ${JSON.stringify(view.visible)}, expected ${JSON.stringify(step["visible"])}`);
      }
      return;
    }
    case "warning": {
      const code = req(step["code"] as string | undefined, "code");
      const found = step["phase"] === "validation" ? c.content.diagnostics.some((d) => d.code === code) : e.warnings.some((w) => w.code === code);
      if (!found) fail(`no ${step["phase"] === "validation" ? "validation diagnostic" : "runtime warning"} with code ${code}`);
      return;
    }
  }
}

function statistic(step: Step, c: StepContext): void {
  const entry = req(step["entry"] as string | undefined, "entry");
  const runs = req(step["runs"] as number | undefined, "runs");
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_STAT_RUNS) throw new ScenarioError("format", `runs must be an integer in [1, ${MAX_STAT_RUNS}]`);
  const fresh = step["freshSeedEach"] === true;
  const expect = req(step["expect"] as { var?: string; values?: Value[]; chiSquaredMinP?: number } | undefined, "expect");
  const name = req(expect.var, "expect.var");
  const values = req(expect.values, "expect.values");
  const minP = req(expect.chiSquaredMinP, "expect.chiSquaredMinP");
  const counts = values.map(() => 0);
  for (let i = 0; i < runs; i++) {
    const engine = new Engine(c.content, { seed: fresh ? `${c.seed}#stat#${i}` : c.seed, adapter: new HeadlessAdapter(), trace: false });
    engine.run(entry);
    engine.settle();
    const v = engine.globals.get(name);
    const idx = values.findIndex((x) => valuesEqual(x, v));
    if (idx < 0) fail(`run ${i} produced unexpected ${name}=${JSON.stringify(v)}`);
    counts[idx] = (counts[idx] as number) + 1;
  }
  const result = chiSquaredUniform(counts);
  c.engine.tracer.emit("scenario.statistic", { entry, runs, counts, p: Math.round(result.p * 1e6) / 1e6 });
  if (result.p < minP) fail(`distribution ${JSON.stringify(counts)} is not uniform (χ²=${result.statistic.toFixed(3)}, p=${result.p.toExponential(3)} < ${minP})`);
}
