// Security regression: every runtime write to question_instances is known, and scoped.
//
// WHY. reset-pending (retired 2026-10-09) ran
//     admin.from("question_instances").update({...}).is("teacher_score", null)
// through the backend key for ANY signed-in caller: one call rewrote every pupil's unreviewed rows
// (3614 rows, 28 pupils, at retirement). An unscoped write like that must not come back unnoticed.
//
// HOW. A naive regex over the source gives false comfort, so this test parses each
// `.from("question_instances")` method chain properly (balanced parentheses, strings skipped) and
// classifies it: which operation, on which client variable, with which filters. Then:
//   1. the set of mutation sites in runtime code must equal an explicit ALLOWLIST — a new write
//      anywhere fails here until it is reviewed and listed;
//   2. every UPDATE / DELETE must be scoped to BOTH .eq("id", …) and .eq("student_id", …); every
//      INSERT must set student_id; UPSERT is not allowed at all;
//   3. the table name may only appear as a literal `.from("question_instances")` argument, so it
//      cannot be smuggled in through a variable that the parser would not see.
// The analyser itself is tested against the old reset-pending write and the v32 updateOwnInstance
// write, so a weakened analyser fails too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TABLE = "question_instances";
const MUTATIONS = new Set(["update", "insert", "upsert", "delete"]);

// ── Source helpers ──────────────────────────────────────────────────────────────────────────────
// Comments out, so prose can neither satisfy nor trip an assertion.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function skipString(src, i) {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === quote) return j;
  }
  return src.length;
}

// src[i] === "(" → index of the matching ")", skipping string and template literals.
function matchParen(src, i) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '"' || c === "'" || c === "`") { j = skipString(src, j); continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return j;
  }
  return -1;
}

const firstStringArg = (args) => {
  const m = /^\s*(['"`])([^'"`]*)\1/.exec(args);
  return m ? m[2] : null;
};

// Parses the chain that starts at `.from(` (index of the dot) and the receiver right before it.
function parseChain(src, dotIndex) {
  const openFrom = src.indexOf("(", dotIndex);
  let i = matchParen(src, openFrom) + 1;
  const calls = [];
  for (;;) {
    const rest = src.slice(i);
    const m = /^\s*\??\.\s*([A-Za-z_$][\w$]*)\s*/.exec(rest);
    if (!m) break;
    const nameEnd = i + m[0].length;
    if (src[nameEnd] !== "(") break;
    const close = matchParen(src, nameEnd);
    if (close < 0) break;
    calls.push({ name: m[1], args: src.slice(nameEnd + 1, close) });
    i = close + 1;
  }
  const before = src.slice(0, dotIndex).replace(/\s+$/, "");
  const receiver = (/([A-Za-z_$][\w$]*)$/.exec(before) ?? [null, null])[1];
  return { receiver, calls };
}

const FROM_TABLE = new RegExp(String.raw`\.\s*from\(\s*(['"\x60])${TABLE}\1\s*\)`, "g");

// All `.from("question_instances")` chains in a piece of source, classified.
function analyse(source) {
  const src = stripComments(source);
  const sites = [];
  for (const m of src.matchAll(FROM_TABLE)) {
    const { receiver, calls } = parseChain(src, m.index);
    const mutation = calls.find((c) => MUTATIONS.has(c.name));
    if (!mutation) continue;
    const eqColumns = calls.filter((c) => c.name === "eq").map((c) => firstStringArg(c.args));
    let scoped;
    if (mutation.name === "update" || mutation.name === "delete") {
      scoped = eqColumns.includes("id") && eqColumns.includes("student_id");
    } else if (mutation.name === "insert") {
      scoped = /\bstudent_id\b/.test(mutation.args);
    } else {
      scoped = false; // upsert: never allowed on this table
    }
    sites.push({ op: mutation.name, receiver, eqColumns, scoped, calls: calls.map((c) => c.name) });
  }
  return sites;
}

// Every literal "question_instances" must be the argument of a .from(...) call.
function tableLiteralOutsideFrom(source) {
  const src = stripComments(source);
  const literals = [...src.matchAll(new RegExp(String.raw`(['"\x60])${TABLE}\1`, "g"))].length;
  const fromCalls = [...src.matchAll(FROM_TABLE)].length;
  return literals - fromCalls;
}

// ── The analyser, proven against the real exploit and the real fix ──────────────────────────────
const OLD_RESET_PENDING = `
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey());
    const { error } = await supabase
      .from("question_instances")
      .update({
        teacher_score: 1,
        teacher_feedback: "Afvist (reset)",
        was_correct: false,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id
      })
      .is("teacher_score", null);
`;

const V32_UPDATE_OWN_INSTANCE = `
  const admin = makeAdminClient();
  const { data, error } = await admin
    .from("question_instances")
    .update(values)
    .eq("id", scope.instanceId)
    .eq("student_id", scope.studentId)
    .select("id");
`;

test("analyser: the old reset-pending write is flagged as an UNSCOPED update", () => {
  const [site, ...rest] = analyse(OLD_RESET_PENDING);
  assert.equal(rest.length, 0);
  assert.deepEqual({ op: site.op, receiver: site.receiver, scoped: site.scoped }, { op: "update", receiver: "supabase", scoped: false });
  assert.deepEqual(site.calls, ["update", "is"]);
});

test("analyser: the v32 updateOwnInstance write is a scoped update", () => {
  const [site] = analyse(V32_UPDATE_OWN_INSTANCE);
  assert.deepEqual({ op: site.op, receiver: site.receiver, scoped: site.scoped }, { op: "update", receiver: "admin", scoped: true });
  assert.deepEqual(site.eqColumns, ["id", "student_id"]);
});

test("analyser: half a scope, a .match() scope or an upsert are all unscoped", () => {
  const cases = {
    onlyStudent: `db.from("question_instances").update({ a: 1 }).eq("student_id", uid)`,
    onlyId: `db.from('question_instances').update({ a: 1 }).eq('id', id)`,
    matchObject: "db.from(`question_instances`).update({ a: 1 }).match({ id, student_id: uid })",
    neqOnly: `db.from("question_instances").delete().neq("id", "x")`,
    upsert: `db.from("question_instances").upsert({ id, student_id: uid }).eq("id", id).eq("student_id", uid)`,
    insertNoOwner: `db.from("question_instances").insert({ question_id: q })`,
  };
  for (const [name, src] of Object.entries(cases)) {
    const sites = analyse(src);
    assert.equal(sites.length, 1, name);
    assert.equal(sites[0].scoped, false, name);
  }
});

test("analyser: scoped delete and owner insert pass; reads are not mutation sites", () => {
  assert.equal(analyse(`db.from("question_instances").delete().eq("id", id).eq("student_id", uid)`)[0].scoped, true);
  assert.equal(analyse(`db.from("question_instances").insert({ student_id, question_id: q.id }).select("id")`)[0].scoped, true);
  assert.deepEqual(analyse(`db.from("question_instances").select("id").eq("student_id", uid)`), []);
});

test("analyser: strings and nested calls inside arguments do not end the chain early", () => {
  const src = `db.from("question_instances").update({ note: "a ) b", at: new Date().toISOString() }).eq("id", f(")")).eq("student_id", uid)`;
  const [site] = analyse(src);
  assert.equal(site.scoped, true);
  assert.deepEqual(site.calls, ["update", "eq", "eq"]);
});

test("analyser: a table name held in a variable is caught by the literal guard", () => {
  assert.equal(tableLiteralOutsideFrom(`const T = "question_instances"; db.from(T).update({}).is("x", null)`), 1);
  assert.equal(tableLiteralOutsideFrom(V32_UPDATE_OWN_INSTANCE), 0);
  // Descriptive prose inside a longer string is not a table argument.
  assert.equal(tableLiteralOutsideFrom(`const doc = "question_instances.misconception_signal is recorded";`), 0);
});

// ── The repository ──────────────────────────────────────────────────────────────────────────────
// Runtime code: every Edge Function, every browser module, and the root pages/scripts.
function runtimeFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules") continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|js|mjs|html)$/.test(name)) out.push(p);
    }
  };
  walk(join(REPO, "supabase", "functions"));
  walk(join(REPO, "js"));
  for (const name of readdirSync(REPO)) {
    const p = join(REPO, name);
    if (statSync(p).isFile() && /\.(js|mjs|html)$/.test(name)) out.push(p);
  }
  return out.map((p) => relative(REPO, p).split("\\").join("/")).sort();
}

