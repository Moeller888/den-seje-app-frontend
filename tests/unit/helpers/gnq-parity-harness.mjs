// Runs the REAL get-next-question/index.ts in Node against a recording stand-in for supabase-js, so the
// off-path of the level engine can be compared, call for call, with the behaviour of the deployed
// version 179 (commit 21ec9ff). Used by tests/unit/get-next-question-release-gate.test.mjs and by
// tools/edge/gnq-release.mjs (which writes the v179 golden file).
//
// How: module.registerHooks maps the two URL imports of index.ts to in-memory stand-ins
// (std's serve() records the handler; createClient returns a client that records every from()/rpc()
// chain with its arguments and answers from a fixed scenario), a minimal Deno.env is installed, and
// every request runs through the captured handler. Node strips the TypeScript types itself.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const SERVE_URL = "https://deno.land/std@0.168.0/http/server.ts";
const SUPABASE_PREFIX = "https://esm.sh/@supabase/supabase-js@";

const STUB_SERVE = `export function serve(h) { globalThis.__gnqHandlers.push(h); }`;
const STUB_SUPABASE = `
const T = () => globalThis.__gnqTrace;
function chain(kind, name, client, ops) {
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        const res = globalThis.__gnqScenario(kind, name, ops);
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
    auth: { getUser: async () => { T().push({ client, kind: "auth.getUser" }); return { data: { user: { id: "stu-1" } }, error: null }; } },
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
  ENV.set("SUPABASE_URL", "http://stub");
  ENV.set("SUPABASE_SERVICE_ROLE_KEY", "SERVICE");
  ENV.set("SUPABASE_ANON_KEY", "ANON");
}

// Loads one index.ts and returns its request handler, after one warm-up request: the key resolver
// (../_shared/supabase-keys.ts) logs its key source once per isolate, so the first request of a fresh
// module differs from every later one. warmup is that first request, compared on its own.
export async function loadHandler(indexPath) {
  installHooks();
  installDeno();
  globalThis.__gnqHandlers = [];
  globalThis.__gnqTrace = [];
  await import(pathToFileURL(indexPath).href);
  if (globalThis.__gnqHandlers.length !== 1) throw new Error(`expected one serve() handler, got ${globalThis.__gnqHandlers.length}`);
  const handler = globalThis.__gnqHandlers[0];
  const warmup = await runCase(handler, { mix: undefined, level: undefined, subject: "historie", scenario: "due" });
  return { handler, warmup };
}

// ── The fixed backend every version sees ───────────────────────────────────────────────────────────
export const B_FUNCTIONS = Object.freeze(["advance_student_level", "get_level_questions_for_student", "request_repeat_level_question_for_student"]);
export const LEVEL_TABLES = Object.freeze(["student_subject_level", "student_level_fold_log"]);
export const OFF_VALUES = Object.freeze([undefined, "", "false", "true", "0", "off", "V1", " v1"]);
export const MIX_VALUES = Object.freeze([undefined, "shadow", "v2"]);
export const SUBJECTS = Object.freeze(["historie", "engelsk"]);
export const SCENARIOS = Object.freeze(["due", "new", "repeat", "none", "error"]);

const MCQ = (id, extra = {}) => ({
  id, content: { question: "Q " + id, options: ["a", "b"], correct: "a" },
  answer_format: "mc", answer_type: "short", metadata: {}, difficulty_band: 3, ...extra,
});

function scenario(s) {
  return (kind, name, ops) => {
    const has = (op, ...a) => ops.some((o) => o[0] === op && a.every((x, i) => o[i + 1] === x));
    if (kind === "from" && name === "profiles") return { data: { active_domains: ["vikings"], selected_grade: 7 }, error: null };
    if (kind === "from" && name === "question_instances") {
      if (ops.some((o) => o[0] === "insert")) return { data: [{ id: "new-inst" }], error: null };
      if (has("eq", "answered", false)) {
        return { data: s === "due" ? [{ id: "due-1", next_review_at: "t", questions: { ...MCQ("dq"), is_active: true } }] : [], error: null };
      }
      if (has("eq", "id", "rep-1")) return { data: [{ id: "rep-1", questions: { ...MCQ("rq"), is_active: true } }], error: null };
      return { data: [], error: null };
    }
    if (kind === "rpc") {
      if (name === "release_open_question_outside") return { data: 0, error: null };
      if (name === "get_unserved_questions_for_student") {
        return s === "error" ? { data: null, error: { message: "boom" } } : { data: s === "new" ? [MCQ("q1"), MCQ("q2")] : [], error: null };
      }
      if (name.startsWith("request_repeat")) return { data: s === "repeat" ? "rep-1" : null, error: null };
      // #351's format mix (QUESTION_MIX_ENGINE shadow / v2).
      if (name === "advance_student_band") return { data: [{ band: 3, seed: 3, seed_source: "grade", folded: 4, newly_folded: 1 }], error: null };
      if (name === "get_question_candidates_for_student") {
        return s === "error" ? { data: null, error: { message: "boom" } } : { data: s === "new" ? [MCQ("m1"), MCQ("m2")] : [], error: null };
      }
      if (name === "advance_student_level") {
        return { data: [{ level: 3000, seed_level: 2800, seed_source: "grade", answered: 4, newly_folded: 2 }], error: null };
      }
      if (name === "get_level_questions_for_student") return { data: s === "new" ? [MCQ("L1", { difficulty_level: 3000 })] : [], error: null };
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
}

const setEnv = (k, v) => (v === undefined ? ENV.delete(k) : ENV.set(k, v));
const normalise = (x) => JSON.parse(JSON.stringify(x).replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<ts>"));
const show = (x) => (typeof x === "string" ? x : x instanceof Error ? x.message : JSON.stringify(x));

// One request: status, body, every backend call (with arguments) and every log line.
export async function runCase(handler, { mix, level, subject, scenario: s }) {
  setEnv("QUESTION_MIX_ENGINE", mix);
  setEnv("LEVEL_ENGINE", level);
  globalThis.__gnqTrace = [];
  globalThis.__gnqScenario = scenario(s);
  const logs = [];
  const { log, error } = console;
  console.log = (...a) => { logs.push("LOG " + a.map(show).join(" ")); };
  console.error = (...a) => { logs.push("ERR " + a.map(show).join(" ")); };
  try {
    const res = await handler(new Request("http://stub/", {
      method: "POST",
      headers: { Authorization: "Bearer pupil" },
      body: JSON.stringify({ subject, session_context: { wave_phase: "challenge" } }),
    }));
    return normalise({ status: res.status, body: await res.text(), calls: globalThis.__gnqTrace, logs });
  } finally {
    console.log = log;
    console.error = error;
  }
}

export const caseKey = ({ mix, subject, scenario: s }) => `mix=${mix ?? "<unset>"}|${subject}|${s}`;

// The golden matrix: v179 does not read LEVEL_ENGINE, so one result per (mix, subject, scenario).
export async function goldenMatrix(handler) {
  const out = {};
  for (const mix of MIX_VALUES) for (const subject of SUBJECTS) for (const s of SCENARIOS) {
    out[caseKey({ mix, subject, scenario: s })] = await runCase(handler, { mix, level: undefined, subject, scenario: s });
  }
  return out;
}
