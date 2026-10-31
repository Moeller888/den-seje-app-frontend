// Runs the REAL process-event/index.ts in Node against a recording stand-in for supabase-js, so the
// answer paths can be tested call for call, and the legacy path (no round_no / submission_id) can be
// compared with the deployed version 34. Used by tests/unit/process-event-v2.test.mjs.
//
// How (same arrangement as ./gnq-parity-harness.mjs): module.registerHooks maps the two URL imports of
// index.ts to in-memory stand-ins (std's serve() records the handler; createClient returns a client
// that records every from()/rpc() chain with its arguments and answers from the case's backend), a
// minimal Deno.env is installed, and every request runs through the captured handler. Node strips the
// TypeScript types itself.
//
// CLI: node tests/unit/helpers/process-event-harness.mjs <functions-dir> <out.json>
// writes the legacy golden file for the index.ts in <functions-dir>/process-event. The committed
// tests/fixtures/process-event-v34-parity.json was written from the files deployed as version 34
// (byte-identical to commit 03f5954), see its "source" block.
import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const SERVE_URL = "https://deno.land/std@0.168.0/http/server.ts";
const SUPABASE_PREFIX = "https://esm.sh/@supabase/supabase-js@";

const STUB_SERVE = `export function serve(h) { globalThis.__peHandlers.push(h); }`;
const STUB_SUPABASE = `
const T = () => globalThis.__peTrace;
function chain(kind, name, client, ops) {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        const res = globalThis.__peBackend(kind, name, ops, client);
        T().push({ client, kind, name, ops });
        return (ok, ko) => Promise.resolve(res).then(ok, ko);
      }
      return (...args) => chain(kind, name, client, [...ops, [String(prop), ...args]]);
    },
  });
}
export function createClient(_url, key, opts) {
  const client = key === "SERVICE" ? "admin" : "user";
  T().push({ createClient: client, auth: opts?.global?.headers?.Authorization ? "pupil-jwt" : "none" });
  return {
    auth: { getUser: async () => { T().push({ client, kind: "auth.getUser" }); return globalThis.__peUser(); } },
    from: (table) => chain("from", table, client, []),
    rpc: (fn, args) => chain("rpc", fn, client, [["args", args]]),
  };
}`;
const dataUrl = (src) => "data:text/javascript," + encodeURIComponent(src);

let hooked = false;
function installHooks() {
  if (hooked) return;
  hooked = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === SERVE_URL) return { url: dataUrl(STUB_SERVE), shortCircuit: true };
      if (specifier.startsWith(SUPABASE_PREFIX)) return { url: dataUrl(STUB_SUPABASE), shortCircuit: true };
      return next(specifier, context);
    },
  });
}

const ENV = new Map();
function installDeno() {
  globalThis.Deno = {
    env: { get: (k) => ENV.get(k), set: (k, v) => { ENV.set(k, v); }, delete: (k) => { ENV.delete(k); } },
  };
}
function resetEnv() {
  ENV.clear();
  ENV.set("SUPABASE_URL", "http://stub");
  ENV.set("SUPABASE_SERVICE_ROLE_KEY", "SERVICE");
  ENV.set("SUPABASE_ANON_KEY", "ANON");
}

// ── The fixed backend ────────────────────────────────────────────────────────────────────────────
export const STUDENT = "stu-1";
const META = { review_text: "Husk: R", misconception_type: "M-type" };
const q = (answer_format, answer_type, extra = {}) => ({ answer_format, answer_type, content: { question: "Q" }, metadata: META, ...extra });
export const INSTANCES = Object.freeze({
  "mc-1":      { student_id: STUDENT, correct_answer: "a", questions: q("mc", "short") },
  "num-1":     { student_id: STUDENT, correct_answer: "42", questions: q("number", "short") },
  "txt-1":     { student_id: STUDENT, correct_answer: "Paris", questions: q("text", "short", { content: { question: "Q", accepted_answers: ["Paris by"] } }) },
  "long-1":    { student_id: STUDENT, correct_answer: null, questions: q("text", "long") },
  "nometa-1":  { student_id: STUDENT, correct_answer: "a", questions: { answer_format: "mc", answer_type: "short", content: null, metadata: null } },
  "foreign-1": { student_id: "stu-2", correct_answer: "a", questions: q("mc", "short") },
  // Match par (#377): 2–6 pairs; the key is the instance's shuffle of the right column.
  ...Object.fromEntries(Object.entries(MATCH_KEYS()).map(([n, key]) => [`match-${n}`, {
    student_id: STUDENT, correct_answer: key,
    questions: q("match", "short", { content: { question: "Forbind", pairs: Array.from({ length: Number(n) }, (_, i) => ({ left: "L" + i, right: "R" + i })) } }),
  }])),
});

