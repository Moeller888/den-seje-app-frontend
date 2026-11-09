// Vej B (D-362): deploy ONLY get-next-question before K1 — archive, release diff and rollback
// (docs/operations/gnq-release-b-d362.md). Nothing here touches production.
//
// 1. The archive record in the doc (one "<sha256>  <path>" line per deployed file, read 2026-11-09 with
//    get_edge_function, version 189) hashes to the deployed manifest the runbook names for a7450b0f.
// 2. The proposed release is this tree: its manifest is the runbook's candidate manifest.
// 3. The diff list in the doc (added / changed / removed) is exactly the per-file difference between the
//    archive record and this tree, so the doc cannot drift from the code.
// 4. With the full history (locally; CI checks the repository out shallowly): the archive record is
//    commit a7450b0f byte for byte, and the archived source loads under the same Node harness as the
//    release gate and behaves exactly like the release for every MC case (LEVEL_ENGINE off, v1 and
//    canary; every QUESTION_MIX_ENGINE mode; both subjects; five situations). A negative control proves
//    the comparison is not vacuous: a row with content.stimulus is served differently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { ENTRY, gitReader, graphFiles, manifest, workingTreeReader } from "../../tools/edge/gnq-release.mjs";
import { MIX_VALUES, SCENARIOS, SUBJECTS, loadHandler, runCase } from "./helpers/gnq-parity-harness.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVE_COMMIT = "a7450b0f";
const DEPLOYED_MANIFEST = "1f508a8459f5141f1e629dec94ec979ce34bafdcecdbc650b8d6db2a2f7c3bbe";
const CANDIDATE_MANIFEST = "04039767dfcdec861abcaef69c333977d0145fc482df9cbc58bc3860b907d6b2";
const DEPLOYED_EZBR = "77e6acf862b5cfd9c8224a7b84dbff328b3f3912b5fed483d2b8d2a025a5b24c";

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
const parse = (lines) => new Map(lines.map((l) => { const [h, p] = l.split(/ {2}/); return [p, h]; }));

const hasArchiveCommit = (() => {
  try {
    execFileSync("git", ["cat-file", "-e", `${ARCHIVE_COMMIT}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const SHALLOW = `commit ${ARCHIVE_COMMIT} is not in this clone (CI checks out shallowly); runs locally`;

test("the archive record hashes to the deployed manifest the runbook names for a7450b0f (version 189)", () => {
  assert.equal(ARCHIVE_LINES.length, 15);
  for (const l of ARCHIVE_LINES) assert.match(l, /^[0-9a-f]{64} {2}functions\/[a-z_/-]+\.(ts|json)$/);
  assert.deepEqual([...ARCHIVE_LINES].sort((a, b) => a.slice(66).localeCompare(b.slice(66))), ARCHIVE_LINES, "sorted by path");
  assert.equal(sha256(ARCHIVE_LINES.join("\n") + "\n"), DEPLOYED_MANIFEST);
  assert.match(RUNBOOK, new RegExp(`\\| \`${ARCHIVE_COMMIT}\` \\| 15 \\| \`${DEPLOYED_MANIFEST}\` \\|`));
  for (const s of [DEPLOYED_MANIFEST, DEPLOYED_EZBR, "version 189", ARCHIVE_COMMIT]) assert.ok(DOC.includes(s), s);
});

test("the proposed release is this tree: its manifest is the runbook's candidate manifest", () => {
  const read = workingTreeReader(ROOT);
  const m = manifest(read, graphFiles(read));
  assert.equal(m.hash, CANDIDATE_MANIFEST);
  assert.equal(m.files.length, 19);
  assert.ok(RUNBOOK.includes(CANDIDATE_MANIFEST));
  assert.ok(DOC.includes(CANDIDATE_MANIFEST));
});

test("the doc's diff list is exactly the per-file difference between the archive and this tree", () => {
  const read = workingTreeReader(ROOT);
  const now = parse(manifest(read, graphFiles(read)).lines);
  const then = parse(ARCHIVE_LINES);
  const computed = [
    ...[...now.keys()].filter((p) => !then.has(p)).map((p) => `added    ${p}`),
    ...[...now.keys()].filter((p) => then.has(p) && then.get(p) !== now.get(p)).map((p) => `changed  ${p}`),
    ...[...then.keys()].filter((p) => !now.has(p)).map((p) => `removed  ${p}`),
  ];
  assert.deepEqual(block("gnq-b:diff"), computed);
  // Not vacuous: 4 new files, 3 changed, 12 byte-identical.
  assert.equal(computed.length, 7);
  assert.equal([...then.keys()].filter((p) => now.get(p) === then.get(p)).length, 12);
});

test("the archive record is commit a7450b0f byte for byte (needs the full history)", (t) => {
  if (!hasArchiveCommit) return t.skip(SHALLOW);
  const read = gitReader(ARCHIVE_COMMIT, ROOT);
  const m = manifest(read, graphFiles(read));
  assert.deepEqual(m.lines, ARCHIVE_LINES);
  assert.equal(m.hash, DEPLOYED_MANIFEST);
});

test("rehearsal: the archived a7450b0f source loads in the release-gate harness and behaves exactly like the release for MC rows", async (t) => {
  if (!hasArchiveCommit) return t.skip(SHALLOW);
  const read = gitReader(ARCHIVE_COMMIT, ROOT);
  const dir = mkdtempSync(join(tmpdir(), "gnq-a7450b0f-"));
  try {
    for (const f of graphFiles(read)) {
      const out = join(dir, "supabase", f);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, read(f));
    }
    const archived = await loadHandler(join(dir, "supabase", ENTRY));
    const release = await loadHandler(join(ROOT, "supabase", ENTRY));
    assert.deepEqual(release.warmup, archived.warmup, "first request of a fresh isolate");

    const levels = [
      { level: undefined }, { level: "v1" }, { level: "canary", canaryIds: "stu-1" }, { level: "canary", canaryIds: "someone-else" },
    ];
    let runs = 0;
    for (const lv of levels) for (const mix of MIX_VALUES) for (const subject of SUBJECTS) for (const scenario of SCENARIOS) {
      const c = { mix, subject, scenario, ...lv };
      const label = JSON.stringify(c);
      assert.deepEqual(await runCase(release.handler, c), await runCase(archived.handler, c), label);
      runs++;
    }
    assert.equal(runs, levels.length * MIX_VALUES.length * SUBJECTS.length * SCENARIOS.length);

    // Negative control: the only payload change for an existing format is content.stimulus. A row that
    // carries one is served WITH it by the release and without it by the archive.
    const stimulus = { kind: "source", text: "Uddrag", credit: { source: "Testkilde" } };
    const patch = (kind, name, _ops, res) => (kind === "rpc" && name === "get_unserved_questions_for_student" && Array.isArray(res.data)
      ? { ...res, data: res.data.map((q) => ({ ...q, content: { ...q.content, stimulus } })) }
      : res);
    const c = { mix: undefined, level: undefined, subject: "historie", scenario: "new", patch };
    const rel = await runCase(release.handler, c);
    const arc = await runCase(archived.handler, c);
    assert.equal(rel.status, 200);
    assert.equal(arc.status, 200);
    assert.deepEqual(JSON.parse(rel.body).content.stimulus, stimulus);
    assert.equal(JSON.parse(arc.body).content.stimulus, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
