// Vej B (D-362): deploy ONLY get-next-question before K1 — archive, release diff and rollback
// (docs/operations/gnq-release-b-d362.md). Nothing here touches production.
//
// Since 2026-11-11 (doc §7) the release candidate is a PINNED commit, not "this tree": main moved on and now
// carries Lærligverse's server code (D-329, D-332, D-338). So the candidate is read from the doc's own record
// and, with the full history, from commit 32f0cb3d — never from the working tree, which follows main.
//
// 1. The archive record in the doc (one "<sha256>  <path>" line per deployed file, read 2026-11-09 with
//    get_edge_function, version 189; re-verified 2026-11-11, version 191) hashes to the deployed manifest
//    the runbook names for a7450b0f.
// 2. The candidate record in the doc hashes to the candidate manifest 04039767…, which the runbook names
//    for main 32f0cb3d.
// 3. The doc's diff list (added / changed / removed) is exactly the per-file difference between the archive
//    record and the candidate record, so the doc cannot drift from its own records.
// 4. With the full history (locally; CI checks the repository out shallowly): the archive record is commit
//    a7450b0f byte for byte, the candidate record is commit 32f0cb3d byte for byte, and the doc's main-diff
//    list is exactly the difference between 32f0cb3d and main 033c90a1 (strategy B).
// 5. Rehearsal (full history): the archived a7450b0f source and the candidate behave identically for every
//    MC case (LEVEL_ENGINE off, v1 and canary; every QUESTION_MIX_ENGINE mode; both subjects; five
//    situations; three request bodies). Negative control: a row with content.stimulus is served differently.
// 6. Strategy B (full history): main 033c90a1 with the LAERLIGVERSE_* flags unset — production's state —
//    behaves like the archive for the same matrix. Negative controls: targeting switched on changes the
//    answer, and D-332 option_details is NOT flag-gated (served by B, not by the archive or the candidate).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { ENTRY, gitReader, graphFiles, manifest } from "../../tools/edge/gnq-release.mjs";
import { MIX_VALUES, SCENARIOS, SUBJECTS, loadHandler, runCase } from "./helpers/gnq-parity-harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVE_COMMIT = "a7450b0f";
const CANDIDATE_COMMIT = "32f0cb3d";
const MAIN_COMMIT = "033c90a1";
const DEPLOYED_MANIFEST = "1f508a8459f5141f1e629dec94ec979ce34bafdcecdbc650b8d6db2a2f7c3bbe";
const CANDIDATE_MANIFEST = "04039767dfcdec861abcaef69c333977d0145fc482df9cbc58bc3860b907d6b2";
const MAIN_MANIFEST = "ea8072da934530fbf3dc39a29599f6026f3b8ed995a157eeb424023aed61ca8b";
const DEPLOYED_EZBR = "77e6acf862b5cfd9c8224a7b84dbff328b3f3912b5fed483d2b8d2a025a5b24c";
const FLAGS = ["LAERLIGVERSE_OBJECTIVE_TARGETING", "LAERLIGVERSE_SEQUENCE"];

const DOC = readFileSync(join(ROOT, "docs", "operations", "gnq-release-b-d362.md"), "utf8");
const RUNBOOK = readFileSync(join(ROOT, "docs", "operations", "level-engine-rollout.md"), "utf8");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// The fenced block right after an HTML marker comment in the doc, as non-empty lines.
function block(marker) {
  const at = DOC.indexOf(`<!-- ${marker} -->`);
  assert.ok(at >= 0, `doc marker ${marker} missing`);
  const m = /```[a-z]*\r?\n([\s\S]*?)```/.exec(DOC.slice(at));
  assert.ok(m, `no code block after ${marker}`);
  return m[1].split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l !== "");
}

const ARCHIVE_LINES = block("gnq-b:archive-manifest");
const CANDIDATE_LINES = block("gnq-b:candidate-manifest");
const parse = (lines) => new Map(lines.map((l) => { const [h, p] = l.split(/ {2}/); return [p, h]; }));
const sortedByPath = (lines) => [...lines].sort((a, b) => a.slice(66).localeCompare(b.slice(66)));

function diffList(thenLines, nowLines) {
  const then = parse(thenLines);
  const now = parse(nowLines);
  return [
    ...[...now.keys()].filter((p) => !then.has(p)).map((p) => `added    ${p}`),
    ...[...now.keys()].filter((p) => then.has(p) && then.get(p) !== now.get(p)).map((p) => `changed  ${p}`),
    ...[...then.keys()].filter((p) => !now.has(p)).map((p) => `removed  ${p}`),
  ];
}