const FILES = runtimeFiles();
const SITES = FILES.flatMap((file) =>
  analyse(readFileSync(join(REPO, file), "utf8")).map((s) => ({ file, ...s })));

// The reviewed, allowed runtime writes. Adding a write anywhere means adding it here, consciously.
const ALLOWLIST = [
  // New instance for the signed-in pupil — pupil's own client (RLS INSERT policy student_id = auth.uid()).
  { file: "supabase/functions/get-next-question/index.ts", op: "insert", receiver: "supabase" },
  // next_review_at after an MC answer — pupil's own client (RLS-filtered; separate spaced-repetition decision).
  { file: "supabase/functions/process-event/index.ts", op: "update", receiver: "supabase" },
  // Server-owned lifecycle writes (long-answer save, misconception signal) — backend admin client.
  { file: "supabase/functions/process-event/instance-writes.ts", op: "update", receiver: "admin" },
];

test("the runtime file walk covers the Edge Functions and the browser code", () => {
  for (const f of ["supabase/functions/process-event/index.ts", "supabase/functions/get-next-question/index.ts", "js/teacher.js", "app.js"]) {
    assert.ok(FILES.includes(f), f);
  }
});

test("every runtime write to question_instances is on the reviewed allowlist — no more, no fewer", () => {
  const found = SITES.map(({ file, op, receiver }) => ({ file, op, receiver }));
  assert.deepEqual(found, ALLOWLIST,
    "a question_instances write was added, removed or moved: review its client and scope, then update ALLOWLIST");
});

test("every runtime update/delete is scoped to id AND student_id; every insert sets student_id; no upsert", () => {
  for (const s of SITES) {
    assert.equal(s.scoped, true, `${s.file}: ${s.op} on ${s.receiver} with eq(${s.eqColumns.join(", ")})`);
    assert.notEqual(s.op, "upsert", s.file);
  }
});

test("no runtime file names the table outside a literal .from(...) call", () => {
  for (const file of FILES) {
    assert.equal(tableLiteralOutsideFrom(readFileSync(join(REPO, file), "utf8")), 0, file);
  }
});

test("the only admin-client write is the scoped, row-counted v32 helper", () => {
  const admin = SITES.filter((s) => s.receiver !== "supabase");
  assert.deepEqual(admin.map((s) => s.file), ["supabase/functions/process-event/instance-writes.ts"]);
  const src = stripComments(readFileSync(join(REPO, "supabase/functions/process-event/instance-writes.ts"), "utf8"));
  assert.match(src, /const admin = makeAdminClient\(\);/);
  assert.match(src, /\.eq\("id", scope\.instanceId\)\s*\.eq\("student_id", scope\.studentId\)\s*\.select\("id"\);/);
  assert.match(src, /if \(data\.length === 1\) return \{ ok: true, rows: 1 \};/);
});