// One fixed, non-identity key per pair count ("left:right display position").
function MATCH_KEYS() {
  return { 2: "0:1,1:0", 3: "0:2,1:0,2:1", 4: "0:3,1:2,2:0,3:1", 5: "0:4,1:0,2:3,3:1,4:2", 6: "0:5,1:3,2:1,3:0,4:4,5:2" };
}
export const MATCH_KEY_BY_PAIRS = Object.freeze(MATCH_KEYS());
// The connections the browser sends for a key, as JSON ([[left, right], …]), in the given order.
export function matchConnections(key, { reverse = false, swap = false } = {}) {
  const pairs = key.split(",").map((p) => p.split(":").map(Number));
  if (swap) [pairs[0][1], pairs[1][1]] = [pairs[1][1], pairs[0][1]];
  return JSON.stringify(reverse ? pairs.reverse() : pairs);
}

const isRead = (kind, name, ops) => kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "maybeSingle");
const isUpdate = (kind, name, ops) => kind === "from" && name === "question_instances" && ops.some((o) => o[0] === "update");

export function defaultBackend(kind, name, ops) {
  if (isRead(kind, name, ops)) {
    const id = ops.find((o) => o[0] === "eq" && o[1] === "id")?.[2];
    return { data: INSTANCES[id] ?? null, error: null };
  }
  if (isUpdate(kind, name, ops)) {
    const id = ops.find((o) => o[0] === "eq" && o[1] === "id")?.[2];
    return ops.some((o) => o[0] === "select") ? { data: [{ id }], error: null } : { data: null, error: null };
  }
  if (kind === "rpc" && name === "process_question_attempt") {
    const args = ops[0][1];
    const key = INSTANCES[args.p_question_instance_id]?.correct_answer;
    return { data: { status: args.p_answer === key ? "correct" : "incorrect", correct_answer: key }, error: null };
  }
  if (kind === "rpc" && name === "process_text_answer") return { data: { status: "processed" }, error: null };
  return { data: null, error: { message: `unexpected ${kind} ${name}` } };
}