const hasCommits = (() => {
  try {
    for (const c of [ARCHIVE_COMMIT, CANDIDATE_COMMIT, MAIN_COMMIT]) {
      execFileSync("git", ["cat-file", "-e", `${c}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
})();
const SHALLOW = `commits ${ARCHIVE_COMMIT}/${CANDIDATE_COMMIT}/${MAIN_COMMIT} are not all in this clone (CI checks out shallowly); runs locally`;

// Materialise one commit's get-next-question graph in a temp dir and load it in the release-gate harness.
async function loadCommit(commit, dirs) {
  const read = gitReader(commit, ROOT);
  const dir = mkdtempSync(join(tmpdir(), `gnq-${commit}-`));
  dirs.push(dir);
  for (const f of graphFiles(read)) {
    const out = join(dir, "supabase", f);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, read(f));
  }
  return loadHandler(join(dir, "supabase", ENTRY));
}

// The harness installs globalThis.Deno (with its env) when it loads the first handler; before that no flag is set.
const setFlags = (value) => {
  if (globalThis.Deno?.env === undefined) { assert.equal(value, undefined, "load a handler before switching a flag on"); return; }
  for (const k of FLAGS) (value === undefined ? globalThis.Deno.env.delete(k) : globalThis.Deno.env.set(k, value));
};

const LEVELS = [{ level: undefined }, { level: "v1" }, { level: "canary", canaryIds: "stu-1" }, { level: "canary", canaryIds: "someone-else" }];
// What an ordinary or a manipulated client may send; with the flags off, every version must ignore it.
const BODIES = [undefined, { learning_objective: "vikings", sequence: true, learning_step: "transfer" }, { learning_objective: "NOT valid!" }];
function* matrix() {
  for (const lv of LEVELS) for (const mix of MIX_VALUES) for (const subject of SUBJECTS) for (const scenario of SCENARIOS) for (const extraBody of BODIES) {
    yield { mix, subject, scenario, extraBody, ...lv };
  }
}
const MATRIX_SIZE = LEVELS.length * MIX_VALUES.length * SUBJECTS.length * SCENARIOS.length * BODIES.length;

const withContent = (extra) => (kind, name, _ops, res) => (kind === "rpc" && Array.isArray(res.data) && /questions|candidates/.test(name)
  ? { ...res, data: res.data.map((q) => ({ ...q, content: { ...q.content, ...extra } })) }
  : res);

test("the archive record hashes to the deployed manifest the runbook names for a7450b0f (version 189, re-verified as 191)", () => {
  assert.equal(ARCHIVE_LINES.length, 15);
  for (const l of ARCHIVE_LINES) assert.match(l, /^[0-9a-f]{64} {2}functions\/[a-z_/-]+\.(ts|json)$/);
  assert.deepEqual(sortedByPath(ARCHIVE_LINES), ARCHIVE_LINES, "sorted by path");
  assert.equal(sha256(ARCHIVE_LINES.join("\n") + "\n"), DEPLOYED_MANIFEST);
  assert.match(RUNBOOK, new RegExp(`\\| \`${ARCHIVE_COMMIT}\` \\| 15 \\| \`${DEPLOYED_MANIFEST}\` \\|`));
  for (const s of [DEPLOYED_MANIFEST, DEPLOYED_EZBR, "version 189", "version 191", ARCHIVE_COMMIT]) assert.ok(DOC.includes(s), s);
});

test("the candidate record hashes to the candidate manifest the runbook names for main 32f0cb3d", () => {
  assert.equal(CANDIDATE_LINES.length, 19);
  for (const l of CANDIDATE_LINES) assert.match(l, /^[0-9a-f]{64} {2}functions\/[a-z_/-]+\.(ts|json)$/);
  assert.deepEqual(sortedByPath(CANDIDATE_LINES), CANDIDATE_LINES, "sorted by path");
  assert.equal(sha256(CANDIDATE_LINES.join("\n") + "\n"), CANDIDATE_MANIFEST);
  assert.match(RUNBOOK, new RegExp(`\\| main \`${CANDIDATE_COMMIT}\` \\| 19 \\| \`${CANDIDATE_MANIFEST}\` \\|`));
  for (const s of [CANDIDATE_MANIFEST, CANDIDATE_COMMIT, MAIN_MANIFEST, MAIN_COMMIT]) assert.ok(DOC.includes(s), s);
  // The candidate carries none of Lærligverse's server modules.
  for (const l of CANDIDATE_LINES) assert.doesNotMatch(l, /objective-target|learning-sequence/);
});

test("the doc's diff list is exactly the per-file difference between the archive and the candidate", () => {
  const computed = diffList(ARCHIVE_LINES, CANDIDATE_LINES);
  assert.deepEqual(block("gnq-b:diff"), computed);
  // Not vacuous: 4 new files, 3 changed, 12 byte-identical.
  assert.equal(computed.length, 7);
  const then = parse(ARCHIVE_LINES);
  const now = parse(CANDIDATE_LINES);
  assert.equal([...then.keys()].filter((p) => now.get(p) === then.get(p)).length, 12);
});

test("the records are the commits byte for byte, and the main diff is 32f0cb3d → 033c90a1 (needs the full history)", (t) => {
  if (!hasCommits) return t.skip(SHALLOW);
  const at = (c) => { const read = gitReader(c, ROOT); return manifest(read, graphFiles(read)); };
  const archive = at(ARCHIVE_COMMIT);
  assert.deepEqual(archive.lines, ARCHIVE_LINES);
  assert.equal(archive.hash, DEPLOYED_MANIFEST);
  const candidate = at(CANDIDATE_COMMIT);
  assert.deepEqual(candidate.lines, CANDIDATE_LINES);
  assert.equal(candidate.hash, CANDIDATE_MANIFEST);
  const main = at(MAIN_COMMIT);
  assert.equal(main.hash, MAIN_MANIFEST);
  assert.equal(main.files.length, 21);
  assert.deepEqual(block("gnq-b:main-diff"), diffList(candidate.lines, main.lines));
});

test("rehearsal: the archived a7450b0f source and the candidate 32f0cb3d behave identically for MC rows", async (t) => {
  if (!hasCommits) return t.skip(SHALLOW);
  const dirs = [];
  try {
    setFlags(undefined);
    const archived = await loadCommit(ARCHIVE_COMMIT, dirs);
    const candidate = await loadCommit(CANDIDATE_COMMIT, dirs);
    assert.deepEqual(candidate.warmup, archived.warmup, "first request of a fresh isolate");
    let runs = 0;
    for (const c of matrix()) {
      assert.deepEqual(await runCase(candidate.handler, c), await runCase(archived.handler, c), JSON.stringify(c));
      runs++;
    }
    assert.equal(runs, MATRIX_SIZE);

    // Negative control: the only payload change for an existing format is content.stimulus. A row that
    // carries one is served WITH it by the candidate and without it by the archive.
    const stimulus = { kind: "source", text: "Uddrag", credit: { source: "Testkilde" } };
    const c = { mix: undefined, level: undefined, subject: "historie", scenario: "new", patch: withContent({ stimulus }) };
    const rel = await runCase(candidate.handler, c);
    const arc = await runCase(archived.handler, c);
    assert.equal(rel.status, 200);
    assert.equal(arc.status, 200);
    assert.deepEqual(JSON.parse(rel.body).content.stimulus, stimulus);
    assert.equal(JSON.parse(arc.body).content.stimulus, undefined);
  } finally {
    setFlags(undefined);
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
});

test("strategy B: main 033c90a1 with the LAERLIGVERSE_* flags unset behaves like the archive; option_details is not flag-gated", async (t) => {
  if (!hasCommits) return t.skip(SHALLOW);
  const dirs = [];
  try {
    setFlags(undefined);
    const archived = await loadCommit(ARCHIVE_COMMIT, dirs);
    const candidate = await loadCommit(CANDIDATE_COMMIT, dirs);
    const main = await loadCommit(MAIN_COMMIT, dirs);
    let runs = 0;
    for (const c of matrix()) {
      assert.deepEqual(await runCase(main.handler, c), await runCase(archived.handler, c), "flags off " + JSON.stringify(c));
      runs++;
    }
    assert.equal(runs, MATRIX_SIZE);

    // Both flags on, but no learning_objective in the request (the ordinary quiz): still the archive's behaviour.
    setFlags("on");
    for (const c of matrix()) {
      if (c.extraBody !== undefined) continue;
      setFlags(undefined);
      const expected = await runCase(archived.handler, c);
      setFlags("on");
      assert.deepEqual(await runCase(main.handler, c), expected, "flags on, no objective " + JSON.stringify(c));
    }

    // Negative control 1: targeting on and an in-scope objective → B answers differently (the comparison is not vacuous).
    const targeted = { mix: undefined, level: "v1", subject: "historie", scenario: "new", extraBody: { learning_objective: "vikings" } };
    const onB = await runCase(main.handler, targeted);
    setFlags(undefined);
    const onArc = await runCase(archived.handler, targeted);
    assert.equal(onB.status, 200);
    assert.equal(JSON.parse(onB.body).learning_objective, "vikings");
    assert.notDeepEqual(onB, onArc);

    // Negative control 2: D-332 option_details, flags OFF, production's LEVEL_ENGINE=v1 and QUESTION_MIX_ENGINE=shadow.
    const details = ["Afsender: X", "Afsender: Y"];
    const od = { mix: "shadow", level: "v1", subject: "historie", scenario: "new", patch: withContent({ option_details: details }) };
    const field = async (h) => { const r = await runCase(h, od); assert.equal(r.status, 200); return JSON.parse(r.body).content.option_details; };
    assert.deepEqual(await field(main.handler), details, "B serves option_details without any flag");
    assert.equal(await field(archived.handler), undefined);
    assert.equal(await field(candidate.handler), undefined);
    const bad = { ...od, patch: withContent({ option_details: ["only one"] }) };
    assert.equal(JSON.parse((await runCase(main.handler, bad)).body).step, "no_questions", "B skips a row with malformed option_details");
    assert.ok(JSON.parse((await runCase(archived.handler, bad)).body).question_instance_id, "the archive serves that row");
  } finally {
    setFlags(undefined);
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
});