const show = (x) => (typeof x === "string" ? x : x instanceof Error ? x.message : JSON.stringify(x));
const normalise = (x) => JSON.parse(JSON.stringify(x).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<ts>"));
export const FIXED_NOW = 1790000000000;

// One request: status, body, every backend call (with arguments) and every log line.
//   body     request body (object), or a raw string sent as is
//   backend  (kind, name, ops, client, base) → result; base is defaultBackend's answer
//   user     false → auth.getUser() fails
//   env      { NAME: value | undefined } applied on top of the default environment
export async function runCase(handler, { body, backend, user = true, env = {} } = {}) {
  resetEnv();
  for (const [k, v] of Object.entries(env)) (v === undefined ? ENV.delete(k) : ENV.set(k, v));
  globalThis.__peTrace = [];
  globalThis.__peUser = () => (user
    ? { data: { user: { id: STUDENT } }, error: null }
    : { data: { user: null }, error: { message: "invalid JWT" } });
  globalThis.__peBackend = (kind, name, ops, client) => {
    const base = defaultBackend(kind, name, ops);
    return backend ? backend(kind, name, ops, client, base) : base;
  };
  const logs = [];
  const { log, error } = console;
  const now = Date.now;
  console.log = (...a) => { logs.push("LOG " + a.map(show).join(" ")); };
  console.error = (...a) => { logs.push("ERR " + a.map(show).join(" ")); };
  Date.now = () => FIXED_NOW;
  try {
    const res = await handler(new Request("http://stub/", {
      method: "POST",
      headers: { Authorization: "Bearer pupil", "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
    }));
    return normalise({ status: res.status, body: await res.text(), calls: globalThis.__peTrace, logs });
  } finally {
    console.log = log;
    console.error = error;
    Date.now = now;
  }
}

// Loads one index.ts and returns its request handler, after one warm-up request: the key resolver
// (../_shared/supabase-keys.ts) logs its key source once per isolate, so the first request of a fresh
// module differs from every later one.
export async function loadHandler(indexPath) {
  installHooks();
  installDeno();
  resetEnv();
  globalThis.__peHandlers = [];
  globalThis.__peTrace = [];
  const { log } = console;
  console.log = () => {};
  try { await import(pathToFileURL(indexPath).href); } finally { console.log = log; }
  if (globalThis.__peHandlers.length !== 1) throw new Error(`expected one serve() handler, got ${globalThis.__peHandlers.length}`);
  const handler = globalThis.__peHandlers[0];
  await runCase(handler, { body: { question_instance_id: "mc-1", answer: "a" } });
  return handler;
}

// ── The legacy cases: requests WITHOUT round_no and submission_id ────────────────────────────────
// Every one of them must give exactly the version 34 result. A backend override is named, so the
// golden file stays readable.
const misconceptionWriteFails = (kind, name, ops, client, base) =>
  isUpdate(kind, name, ops) && ops.some((o) => o[0] === "update" && "misconception_signal" in o[1])
    ? { data: [], error: null } : base;
const reviewUpdateFails = (kind, name, ops, client, base) =>
  isUpdate(kind, name, ops) && ops.some((o) => o[0] === "update" && "next_review_at" in o[1])
    ? { data: null, error: { message: "no row" } } : base;
const rpcFails = (fn, error) => (kind, name, ops, client, base) => (kind === "rpc" && name === fn ? { data: null, error } : base);

export const LEGACY_CASES = Object.freeze({
  "unauthorized":            { user: false, body: { question_instance_id: "mc-1", answer: "a" } },
  "invalid json":            { body: "{not json" },
  "missing answer":          { body: { question_instance_id: "mc-1" } },
  "missing instance id":     { body: { answer: "a" } },
  "instance not found":      { body: { question_instance_id: "nope", answer: "a" } },
  "instance read error":     { body: { question_instance_id: "mc-1", answer: "a" }, backend: (k, n, o, c, b) => (isRead(k, n, o) ? { data: null, error: { message: "read failed" } } : b) },
  "foreign instance":        { body: { question_instance_id: "foreign-1", answer: "a" } },
  "no backend key":          { body: { question_instance_id: "mc-1", answer: "a" }, env: { SUPABASE_SERVICE_ROLE_KEY: undefined } },
  "mc correct":              { body: { question_instance_id: "mc-1", answer: "a", question_shown_at: 1789999990000 } },
  "mc incorrect":            { body: { question_instance_id: "mc-1", answer: "b" } },
  "mc incorrect no meta":    { body: { question_instance_id: "nometa-1", answer: "b" } },
  "mc misconception fails":  { body: { question_instance_id: "mc-1", answer: "b" }, backend: misconceptionWriteFails },
  "mc review update fails":  { body: { question_instance_id: "mc-1", answer: "a" }, backend: reviewUpdateFails },
  "mc rpc error":            { body: { question_instance_id: "mc-1", answer: "a" }, backend: rpcFails("process_question_attempt", { code: "P0001", message: "boom" }) },
  "mc rpc no data":          { body: { question_instance_id: "mc-1", answer: "a" }, backend: (k, n, o, c, b) => (k === "rpc" ? { data: null, error: null } : b) },
  "mc already answered":     { body: { question_instance_id: "mc-1", answer: "a" }, backend: (k, n, o, c, b) => (k === "rpc" ? { data: { status: "already_answered" }, error: null } : b) },
  "number correct":          { body: { question_instance_id: "num-1", answer: "42" } },
  "number incorrect":        { body: { question_instance_id: "num-1", answer: "41" } },
  "text correct":            { body: { question_instance_id: "txt-1", answer: " paris. " } },
  "text accepted variant":   { body: { question_instance_id: "txt-1", answer: "Paris by" } },
  "text incorrect":          { body: { question_instance_id: "txt-1", answer: "Lyon" } },
  "text misconception fails": { body: { question_instance_id: "txt-1", answer: "Lyon" }, backend: misconceptionWriteFails },
  "text rpc error":          { body: { question_instance_id: "txt-1", answer: "Paris" }, backend: rpcFails("process_text_answer", { code: "P0001", message: "boom" }) },
  "long too short":          { body: { question_instance_id: "long-1", answer: "for kort svar" } },
  "long saved":              { body: { question_instance_id: "long-1", answer: Array.from({ length: 25 }, (_, i) => "ord" + i).join(" ") } },
  "long save no row":        { body: { question_instance_id: "long-1", answer: Array.from({ length: 25 }, (_, i) => "ord" + i).join(" ") }, backend: (k, n, o, c, b) => (isUpdate(k, n, o) ? { data: [], error: null } : b) },
  "extra unrelated fields":  { body: { question_instance_id: "mc-1", answer: "a", client_version: 7, round: 2 } },
});

// ── Match par cases (#377, main 2d8577c): not part of version 34, which had no Match par ──────────
// Legacy requests; the browser sends its connections as a JSON string.
const MATCH_INVALID = {
  "too few connections":   '[[0,1]]',
  "too many connections":  '[[0,1],[1,0],[1,1]]',
  "index out of range":    '[[0,1],[1,2]]',
  "negative index":        '[[0,1],[-1,0]]',
  "duplicate left":        '[[0,1],[0,0]]',
  "duplicate right":       '[[0,1],[1,1]]',
  "not a pair":            '[[0,1],[1]]',
  "not json":              "0:1,1:0",
  "too long":              "[" + " ".repeat(200) + "]",
};
export const MATCH_CASES = Object.freeze({
  ...Object.fromEntries(Object.entries(MATCH_KEY_BY_PAIRS).flatMap(([n, key]) => [
    [`match ${n} pairs correct`, { body: { question_instance_id: `match-${n}`, answer: matchConnections(key, { reverse: true }) } }],
    [`match ${n} pairs wrong`, { body: { question_instance_id: `match-${n}`, answer: matchConnections(key, { swap: true }) } }],
  ])),
  ...Object.fromEntries(Object.entries(MATCH_INVALID).map(([name, answer]) =>
    [`match invalid: ${name}`, { body: { question_instance_id: "match-2", answer } }])),
  "match parsed array":      { body: { question_instance_id: "match-3", answer: [[0, 2], [1, 0], [2, 1]] } },
});

async function runCases(handler, cases) {
  const out = {};
  for (const [name, c] of Object.entries(cases)) out[name] = await runCase(handler, c);
  return out;
}
export const runLegacyCases = (handler) => runCases(handler, LEGACY_CASES);
export const runMainCases = (handler) => runCases(handler, { ...LEGACY_CASES, ...MATCH_CASES });

// The two references (H5 PR 3): version 34 as deployed, and main after #377 and #464.
const SOURCES = {
  v34: {
    run: runLegacyCases,
    source: {
      version: 34,
      ezbr_sha256: "9efa541c4482b0ea593d6a3684e0bf3de0365e6b97f3c35b8137918514f0f11c",
      manifest_sha256: "dbdadf81da912bf4a962e5f2937b3d147f0fc930afeb4663bb89ac2674ceb2ff",
      commit: "03f5954",
      note: "written from the 7 files deployed as process-event version 34 (read 2026-10-31), byte-identical to commit 03f5954",
    },
  },
  main: {
    run: runMainCases,
    source: {
      commit: "2d8577cd1303cdc2705c988f97a722caf4ea9086",
      note: "written from process-event on main after #377 (Match par) and #464 (D-254), before H5 PR 3; NOT deployed (production runs version 34)",
    },
  },
};

const invoked = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invoked) {
  const [functionsDir, out, which = "v34"] = process.argv.slice(2);
  if (!functionsDir || !out || !SOURCES[which]) {
    console.error("usage: process-event-harness.mjs <functions-dir> <out.json> [v34|main]");
    process.exit(2);
  }
  const handler = await loadHandler(join(resolve(functionsDir), "process-event", "index.ts"));
  const cases = await SOURCES[which].run(handler);
  writeFileSync(out, JSON.stringify({ source: SOURCES[which].source, cases }, null, 2) + "\n");
  console.log(`wrote ${Object.keys(cases).length} cases to ${out}`);
}
